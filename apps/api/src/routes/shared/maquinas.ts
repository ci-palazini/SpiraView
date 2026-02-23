import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { sseBroadcast } from '../../utils/sse';
import { requirePermission } from '../../middlewares/requirePermission';
import { userFromHeader } from '../../middlewares/userFromHeader';
import { logger } from '../../logger';

export const maquinasRouter: Router = Router();

/**
 * @swagger
 * /maquinas:
 *   get:
 *     summary: List machines
 *     tags: [Shared]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: escopo
 *         schema:
 *           type: string
 *           enum: [manutencao, producao]
 *         description: Filter by scope
 *     responses:
 *       200:
 *         description: List of machines
 */
maquinasRouter.get("/maquinas", async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const escopo = req.query.escopo as string | undefined; // 'manutencao' | 'producao' | undefined
    const params: any[] = [];
    let where = "1=1";

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (nome ILIKE $${params.length})`;
    }

    // Filtro por escopo
    if (escopo === 'manutencao') {
      where += " AND escopo_manutencao = TRUE";
    } else if (escopo === 'producao') {
      where += " AND escopo_producao = TRUE";
    }

    const { rows } = await pool.query(
      `SELECT id, nome, setor, escopo_manutencao, escopo_producao, escopo_planejamento, aliases_producao, parent_maquina_id, is_maquina_mae, exibir_filhos_dashboard, nome_producao
       FROM maquinas
       WHERE ${where}
       ORDER BY nome ASC`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});



// Criar máquina
maquinasRouter.post("/maquinas", async (req, res) => {
  try {
    const { nome, setor, parentId, isMaquinaMae, exibirFilhosDashboard, escopoManutencao, escopoProducao, escopoPlanejamento } = req.body ?? {};
    const nomeTrim = String(nome || "").trim();

    if (!nomeTrim || nomeTrim.length < 2) {
      return res.status(400).json({ error: "Nome da máquina é obrigatório." });
    }

    // Evita duplicado (mesmo sem UNIQUE no banco)
    const dup = await pool.query(
      `SELECT id FROM maquinas
        WHERE lower(nome) = lower($1)
        LIMIT 1`,
      [nomeTrim]
    );
    if ((dup.rowCount ?? 0) > 0) {
      return res.status(409).json({ error: "Já existe uma máquina com esse nome." });
    }

    const nomeProducaoTrim = req.body?.nomeProducao ? String(req.body.nomeProducao).trim() || null : null;
    const { rows } = await pool.query(
      `INSERT INTO maquinas (nome, setor, parent_maquina_id, is_maquina_mae, exibir_filhos_dashboard, escopo_manutencao, escopo_producao, escopo_planejamento, nome_producao)
       VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, true), COALESCE($6, true), COALESCE($7, false), COALESCE($8, false), $9)
       RETURNING id, nome, setor, parent_maquina_id, is_maquina_mae, exibir_filhos_dashboard, escopo_manutencao, escopo_producao, escopo_planejamento, nome_producao`,
      [nomeTrim, setor ?? null, parentId || null, !!isMaquinaMae, exibirFilhosDashboard !== undefined ? !!exibirFilhosDashboard : true, escopoManutencao !== undefined ? !!escopoManutencao : true, escopoProducao !== undefined ? !!escopoProducao : false, escopoPlanejamento !== undefined ? !!escopoPlanejamento : false, nomeProducaoTrim]
    );

    // SSE broadcast
    sseBroadcast({ topic: "maquinas", action: "created", id: rows[0].id });

    res.status(201).json(rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    // Se você tiver UNIQUE no banco, pode cair aqui:
    if (e?.code === "23505") {
      return res.status(409).json({ error: "Já existe uma máquina com esse nome." });
    }
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /maquinas/:id/parent - Atualizar máquina mãe (requer editar maquinas)
maquinasRouter.patch('/maquinas/:id/parent', requirePermission('maquinas', 'editar'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { parentId } = req.body; // pode ser null

    // Evitar auto-referência
    if (parentId && parentId === id) {
      return res.status(400).json({ error: 'Uma máquina não pode ser mãe de si mesma.' });
    }

    // (Opcional) Verificar ciclos mais profundos se necessário, mas 1 nível já ajuda.

    const upd = await pool.query(
      `UPDATE maquinas 
             SET parent_maquina_id = $2, atualizado_em = NOW()
             WHERE id = $1
             RETURNING id, nome, parent_maquina_id`,
      [id, parentId || null]
    );

    if (!upd.rowCount) {
      return res.status(404).json({ error: 'Máquina não encontrada.' });
    }

    sseBroadcast({ topic: 'maquinas', action: 'updated', id });
    res.json(upd.rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /maquinas/:id/escopo - Atualizar escopos e setor da máquina (requer editar maquinas)
maquinasRouter.patch('/maquinas/:id/escopo', requirePermission('maquinas', 'editar'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { escopoManutencao, escopoProducao, escopoPlanejamento, setor } = req.body || {};

    // Validar que pelo menos um escopo está ativo (se estiver sendo alterado)
    // Simplificação: apenas validar se escopos forem false explicitamente.
    const manut = escopoManutencao !== undefined ? !!escopoManutencao : null;
    const prod = escopoProducao !== undefined ? !!escopoProducao : null;
    const plan = escopoPlanejamento !== undefined ? !!escopoPlanejamento : null;
    const isMae = req.body.isMaquinaMae !== undefined ? !!req.body.isMaquinaMae : null;
    const exibeFilhos = req.body.exibirFilhosDashboard !== undefined ? !!req.body.exibirFilhosDashboard : null;

    if (manut === false && prod === false && plan === false) {
      return res.status(400).json({ error: 'A máquina deve ter pelo menos um escopo ativo.' });
    }

    const sets: string[] = [];
    const params: any[] = [id];

    if (manut !== null) {
      params.push(manut);
      sets.push(`escopo_manutencao = $${params.length}`);
    }
    if (prod !== null) {
      params.push(prod);
      sets.push(`escopo_producao = $${params.length}`);
    }
    if (plan !== null) {
      params.push(plan);
      sets.push(`escopo_planejamento = $${params.length}`);
    }
    // Setor pode ser string ou null
    if (setor !== undefined) {
      params.push(setor || null);
      sets.push(`setor = $${params.length}`);
    }
    // Configs de Mãe
    if (isMae !== null) {
      params.push(isMae);
      sets.push(`is_maquina_mae = $${params.length}`);
    }
    if (exibeFilhos !== null) {
      params.push(exibeFilhos);
      sets.push(`exibir_filhos_dashboard = $${params.length}`);
    }

    if (!sets.length) {
      return res.status(400).json({ error: 'Informe escopoManutencao, escopoProducao, setor ou configuracoes de mae.' });
    }

    const upd = await pool.query(
      `UPDATE maquinas SET ${sets.join(', ')}, atualizado_em = NOW()
       WHERE id = $1
       RETURNING id, nome, escopo_manutencao, escopo_producao, escopo_planejamento, setor, is_maquina_mae, exibir_filhos_dashboard`,
      params
    );

    if (!upd.rowCount) {
      return res.status(404).json({ error: 'Máquina não encontrada.' });
    }

    sseBroadcast({ topic: 'maquinas', action: 'updated', id });
    res.json(upd.rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /maquinas/:id/aliases-producao - Atualizar aliases para upload de produção (requer editar producao_config)
maquinasRouter.patch('/maquinas/:id/aliases-producao', requirePermission('producao_config', 'editar'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { aliases } = req.body || {};

    // Aceita array de strings ou null para limpar
    const aliasesArray: string[] = Array.isArray(aliases)
      ? aliases.map((a: unknown) => String(a).trim()).filter(Boolean)
      : [];

    const upd = await pool.query(
      `UPDATE maquinas 
       SET aliases_producao = $2, atualizado_em = NOW()
       WHERE id = $1::uuid
       RETURNING id, nome, aliases_producao`,
      [id, aliasesArray]
    );

    if (!upd.rowCount) {
      return res.status(404).json({ error: 'Máquina não encontrada.' });
    }

    sseBroadcast({ topic: 'maquinas', action: 'updated', id });
    res.json(upd.rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /maquinas/:id/nome-producao - Atualizar nome de exibição para produção
maquinasRouter.patch('/maquinas/:id/nome-producao', requirePermission('producao_config', 'editar'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { nomeProducao } = req.body || {};

    // Aceita string ou null para limpar
    const valor = typeof nomeProducao === 'string' ? nomeProducao.trim() || null : null;

    const upd = await pool.query(
      `UPDATE maquinas 
       SET nome_producao = $2, atualizado_em = NOW()
       WHERE id = $1::uuid
       RETURNING id, nome, nome_producao`,
      [id, valor]
    );

    if (!upd.rowCount) {
      return res.status(404).json({ error: 'Máquina não encontrada.' });
    }

    sseBroadcast({ topic: 'maquinas', action: 'updated', id });
    res.json(upd.rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

maquinasRouter.get('/maquinas/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const TZ = 'America/Sao_Paulo';

    // 1) Dados da máquina
    const maq = await pool.query(
      `
      SELECT
        id,
        nome,
        setor,
        escopo_manutencao,
        escopo_producao,
        escopo_planejamento,
        nome_producao,
        COALESCE(checklist_diario, '[]'::jsonb) AS checklist_diario
      FROM maquinas
      WHERE id = $1
      `,
      [id]
    );
    if (!maq.rowCount) {
      return res.status(404).json({ error: 'Máquina não encontrada.' });
    }

    // 2) Chamados ATIVOS (Aberto/Em Andamento)
    const ativos = await pool.query(
      `
      SELECT
        c.id,
        c.tipo,
        c.status,
        c.descricao,
        c.item,
        c.checklist_item_key,
        to_char(c.criado_em, 'YYYY-MM-DD HH24:MI') AS criado_em
      FROM chamados c
      WHERE c.maquina_id = $1
        AND c.status IN ('Aberto','Em Andamento')
      ORDER BY c.criado_em DESC
      LIMIT 50
      `,
      [id]
    );

    // 3) Últimas submissões de checklist (com totais e qtd de "nao")
    //    Usamos LATERAL para calcular total/nao em uma única varredura.
    const subms = await pool.query(
      `
      SELECT
        s.id,
        s.maquina_id,
        s.operador_nome,
        s.operador_email,
        COALESCE(NULLIF(s.turno,''),'') AS turno,
        s.respostas,
        to_char(COALESCE(s.created_at, s.criado_em), 'YYYY-MM-DD HH24:MI') AS criado_em,
        stats.total_itens,
        stats.itens_nao
      FROM checklist_submissoes s
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)                                        AS total_itens,
          COUNT(*) FILTER (WHERE e.value = 'nao')         AS itens_nao
        FROM jsonb_each_text(s.respostas) AS e
      ) AS stats ON TRUE
      WHERE s.maquina_id = $1
      ORDER BY COALESCE(s.created_at, s.criado_em) DESC
      LIMIT 50
      `,
      [id]
    );

    // 4) histórico agregado por dia/turno (para a tabela "histórico de Conformidade Diária")
    // IMPORTANTE: usamos data_ref (que já considera a regra de turnos) ao invés de created_at
    const historico = await pool.query(
      `
      WITH base AS (
        SELECT
          data_ref AS dia,
          COALESCE(NULLIF(turno,''),'') AS turno_raw,
          COALESCE(operador_nome,'') AS operador_nome,
          operador_email
        FROM checklist_submissoes
        WHERE maquina_id = $1
      ),
      norm AS (
        SELECT
          dia,
          /* normaliza: aceita 1, 1º, 1o, 1°, primeiro, turno1; idem para 2 */
          CASE
            WHEN lower(turno_raw) IN ('1','1º','1o','1°','primeiro','turno1') THEN '1º'
            WHEN lower(turno_raw) IN ('2','2º','2o','2°','segundo','turno2')   THEN '2º'
            ELSE turno_raw
          END AS turno_norm,
          operador_nome,
          operador_email
        FROM base
        WHERE dia IS NOT NULL
      )
      SELECT
        to_char(dia, 'YYYY-MM-DD') AS dia,
        (COUNT(*) FILTER (WHERE turno_norm = '1º') > 0)::bool AS turno1_ok,
        (COUNT(*) FILTER (WHERE turno_norm = '2º') > 0)::bool AS turno2_ok,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object('nome', operador_nome, 'email', operador_email))
          FILTER (WHERE turno_norm = '1º'),
          '[]'::jsonb
        ) AS turno1_detalhes,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object('nome', operador_nome, 'email', operador_email))
          FILTER (WHERE turno_norm = '2º'),
          '[]'::jsonb
        ) AS turno2_detalhes
      FROM norm
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 60
      `,
      [id]
    );

    // 5) Extrai as keys de itens com chamados abertos (preditivas)
    const itensComChamadoAberto = ativos.rows
      .filter((c: { tipo?: string; checklist_item_key?: string }) =>
        c.tipo === 'preditiva' && c.checklist_item_key
      )
      .map((c: { checklist_item_key: string }) => c.checklist_item_key);

    // 6) Resposta
    res.json({
      ...maq.rows[0],
      chamadosAtivos: ativos.rows,       // cards "Chamados Ativos"
      checklistHistorico: subms.rows,    // lista das últimas submissões (com totais)
      historicoChecklist: historico.rows, // agregado por dia/turno p/ a tabela do painel
      itensComChamadoAberto,             // keys de itens com chamado preditivo aberto
    });
  } catch (e) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

maquinasRouter.patch(
  '/maquinas/:id/nome',
  requirePermission('maquinas', 'editar'),
  async (req, res) => {
    const id = String(req.params.id || '').trim();
    const novoNome = String(req.body?.nome ?? '').trim();

    if (!id) return res.status(400).json({ error: 'ID_OBRIGATORIO' });
    if (!novoNome) return res.status(400).json({ error: 'NOME_OBRIGATORIO' });

    try {
      // 0) Existe?
      const cur = await pool.query(
        `SELECT id, nome FROM public.maquinas WHERE id = $1::uuid`,
        [id]
      );
      if (!cur.rowCount) return res.status(404).json({ error: 'MAQUINA_NAO_ENCONTRADA' });

      // 1) Duplicidade (nome sempre)
      const dup = await pool.query(
        `
        SELECT 1
          FROM public.maquinas
         WHERE id <> $2::uuid
           AND lower(nome) = lower($1::text)
         LIMIT 1
        `,
        [novoNome, id]
      );
      if (dup.rowCount) return res.status(409).json({ error: 'MAQUINA_DUPLICADA' });

      // 2) UPDATE
      const upd = await pool.query(
        `
        UPDATE public.maquinas
           SET nome = $2::text,
               atualizado_em = now()
         WHERE id = $1::uuid
         RETURNING id, nome, setor, critico
        `,
        [id, novoNome]
      );

      try { sseBroadcast({ topic: 'maquinas', action: 'updated', id }); } catch { }
      return res.json(upd.rows[0]);
    } catch (e: any) {
      console.error('PATCH /maquinas/:id/nome error:', {
        message: e?.message,
        code: e?.code,
        detail: e?.detail
      });
      if (e?.code === '23505') return res.status(409).json({ error: 'MAQUINA_DUPLICADA' });
      if (e?.code === '22P02') return res.status(400).json({ error: 'ID_INVALIDO' });
      if (e?.code === '42703') return res.status(500).json({ error: 'COLUNA_INEXISTENTE', detail: e?.detail });
      return res.status(500).json({ error: 'ERRO_RENOMEAR_MAQUINA' });
    }
  }
);

// ADICIONAR ITEM AO CHECKLIST DIÁRIO DA MÁQUINA
maquinasRouter.post('/maquinas/:id/checklist-add', async (req, res) => {
  try {
    const id = String(req.params.id);
    const item = String(req.body?.item || '').trim();

    if (!item) return res.status(400).json({ error: 'Item inválido.' });

    // evita duplicados (case-insensitive) e adiciona no final
    const { rows } = await pool.query(
      `
      UPDATE maquinas
         SET checklist_diario =
               CASE
                 WHEN EXISTS (
                   SELECT 1
                     FROM jsonb_array_elements_text(COALESCE(checklist_diario,'[]'::jsonb)) AS x(val)
                    WHERE lower(val) = lower($2)
                 )
                 THEN COALESCE(checklist_diario,'[]'::jsonb)
                 ELSE COALESCE(checklist_diario,'[]'::jsonb) || to_jsonb(ARRAY[$2]::text[])
               END
       WHERE id = $1
       RETURNING COALESCE(checklist_diario,'[]'::jsonb) AS checklist_diario;
      `,
      [id, item]
    );

    if (!rows.length) return res.status(404).json({ error: 'Máquina não encontrada.' });
    res.json({ checklistDiario: rows[0].checklist_diario });
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// REMOVER ITEM DO CHECKLIST DIÁRIO DA MÁQUINA
maquinasRouter.post('/maquinas/:id/checklist-remove', async (req, res) => {
  try {
    const id = String(req.params.id);
    const item = String(req.body?.item || '').trim();
    if (!item) return res.status(400).json({ error: 'Item inválido.' });

    const { rows } = await pool.query(
      `
      UPDATE maquinas
         SET checklist_diario = (
               SELECT COALESCE(jsonb_agg(to_jsonb(val)), '[]'::jsonb)
                 FROM jsonb_array_elements_text(COALESCE(checklist_diario,'[]'::jsonb)) AS x(val)
                WHERE lower(val) <> lower($2)
             )
       WHERE id = $1
       RETURNING COALESCE(checklist_diario,'[]'::jsonb) AS checklist_diario;
      `,
      [id, item]
    );

    if (!rows.length) return res.status(404).json({ error: 'Máquina não encontrada.' });
    res.json({ checklistDiario: rows[0].checklist_diario });
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// REORDENAR ITENS DO CHECKLIST DIÁRIO DA MÁQUINA
maquinasRouter.post('/maquinas/:id/checklist-reorder', async (req, res) => {
  try {
    const id = String(req.params.id);
    const items = req.body?.items;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items deve ser um array.' });
    }

    // Valida que são strings
    const validItems = items.filter((i: unknown) => typeof i === 'string' && i.trim());

    const { rows } = await pool.query(
      `
      UPDATE maquinas
         SET checklist_diario = $2::jsonb
       WHERE id = $1
       RETURNING COALESCE(checklist_diario,'[]'::jsonb) AS checklist_diario;
      `,
      [id, JSON.stringify(validItems)]
    );

    if (!rows.length) return res.status(404).json({ error: 'Máquina não encontrada.' });
    res.json({ checklistDiario: rows[0].checklist_diario });
  } catch (e: any) {
    logger.error({ err: e }, 'Erro na rota');
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /maquinas/:id (requer editar maquinas)
maquinasRouter.delete('/maquinas/:id', requirePermission('maquinas', 'editar'), async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'id inválido' });
  }

  try {
    const r = await pool.query('DELETE FROM public.maquinas WHERE id = $1::uuid', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Máquina não encontrada.' });
    return res.status(204).end();
  } catch (e: any) {
    logger.error({ err: e }, 'DELETE /maquinas/:id');
    if (e?.code === '23503') {
      const detail = e.detail || '';
      let msg = 'Não é possível excluir esta máquina pois ela possui registros vinculados.';

      if (detail.includes('checklist_submissoes') || detail.includes('fk_subs_maquina')) msg = 'Esta máquina possui checklists preenchidos.';
      else if (detail.includes('checklist_pendencias')) msg = 'Esta máquina possui pendências de checklist (tente novamente após aplicar a migração de cascade).';
      else if (detail.includes('chamados') || detail.includes('fk_chamados_maquina')) msg = 'Esta máquina possui chamados de manutenção.';
      else if (detail.includes('agendamentos_preventivos')) msg = 'Esta máquina possui agendamentos preventivos.';
      else if (detail.includes('planejamento_reservas')) msg = 'Esta máquina possui reservas no planejamento.';
      else if (detail.includes('producao_metas')) msg = 'Esta máquina possui metas de produção definidas.';
      else if (detail.includes('producao_lancamentos')) msg = 'Esta máquina possui lançamentos de produção.';
      else if (detail.includes('maquinas_parent_maquina_id_fkey')) msg = 'Esta máquina possui máquinas filhas vinculadas via hierarquia.';

      return res.status(409).json({ error: msg });
    }
    return res.status(500).json({ error: 'Erro interno ao excluir máquina.' });
  }
});

