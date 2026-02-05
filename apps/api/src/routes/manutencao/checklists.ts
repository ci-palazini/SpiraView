import { Router } from 'express';
import { pool } from '../../db';
import { slugify } from '../../utils/slug';
import { sseBroadcast } from '../../utils/sse';

export const checklistsRouter: Router = Router();

/**
 * @swagger
 * /checklists/daily/submit:
 *   post:
 *     summary: Submit a daily checklist
 *     tags: [Manutencao]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [operadorEmail, maquinaId, respostas]
 *             properties:
 *               operadorEmail:
 *                 type: string
 *               maquinaId:
 *                 type: string
 *               respostas:
 *                 type: object
 *     responses:
 *       200:
 *         description: Checklist submitted
 */
checklistsRouter.post('/checklists/daily/submit', async (req, res) => {
  try {
    const auth = (req as any).user || {};
    if (!auth?.email) return res.status(401).json({ error: 'Sem Usuário no header.' });

    const {
      operadorEmail = auth.email,
      operadorNome = '',
      maquinaId,
      maquinaNome = '',
      respostas = {},
      turno = ''
    } = req.body || {};

    if (!operadorEmail || !maquinaId || !respostas || typeof respostas !== 'object') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }

    // operador
    const u = await pool.query(`SELECT id, nome FROM usuarios WHERE email = $1`, [operadorEmail]);
    if (!u.rowCount) return res.status(404).json({ error: 'Operador não encontrado.' });
    const operadorId = u.rows[0].id;
    const operadorNomeFinal = operadorNome || u.rows[0].nome || '';

    // máquina
    const m = await pool.query(`SELECT id, nome FROM maquinas WHERE id = $1`, [maquinaId]);
    if (!m.rowCount) return res.status(404).json({ error: 'Máquina não encontrada.' });
    const maquinaNomeFinal = maquinaNome || m.rows[0].nome || '';

    // 1) grava submissão
    // REGRA DE TURNOS:
    // - 1º turno: 05:30 às 15:18 (do mesmo dia)
    // - 2º turno: 15:18 às 00:44 (do dia seguinte)
    // Se a hora for entre 00:00 e 00:44, é 2º turno do DIA ANTERIOR
    await pool.query(
      `INSERT INTO checklist_submissoes
        (operador_id, operador_nome, operador_email,
          maquina_id,  maquina_nome,  respostas, turno, created_at, data_ref)
      VALUES (
        $1,$2,$3,$4,$5,$6::jsonb,
        /* turno normalizado - se hora < 00:45, é 2º turno */
        CASE
          WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time < '00:45' THEN '2º'
          WHEN lower($7) IN ('turno1','1','1º','1o','1°','primeiro') THEN '1º'
          WHEN lower($7) IN ('turno2','2','2º','2o','2°','segundo')   THEN '2º'
          WHEN coalesce($7,'') = '' THEN
            CASE WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time < '15:18' THEN '1º' ELSE '2º' END
          ELSE
            CASE
              WHEN regexp_replace(lower($7),'[^0-9]','','g') = '1' THEN '1º'
              WHEN regexp_replace(lower($7),'[^0-9]','','g') = '2' THEN '2º'
              ELSE CASE WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time < '15:18' THEN '1º' ELSE '2º' END
            END
        END,
        now(),
        /* data_ref: se hora < 00:45, usar dia anterior (2º turno do dia anterior) */
        CASE 
          WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time < '00:45' 
          THEN (now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '1 day'
          ELSE (now() AT TIME ZONE 'America/Sao_Paulo')::date
        END
      )
      ON CONFLICT (operador_id, maquina_id, data_ref, turno)
      DO UPDATE SET
        respostas     = EXCLUDED.respostas,
        turno         = EXCLUDED.turno,
        operador_nome = EXCLUDED.operador_nome,
        maquina_nome  = EXCLUDED.maquina_nome,
        updated_at    = now()`
      ,
      [operadorId, operadorNomeFinal, operadorEmail, maquinaId, maquinaNomeFinal, JSON.stringify(respostas), turno]
    );


    // 2) cria chamados preditivos para itens 'nao' (sem duplicar)
    let gerados = 0;
    for (const [pergunta, valor] of Object.entries(respostas as Record<string, string>)) {
      if (valor !== 'nao') continue;

      const key = slugify(pergunta);

      // já existe aberto/andamento para este item desta máquina?
      const { rows: ja } = await pool.query(
        `SELECT 1
          FROM chamados
          WHERE maquina_id = $1
            AND tipo = 'preditiva'
            AND checklist_item_key = $2
            AND status IN ('Aberto','Em Andamento')
          LIMIT 1`,
        [maquinaId, key]
      );
      if (ja.length) continue;

      const descricao = `Checklist: item "${pergunta}" marcado como NÃO.`;

      try {
        const { rows: createdInfos } = await pool.query(
          `INSERT INTO chamados
            (maquina_id, tipo, status, descricao, criado_por_id, item, checklist_item_key)
          VALUES ($1, 'preditiva', 'Aberto', $2, $3, $4, $5)
          RETURNING id, tipo, descricao, criado_em`,
          [maquinaId, descricao, operadorId, pergunta, key]
        );

        // Dispara notificação
        if (createdInfos.length) {
          const novoChamado = {
            ...createdInfos[0],
            maquina: maquinaNomeFinal, // Já temos o nome da máquina aqui
            criado_por: operadorNomeFinal
          };
          try { sseBroadcast?.({ topic: 'chamados', action: 'created' }); } catch { }
          // Async notification
          void import('../../services/notifications/TicketCreated').then(m => m.TicketCreatedNotification.handle(novoChamado));
        }

        gerados++;
      } catch (e: any) {
        if (e.code === '23505') {
          // Já existe uma preditiva ativa p/ (maquina_id, checklist_item_key) -> ignorar
        } else {
          throw e;
        }
      }
    }

    res.json({ ok: true, chamados_gerados: gerados });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});



