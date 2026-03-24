import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

export const metasRouter: Router = Router();

// GET /producao/metas/padrao?ano=2026&mes=3
metasRouter.get('/producao/metas/padrao', requirePermission('producao_config', 'ver'), async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string, 10);
    const mes = parseInt(req.query.mes as string, 10);

    if (!ano || !mes) {
      return res.status(400).json({ error: 'ano e mes sao obrigatorios.' });
    }

    const { rows } = await pool.query(
      `SELECT id, maquina_id AS "maquinaId", ano, mes, horas_meta AS "horasMeta", atualizado_em AS "atualizadoEm"
       FROM producao_metas_padrao
       WHERE ano = $1 AND mes = $2`,
      [ano, mes]
    );
    res.json(rows);
  } catch (e: unknown) {
    logger.error({ err: e }, 'Erro ao buscar metas padrao');
    res.status(500).json({ error: 'Erro ao buscar metas.' });
  }
});

// PUT /producao/metas/padrao - Salvar meta padrão (upsert)
metasRouter.put('/producao/metas/padrao', requirePermission('producao_config', 'editar'), async (req, res) => {
  try {
    const { maquinaId, ano, mes, horasMeta } = req.body;

    if (!maquinaId || !ano || !mes || horasMeta === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios: maquinaId, ano, mes, horasMeta.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO producao_metas_padrao (maquina_id, ano, mes, horas_meta)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (maquina_id, ano, mes) 
       DO UPDATE SET horas_meta = EXCLUDED.horas_meta, atualizado_em = NOW()
       RETURNING id, maquina_id AS "maquinaId", ano, mes, horas_meta AS "horasMeta"`,
      [maquinaId, ano, mes, horasMeta]
    );
    res.json(rows[0]);
  } catch (e: unknown) {
    logger.error({ err: e }, 'Erro ao salvar meta padrao');
    res.status(500).json({ error: 'Erro ao salvar meta.' });
  }
});

// ============================================================================
// METAS LEGADAS (Retrocompatibilidade para Modo TV e Dashboard antigo)
// ============================================================================
metasRouter.get('/producao/metas', async (req, res) => {
    try {
        const maquinaId = req.query.maquinaId as string;
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = hoje.getMonth() + 1;
        const dataStr = `${ano}-${String(mes).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

        let query = `
            WITH padrao AS (
                SELECT maquina_id, horas_meta 
                FROM producao_metas_padrao 
                WHERE ano = $1 AND mes = $2
            ),
            dia AS (
                SELECT maquina_id, horas_meta 
                FROM producao_metas_dia 
                WHERE data_ref = $3
            )
            SELECT
                m.id AS "maquina_id",
                COALESCE(d.horas_meta, p.horas_meta, 0) AS "horas_meta"
            FROM maquinas m
            LEFT JOIN padrao p ON p.maquina_id = m.id
            LEFT JOIN dia d ON d.maquina_id = m.id
            WHERE m.setor IS NOT NULL
        `;
        const params: any[] = [ano, mes, dataStr];
        
        if (maquinaId) {
            params.push(maquinaId);
            query += ` AND m.id = $4`;
        }

        const { rows } = await pool.query(query, params);

        const items = rows.map(r => ({
            id: r.maquina_id,
            maquinaId: r.maquina_id,
            dataInicio: dataStr,
            horasMeta: r.horas_meta,
            ativo: true,
            atualizadoEm: new Date().toISOString()
        }));

        res.json({ items });
    } catch (e: unknown) {
        logger.error({ err: e }, 'Erro ao buscar metas compatíveis');
        res.status(500).json({ error: 'Erro ao buscar metas.' });
    }
});

// GET /producao/metas/dia?dataInicio=2026-03-01&dataFim=2026-03-31
metasRouter.get('/producao/metas/dia', requirePermission('producao_config', 'ver'), async (req, res) => {
  try {
    const dataInicio = req.query.dataInicio as string;
    const dataFim = req.query.dataFim as string;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: 'dataInicio e dataFim sao obrigatorios.' });
    }

    const { rows } = await pool.query(
      `SELECT id, maquina_id AS "maquinaId", to_char(data_ref, 'YYYY-MM-DD') AS "dataRef", horas_meta AS "horasMeta", atualizado_em AS "atualizadoEm"
       FROM producao_metas_dia
       WHERE data_ref BETWEEN $1::date AND $2::date`,
      [dataInicio, dataFim]
    );
    res.json(rows);
  } catch (e: unknown) {
    logger.error({ err: e }, 'Erro ao buscar metas do dia');
    res.status(500).json({ error: 'Erro ao buscar metas.' });
  }
});

