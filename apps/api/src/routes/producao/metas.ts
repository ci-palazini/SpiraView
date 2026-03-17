import { Router } from 'express';
import { pool } from '../../db';
import { logger } from '../../logger';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePermission } from '../../middlewares/requirePermission';

export const metasRouter: Router = Router();

// Helper: verificar permissão granular inline
async function checkPermission(userId: string, pageKey: string, level: 'ver' | 'editar'): Promise<boolean> {
    if (!userId) return false;
    const { rows } = await pool.query<{ permissoes: Record<string, string> }>(
        `SELECT r.permissoes FROM usuarios u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 LIMIT 1`,
        [userId]
    );
    const permissions = rows[0]?.permissoes || {};
    const userPerm = permissions[pageKey];
    if (!userPerm || userPerm === 'nenhum') return false;
    if (level === 'ver') return userPerm === 'ver' || userPerm === 'editar';
    return userPerm === 'editar';
}

// ============================================================================
// METAS DE MÁQUINAS (producao_metas) - Metas de produção por máquina
// ============================================================================

// GET /producao/metas - Listar metas de produção por máquina
metasRouter.get('/producao/metas', requireAuth, async (req, res) => {
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
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// POST /producao/metas - Criar meta de produção
metasRouter.post('/producao/metas', requirePermission('producao_config', 'editar'), async (req, res) => {
    try {
        const auth = (req as any).user || {};
        const userRole = (auth.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';

        if (!isAdmin && !await checkPermission(auth.id, 'producao_config', 'editar')) {
            return res.status(403).json({ error: 'Sem permissão para criar metas.' });
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
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// PUT /producao/metas/:id - Atualizar meta de produção
metasRouter.put('/producao/metas/:id', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        const userRole = (auth.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';

        if (!isAdmin && !await checkPermission(auth.id, 'producao_config', 'editar')) {
            return res.status(403).json({ error: 'Sem permissão para atualizar metas.' });
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
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// DELETE /producao/metas/:id - Excluir meta de produção
metasRouter.delete('/producao/metas/:id', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        const userRole = (auth.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';

        if (!isAdmin && !await checkPermission(auth.id, 'producao_config', 'editar')) {
            return res.status(403).json({ error: 'Sem permissão para excluir metas.' });
        }

        const id = String(req.params.id);
        const { rowCount } = await pool.query('DELETE FROM producao_metas WHERE id = $1', [id]);

        if (!rowCount) {
            return res.status(404).json({ error: 'Meta não encontrada.' });
        }

        res.json({ ok: true });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
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
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// POST /producao/metas/funcionarios - Criar/Atualizar meta
metasRouter.post('/producao/metas/funcionarios', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        const userRole = (auth.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';

        if (!isAdmin && !await checkPermission(auth.id, 'producao_colaboradores', 'editar')) {
            return res.status(403).json({ error: 'Sem permissão para definir metas de funcionários.' });
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
        logger.error({ err: e }, 'Erro na rota');
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
                SUM(pl.horas_realizadas) AS "produzido_h",
                COUNT(DISTINCT pl.maquina_id) AS "total_maquinas",
                COUNT(DISTINCT pl.numero_op) FILTER (WHERE pl.numero_op IS NOT NULL) AS "total_ops",
                ARRAY_AGG(DISTINCT m.nome ORDER BY m.nome) AS "maquinas_list"
             FROM producao_lancamentos pl
             JOIN maquinas m ON m.id = pl.maquina_id
             WHERE pl.data_ref = $1
               AND pl.matricula_operador IS NOT NULL
             GROUP BY pl.data_ref, pl.matricula_operador`,
            [data]
        );
        res.json(rows);
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
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
                SUM(pl.horas_realizadas) AS "produzido_h",
                COUNT(DISTINCT pl.maquina_id) AS "total_maquinas",
                COUNT(DISTINCT pl.numero_op) FILTER (WHERE pl.numero_op IS NOT NULL) AS "total_ops",
                COUNT(DISTINCT pl.data_ref) AS "dias_trabalhados",
                ARRAY_AGG(DISTINCT m.nome ORDER BY m.nome) AS "maquinas_list"
             FROM producao_lancamentos pl
             JOIN maquinas m ON m.id = pl.maquina_id
             WHERE pl.data_ref >= $1 AND pl.data_ref <= $2
               AND pl.matricula_operador IS NOT NULL
             GROUP BY 1, 2`,
            [start, end]
        );
        res.json(rows);
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/indicadores/funcionarios/resumo - Snapshot único para tela de colaboradores
metasRouter.get('/producao/indicadores/funcionarios/resumo', requirePermission('producao_colaboradores', 'ver'), async (req, res) => {
    try {
        const data = (req.query.data as string || '').trim(); // YYYY-MM-DD
        const anoMesRaw = (req.query.anoMes as string || '').trim(); // YYYY-MM ou YYYY-MM-DD

        if (!data || !anoMesRaw) {
            return res.status(400).json({ error: 'Data e anoMes são obrigatórios.' });
        }

        const anoMesMatch = anoMesRaw.match(/^(\d{4})-(\d{2})/);
        if (!anoMesMatch) {
            return res.status(400).json({ error: 'Formato inválido para anoMes. Use YYYY-MM.' });
        }

        const year = Number(anoMesMatch[1]);
        const month = Number(anoMesMatch[2]); // 1-12
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return res.status(400).json({ error: 'Mês inválido.' });
        }

        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const [metasRows, diaRows, mesRows] = await Promise.all([
            pool.query(
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
            ).then((r) => r.rows),
            pool.query(
                `SELECT
                    pl.data_ref AS "data_wip",
                    pl.matricula_operador AS "matricula",
                    SUM(pl.horas_realizadas) AS "produzido_h",
                    COUNT(DISTINCT pl.maquina_id) AS "total_maquinas",
                    COUNT(DISTINCT pl.numero_op) FILTER (WHERE pl.numero_op IS NOT NULL) AS "total_ops",
                    ARRAY_AGG(DISTINCT m.nome ORDER BY m.nome) AS "maquinas_list"
                 FROM producao_lancamentos pl
                 JOIN maquinas m ON m.id = pl.maquina_id
                 WHERE pl.data_ref = $1
                   AND pl.matricula_operador IS NOT NULL
                 GROUP BY pl.data_ref, pl.matricula_operador`,
                [data]
            ).then((r) => r.rows),
            pool.query(
                `SELECT
                    to_char(pl.data_ref, 'YYYY-MM') AS "ano_mes",
                    pl.matricula_operador AS "matricula",
                    SUM(pl.horas_realizadas) AS "produzido_h",
                    COUNT(DISTINCT pl.maquina_id) AS "total_maquinas",
                    COUNT(DISTINCT pl.numero_op) FILTER (WHERE pl.numero_op IS NOT NULL) AS "total_ops",
                    COUNT(DISTINCT pl.data_ref) AS "dias_trabalhados",
                    ARRAY_AGG(DISTINCT m.nome ORDER BY m.nome) AS "maquinas_list"
                 FROM producao_lancamentos pl
                 JOIN maquinas m ON m.id = pl.maquina_id
                 WHERE pl.data_ref >= $1 AND pl.data_ref <= $2
                   AND pl.matricula_operador IS NOT NULL
                 GROUP BY 1, 2`,
                [start, end]
            ).then((r) => r.rows),
        ]);

        res.json({
            metas: metasRows,
            dia: diaRows,
            mes: mesRows,
        });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/indicadores/funcionarios/detalhe-dia - Detalhe de lançamentos de um colaborador em um dia
metasRouter.get('/producao/indicadores/funcionarios/detalhe-dia', requirePermission('producao_colaboradores', 'ver'), async (req, res) => {
    try {
        const matricula = (req.query.matricula as string || '').trim();
        const data = (req.query.data as string || '').trim(); // YYYY-MM-DD

        if (!matricula || !data) {
            return res.status(400).json({ error: 'Matrícula e data são obrigatórias.' });
        }

        type DetalheDiaRow = {
            id: string;
            maquinaNome: string;
            turno: string | null;
            horasRealizadas: number | string;
            numeroOP: string | null;
            observacao: string | null;
            horasReferenciaEm: string | null;
        };

        const { rows } = await pool.query<DetalheDiaRow>(
            `SELECT
                pl.id,
                m.nome AS "maquinaNome",
                pl.turno,
                pl.horas_realizadas AS "horasRealizadas",
                pl.numero_op AS "numeroOP",
                pl.observacao,
                pl.horas_referencia_em AS "horasReferenciaEm"
             FROM producao_lancamentos pl
             JOIN maquinas m ON m.id = pl.maquina_id
             WHERE pl.data_ref = $1
               AND pl.matricula_operador = $2
             ORDER BY m.nome ASC, pl.numero_op ASC`,
            [data, matricula]
        );

        const totalHoras = rows.reduce((sum, r) => sum + Number(r.horasRealizadas || 0), 0);
        const totalMaquinas = new Set(rows.map((r) => r.maquinaNome)).size;
        const totalOPs = new Set(rows.filter((r) => r.numeroOP).map((r) => r.numeroOP)).size;

        res.json({
            matricula,
            data,
            lancamentos: rows,
            resumo: {
                totalHoras,
                totalMaquinas,
                totalOPs,
                totalLancamentos: rows.length,
            }
        });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/indicadores/funcionarios/detalhe-mes - Detalhe de lançamentos de um colaborador em todo o mês
metasRouter.get('/producao/indicadores/funcionarios/detalhe-mes', requirePermission('producao_colaboradores', 'ver'), async (req, res) => {
    try {
        const matricula = (req.query.matricula as string || '').trim();
        const anoMes = (req.query.anoMes as string || '').trim(); // YYYY-MM

        if (!matricula || !anoMes) {
            return res.status(400).json({ error: 'Matrícula e mês (anoMes) são obrigatórios.' });
        }

        if (!/^\d{4}-\d{2}$/.test(anoMes)) {
            return res.status(400).json({ error: 'Formato inválido para anoMes. Use YYYY-MM.' });
        }

        const [yyyy, mm] = anoMes.split('-').map(Number);
        if (!Number.isInteger(yyyy) || !Number.isInteger(mm) || mm < 1 || mm > 12) {
            return res.status(400).json({ error: 'Mês inválido.' });
        }

        const start = `${yyyy}-${String(mm).padStart(2, '0')}-01`;
        const lastDay = new Date(yyyy, mm, 0).getDate();
        const end = `${yyyy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Get operator name
        const { rows: workerRows } = await pool.query(
            'SELECT nome FROM usuarios WHERE matricula = $1 LIMIT 1',
            [matricula]
        );
        const nome = workerRows[0]?.nome || matricula;

        const { rows: metaRows } = await pool.query<{ meta_diaria_horas: number | string }>(
            'SELECT meta_diaria_horas FROM producao_colaborador_metas WHERE matricula = $1 LIMIT 1',
            [matricula]
        );
        const metaDiariaHoras = Number(metaRows[0]?.meta_diaria_horas || 0);
        const diasUteisMes = (() => {
            let count = 0;
            for (let d = 1; d <= lastDay; d += 1) {
                const wd = new Date(yyyy, mm - 1, d).getDay();
                if (wd >= 1 && wd <= 5) count += 1;
            }
            return count;
        })();
        const metaMensalHoras = metaDiariaHoras * diasUteisMes;

        type DetalheMesRow = {
            id: string;
            dataRef: string;
            maquinaNome: string;
            turno: string | null;
            horasRealizadas: number | string;
            numeroOP: string | null;
            observacao: string | null;
            horasReferenciaEm: string | null;
        };

        const { rows } = await pool.query<DetalheMesRow>(
            `SELECT
                pl.id,
                pl.data_ref::text AS "dataRef",
                m.nome AS "maquinaNome",
                pl.turno,
                pl.horas_realizadas AS "horasRealizadas",
                pl.numero_op AS "numeroOP",
                pl.observacao,
                pl.horas_referencia_em AS "horasReferenciaEm"
             FROM producao_lancamentos pl
             JOIN maquinas m ON m.id = pl.maquina_id
             WHERE pl.data_ref >= $1 AND pl.data_ref <= $2
               AND pl.matricula_operador = $3
             ORDER BY pl.data_ref ASC, m.nome ASC, pl.numero_op ASC`,
            [start, end, matricula]
        );

        const totalHoras = rows.reduce((sum, r) => sum + Number(r.horasRealizadas || 0), 0);
        const totalMaquinas = new Set(rows.map((r) => r.maquinaNome)).size;
        const totalOPs = new Set(rows.filter((r) => r.numeroOP).map((r) => r.numeroOP)).size;
        const diasTrabalhados = new Set(rows.map((r) => String(r.dataRef).slice(0, 10))).size;

        res.json({
            matricula,
            nome,
            anoMes,
            lancamentos: rows,
            resumo: {
                totalHoras,
                totalMaquinas,
                totalOPs,
                totalLancamentos: rows.length,
                diasTrabalhados,
                metaDiariaHoras,
                metaMensalHoras,
                diasUteisMes,
            }
        });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

