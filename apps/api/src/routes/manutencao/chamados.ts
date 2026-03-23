import { Router } from 'express';
import { requirePermission, requireAnyPermission } from '../../middlewares/requirePermission';
import { pool, withTx } from '../../db';
import { CHAMADO_STATUS, normalizeChamadoStatus, isStatusAtivo } from '../../utils/status';
import { sseBroadcast } from '../../utils/sse';
import {
  CreateChamadoSchema,
  ConcluirChamadoSchema,
  PatchChecklistSchema,
  ObservacaoSchema,
} from "@spiraview/shared";

import multer from "multer";
import { storageProvider } from "../../utils/storage";
import { TicketCreatedNotification } from "../../services/notifications/TicketCreated";
import { PreventiveMaintenanceNotification } from "../../services/notifications/PreventiveMaintenance";
import { logger } from '../../logger';
import { checkPermission, getChamadoSummary } from './chamados.service';

export const chamadosRouter: Router = Router();

// upload em memória, só para fotos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB (ajusta se precisar)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não suportado. Apenas imagens são permitidas."));
    }
  }
});

/**
 * @swagger
 * /chamados:
 *   get:
 *     summary: List tickets (Chamados) with filters
 *     tags: [Manutencao]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: maquinaId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tickets
 */
// ---------- Chamados: contagens para badges (1 query, substitui 4 GETs) ----------
chamadosRouter.get("/chamados/counts", requireAnyPermission(['meus_chamados', 'chamados_abertos'], 'ver'), async (req, res) => {
  try {
    const manutentorEmail = req.query.manutentorEmail as string | undefined;

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE LOWER(c.status) = 'aberto')::int          AS abertos,
         COUNT(*) FILTER (WHERE LOWER(c.status) = 'em andamento')::int    AS em_andamento,
         COUNT(*) FILTER (
           WHERE LOWER(c.status) = 'aberto'
             AND ($1::text IS NULL OR LOWER(um.email) = LOWER($1))
         )::int AS meus_abertos,
         COUNT(*) FILTER (
           WHERE LOWER(c.status) = 'em andamento'
             AND ($1::text IS NULL OR LOWER(um.email) = LOWER($1))
         )::int AS meus_em_andamento
       FROM public.chamados c
       LEFT JOIN public.usuarios um ON um.id = c.manutentor_id`,
      [manutentorEmail || null]
    );

    const r = rows[0] || {};
    res.json({
      abertos: r.abertos ?? 0,
      emAndamento: r.em_andamento ?? 0,
      meusAbertos: r.meus_abertos ?? 0,
      meusEmAndamento: r.meus_em_andamento ?? 0,
    });
  } catch (e: any) {
    logger.error({ err: e }, 'Erro em /chamados/counts');
    res.status(500).json({ error: String(e) });
  }
});

// ---------- Chamados: lista com filtros + paginação ----------
chamadosRouter.get("/chamados", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const tipo = req.query.tipo as string | undefined;
    const maquinaNome = (req.query.maquinaTag || req.query.maquinaNome) as string | undefined; // Fallback para manter compatibilidade
    const maquinaId = req.query.maquinaId as string | undefined;
    const criadoPorEmail = req.query.criadoPorEmail as string | undefined;
    const manutentorEmail = req.query.manutentorEmail as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? "20"), 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const params: any[] = [];
    const where: string[] = [];

    // status (robusto p/ "Concluído", "Concluido", "concluido"...)
    let isConcluido = false;
    if (status) {
      const statusNorm = normalizeChamadoStatus(status);
      if (!statusNorm) {
        return res.status(400).json({ error: 'STATUS_INVALIDO' });
      }
      params.push(statusNorm);
      where.push(`LOWER(c.status) = LOWER($${params.length})`);
      isConcluido = (statusNorm === CHAMADO_STATUS.CONCLUIDO);
    }

    // tipo (case-insensitive)
    if (tipo) {
      params.push(tipo);
      where.push(`LOWER(c.tipo) = LOWER($${params.length})`);
    }

    if (maquinaNome) {
      params.push(maquinaNome);
      where.push(`m.nome = $${params.length}`);
    }

    if (maquinaId) {
      params.push(maquinaId);
      where.push(`c.maquina_id = $${params.length}`);
    }

    // e-mail de quem criou (case-insensitive)
    if (criadoPorEmail) {
      params.push(criadoPorEmail);
      where.push(`LOWER(u.email) = LOWER($${params.length})`);
    }

    // manutentor: filtra por manutentor_id via join
    if (manutentorEmail) {
      params.push(manutentorEmail);
      where.push(`LOWER(um.email) = LOWER($${params.length})`);
    }

    // Período: se Concluído, filtra por concluido_em; senão por criado_em
    const dateCol = isConcluido ? "c.concluido_em" : "c.criado_em";
    if (from) {
      params.push(new Date(from).toISOString());
      where.push(`${dateCol} >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(new Date(to).toISOString());
      where.push(`${dateCol} <= $${params.length}::timestamptz`);
    }

    const whereSql = where.length ? where.join(" AND ") : "1=1";
    const orderCol = isConcluido ? "c.concluido_em" : "c.criado_em";

    // Single query: items + total via window function (replaces 2 separate queries)
    const params2 = [...params, pageSize, offset];
    const { rows: items } = await pool.query(
      `SELECT
         c.id,
         m.nome  AS maquina,
         c.tipo,
         c.status,
         c.causa,
         c.descricao,
         c.item,
         c.checklist_item_key AS "checklistItemKey",
         u.nome  AS criado_por,
         um.nome AS manutentor,
         to_char(c.criado_em,    'YYYY-MM-DD HH24:MI') AS criado_em,
         to_char(c.concluido_em, 'YYYY-MM-DD HH24:MI') AS concluido_em,
         count(*) OVER()::int AS _total
       FROM public.chamados c
       JOIN public.maquinas  m  ON m.id  = c.maquina_id
       JOIN public.usuarios  u  ON u.id  = c.criado_por_id
       LEFT JOIN public.usuarios um ON um.id = c.manutentor_id
       WHERE ${whereSql}
       ORDER BY ${orderCol} DESC NULLS LAST
       LIMIT $${params2.length - 1} OFFSET $${params2.length}`,
      params2
    );

    const total = items[0]?._total ?? 0;
    // Remove _total from response items
    const cleanItems = items.map(({ _total, ...rest }: any) => rest);

    res.json({ items: cleanItems, page, pageSize, total, hasNext: offset + cleanItems.length < total });
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// ---------- Chamados: detalhe ----------
chamadosRouter.get("/chamados/:id", async (req, res) => {
  try {
    const id = String(req.params.id);

    const { rows } = await pool.query(
      `
      SELECT
        c.id,
        m.nome AS maquina,
        c.tipo,
        c.status,
        CASE
          WHEN LOWER(c.status) LIKE 'abert%'       THEN 'aberto'
          WHEN LOWER(c.status) LIKE 'em andament%' THEN 'em_andamento'
          WHEN LOWER(c.status) LIKE 'conclu%'      THEN 'concluido'
          WHEN LOWER(c.status) LIKE 'cancel%'      THEN 'cancelado'
          ELSE 'aberto'
        END AS status_key,

        c.descricao,
        c.problema_reportado,
        c.causa,
        c.solucao,

        to_char(c.criado_em,    'YYYY-MM-DD HH24:MI') AS criado_em,
        to_char(c.concluido_em, 'YYYY-MM-DD HH24:MI') AS concluido_em,

        c.criado_por_id,
        COALESCE(c.criado_por_nome, ucri.nome) AS criado_por,
        ucri.email                              AS criado_por_email,

        c.manutentor_id,
        umat.nome  AS manutentor,
        umat.email AS manutentor_email,

        c.concluido_por_id,
        c.concluido_por_nome,
        c.concluido_por_email,

        CASE WHEN jsonb_typeof(c.checklist) = 'array' THEN c.checklist ELSE '[]'::jsonb END AS checklist,
        CASE WHEN c.tipo = 'preventiva' THEN 'preventiva' ELSE NULL END AS tipo_checklist,
        CASE WHEN c.tipo = 'preventiva' AND c.checklist IS NOT NULL
            THEN jsonb_array_length(c.checklist)
            ELSE NULL
        END AS qtd_itens,

        -- Observações (inline JSON array — avoids separate query)
        COALESCE(obs_agg.items, '[]'::jsonb) AS observacoes,

        -- Manutentores (inline JSON array — avoids separate query)
        COALESCE(man_agg.items, '[]'::jsonb) AS manutentores

      FROM public.chamados c
      JOIN public.maquinas  m    ON m.id   = c.maquina_id
      LEFT JOIN public.usuarios ucri ON ucri.id = c.criado_por_id
      LEFT JOIN public.usuarios umat ON umat.id = c.manutentor_id

      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'texto', o.texto,
          'criado_em', to_char(o.criado_em, 'YYYY-MM-DD HH24:MI'),
          'autor', COALESCE(o.autor_nome, uobs.nome, 'Sistema')
        ) ORDER BY o.criado_em ASC) AS items
        FROM public.chamado_observacoes o
        LEFT JOIN public.usuarios uobs ON uobs.id = o.autor_id
        WHERE o.chamado_id = c.id
      ) AS obs_agg ON TRUE

      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', cm.manutentor_id,
          'nome', cm.manutentor_nome,
          'email', cm.manutentor_email,
          'papel', cm.papel,
          'entrou_em', to_char(cm.entrou_em, 'YYYY-MM-DD HH24:MI')
        ) ORDER BY cm.entrou_em ASC) AS items
        FROM public.chamado_manutentores cm
        WHERE cm.chamado_id = c.id
      ) AS man_agg ON TRUE

      WHERE c.id = $1
      LIMIT 1;
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Chamado não encontrado." });
    }

    res.json(rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// ---------- Chamados: excluir (requer editar maquinas) ----------
chamadosRouter.delete(
  "/chamados/:id",
  requirePermission('maquinas', 'editar'),
  async (req, res) => {
    try {
      const chamadoId = String(req.params.id || "").trim();
      if (!chamadoId) {
        return res.status(400).json({ error: "ID_INVALIDO" });
      }

      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }

      // Verifica se o chamado existe
      const { rows } = await pool.query(
        `SELECT id FROM public.chamados WHERE id = $1`,
        [chamadoId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "CHAMADO_NAO_ENCONTRADO" });
      }

      // Busca fotos para exclusão física no storage (fire-and-forget)
      const { rows: fotosParaDeletar } = await pool.query(
        `SELECT storage_path FROM public.chamado_fotos WHERE chamado_id = $1`,
        [chamadoId]
      );

      // Exclui registros relacionados primeiro (fotos, observações)
      await pool.query(
        `DELETE FROM public.chamado_fotos WHERE chamado_id = $1`,
        [chamadoId]
      );
      await pool.query(
        `DELETE FROM public.chamado_observacoes WHERE chamado_id = $1`,
        [chamadoId]
      );

      // Exclui o chamado
      await pool.query(
        `DELETE FROM public.chamados WHERE id = $1`,
        [chamadoId]
      );

      try {
        sseBroadcast?.({ topic: "chamados", action: "deleted", id: chamadoId });
      } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }


      // Limpeza assíncrona de arquivos
      if (fotosParaDeletar.length > 0) {
        Promise.allSettled(
          fotosParaDeletar.map((f) => storageProvider.deleteFile(f.storage_path))
        ).then((results) => {
          results.forEach((res, idx) => {
            if (res.status === "rejected") {
              console.error(
                `[Storage] Failed to delete file: ${fotosParaDeletar[idx].storage_path}`,
                res.reason
              );
            }
          });
        });
      }

      return res.json({ ok: true, message: "Chamado excluído com sucesso." });
    } catch (e: any) {
      logger.error({ err: e }, 'Erro na rota');
      return res.status(500).json({ error: String(e) });
    }
  }
);

// ---------- Chamados: listar fotos ----------
chamadosRouter.get(
  "/chamados/:id/fotos",
  requireAnyPermission(['maquinas', 'chamados_abertos', 'meus_chamados'], 'ver'),
  async (req, res) => {
    try {
      const chamadoId = String(req.params.id || "").trim();
      if (!chamadoId) {
        return res.status(400).json({ error: "ID_INVALIDO" });
      }

      const { rows } = await pool.query(
        `
        SELECT
          f.id,
          f.storage_path,
          f.mime_type,
          f.tamanho_bytes,
          to_char(f.criado_em, 'YYYY-MM-DD HH24:MI') AS criado_em,
          COALESCE(u.nome, u.email, 'Sistema') AS autor_nome
        FROM public.chamado_fotos f
        LEFT JOIN public.usuarios u ON u.id = f.criado_por_id
        WHERE f.chamado_id = $1
        ORDER BY f.criado_em ASC
        `,
        [chamadoId]
      );

      // constrói URLs públicas para exibição no front
      const items = rows.map((row) => {
        const url = storageProvider.getPublicUrl(row.storage_path);
        return {
          id: row.id,
          url,
          caminho: row.storage_path,
          mimeType: row.mime_type,
          tamanhoBytes: row.tamanho_bytes,
          criadoEm: row.criado_em,
          autorNome: row.autor_nome,
        };
      })

      return res.json(items);
    } catch (e: any) {
      logger.error({ err: e }, 'Erro na rota');
      return res.status(500).json({ error: String(e) });
    }
  }
);


// ---------- Chamados: observacoes ----------
chamadosRouter.post(
  "/chamados/:id/observacoes",
  requireAnyPermission(['maquinas', 'chamados_abertos', 'meus_chamados'], 'ver'),
  async (req, res) => {
    try {
      const chamadoId = String(req.params.id);

      // ✅ validação + trim
      const parsed = ObservacaoSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const { texto } = parsed.data;

      const user = req.user;
      const autorId = user?.id ?? null;
      const autorNome = user?.name ? String(user.name).trim()
        : user?.email ? String(user.email).trim()
          : null;
      const autorEmail = user?.email ? String(user.email).trim() : null;

      const { rows } = await pool.query(
        `INSERT INTO public.chamado_observacoes
           (chamado_id, autor_id, autor_nome, autor_email, texto, criado_em)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, texto, criado_em`,
        [chamadoId, autorId, autorNome, autorEmail, texto]
      );

      const observacao = rows[0];

      const { rows: lista } = await pool.query(
        `SELECT
           o.texto                                    AS texto,
           to_char(o.criado_em, 'YYYY-MM-DD HH24:MI') AS criado_em,
           COALESCE(o.autor_nome, u.nome, 'Sistema')  AS autor
         FROM public.chamado_observacoes o
         LEFT JOIN public.usuarios u ON u.id = o.autor_id
        WHERE o.chamado_id = $1
        ORDER BY o.criado_em ASC`,
        [chamadoId]
      );

      const ultimaObservacao = lista[lista.length - 1] ?? observacao;

      try {
        sseBroadcast?.({
          topic: "chamados",
          action: "observacao-criada",
          id: chamadoId,
          payload: ultimaObservacao,
        });
      } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

      return res.status(201).json({ ok: true, observacao: ultimaObservacao, observacoes: lista });
    } catch (error: any) {
      if (error?.code === "23503") {
        return res.status(404).json({ error: "CHAMADO_NAO_ENCONTRADO" });
      }
      console.error(error);
      return res.status(500).json({ error: String(error) });
    }
  }
);

// ---------- Chamados: atender ----------
chamadosRouter.post(
  "/chamados/:id/atender",
  requirePermission('meus_chamados', 'editar'),
  async (req, res) => {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }

      const chamadoId = String(req.params.id);
      const atendenteId = user.id;
      const atendenteEmail = user.email ? String(user.email).trim() : null;
      const atendenteNome = user.name ? String(user.name).trim() : null;

      const resultado = await withTx(async (client) => {
        // trava a linha para transição segura
        const { rows } = await client.query(
          `SELECT status, tipo, manutentor_id, agendamento_id
             FROM public.chamados
            WHERE id = $1
            FOR UPDATE`,
          [chamadoId]
        );

        if (!rows.length) {
          return { notFound: true as const };
        }

        const atual = rows[0];
        const statusAtual = normalizeChamadoStatus(atual.status);

        // só permite atender a partir de "Aberto"
        if (statusAtual !== CHAMADO_STATUS.ABERTO) {
          return { conflict: String(atual.status) };
        }

        // Atualiza para "Em Andamento"
        const { rows: updated } = await client.query(
          `UPDATE public.chamados
              SET status        = $2,
                  manutentor_id = COALESCE(manutentor_id, $3),
                  atualizado_em = NOW()
            WHERE id = $1
        RETURNING id, status, manutentor_id, agendamento_id`,
          [chamadoId, CHAMADO_STATUS.EM_ANDAMENTO, atendenteId]
        );

        if (!updated.length) {
          return { conflict: String(atual.status) };
        }

        // Registra manutentor principal na tabela canônica
        await client.query(
          `INSERT INTO public.chamado_manutentores
             (chamado_id, manutentor_id, manutentor_email, manutentor_nome, papel)
           VALUES ($1, $2, $3, $4, 'principal')
           ON CONFLICT (chamado_id, manutentor_id) DO NOTHING`,
          [chamadoId, atendenteId, atendenteEmail, atendenteNome]
        );

        return { row: updated[0], tipo: atual.tipo };
      });

      if (resultado.notFound) {
        return res.status(404).json({ error: "CHAMADO_NAO_ENCONTRADO" });
      }
      if (resultado.conflict) {
        return res.status(409).json({ error: "STATE_CONFLICT", status: resultado.conflict });
      }

      try {
        sseBroadcast?.({ topic: "chamados", action: "updated", id: chamadoId });
      } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

      // Notificação Teams: preventiva iniciada (fire-and-forget)
      if (typeof resultado.tipo === 'string' && resultado.tipo.toLowerCase() === 'preventiva') {
        PreventiveMaintenanceNotification.onIniciada({
          chamadoId,
          manutentorNome: atendenteNome ?? atendenteEmail ?? 'N/A',
        }).catch(() => { });
      }

      // mantém o mesmo shape de retorno que você já usa
      return res.json({ ok: true, chamado: resultado.row });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: String(error) });
    }
  }
);

// ---------- Chamados: entrar (co-manutenção) ----------
chamadosRouter.post(
  "/chamados/:id/entrar",
  requirePermission('meus_chamados', 'editar'),
  async (req, res) => {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }

      const chamadoId = String(req.params.id);
      const manutentorId = user.id;
      const manutentorEmail = user.email ? String(user.email).trim() : null;
      const manutentorNome = user.name ? String(user.name).trim() : null;

      const resultado = await withTx(async (client) => {
        const { rows } = await client.query(
          `SELECT status FROM public.chamados WHERE id = $1 FOR UPDATE`,
          [chamadoId]
        );

        if (!rows.length) return { notFound: true as const };

        const statusAtual = normalizeChamadoStatus(rows[0].status);
        if (statusAtual !== CHAMADO_STATUS.EM_ANDAMENTO) {
          return { conflict: String(rows[0].status) };
        }

        // Verifica se já está na lista
        const { rows: existing } = await client.query(
          `SELECT id FROM public.chamado_manutentores
            WHERE chamado_id = $1 AND manutentor_id = $2`,
          [chamadoId, manutentorId]
        );
        if (existing.length) return { alreadyJoined: true as const };

        await client.query(
          `INSERT INTO public.chamado_manutentores
             (chamado_id, manutentor_id, manutentor_email, manutentor_nome, papel)
           VALUES ($1, $2, $3, $4, 'co')`,
          [chamadoId, manutentorId, manutentorEmail, manutentorNome]
        );

        return { ok: true as const };
      });

      if (resultado.notFound) {
        return res.status(404).json({ error: "CHAMADO_NAO_ENCONTRADO" });
      }
      if (resultado.conflict) {
        return res.status(409).json({ error: "STATE_CONFLICT", status: resultado.conflict });
      }
      if (resultado.alreadyJoined) {
        return res.status(409).json({ error: "JA_NA_MANUTENCAO" });
      }

      try {
        sseBroadcast?.({ topic: "chamados", action: "updated", id: chamadoId });
      } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: String(error) });
    }
  }
);

// ---------- Chamados: sair (co-manutenção) ----------
chamadosRouter.post(
  "/chamados/:id/sair",
  requirePermission('meus_chamados', 'editar'),
  async (req, res) => {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }

      const chamadoId = String(req.params.id);

      const resultado = await withTx(async (client) => {
        const { rows } = await client.query(
          `SELECT manutentor_id, papel
             FROM public.chamado_manutentores
            WHERE chamado_id = $1 AND manutentor_id = $2`,
          [chamadoId, user.id]
        );

        if (!rows.length) return { notFound: true as const };
        if (rows[0].papel === 'principal') return { forbidden: true as const };

        await client.query(
          `DELETE FROM public.chamado_manutentores
            WHERE chamado_id = $1 AND manutentor_id = $2`,
          [chamadoId, user.id]
        );

        return { ok: true as const };
      });

      if (resultado.notFound) {
        return res.status(404).json({ error: "NAO_ESTA_NA_MANUTENCAO" });
      }
      if (resultado.forbidden) {
        return res.status(403).json({ error: "MANUTENTOR_PRINCIPAL_NAO_PODE_SAIR" });
      }

      try {
        sseBroadcast?.({ topic: "chamados", action: "updated", id: chamadoId });
      } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: String(error) });
    }
  }
);

// ---------- Chamados: concluir ----------
chamadosRouter.post(
  "/chamados/:id/concluir",
  requirePermission('meus_chamados', 'editar'),
  async (req, res) => {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }

      const chamadoId = String(req.params.id);

      // ✅ validação básica do body e normalização do checklist (se vier)
      const parsed = ConcluirChamadoSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const body = parsed.data;

      // lê status/tipo e vínculos para regras de permissão/transição
      const { rows } = await pool.query(
        `SELECT c.status, c.tipo, c.manutentor_id, c.agendamento_id, c.checklist,
                m.nome AS maquina_nome
           FROM public.chamados c
           JOIN public.maquinas m ON m.id = c.maquina_id
          WHERE c.id = $1`,
        [chamadoId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "CHAMADO_NAO_ENCONTRADO" });
      }

      const atual = rows[0];
      const statusAtual = normalizeChamadoStatus(atual.status);
      if (statusAtual !== CHAMADO_STATUS.EM_ANDAMENTO) {
        return res.status(409).json({ error: "STATE_CONFLICT", status: atual.status });
      }

      // Permissão: manutentor pode concluir; gestor sempre pode
      const hasGestao = await checkPermission(user.id, 'chamados_gestao', 'editar');
      const isGestorLike = (user.role || '').toLowerCase() === "admin" || hasGestao;

      if (!isGestorLike && String(atual.manutentor_id) !== String(user.id)) {
        // também verifica se é co-manutentor
        const { rows: cmRows } = await pool.query(
          `SELECT 1 FROM public.chamado_manutentores WHERE chamado_id = $1 AND manutentor_id = $2`,
          [chamadoId, user.id]
        );
        if (!cmRows.length) {
          return res.status(403).json({ error: "PERMISSAO_NEGADA" });
        }
      }

      const tipoChamado = typeof atual.tipo === "string" ? atual.tipo.toLowerCase() : "";

      // ✅ Regras por tipo
      // - preventiva: checklist é obrigatório e com pelo menos 1 item já normalizado
      // - corretiva: causa e solucao obrigatórias; checklist opcional
      let checklistJson: string | null = null;

      if (tipoChamado === "preventiva") {
        if (!Array.isArray(body.checklist) || body.checklist.length === 0) {
          return res.status(400).json({ error: "CHECKLIST_OBRIGATORIO" });
        }
        checklistJson = JSON.stringify(body.checklist);
      } else if (tipoChamado === "corretiva") {
        const causaOk = typeof body.causa === "string" && body.causa.trim().length > 0;
        const solucaoOk = typeof body.solucao === "string" && body.solucao.trim().length > 0;
        if (!causaOk) return res.status(400).json({ error: "CAUSA_OBRIGATORIA" });
        if (!solucaoOk) return res.status(400).json({ error: "SOLUCAO_OBRIGATORIA" });

        if (Array.isArray(body.checklist) && body.checklist.length) {
          checklistJson = JSON.stringify(body.checklist);
        }
      } else {
        // se futuramente houver outros tipos, no mínimo aceite checklist se vier
        if (Array.isArray(body.checklist) && body.checklist.length) {
          checklistJson = JSON.stringify(body.checklist);
        }
      }

      const causaFinal =
        tipoChamado === "corretiva"
          ? (body.causa ?? "").trim()
          : (typeof body.causa === "string" ? body.causa.trim() : null) || null;

      const solucaoFinal =
        tipoChamado === "corretiva"
          ? (body.solucao ?? "").trim()
          : (typeof body.solucao === "string" ? body.solucao.trim() : null) || null;

      const chamadoAtualizado = await withTx(async (client) => {
        const paramsBase = {
          concluidorId: user.id,
          concluidorEmail: user.email ?? null,
          concluidorNome: user.name ?? null,
        };

        const qEnd = await client.query(
          `
          UPDATE public.chamados
             SET status               = $2,
                 concluido_em         = NOW(),
                 checklist            = COALESCE($3::jsonb, checklist),
                 causa                = COALESCE($4::text, causa),
                 solucao              = COALESCE($5::text, solucao),

                 concluido_por_id     = $6,
                 concluido_por_email  = $7,
                 concluido_por_nome   = $8,
                 atualizado_em        = NOW()
           WHERE id = $1
           RETURNING id, status, tipo, agendamento_id
          `,
          [
            chamadoId,
            CHAMADO_STATUS.CONCLUIDO,
            checklistJson,
            causaFinal,
            solucaoFinal,
            paramsBase.concluidorId,
            paramsBase.concluidorEmail,
            paramsBase.concluidorNome,
          ]
        );

        if (!qEnd.rowCount) return null;

        const row = qEnd.rows[0];

        if (row.agendamento_id) {
          await client.query(
            `UPDATE public.agendamentos_preventivos
                SET status = 'concluido',
                    concluido_em = NOW()
              WHERE id = $1`,
            [row.agendamento_id]
          );
        }

        return row;
      });

      if (!chamadoAtualizado) {
        return res.status(500).json({ error: "FALHA_ATUALIZAR_CHAMADO" });
      }

      try {
        sseBroadcast?.({ topic: "chamados", action: "updated", id: chamadoId });
      } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

      // Notificação Teams: preventiva concluída (fire-and-forget)
      if (tipoChamado === 'preventiva') {
        PreventiveMaintenanceNotification.onConcluida({
          chamadoId,
          maquinaNome: atual.maquina_nome ?? 'N/A',
          concluidorNome: user.name ?? user.email ?? 'N/A',
          checklist: body.checklist ?? [],
        }).catch(() => { });
      }

      return res.json({ ok: true, chamado: chamadoAtualizado });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: String(error) });
    }
  }
);


// ---------- Chamados: upload de foto ----------
chamadosRouter.post(
  "/chamados/:id/fotos",
  requireAnyPermission(['maquinas', 'meus_chamados'], 'editar'),
  upload.single("file"), // campo "file" no form-data
  async (req, res) => {
    try {
      const chamadoId = String(req.params.id || "").trim();
      if (!chamadoId) {
        return res.status(400).json({ error: "ID_INVALIDO" });
      }

      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }

      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ error: "ARQUIVO_OBRIGATORIO" });
      }

      if (!file.mimetype || !file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "TIPO_INVALIDO", detalhe: "Envie apenas imagens." });
      }

      // valida se o usuário está associado ao chamado
      const { rows } = await pool.query(
        `SELECT status, manutentor_id FROM public.chamados WHERE id = $1 LIMIT 1`,
        [chamadoId]
      );
      if (!rows.length) {
        return res.status(404).json({ error: "CHAMADO_NAO_ENCONTRADO" });
      }

      const atual = rows[0];
      const role = String(user.role || "").toLowerCase();
      const hasGestao = await checkPermission(user.id, 'chamados_gestao', 'editar');
      const isGestorLike = role === "gestor industrial" || role === "admin" || hasGestao;

      if (!isGestorLike && String(atual.manutentor_id) !== String(user.id)) {
        const { rows: cmRows } = await pool.query(
          `SELECT 1 FROM public.chamado_manutentores WHERE chamado_id = $1 AND manutentor_id = $2`,
          [chamadoId, user.id]
        );
        if (!cmRows.length) {
          return res.status(403).json({ error: "PERMISSAO_NEGADA" });
        }
      }

      // upload no Storage via Provider
      let storagePath: string;
      try {
        // Gera o nome do arquivo aqui (controller) para não acoplar regra de negócio no provider
        const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.originalname || "");
        const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
        const fileName = `${chamadoId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}${ext}`;

        storagePath = await storageProvider.uploadFile(fileName, file.buffer, file.mimetype);
      } catch (e) {
        console.error("[chamados/:id/fotos] erro upload storage", e);
        return res.status(500).json({ error: "UPLOAD_FAILED" });
      }

      // grava metadados no Postgres
      const { rows: inserted } = await pool.query(
        `
        INSERT INTO public.chamado_fotos
          (chamado_id, storage_path, mime_type, tamanho_bytes, criado_por_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          storage_path,
          mime_type,
          tamanho_bytes,
          to_char(criado_em, 'YYYY-MM-DD HH24:MI') AS criado_em
        `,
        [chamadoId, storagePath, file.mimetype, file.size, user.id]
      );

      const foto = inserted[0];

      const payload = {
        id: foto.id,
        url: storageProvider.getPublicUrl(foto.storage_path),
        caminho: foto.storage_path,
        mimeType: foto.mime_type,
        tamanhoBytes: foto.tamanho_bytes,
        criadoEm: foto.criado_em,
        autorId: user.id,
        autorNome: (user.name as string) || (user.email as string) || null,
      };

      try {
        sseBroadcast?.({
          topic: "chamados",
          action: "foto-criada",
          id: chamadoId,
          payload,
        });
      } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

      return res.status(201).json(payload);
    } catch (e: any) {
      logger.error({ err: e }, 'Erro na rota');
      return res.status(500).json({ error: String(e) });
    }
  }
);


chamadosRouter.patch(
  "/chamados/:id/checklist",
  requireAnyPermission(['maquinas', 'meus_chamados'], 'editar'),
  async (req, res) => {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }

      const parsed = PatchChecklistSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const { checklist } = parsed.data;
      const chamadoId = String(req.params.id);

      // Carrega chamado para validar estado/permissão
      const { rows } = await pool.query(
        `SELECT status, manutentor_id FROM public.chamados WHERE id = $1 LIMIT 1`,
        [chamadoId]
      );
      if (!rows.length) {
        return res.status(404).json({ error: "CHAMADO_NAO_ENCONTRADO" });
      }

      const atual = rows[0];
      const statusNorm = normalizeChamadoStatus(atual.status);
      if (statusNorm === CHAMADO_STATUS.CONCLUIDO || statusNorm === CHAMADO_STATUS.CANCELADO) {
        return res.status(409).json({ error: "INVALID_STATE", status: atual.status });
      }

      // manutentor/gestor: se não for gestor, precisa estar associado
      const hasGestao = await checkPermission(user.id, 'chamados_gestao', 'editar');
      const isGestorLike = (user.role || '').toLowerCase() === "gestor industrial" || user.role === "admin" || hasGestao;

      if (!isGestorLike && String(atual.manutentor_id) !== String(user.id)) {
        const { rows: cmRows } = await pool.query(
          `SELECT 1 FROM public.chamado_manutentores WHERE chamado_id = $1 AND manutentor_id = $2`,
          [chamadoId, user.id]
        );
        if (!cmRows.length) {
          return res.status(403).json({ error: "PERMISSAO_NEGADA" });
        }
      }

      await pool.query(
        `UPDATE public.chamados
            SET checklist = $2::jsonb,
                atualizado_em = NOW()
          WHERE id = $1`,
        [chamadoId, JSON.stringify(checklist)]
      );

      try { sseBroadcast?.({ topic: "chamados", action: "updated", id: chamadoId }); } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

      return res.json({ ok: true });
    } catch (e: any) {
      logger.error({ err: e }, 'Erro na rota');
      return res.status(500).json({ error: String(e) });
    }
  }
);

// ---------- Chamados: criar ----------
/**
 * Body:
 * {
 *   "maquinaTag": "TCN-12"   // ou "maquinaNome": "TCN-12"
 *   "descricao": "texto...",
 *   "tipo": "corretiva" | "preventiva",      // padrão: "corretiva"
 *   "status": "Aberto" | "Em Andamento"      (padrão: "Aberto")
 *   "criadoPorEmail": "operador@local",
 *   "manutentorEmail": "manutentor@local"    // obrigatório se status = "Em Andamento"
 * }
 *
 * Regras:
 * - operador pode criar SOMENTE "Aberto" (sem manutentorEmail)
 * - manutentor/gestor podem criar "Aberto" ou "Em Andamento"
 */
chamadosRouter.post("/chamados", async (req, res) => {
  try {
    const auth = (req as any).user as { id?: string, role?: string; email?: string } | undefined;

    // validação
    const parsed = CreateChamadoSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    const data = parsed.data;

    // quem está criando (header > body)
    const criadorEmail = auth?.email || data.criadoPorEmail;
    if (!criadorEmail) return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });

    // normalizações
    const tipo = (data.tipo ?? "corretiva") === "preventiva" ? "preventiva" : "corretiva";
    const role = (auth?.role || "gestor").toLowerCase();

    // Verifica permissão granular para decidir se pode criar chamados avançados (atribuir)
    // Se for operador (role) e NÃO tiver permissão, só pode abrir
    // Se tiver permissão 'chamados_gestao' (editar), pode tudo
    const hasGestao = auth?.id ? await checkPermission(auth.id, 'chamados_gestao', 'editar') : false;
    const canManage = role === 'manutentor' || role === 'gestor industrial' || role === 'admin' || hasGestao;

    // normaliza status informado, mas ele pode ser sobrescrito adiante
    let statusNorm = normalizeChamadoStatus(data.status) ?? CHAMADO_STATUS.ABERTO;

    // RBAC mínimo: quem não pode gerenciar (operador s/ permissão) só cria em Aberto
    if (!canManage) {
      if (statusNorm !== CHAMADO_STATUS.ABERTO) {
        return res.status(403).json({ error: "Operador só pode criar chamados em 'Aberto'." });
      }
      if (data.manutentorEmail) {
        return res.status(403).json({ error: "Operador não pode atribuir manutentor ao criar." });
      }
    }

    // id do criador
    const { rows: uCriador } = await pool.query(
      `SELECT id FROM public.usuarios WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [criadorEmail]
    );
    if (!uCriador.length) return res.status(400).json({ error: "criadoPorEmail inválido" });

    // resolve máquina: id direto > agendamento > tag/nome
    let maquinaId: string | null = data.maquinaId ?? null;

    if (!maquinaId && data.agendamentoId) {
      const { rows: ag } = await pool.query(
        `SELECT maquina_id FROM public.agendamentos_preventivos WHERE id=$1 LIMIT 1`,
        [data.agendamentoId]
      );
      if (ag.length) maquinaId = ag[0].maquina_id;
    }

    if (!maquinaId && (data.maquinaTag || data.maquinaNome)) {
      const { rows: maq } = await pool.query(
        `SELECT id FROM public.maquinas
           WHERE ($1::text IS NOT NULL AND tag=$1)
              OR ($2::text IS NOT NULL AND nome=$2)
           LIMIT 1`,
        [data.maquinaTag ?? null, data.maquinaNome ?? null]
      );
      if (!maq.length) return res.status(400).json({ error: "Máquina não encontrada" });
      maquinaId = maq[0].id;
    }

    if (!maquinaId) {
      return res.status(400).json({ error: "Informe maquinaId, maquinaTag ou maquinaNome." });
    }

    // checklist jsonb (opcional)
    let checklistFinal: any[] = [];
    if (Array.isArray(data.checklistItems) && data.checklistItems.length) {
      checklistFinal = data.checklistItems.map((t: string | number) => ({ item: String(t), resposta: "sim" }));
    }

    // manutentor (se vier email e o usuário tiver permissão para atribuir)
    let manutentorId: string | null = null;
    if (data.manutentorEmail && canManage) {
      const { rows: uMant } = await pool.query(
        `SELECT id FROM public.usuarios WHERE LOWER(email)=LOWER($1) LIMIT 1`,
        [data.manutentorEmail]
      );
      if (!uMant.length) return res.status(400).json({ error: "manutentorEmail inválido" });
      manutentorId = uMant[0].id;
    }

    // STATUS FINAL:
    //  - se tem manutentor, força "Em Andamento"
    //  - senão, usa o normalizado (padrão "Aberto")
    const statusFinal = manutentorId ? "Em Andamento" : statusNorm;

    // segurança: criamos apenas chamados "ativos"
    if (!["Aberto", "Em Andamento"].includes(statusFinal)) {
      return res.status(400).json({ error: "Status inválido para criação." });
    }

    // INSERT
    const { rows: created } = await pool.query(
      `INSERT INTO public.chamados
         (maquina_id, tipo, status, descricao,
          criado_por_id, manutentor_id,
          checklist)
       VALUES ($1,$2,$3,$4, $5,$6, $7::jsonb)
       RETURNING id`,
      [
        maquinaId,
        tipo,
        statusFinal,
        String(data.descricao).trim(),
        uCriador[0].id,
        manutentorId,     // null se não atribuído
        JSON.stringify(checklistFinal),
      ]
    );

    const chamadoId = created[0].id;

    const chamado = await getChamadoSummary(chamadoId);

    try { sseBroadcast?.({ topic: "chamados", action: "created", id: chamadoId }); } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }

    // Dispara notificação de email (fire-and-forget)
    void TicketCreatedNotification.handle(chamado);

    return res.status(201).json(chamado);

  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    return res.status(500).json({ error: String(e) });
  }
});

// ---------- Chamados: atualizar status ----------
/**
 * Body:
 * {
 *   "status": "Aberto" | "Em Andamento" | "Concluído",
 *   "manutentorEmail": "manutentor@local"  // obrigatório se status = "Em Andamento"
 * }
 *
 * Regras:
 * - "Em Andamento": manutentor/gestor
 * - "Concluído":    manutentor/gestor
 * - "Aberto":       gestor
 */
chamadosRouter.patch("/chamados/:id", async (req, res) => {
  try {
    const user = (req as any).user as { role?: string; email?: string } | undefined;
    const role = user?.role ?? "gestor"; // ambiente dev: default libera

    const id = String(req.params.id);
    const manutentorEmail = req.body?.manutentorEmail as string | undefined;

    const rawStatus = req.body?.status as string | undefined;
    const statusNorm = normalizeChamadoStatus(rawStatus);
    if (!statusNorm) return res.status(400).json({ error: "STATUS_INVALIDO" });

    const isEmAndamento = statusNorm === CHAMADO_STATUS.EM_ANDAMENTO;
    const isConcluido = statusNorm === CHAMADO_STATUS.CONCLUIDO;
    const isAberto = statusNorm === CHAMADO_STATUS.ABERTO;

    if (isEmAndamento && !(role === "manutentor" || role === "gestor industrial")) {
      return res.status(403).json({ error: "Apenas manutentor/gestor podem mover para 'Em Andamento'." });
    }
    if (isEmAndamento && !manutentorEmail) {
      return res.status(400).json({ error: "manutentorEmail é obrigatório quando status = 'Em Andamento'." });
    }
    if (isConcluido && !(role === "manutentor" || role === "gestor industrial")) {
      return res.status(403).json({ error: "Apenas manutentor/gestor podem concluir." });
    }
    if (isAberto && role !== "gestor industrial") {
      return res.status(403).json({ error: "Apenas gestor pode reabrir para 'Aberto'." });
    }

    const sql = `
      WITH mt AS (SELECT id FROM usuarios WHERE email = $2 LIMIT 1)
      UPDATE chamados c
      SET
        status = $1,
        manutentor_id = CASE
          WHEN $1 = 'Em Andamento' THEN (SELECT id FROM mt)
          WHEN $1 = 'Aberto' THEN NULL
          ELSE c.manutentor_id
        END,
        concluido_em = CASE
          WHEN $1 = 'Concluido' THEN NOW()
          WHEN $1 = 'Aberto' THEN NULL
          ELSE c.concluido_em
        END,
        concluido_por_id = CASE WHEN $1 = 'Concluido' THEN $3 ELSE c.concluido_por_id END,
        concluido_por_email = CASE WHEN $1 = 'Concluido' THEN $4 ELSE c.concluido_por_email END,
        concluido_por_nome  = CASE WHEN $1 = 'Concluido' THEN $5 ELSE c.concluido_por_nome  END,
        atualizado_em = NOW()
      WHERE c.id = $6
      RETURNING c.id;
    `;

    const upd = await pool.query(sql, [
      statusNorm,
      manutentorEmail ?? null,
      (req as any)?.user?.id ?? null,
      (req as any)?.user?.email ?? null,
      (req as any)?.user?.name ?? null,
      id,
    ]);
    if (upd.rowCount === 0) {
      return res.status(404).json({ error: "Chamado não encontrado ou manutentor inexistente." });
    }

    sseBroadcast({ topic: "chamados", action: "updated", id });

    res.json(await getChamadoSummary(id));
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// -------------------------------------------------------
// POST /chamados/:id/atribuir  (GESTOR atribui a alguém)
// body: { manutentorEmail: string }
// -> Atualiza manutentor_id, status = 'Em Andamento'
// -------------------------------------------------------
chamadosRouter.post(
  '/chamados/:id/atribuir',
  requirePermission('chamados_abertos', 'editar'),
  async (req, res) => {
    try {
      const chamadoId = String(req.params.id || '').trim();
      const manutentorEmail = String(req.body?.manutentorEmail || '').trim().toLowerCase();
      if (!chamadoId) return res.status(400).json({ error: 'ID inválido.' });
      if (!manutentorEmail) return res.status(400).json({ error: 'Informe manutentorEmail.' });

      // valida manutentor
      const { rows: um } = await pool.query(
        `SELECT id FROM public.usuarios WHERE lower(email)=lower($1) LIMIT 1`,
        [manutentorEmail]
      );
      if (!um.length) return res.status(400).json({ error: 'manutentorEmail inválido.' });
      const manutentorId = um[0].id;

      // pega status atual
      const { rows: cur } = await pool.query(
        `SELECT status FROM public.chamados WHERE id=$1 LIMIT 1`,
        [chamadoId]
      );
      if (!cur.length) return res.status(404).json({ error: 'Chamado não encontrado.' });
      const atual = normalizeChamadoStatus(cur[0].status);

      // se estava "Aberto", ao atribuir vira "Em Andamento"
      const novoStatus =
        atual === CHAMADO_STATUS.ABERTO ? CHAMADO_STATUS.EM_ANDAMENTO : atual;

      await pool.query(
        `UPDATE public.chamados
            SET manutentor_id = $2,
                status = $3,
                atualizado_em = NOW()
          WHERE id = $1`,
        [chamadoId, manutentorId, novoStatus]
      );

      try { sseBroadcast?.({ topic: 'chamados', action: 'updated', id: chamadoId }); } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }
      return res.json(await getChamadoSummary(chamadoId));
    } catch (e: any) {
      logger.error({ err: e }, 'Erro na rota');
      return res.status(500).json({ error: String(e) });
    }
  }
);

chamadosRouter.delete(
  '/chamados/:id/atribuir',
  requirePermission('chamados_abertos', 'editar'),
  async (req, res) => {
    try {
      const chamadoId = String(req.params.id || '').trim();
      if (!chamadoId) return res.status(400).json({ error: 'ID inválido.' });

      await pool.query(
        `UPDATE public.chamados
            SET manutentor_id = NULL,
                status = $2,
                atualizado_em = NOW()
          WHERE id = $1`,
        [chamadoId, CHAMADO_STATUS.ABERTO]
      );

      try { sseBroadcast?.({ topic: 'chamados', action: 'updated', id: chamadoId }); } catch (e) { logger.warn({ err: e }, 'sseBroadcast falhou (fire-and-forget)'); }
      return res.json(await getChamadoSummary(chamadoId));
    } catch (e: any) {
      logger.error({ err: e }, 'Erro na rota');
      return res.status(500).json({ error: String(e) });
    }
  }
);