// PUT /producao/metas/dia - Salvar/override meta de um dia específico (upsert ou delete se null)
metasRouter.put('/producao/metas/dia', requirePermission('producao_config', 'editar'), async (req, res) => {
  try {
    const { maquinaId, dataRef, horasMeta } = req.body;

    if (!maquinaId || !dataRef) {
      return res.status(400).json({ error: 'Campos obrigatórios: maquinaId, dataRef.' });
    }

    if (horasMeta === null) {
      // Remover override
      await pool.query(
        'DELETE FROM producao_metas_dia WHERE maquina_id = $1 AND data_ref = $2',
        [maquinaId, dataRef]
      );
      return res.json({ ok: true, deleted: true });
    }

    // Upsert
    const { rows } = await pool.query(
      `INSERT INTO producao_metas_dia (maquina_id, data_ref, horas_meta)
       VALUES ($1, $2, $3)
       ON CONFLICT (maquina_id, data_ref) 
       DO UPDATE SET horas_meta = EXCLUDED.horas_meta, atualizado_em = NOW()
       RETURNING id, maquina_id AS "maquinaId", to_char(data_ref, 'YYYY-MM-DD') AS "dataRef", horas_meta AS "horasMeta"`,
      [maquinaId, dataRef, horasMeta]
    );
    res.json(rows[0]);
  } catch (e: unknown) {
    logger.error({ err: e }, 'Erro ao salvar meta do dia');
    res.status(500).json({ error: 'Erro ao salvar meta do dia.' });
  }
});

// Helper: verificar permiss├úo granular inline
async function checkPermission(userId: string, pageKey: string, level: 'ver' | 'editar'): Promise<boolean> {
    if (!userId) return false;
    const { rows } = await pool.query<{ permissoes: Record<string, string>; role_nome: string }>(
        `SELECT COALESCE(u.permissoes, r.permissoes) as permissoes, r.nome as role_nome
         FROM usuarios u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 LIMIT 1`,
        [userId]
    );
    if (!rows.length) return false;
    if ((rows[0].role_nome || '').toLowerCase() === 'admin') return true;
    const permissions = rows[0]?.permissoes || {};
    const userPerm = permissions[pageKey];
    if (!userPerm || userPerm === 'nenhum') return false;
    if (level === 'ver') return userPerm === 'ver' || userPerm === 'editar';
    return userPerm === 'editar';
}

// ============================================================================
// METAS DE FUNCION├üRIOS (producao_colaborador_metas)
// ============================================================================