checklistsRouter.get('/checklists/daily/submissoes', async (req, res) => {
  try {
    const operadorEmail = String(req.query.operadorEmail || '')
      .trim()
      .toLowerCase();           // normalize no parâmetro
    const dateISO = String(req.query.date || '').slice(0, 10); // 'YYYY-MM-DD'
    const maquinaId = req.query.maquinaId ? String(req.query.maquinaId).trim() : null;

    if (!operadorEmail || !dateISO) {
      return res.status(400).json({ error: 'Informe operadorEmail e date (YYYY-MM-DD).' });
    }

    // Monta a query base
    let sql = `SELECT
        id,
        operador_id,
        operador_nome,
        operador_email,
        maquina_id,
        maquina_nome,
        respostas,
        turno,
        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as criado_em
      FROM checklist_submissoes
      WHERE operador_email = $1
        AND created_at >= ($2::date AT TIME ZONE 'America/Sao_Paulo')
        AND created_at <  (($2::date + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')`;

    const params: (string | null)[] = [operadorEmail, dateISO];

    // Se maquinaId foi informado, filtra também
    if (maquinaId) {
      sql += ` AND maquina_id = $3`;
      params.push(maquinaId);
    }

    sql += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(sql, params);

    res.json({ items: rows });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});


// GET /checklists/overview - Retorna status consolidado de todas as maquinas para uma data
// Otimizado para fazer uma única query em vez de N+1
checklistsRouter.get('/checklists/overview', async (req, res) => {
  try {
    const dateParam = String(req.query.date || '').trim();
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return res.status(400).json({ error: 'Data inválida (YYYY-MM-DD)' });
    }

    // LISTAR TODAS AS MÁQUINAS DO ESCOPO DE MANUTENÇÃO
    // LEFT JOIN 1: status do dia selecionado
    // LEFT JOIN 2: última submissão geral (independente da data)

    const sql = `
      WITH subs_dia AS (
        SELECT
          maquina_id,
          CASE
            WHEN lower(turno) IN ('1','1º','1o','1°','primeiro','turno1') THEN '1'
            WHEN lower(turno) IN ('2','2º','2o','2°','segundo','turno2')   THEN '2'
            ELSE '1'
          END AS turno_norm,
          operador_nome,
          created_at
        FROM checklist_submissoes
        WHERE data_ref = $1::date
      ),
      agregado_dia AS (
         SELECT
           maquina_id,
           bool_or(turno_norm = '1') AS t1_ok,
           bool_or(turno_norm = '2') AS t2_ok,
           string_agg(DISTINCT operador_nome, ', ') FILTER (WHERE turno_norm = '1') as t1_nomes,
           string_agg(DISTINCT operador_nome, ', ') FILTER (WHERE turno_norm = '2') as t2_nomes
         FROM subs_dia
         GROUP BY 1
      ),
      ultima_sub AS (
         SELECT 
           maquina_id, 
           MAX(created_at) as last_at
         FROM checklist_submissoes
         GROUP BY 1
      )
      SELECT
        m.id,
        m.nome,
        (CASE WHEN jsonb_array_length(COALESCE(m.checklist_diario,'[]'::jsonb)) > 0 THEN true ELSE false END) as has_checklist,
        COALESCE(a.t1_ok, false) as t1_ok,
        COALESCE(a.t2_ok, false) as t2_ok,
        COALESCE(a.t1_nomes, '') as t1_nomes,
        COALESCE(a.t2_nomes, '') as t2_nomes,
        to_char(u.last_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as last_sub_at
      FROM maquinas m
      LEFT JOIN agregado_dia a ON a.maquina_id = m.id
      LEFT JOIN ultima_sub u ON u.maquina_id = m.id
      WHERE m.escopo_manutencao = true
      ORDER BY m.nome ASC
    `;

    const { rows } = await pool.query(sql, [dateParam]);

    const items = rows.map(r => ({
      id: r.id,
      nome: r.nome,
      hasChecklist: r.has_checklist,
      turno1Ok: r.t1_ok,
      turno2Ok: r.t2_ok,
      turno1Nomes: r.t1_nomes ? r.t1_nomes.split(',').map((s: string) => s.trim()) : [],
      turno2Nomes: r.t2_nomes ? r.t2_nomes.split(',').map((s: string) => s.trim()) : [],
      lastSubmissionAt: r.last_sub_at || null
    }));

    res.json({ items });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /checklists/overview/range - Retorna status consolidado para um intervalo de datas
// Usado na exportação Excel
checklistsRouter.get('/checklists/overview/range', async (req, res) => {
  try {
    const start = String(req.query.start || '').trim();
    const end = String(req.query.end || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: 'Datas inválidas usage: ?start=YYYY-MM-DD&end=YYYY-MM-DD' });
    }

    const sql = `
      WITH raw_subs AS (
        SELECT
          maquina_id,
          data_ref,
          CASE
            WHEN lower(turno) IN ('1','1º','1o','1°','primeiro','turno1') THEN '1'
            WHEN lower(turno) IN ('2','2º','2o','2°','segundo','turno2')   THEN '2'
            ELSE '1'
          END AS turno_norm
        FROM checklist_submissoes
        WHERE data_ref >= $1::date AND data_ref <= $2::date
      ),
      agregado AS (
        SELECT
          maquina_id,
          data_ref,
          bool_or(turno_norm = '1') AS t1_ok,
          bool_or(turno_norm = '2') AS t2_ok
        FROM raw_subs
        GROUP BY 1, 2
      )
      SELECT
        m.id,
        m.nome,
        (CASE WHEN jsonb_array_length(COALESCE(m.checklist_diario,'[]'::jsonb)) > 0 THEN true ELSE false END) as has_checklist,
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(a.data_ref, 'YYYY-MM-DD'),
            't1Ok', a.t1_ok,
            't2Ok', a.t2_ok
          )
        ) FILTER (WHERE a.data_ref IS NOT NULL) as days
      FROM maquinas m
      LEFT JOIN agregado a ON a.maquina_id = m.id
      WHERE m.escopo_manutencao = true
      GROUP BY m.id, m.nome, m.checklist_diario
      ORDER BY m.nome ASC
    `;

    const { rows } = await pool.query(sql, [start, end]);

    const items = rows.map(r => ({
      id: r.id,
      nome: r.nome,
      hasChecklist: r.has_checklist,
      days: r.days || []
    }));

    res.json({ items });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

