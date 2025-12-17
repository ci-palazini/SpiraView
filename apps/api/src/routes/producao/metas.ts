import { Router } from 'express';
import { pool } from '../../db';

export const metasRouter: Router = Router();

// ============================================================================
// METAS DE MÁQUINAS (producao_metas) - Metas de produção por máquina
// ============================================================================

// GET /producao/metas - Listar metas de produção por máquina
metasRouter.get('/producao/metas', async (req, res) => {
    try {
        const maquinaId = req.query.maquinaId as string | undefined;
        const vigente = req.query.vigente === 'true';

        const params: any[] = [];
        let where = 'm.escopo_producao = true';

        if (maquinaId) {
            params.push(maquinaId);
            where += ` AND pm.maquina_id = $${params.length}`;
        }

        if (vigente) {
            where += ` AND (pm.data_fim IS NULL OR pm.data_fim >= CURRENT_DATE)`;
            where += ` AND pm.data_inicio <= CURRENT_DATE`;
        }

        const { rows } = await pool.query(
            `SELECT
                pm.id,
                pm.maquina_id AS "maquinaId",
                m.nome AS "maquinaNome",
                m.tag AS "maquinaTag",
                pm.data_inicio AS "dataInicio",
                pm.data_fim AS "dataFim",
                pm.horas_meta AS "horasMeta",
                pm.criado_em AS "criadoEm",
                pm.atualizado_em AS "atualizadoEm"
            FROM producao_metas pm
            JOIN maquinas m ON m.id = pm.maquina_id
            WHERE ${where}
            ORDER BY m.nome ASC, pm.data_inicio DESC`,
            params
        );

        res.json({ items: rows });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// POST /producao/metas - Criar meta de produção
metasRouter.post('/producao/metas', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        if (!['gestor'].includes(auth.role)) {
            return res.status(403).json({ error: 'Somente gestor pode criar metas.' });
        }

        const { maquinaId, dataInicio, dataFim, horasMeta } = req.body || {};

        if (!maquinaId || !dataInicio || horasMeta === undefined) {
            return res.status(400).json({ error: 'Informe maquinaId, dataInicio e horasMeta.' });
        }

        if (Number(horasMeta) < 0) {
            return res.status(400).json({ error: 'horasMeta não pode ser negativo.' });
        }

        // Verificar se máquina existe e tem escopo de produção
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

        const { rows } = await pool.query(
            `INSERT INTO producao_metas (maquina_id, data_inicio, data_fim, horas_meta)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [maquinaId, dataInicio, dataFim || null, horasMeta]
        );

        res.status(201).json({ id: rows[0].id, ok: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// PUT /producao/metas/:id - Atualizar meta de produção
metasRouter.put('/producao/metas/:id', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        if (!['gestor'].includes(auth.role)) {
            return res.status(403).json({ error: 'Somente gestor pode atualizar metas.' });
        }

        const id = String(req.params.id);
        const { dataInicio, dataFim, horasMeta } = req.body || {};

        if (!dataInicio || horasMeta === undefined) {
            return res.status(400).json({ error: 'Informe dataInicio e horasMeta.' });
        }

        if (Number(horasMeta) < 0) {
            return res.status(400).json({ error: 'horasMeta não pode ser negativo.' });
        }

        const { rowCount } = await pool.query(
            `UPDATE producao_metas
             SET data_inicio = $2, data_fim = $3, horas_meta = $4, atualizado_em = NOW()
             WHERE id = $1`,
            [id, dataInicio, dataFim || null, horasMeta]
        );

        if (!rowCount) {
            return res.status(404).json({ error: 'Meta não encontrada.' });
        }

        res.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// DELETE /producao/metas/:id - Excluir meta de produção
metasRouter.delete('/producao/metas/:id', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        if (!['gestor'].includes(auth.role)) {
            return res.status(403).json({ error: 'Somente gestor pode excluir metas.' });
        }

        const id = String(req.params.id);
        const { rowCount } = await pool.query('DELETE FROM producao_metas WHERE id = $1', [id]);

        if (!rowCount) {
            return res.status(404).json({ error: 'Meta não encontrada.' });
        }

        res.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// ============================================================================
// METAS DE FUNCIONÁRIOS (producao_colaborador_metas)
// ============================================================================

// GET /producao/metas/funcionarios - Listar metas de funcionários
metasRouter.get('/producao/metas/funcionarios', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT
                m.id,
                m.matricula,
                u.nome,
                m.meta_diaria_horas,
                m.ativo,
                m.atualizado_em
            FROM producao_colaborador_metas m
            LEFT JOIN usuarios u ON u.matricula = m.matricula
            ORDER BY u.nome NULLS LAST, m.matricula`
        );
        res.json(rows);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// POST /producao/metas/funcionarios - Criar/Atualizar meta
metasRouter.post('/producao/metas/funcionarios', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        if (!['gestor'].includes(auth.role)) {
            return res.status(403).json({ error: 'Somente gestor pode definir metas.' });
        }

        let { id, matricula, meta_diaria_horas, ativo } = req.body;

        matricula = String(matricula || '').trim();
        const meta = Number(meta_diaria_horas);

        if (!matricula) {
            return res.status(400).json({ error: 'Matrícula obrigatória.' });
        }
        if (isNaN(meta) || meta < 0) {
            return res.status(400).json({ error: 'Meta inválida.' });
        }

        // Upsert
        const { rows } = await pool.query(
            `INSERT INTO producao_colaborador_metas (id, matricula, meta_diaria_horas, ativo, atualizado_em)
             VALUES (
               COALESCE($1, gen_random_uuid()), 
               $2, $3, $4, NOW()
             )
             ON CONFLICT (matricula) DO UPDATE SET
               meta_diaria_horas = EXCLUDED.meta_diaria_horas,
               ativo = EXCLUDED.ativo,
               atualizado_em = NOW()
             RETURNING id`,
            [id || null, matricula, meta, ativo ?? true]
        );

        res.json({ ok: true, id: rows[0].id });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});


// ============================================================================
// AGREGADOS PARA DASHBOARD (Dia/Mês)
// ============================================================================

// GET /producao/indicadores/funcionarios/dia - Produção por funcionário em um dia
metasRouter.get('/producao/indicadores/funcionarios/dia', async (req, res) => {
    try {
        const data = req.query.data as string; // YYYY-MM-DD
        if (!data) return res.status(400).json({ error: 'Data obrigatória' });

        const { rows } = await pool.query(
            `SELECT
                pl.data_ref AS "data_wip",
                pl.matricula_operador AS "matricula",
                SUM(pl.horas_realizadas) AS "produzido_h"
             FROM producao_lancamentos pl
             WHERE pl.data_ref = $1
               AND pl.matricula_operador IS NOT NULL
             GROUP BY pl.data_ref, pl.matricula_operador`,
            [data]
        );
        res.json(rows);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/indicadores/funcionarios/mes - Produção por funcionário no mês
metasRouter.get('/producao/indicadores/funcionarios/mes', async (req, res) => {
    try {
        const anoMes = req.query.anoMes as string; // YYYY-MM-DD (usaremos apenas ano/mes)
        if (!anoMes) return res.status(400).json({ error: 'Data obrigatória' });

        // Parse manual para evitar problemas de timezone
        const [yyyy, mm] = anoMes.split('-').map(Number);
        const year = yyyy;
        const month = mm; // 1-12

        // Primeiro dia do mês
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        // Último dia do mês
        const lastDay = new Date(year, month, 0).getDate(); // month aqui é 1-13, Date interpreta corretamente
        const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const { rows } = await pool.query(
            `SELECT
                to_char(pl.data_ref, 'YYYY-MM') AS "ano_mes",
                pl.matricula_operador AS "matricula",
                SUM(pl.horas_realizadas) AS "produzido_h"
             FROM producao_lancamentos pl
             WHERE pl.data_ref >= $1 AND pl.data_ref <= $2
               AND pl.matricula_operador IS NOT NULL
             GROUP BY 1, 2`,
            [start, end]
        );
        res.json(rows);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});