// GET /producao/metas/funcionarios - Listar metas de funcion├írios
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
            return res.status(403).json({ error: 'Sem permiss├úo para definir metas de funcion├írios.' });
        }

        let { id, matricula, meta_diaria_horas, ativo } = req.body;

        matricula = String(matricula || '').trim();
        const meta = Number(meta_diaria_horas);

        if (!matricula) {
            return res.status(400).json({ error: 'Matr├¡cula obrigat├│ria.' });
        }
        if (isNaN(meta) || meta < 0) {
            return res.status(400).json({ error: 'Meta inv├ílida.' });
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
// AGREGADOS PARA DASHBOARD (Dia/M├¬s)
// ============================================================================

// GET /producao/indicadores/funcionarios/dia - Produ├º├úo por funcion├írio em um dia
metasRouter.get('/producao/indicadores/funcionarios/dia', async (req, res) => {
    try {
        const data = req.query.data as string; // YYYY-MM-DD
        if (!data) return res.status(400).json({ error: 'Data obrigat├│ria' });

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
               AND m.setor IS NOT NULL
             GROUP BY pl.data_ref, pl.matricula_operador`,
            [data]
        );
        res.json(rows);
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/indicadores/funcionarios/mes - Produ├º├úo por funcion├írio no m├¬s
metasRouter.get('/producao/indicadores/funcionarios/mes', async (req, res) => {
    try {
        const anoMes = req.query.anoMes as string; // YYYY-MM-DD (usaremos apenas ano/mes)
        if (!anoMes) return res.status(400).json({ error: 'Data obrigat├│ria' });

        // Parse manual para evitar problemas de timezone
        const [yyyy, mm] = anoMes.split('-').map(Number);
        const year = yyyy;
        const month = mm; // 1-12

        // Primeiro dia do m├¬s
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        // ├Ültimo dia do m├¬s
        const lastDay = new Date(year, month, 0).getDate(); // month aqui ├® 1-13, Date interpreta corretamente
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
               AND m.setor IS NOT NULL
             GROUP BY 1, 2`,
            [start, end]
        );
        res.json(rows);
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/indicadores/funcionarios/resumo - Snapshot ├║nico para tela de colaboradores
metasRouter.get('/producao/indicadores/funcionarios/resumo', requirePermission('producao_colaboradores', 'ver'), async (req, res) => {
    try {
        const data = (req.query.data as string || '').trim(); // YYYY-MM-DD
        const anoMesRaw = (req.query.anoMes as string || '').trim(); // YYYY-MM ou YYYY-MM-DD

        if (!data || !anoMesRaw) {
            return res.status(400).json({ error: 'Data e anoMes s├úo obrigat├│rios.' });
        }

        const anoMesMatch = anoMesRaw.match(/^(\d{4})-(\d{2})/);
        if (!anoMesMatch) {
            return res.status(400).json({ error: 'Formato inv├ílido para anoMes. Use YYYY-MM.' });
        }

        const year = Number(anoMesMatch[1]);
        const month = Number(anoMesMatch[2]); // 1-12
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return res.status(400).json({ error: 'M├¬s inv├ílido.' });
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
                   AND m.setor IS NOT NULL
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
                   AND m.setor IS NOT NULL
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

// GET /producao/indicadores/funcionarios/detalhe-dia - Detalhe de lan├ºamentos de um colaborador em um dia
metasRouter.get('/producao/indicadores/funcionarios/detalhe-dia', requirePermission('producao_colaboradores', 'ver'), async (req, res) => {
    try {
        const matricula = (req.query.matricula as string || '').trim();
        const data = (req.query.data as string || '').trim(); // YYYY-MM-DD

        if (!matricula || !data) {
            return res.status(400).json({ error: 'Matr├¡cula e data s├úo obrigat├│rias.' });
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
               AND m.setor IS NOT NULL
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

// GET /producao/indicadores/funcionarios/detalhe-mes - Detalhe de lan├ºamentos de um colaborador em todo o m├¬s
metasRouter.get('/producao/indicadores/funcionarios/detalhe-mes', requirePermission('producao_colaboradores', 'ver'), async (req, res) => {
    try {
        const matricula = (req.query.matricula as string || '').trim();
        const anoMes = (req.query.anoMes as string || '').trim(); // YYYY-MM

        if (!matricula || !anoMes) {
            return res.status(400).json({ error: 'Matr├¡cula e m├¬s (anoMes) s├úo obrigat├│rios.' });
        }

        if (!/^\d{4}-\d{2}$/.test(anoMes)) {
            return res.status(400).json({ error: 'Formato inv├ílido para anoMes. Use YYYY-MM.' });
        }

        const [yyyy, mm] = anoMes.split('-').map(Number);
        if (!Number.isInteger(yyyy) || !Number.isInteger(mm) || mm < 1 || mm > 12) {
            return res.status(400).json({ error: 'M├¬s inv├ílido.' });
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
               AND m.setor IS NOT NULL
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

