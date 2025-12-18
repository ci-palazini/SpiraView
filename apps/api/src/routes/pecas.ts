import { Router } from 'express';
import { pool, withTx } from '../db';
import { sseBroadcast } from '../utils/sse';

export const pecasRouter: Router = Router();

pecasRouter.post('/pecas', async (req, res) => {
  try {
    const auth = (req as any).user || {};
    if (auth.role !== 'gestor') return res.status(403).json({ error: 'Somente gestor.' });

    const {
      codigo,
      nome,
      categoria = null,
      estoqueMinimo = 0,
      localizacao = null,
      estoqueAtual = 0, // opcional (normalmente comeÃ§amos em 0)
    } = req.body || {};

    if (!codigo || !nome) return res.status(400).json({ error: 'Informe cÃ³digo e nome.' });
    if (estoqueMinimo < 0 || estoqueAtual < 0) return res.status(400).json({ error: 'Estoque nÃ£o pode ser negativo.' });

    const insert = await pool.query(
      `INSERT INTO pecas (codigo, nome, categoria, estoque_minimo, localizacao, estoque_atual)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, codigo, nome, categoria,
                 estoque_atual AS "estoqueAtual",
                 estoque_minimo AS "estoqueMinimo",
                 localizacao`,
      [codigo, nome, categoria, estoqueMinimo, localizacao, estoqueAtual]
    );

    // opcional: notificar SSE
    sseBroadcast({ topic: 'pecas', action: 'created', id: insert.rows[0].id });

    res.status(201).json(insert.rows[0]);
  } catch (e: any) {
    if (String(e?.message || '').includes('pecas_codigo_key')) {
      return res.status(409).json({ error: 'JÃ¡ existe uma peÃ§a com esse cÃ³digo.' });
    }
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ATUALIZAR PEÃ‡A (somente gestor)
pecasRouter.put('/pecas/:id', async (req, res) => {
  try {
    const auth = (req as any).user || {};
    if (auth.role !== 'gestor') return res.status(403).json({ error: 'Somente gestor.' });

    const id = String(req.params.id);
    const {
      codigo,
      nome,
      categoria = null,
      estoqueMinimo = 0,
      localizacao = null
    } = req.body || {};

    if (!codigo || !nome) return res.status(400).json({ error: 'Informe cÃ³digo e nome.' });
    if (estoqueMinimo < 0) return res.status(400).json({ error: 'Estoque mÃ­nimo invÃ¡lido.' });

    const upd = await pool.query(
      `UPDATE pecas
          SET codigo=$2, nome=$3, categoria=$4, estoque_minimo=$5, localizacao=$6
        WHERE id=$1
      RETURNING id, codigo, nome, categoria,
                estoque_atual AS "estoqueAtual",
                estoque_minimo AS "estoqueMinimo",
                localizacao`,
      [id, codigo, nome, categoria, estoqueMinimo, localizacao]
    );

    if (!upd.rowCount) return res.status(404).json({ error: 'PeÃ§a nÃ£o encontrada.' });

    sseBroadcast({ topic: 'pecas', action: 'updated', id });
    res.json(upd.rows[0]);
  } catch (e: any) {
    if (String(e?.message || '').includes('pecas_codigo_key')) {
      return res.status(409).json({ error: 'JÃ¡ existe uma peÃ§a com esse cÃ³digo.' });
    }
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// Lista de peÃ§as (para a EstoquePage)
pecasRouter.get('/pecas', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         codigo,
         nome,
         categoria,
         estoque_atual  AS "estoqueAtual",
         estoque_minimo AS "estoqueMinimo",
         localizacao
       FROM pecas
       ORDER BY codigo ASC`
    );
    res.json({ items: rows });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /pecas/:id  (somente gestor)
pecasRouter.delete('/pecas/:id', async (req, res) => {
  try {
    const auth = (req as any).user || {};
    if (auth.role !== 'gestor') {
      return res.status(403).json({ error: 'Somente gestor.' });
    }

    const id = String(req.params.id);
    const r = await pool.query('DELETE FROM pecas WHERE id = $1', [id]);
    if (r.rowCount === 0) {
      return res.status(404).json({ error: 'PeÃ§a nÃ£o encontrada.' });
    }

    sseBroadcast({ topic: 'pecas', action: 'deleted', id });
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// Lista de chamados com filtros opcionais (tipo, status, PerÃ­odo e mÃ¡quina)

pecasRouter.post('/pecas/:id/movimentacoes', async (req, res) => {
  try {
    const auth = (req as any).user || {};
    if (!['gestor', 'manutentor'].includes(auth.role)) {
      return res.status(403).json({ error: 'Somente gestor/manutentor.' });
    }
    const pecaId = String(req.params.id);
    const { tipo, quantidade, descricao } = req.body || {};
    const q = Number(quantidade);
    if (!['entrada', 'saida'].includes(String(tipo)) || !Number.isFinite(q) || q <= 0) {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }


    // Verificar estoque disponível antes de saída
    if (tipo === 'saida') {
      const pecaCheck = await pool.query('SELECT estoque_atual FROM pecas WHERE id = $1', [pecaId]);
      if (!pecaCheck.rowCount) {
        return res.status(404).json({ error: 'Peça não encontrada.' });
      }
      const estoqueAtual = pecaCheck.rows[0].estoque_atual || 0;
      if (estoqueAtual < q) {
        return res.status(400).json({
          error: `Estoque insuficiente. Disponível: ${estoqueAtual}, solicitado: ${q}`
        });
      }
    }

    const { movimentacaoId, peca } = await withTx(async (client) => {
      // Inserir a movimentação - o trigger 'tg_movimentacoes_apply' já atualiza o estoque automaticamente
      const mov = await client.query(
        `INSERT INTO movimentacoes (peca_id, tipo, quantidade, descricao, usuario_email)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [pecaId, tipo, q, descricao || null, auth.email || null]
      );
      if (!mov.rowCount) throw new Error('Falha ao registrar movimentação.');

      // Buscar peça com estoque atualizado (o trigger já aplicou a alteração)
      const upd = await client.query(
        `SELECT id, codigo, nome, estoque_atual FROM pecas WHERE id = $1`,
        [pecaId]
      );
      if (!upd.rowCount) throw new Error('Peça não encontrada.');

      return { movimentacaoId: mov.rows[0].id, peca: upd.rows[0] };
    });

    res.json({ ok: true, movimentacaoId, peca });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /movimentacoes - Listar histórico de movimentações
pecasRouter.get('/movimentacoes', async (req, res) => {
  try {
    const { pecaId, tipo, dataInicio, dataFim, limit = '100' } = req.query;

    const params: any[] = [];
    const where: string[] = [];

    if (pecaId) {
      params.push(String(pecaId));
      where.push(`m.peca_id = $${params.length}`);
    }

    if (tipo && ['entrada', 'saida'].includes(String(tipo))) {
      params.push(String(tipo));
      where.push(`m.tipo = $${params.length}`);
    }

    if (dataInicio) {
      params.push(String(dataInicio));
      where.push(`m.criado_em >= $${params.length}::date`);
    }

    if (dataFim) {
      params.push(String(dataFim));
      where.push(`m.criado_em < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 500);

    const { rows } = await pool.query(
      `SELECT 
        m.id,
        m.peca_id AS "pecaId",
        p.codigo AS "pecaCodigo",
        p.nome AS "pecaNome",
        m.tipo,
        m.quantidade,
        m.descricao,
        m.usuario_email AS "usuarioEmail",
        COALESCE(u.nome, m.usuario_email) AS "usuarioNome",
        m.criado_em AS "criadoEm",
        m.estoque_apos AS "estoqueApos"
       FROM movimentacoes m
       JOIN pecas p ON p.id = m.peca_id
       LEFT JOIN usuarios u ON LOWER(u.email) = LOWER(m.usuario_email)
       ${whereSql}
       ORDER BY m.criado_em DESC
       LIMIT ${limitNum}`,
      params
    );

    res.json({ items: rows });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});


