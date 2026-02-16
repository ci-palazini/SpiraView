// apps/api/src/routes/producao/lancamentos.ts
import { Router } from 'express';
import { pool } from '../../db';
import { sseBroadcast } from '../../utils/sse';

export const lancamentosRouter: Router = Router();

// Helper: verificar permissão granular inline
async function checkPermission(userId: string, pageKey: string, level: 'ver' | 'editar'): Promise<boolean> {
    if (!userId) return false;
    const { rows } = await pool.query<{ permissoes: Record<string, string>; role_nome: string }>(
        `SELECT r.permissoes, r.nome as role_nome FROM usuarios u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 LIMIT 1`,
        [userId]
    );

    if (!rows.length) return false;

    const dbRoleName = (rows[0].role_nome || '').toLowerCase();
    if (dbRoleName === 'admin') return true; // Admin tem acesso total
    const permissions = rows[0]?.permissoes || {};
    const userPerm = permissions[pageKey];
    if (!userPerm || userPerm === 'nenhum') return false;
    if (level === 'ver') return userPerm === 'ver' || userPerm === 'editar';
    return userPerm === 'editar';
}

// GET /producao/lancamentos - Listar lançamentos
lancamentosRouter.get('/producao/lancamentos', async (req, res) => {
    try {
        const maquinaId = req.query.maquinaId as string | undefined;
        const dataRef = req.query.dataRef as string | undefined;
        const dataInicio = req.query.dataInicio as string | undefined;
        const dataFim = req.query.dataFim as string | undefined;

        const params: any[] = [];
        let where = '1=1';

        if (maquinaId) {
            params.push(maquinaId);
            where += ` AND pl.maquina_id = $${params.length}`;
        }

        if (dataRef) {
            params.push(dataRef);
            where += ` AND pl.data_ref = $${params.length}`;
        } else {
            if (dataInicio) {
                params.push(dataInicio);
                where += ` AND pl.data_ref >= $${params.length}`;
            }
            if (dataFim) {
                params.push(dataFim);
                where += ` AND pl.data_ref <= $${params.length}`;
            }
        }

        const { rows } = await pool.query(
            `SELECT
        pl.id,
        pl.maquina_id AS "maquinaId",
        m.nome AS "maquinaNome",
        m.tag AS "maquinaTag",
        pl.data_ref AS "dataRef",
        pl.turno,
        pl.horas_realizadas AS "horasRealizadas",
        pl.observacao,
        pl.lancado_por_nome AS "lancadoPorNome",
        pl.upload_id AS "uploadId",
        pl.criado_em AS "criadoEm"
      FROM producao_lancamentos pl
      JOIN maquinas m ON m.id = pl.maquina_id
      WHERE ${where}
      ORDER BY pl.data_ref DESC, m.nome ASC, pl.turno ASC`,
            params
        );

        res.json({ items: rows });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/lancamentos/:id - Detalhes de um lançamento
lancamentosRouter.get('/producao/lancamentos/:id', async (req, res) => {
    try {
        const id = String(req.params.id);

        const { rows } = await pool.query(
            `SELECT
        pl.id,
        pl.maquina_id AS "maquinaId",
        m.nome AS "maquinaNome",
        m.tag AS "maquinaTag",
        pl.data_ref AS "dataRef",
        pl.turno,
        pl.horas_realizadas AS "horasRealizadas",
        pl.observacao,
        pl.lancado_por_id AS "lancadoPorId",
        pl.lancado_por_nome AS "lancadoPorNome",
        pl.lancado_por_email AS "lancadoPorEmail",
        pl.upload_id AS "uploadId",
        pl.criado_em AS "criadoEm",
        pl.atualizado_em AS "atualizadoEm"
      FROM producao_lancamentos pl
      JOIN maquinas m ON m.id = pl.maquina_id
      WHERE pl.id = $1`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Lançamento não encontrado.' });
        }

        res.json(rows[0]);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// POST /producao/lancamentos - Criar lançamento manual
lancamentosRouter.post('/producao/lancamentos', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        if (!await checkPermission(auth.id, 'producao_upload', 'editar')) {
            return res.status(403).json({ error: 'Sem permissão para lançar produção.' });
        }

        const { maquinaId, dataRef, turno, horasRealizadas, observacao } = req.body || {};

        if (!maquinaId || !dataRef || horasRealizadas === undefined) {
            return res.status(400).json({ error: 'Informe maquinaId, dataRef e horasRealizadas.' });
        }

        if (Number(horasRealizadas) < 0) {
            return res.status(400).json({ error: 'horasRealizadas não pode ser negativo.' });
        }

        if (turno && !['1º', '2º'].includes(turno)) {
            return res.status(400).json({ error: 'turno deve ser "1º" ou "2º".' });
        }

        // Verificar se máquina tem escopo de produção
        const maqCheck = await pool.query(
            'SELECT id, escopo_producao FROM maquinas WHERE id = $1',
            [maquinaId]
        );
        if (!maqCheck.rows.length) {
            return res.status(404).json({ error: 'Máquina não encontrada.' });
        }
        if (!maqCheck.rows[0].escopo_producao) {
            return res.status(400).json({ error: 'Máquina não está habilitada para produção.' });
        }

        const insert = await pool.query(
            `INSERT INTO producao_lancamentos 
        (maquina_id, data_ref, turno, horas_realizadas, observacao, lancado_por_id, lancado_por_nome, lancado_por_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
            [
                maquinaId,
                dataRef,
                turno || null,
                horasRealizadas,
                observacao || null,
                auth.id || null,
                auth.nome || null,
                auth.email || null
            ]
        );

        sseBroadcast({ topic: 'producao_lancamentos', action: 'created', id: insert.rows[0].id });

        res.status(201).json({ id: insert.rows[0].id, ok: true });
    } catch (e: any) {
        if (String(e?.message || '').includes('uq_producao_lanc_maquina_data_turno')) {
            return res.status(409).json({ error: 'Já existe um lançamento para esta máquina/data/turno.' });
        }
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// PUT /producao/lancamentos/:id - Atualizar lançamento
lancamentosRouter.put('/producao/lancamentos/:id', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        if (!await checkPermission(auth.id, 'producao_upload', 'editar')) {
            return res.status(403).json({ error: 'Sem permissão para editar lançamento.' });
        }

        const id = String(req.params.id);
        const { horasRealizadas, observacao } = req.body || {};

        if (horasRealizadas === undefined) {
            return res.status(400).json({ error: 'Informe horasRealizadas.' });
        }

        if (Number(horasRealizadas) < 0) {
            return res.status(400).json({ error: 'horasRealizadas não pode ser negativo.' });
        }

        const upd = await pool.query(
            `UPDATE producao_lancamentos
       SET horas_realizadas = $2, observacao = $3
       WHERE id = $1
       RETURNING id`,
            [id, horasRealizadas, observacao || null]
        );

        if (!upd.rowCount) {
            return res.status(404).json({ error: 'Lançamento não encontrado.' });
        }

        sseBroadcast({ topic: 'producao_lancamentos', action: 'updated', id });
        res.json({ id, ok: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// DELETE /producao/lancamentos/:id - Excluir lançamento
lancamentosRouter.delete('/producao/lancamentos/:id', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        if (!await checkPermission(auth.id, 'producao_upload', 'editar')) {
            return res.status(403).json({ error: 'Sem permissão para excluir lançamentos.' });
        }

        const id = String(req.params.id);
        const r = await pool.query('DELETE FROM producao_lancamentos WHERE id = $1', [id]);

        if (r.rowCount === 0) {
            return res.status(404).json({ error: 'Lançamento não encontrado.' });
        }

        sseBroadcast({ topic: 'producao_lancamentos', action: 'deleted', id });
        res.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/rendimento - Relatório de rendimento
lancamentosRouter.get('/producao/rendimento', async (req, res) => {
    try {
        const maquinaId = req.query.maquinaId as string | undefined;
        const dataInicio = req.query.dataInicio as string | undefined;
        const dataFim = req.query.dataFim as string | undefined;

        const params: any[] = [];
        let where = '1=1';

        if (maquinaId) {
            params.push(maquinaId);
            where += ` AND maquina_id = $${params.length}`;
        }

        if (dataInicio) {
            params.push(dataInicio);
            where += ` AND data_ref >= $${params.length}`;
        }

        if (dataFim) {
            params.push(dataFim);
            where += ` AND data_ref <= $${params.length}`;
        }

        const { rows } = await pool.query(
            `SELECT
        maquina_id AS "maquinaId",
        maquina_nome AS "maquinaNome",
        maquina_tag AS "maquinaTag",
        maquina_setor AS "maquinaSetor",
        data_ref AS "dataRef",
        turno,
        horas_realizadas AS "horasRealizadas",
        horas_meta AS "horasMeta",
        percentual_atingido AS "percentualAtingido",
        status_meta AS "statusMeta",
        lancado_por_nome AS "lancadoPorNome",
        criado_em AS "criadoEm"
      FROM v_producao_rendimento
      WHERE ${where}
      ORDER BY data_ref DESC, maquina_nome ASC`,
            params
        );

        res.json({ items: rows });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/resumo-diario - Resumo diário por máquina
lancamentosRouter.get('/producao/resumo-diario', async (req, res) => {
    try {
        const dataRef = req.query.dataRef as string | undefined;
        const dataInicio = req.query.dataInicio as string | undefined;
        const dataFim = req.query.dataFim as string | undefined;

        const params: any[] = [];
        let where = '1=1';

        if (dataRef) {
            params.push(dataRef);
            where += ` AND data_ref = $${params.length}`;
        } else {
            if (dataInicio) {
                params.push(dataInicio);
                where += ` AND data_ref >= $${params.length}`;
            }
            if (dataFim) {
                params.push(dataFim);
                where += ` AND data_ref <= $${params.length}`;
            }
        }

        // Query direta para incluir horas_referencia_em (lógica de justiça)
        const { rows } = await pool.query(
            `SELECT
                pl.maquina_id AS "maquinaId",
                m.nome AS "maquinaNome",
                m.tag AS "maquinaTag",
                pl.data_ref AS "dataRef",
                SUM(pl.horas_realizadas) AS "horasDia",
                COALESCE((
                    SELECT pm.horas_meta FROM producao_metas pm 
                    WHERE pm.maquina_id = pl.maquina_id 
                    AND pm.data_inicio <= pl.data_ref 
                    AND (pm.data_fim IS NULL OR pm.data_fim >= pl.data_ref)
                    ORDER BY pm.data_inicio DESC LIMIT 1
                ), 0) AS "metaDia",
                COUNT(*) AS "qtdLancamentos",
                MAX(pl.horas_referencia_em) AS "ultimaAtualizacaoEm"
            FROM producao_lancamentos pl
            JOIN maquinas m ON m.id = pl.maquina_id
            WHERE ${where.replace(/data_ref/g, 'pl.data_ref')}
            GROUP BY pl.maquina_id, m.nome, m.tag, pl.data_ref
            ORDER BY pl.data_ref DESC, m.nome ASC`,
            params
        );

        res.json({ items: rows });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});
