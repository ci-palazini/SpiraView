import { Router } from 'express';
import { pool } from '../db';
import { requirePermission } from '../middlewares/requirePermission';
import { logger } from '../logger';

export const reuniaoDiariaRouter: Router = Router();

const DEPARTAMENTOS_VALIDOS = ['usinagem', 'montagem', 'logistica'] as const;
type Departamento = (typeof DEPARTAMENTOS_VALIDOS)[number];

/**
 * GET /reuniao-diaria/:departamento
 * Retorna dados agregados SQDCP para a reunião diária de um departamento.
 * Slides: S (placeholder), Q (refugo+retrabalho), D&C (faturamento + eficiência + custo refugo), P (placeholder)
 */
reuniaoDiariaRouter.get(
    '/reuniao-diaria/:departamento',
    requirePermission('reuniao_diaria', 'ver'),
    async (req, res) => {
        try {
            const dep = (req.params.departamento || '').toLowerCase().trim() as Departamento;

            if (!DEPARTAMENTOS_VALIDOS.includes(dep)) {
                return res.status(400).json({
                    error: `Departamento inválido. Valores aceitos: ${DEPARTAMENTOS_VALIDOS.join(', ')}`,
                });
            }

            // Data de referência: hoje em SP timezone
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const monthStart = today.slice(0, 7) + '-01'; // YYYY-MM-01
            const month = Number(today.split('-')[1]);
            const year = Number(today.split('-')[0]);

            // ============================================================
            // QUALITY (universal) — últimos refugos + retrabalhos + custo mês
            // ============================================================

            // Verificar se há dados de qualidade no mês atual
            const qualityCheckRes = await pool.query(
                `SELECT COUNT(*)::int AS total FROM qualidade_refugos WHERE data_ocorrencia >= $1`,
                [monthStart]
            );
            const hasCurrentMonthQuality = Number(qualityCheckRes.rows[0]?.total || 0) > 0;

            // Se não há dados no mês atual, buscar o último mês com dados
            let effectiveQualityMonthStart = monthStart;
            let effectiveQualityMonth = month;
            let effectiveQualityYear = year;

            if (!hasCurrentMonthQuality) {
                const lastQualityMonth = await pool.query(
                    `SELECT EXTRACT(YEAR FROM data_ocorrencia)::int AS year,
                            EXTRACT(MONTH FROM data_ocorrencia)::int AS month
                     FROM qualidade_refugos
                     WHERE data_ocorrencia < $1
                     ORDER BY data_ocorrencia DESC
                     LIMIT 1`,
                    [monthStart]
                );
                if (lastQualityMonth.rows.length > 0) {
                    effectiveQualityYear = lastQualityMonth.rows[0].year;
                    effectiveQualityMonth = lastQualityMonth.rows[0].month;
                    effectiveQualityMonthStart = `${effectiveQualityYear}-${String(effectiveQualityMonth).padStart(2, '0')}-01`;
                }
            }

            const nextQMonth = effectiveQualityMonth === 12 ? 1 : effectiveQualityMonth + 1;
            const nextQYear = effectiveQualityMonth === 12 ? effectiveQualityYear + 1 : effectiveQualityYear;
            const effectiveQualityMonthEnd = `${nextQYear}-${String(nextQMonth).padStart(2, '0')}-01`;

            const [refugosRes, retrabalhoRes, custoMesRes, topCausaRes, breakdownRes, rpnRes, internoExternoRes, topNcRes, causas4mRes, topSolicitanteRes, retrabalhoStatsRes] = await Promise.all([
                pool.query(
                    `SELECT qr.data_ocorrencia, qr.descricao_item, qr.motivo_defeito,
                  qr.quantidade, qr.custo, qr.origem, qr.responsavel_nome, qr.tipo_lancamento,
                  qo.tipo AS tipo_origem
           FROM qualidade_refugos qr
           LEFT JOIN qualidade_origens qo ON qo.nome = qr.origem
           WHERE qr.data_ocorrencia >= $1 AND qr.data_ocorrencia < $2
           ORDER BY qr.data_ocorrencia DESC, qr.created_at DESC
           LIMIT 7`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                pool.query(
                    `SELECT data, codigo, descricao, nao_conformidade, causa_provavel,
                  solicitante, ncr, ordem_producao,
                  ocorrencia, severidade, deteccao, horas_retrabalho
           FROM qualidade_retrabalho
           WHERE data >= $1 AND data < $2
           ORDER BY data DESC, created_at DESC
           LIMIT 7`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                pool.query(
                    `SELECT COALESCE(SUM(custo), 0) as custo_total,
                  COALESCE(SUM(quantidade), 0) as qtd_total
           FROM qualidade_refugos
           WHERE data_ocorrencia >= $1 AND data_ocorrencia < $2`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Top causa Pareto (mês efetivo)
                pool.query(
                    `SELECT motivo_defeito AS causa, COUNT(*)::int AS ocorrencias,
                            COALESCE(SUM(quantidade), 0)::int AS quantidade_total
                     FROM qualidade_refugos
                     WHERE data_ocorrencia >= $1 AND data_ocorrencia < $2
                       AND motivo_defeito IS NOT NULL AND btrim(motivo_defeito) <> ''
                     GROUP BY motivo_defeito
                     ORDER BY ocorrencias DESC
                     LIMIT 5`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Breakdown refugo vs quarentena no mês
                pool.query(
                    `SELECT
                       COALESCE(SUM(CASE WHEN tipo_lancamento = 'REFUGO' THEN quantidade ELSE 0 END), 0)::int AS qtd_refugo,
                       COALESCE(SUM(CASE WHEN tipo_lancamento = 'REFUGO' THEN custo ELSE 0 END), 0) AS custo_refugo,
                       COALESCE(SUM(CASE WHEN tipo_lancamento = 'QUARENTENA' THEN quantidade ELSE 0 END), 0)::int AS qtd_quarentena,
                       COALESCE(SUM(CASE WHEN tipo_lancamento = 'QUARENTENA' THEN custo ELSE 0 END), 0) AS custo_quarentena
                     FROM qualidade_refugos
                     WHERE data_ocorrencia >= $1 AND data_ocorrencia < $2`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Total de horas de retrabalho no mês
                pool.query(
                    `SELECT
                       COALESCE(SUM(
                         CASE WHEN horas_retrabalho IS NOT NULL AND horas_retrabalho <> ''
                           THEN EXTRACT(EPOCH FROM horas_retrabalho::interval) / 3600
                           ELSE 0
                         END
                       ), 0) AS total_horas_mes
                     FROM qualidade_retrabalho
                     WHERE data >= $1 AND data < $2`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Breakdown Interno vs Externo no mês
                pool.query(
                    `SELECT
                       COALESCE(SUM(CASE WHEN qo.tipo = 'INTERNO' THEN qr.quantidade ELSE 0 END), 0)::int AS qtd_interno,
                       COALESCE(SUM(CASE WHEN qo.tipo = 'INTERNO' THEN qr.custo ELSE 0 END), 0) AS custo_interno,
                       COALESCE(SUM(CASE WHEN qo.tipo = 'EXTERNO' THEN qr.quantidade ELSE 0 END), 0)::int AS qtd_externo,
                       COALESCE(SUM(CASE WHEN qo.tipo = 'EXTERNO' THEN qr.custo ELSE 0 END), 0) AS custo_externo
                     FROM qualidade_refugos qr
                     LEFT JOIN qualidade_origens qo ON qo.nome = qr.origem
                     WHERE qr.data_ocorrencia >= $1 AND qr.data_ocorrencia < $2`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Top não-conformidades de retrabalho
                pool.query(
                    `SELECT nao_conformidade AS nc,
                            COUNT(*)::int AS total,
                            ROUND(COALESCE(SUM(
                              CASE WHEN horas_retrabalho IS NOT NULL AND horas_retrabalho <> ''
                                THEN EXTRACT(EPOCH FROM horas_retrabalho::interval) / 3600
                                ELSE 0 END
                            ), 0)::numeric, 1) AS horas
                     FROM qualidade_retrabalho
                     WHERE data >= $1 AND data < $2
                       AND nao_conformidade IS NOT NULL AND btrim(nao_conformidade) <> ''
                     GROUP BY nao_conformidade
                     ORDER BY horas DESC, total DESC
                     LIMIT 5`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Causas 4M de retrabalho
                pool.query(
                    `SELECT causa_provavel AS causa,
                            COUNT(*)::int AS total,
                            ROUND(COALESCE(SUM(
                              CASE WHEN horas_retrabalho IS NOT NULL AND horas_retrabalho <> ''
                                THEN EXTRACT(EPOCH FROM horas_retrabalho::interval) / 3600
                                ELSE 0 END
                            ), 0)::numeric, 1) AS horas
                     FROM qualidade_retrabalho
                     WHERE data >= $1 AND data < $2
                       AND causa_provavel IS NOT NULL AND btrim(causa_provavel) <> ''
                     GROUP BY causa_provavel
                     ORDER BY total DESC`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Top solicitantes de retrabalho
                pool.query(
                    `SELECT solicitante,
                            COUNT(*)::int AS total,
                            ROUND(COALESCE(SUM(
                              CASE WHEN horas_retrabalho IS NOT NULL AND horas_retrabalho <> ''
                                THEN EXTRACT(EPOCH FROM horas_retrabalho::interval) / 3600
                                ELSE 0 END
                            ), 0)::numeric, 1) AS horas
                     FROM qualidade_retrabalho
                     WHERE data >= $1 AND data < $2
                       AND solicitante IS NOT NULL AND btrim(solicitante) <> ''
                     GROUP BY solicitante
                     ORDER BY horas DESC, total DESC
                     LIMIT 5`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
                // Stats consolidados de retrabalho
                pool.query(
                    `SELECT COUNT(*)::int AS total_retrabalhos,
                            COUNT(DISTINCT codigo)::int AS itens_distintos,
                            COUNT(DISTINCT nao_conformidade)::int AS nc_distintas
                     FROM qualidade_retrabalho
                     WHERE data >= $1 AND data < $2`,
                    [effectiveQualityMonthStart, effectiveQualityMonthEnd]
                ),
            ]);

            const breakdownRow = breakdownRes.rows[0] || {};
            const horasRow = rpnRes.rows[0] || {};
            const ieRow = internoExternoRes.rows[0] || {};
            const statsRow = retrabalhoStatsRes.rows[0] || {};

            const quality = {
                refugos: refugosRes.rows,
                retrabalhos: retrabalhoRes.rows,
                custoTotalMes: Number(custoMesRes.rows[0]?.custo_total || 0),
                qtdTotalMes: Number(custoMesRes.rows[0]?.qtd_total || 0),
                topCausas: topCausaRes.rows.map((r: any) => ({
                    causa: r.causa,
                    ocorrencias: Number(r.ocorrencias),
                    quantidadeTotal: Number(r.quantidade_total),
                })),
                breakdown: {
                    qtdRefugo: Number(breakdownRow.qtd_refugo || 0),
                    custoRefugo: Number(breakdownRow.custo_refugo || 0),
                    qtdQuarentena: Number(breakdownRow.qtd_quarentena || 0),
                    custoQuarentena: Number(breakdownRow.custo_quarentena || 0),
                },
                horasRetrabalho: {
                    totalMes: Number(horasRow.total_horas_mes || 0),
                },
                internoExterno: {
                    qtdInterno: Number(ieRow.qtd_interno || 0),
                    custoInterno: Number(ieRow.custo_interno || 0),
                    qtdExterno: Number(ieRow.qtd_externo || 0),
                    custoExterno: Number(ieRow.custo_externo || 0),
                },
                retrabalhoStats: {
                    totalOcorrencias: Number(statsRow.total_retrabalhos || 0),
                    itensdistintos: Number(statsRow.itens_distintos || 0),
                    ncDistintas: Number(statsRow.nc_distintas || 0),
                },
                topNCs: topNcRes.rows.map((r: any) => ({
                    nc: r.nc,
                    total: Number(r.total),
                    horas: Number(r.horas || 0),
                })),
                causas4M: causas4mRes.rows.map((r: any) => ({
                    causa: r.causa,
                    total: Number(r.total),
                    horas: Number(r.horas || 0),
                })),
                topSolicitantes: topSolicitanteRes.rows.map((r: any) => ({
                    solicitante: r.solicitante,
                    total: Number(r.total),
                    horas: Number(r.horas || 0),
                })),
                mesReferencia: effectiveQualityMonth,
                anoReferencia: effectiveQualityYear,
            };

            // ============================================================
            // DELIVERY & COST (merged slide)
            // Universal: faturamento + custo refugo
            // Nichado: eficiência de produção (usinagem/montagem) ou placeholder (logistica)
            // ============================================================

            // --- Faturamento (universal - dados da logística KPIs) ---
            // Fetch absolute latest data indiscriminately
            const faturamentoRes = await pool.query(
                `SELECT data, faturado_acumulado, exportacao_acumulado, devolucoes_dia,
                  total_linhas, linhas_atraso, backlog_atraso, ottr_ytd
           FROM logistica_kpis_diario
           ORDER BY data DESC
           LIMIT 1`
            );

            const lastKpi = faturamentoRes.rows[0] || null;

            let metaFinanceira: number | null = null;
            let prevOttr: number | null = null;

            if (lastKpi) {
                // Determine month of the fetched data to correctly get the meta
                const kpiDate = new Date(lastKpi.data);
                const kpiMonth = kpiDate.getUTCMonth() + 1;
                const kpiYear = kpiDate.getUTCFullYear();

                const metaRes = await pool.query(
                    `SELECT meta_financeira FROM logistica_metas WHERE mes = $1 AND ano = $2`,
                    [kpiMonth, kpiYear]
                );
                metaFinanceira = metaRes.rows[0]?.meta_financeira ? Number(metaRes.rows[0].meta_financeira) : null;

                const previousMonthDate = new Date(kpiYear, kpiMonth - 2, 1);
                const prevMonthStr = String(previousMonthDate.getMonth() + 1).padStart(2, '0');
                const prevYearStr = String(previousMonthDate.getFullYear());

                const prevMonthOttrRes = await pool.query(
                    `SELECT ottr_ytd
           FROM logistica_kpis_diario
           WHERE EXTRACT(MONTH FROM data) = $1 AND EXTRACT(YEAR FROM data) = $2
           ORDER BY data DESC
           LIMIT 1`,
                    [prevMonthStr, prevYearStr]
                );
                prevOttr = prevMonthOttrRes.rows[0]?.ottr_ytd ? Number(prevMonthOttrRes.rows[0].ottr_ytd) : null;
            }

            const faturamento = lastKpi
                ? {
                    dataRef: lastKpi.data,
                    faturadoAcumulado: Number(lastKpi.faturado_acumulado),
                    exportacaoAcumulado: Number(lastKpi.exportacao_acumulado),
                    devolucoesDia: Number(lastKpi.devolucoes_dia),
                    totalLinhas: Number(lastKpi.total_linhas),
                    linhasAtraso: Number(lastKpi.linhas_atraso || 0),
                    backlogAtraso: Number(lastKpi.backlog_atraso || 0),
                    ottrUltimoMes: prevOttr,
                    ottrYtd: Number(lastKpi.ottr_ytd),
                    metaFinanceira,
                    pctMeta: metaFinanceira && metaFinanceira > 0
                        ? Math.round((Number(lastKpi.faturado_acumulado) / metaFinanceira) * 1000) / 10
                        : null,
                }
                : null;

            // --- Eficiência de produção (nichado usinagem/montagem) ---
            let eficiencia: unknown = null;

            if (dep === 'usinagem' || dep === 'montagem') {
                const todayObj = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                const isMonday = todayObj.getDay() === 1; // 0=Sun, 1=Mon

                let datesToFetch: string[] = [];
                let metaDate: string = "";

                if (isMonday) {
                    // Monday -> Fetch Fri (today-3), Sat (today-2), Sun (today-1)
                    // Meta is from Friday
                    for (let i = 3; i >= 1; i--) {
                        const d = new Date(todayObj);
                        d.setDate(d.getDate() - i);
                        datesToFetch.push(d.toLocaleDateString("en-CA"));
                        if (i === 3) metaDate = d.toLocaleDateString("en-CA"); // Friday
                    }
                } else {
                    // Not Monday -> Fetch Yesterday
                    const d = new Date(todayObj);
                    d.setDate(d.getDate() - 1);
                    const yesterday = d.toLocaleDateString("en-CA");
                    datesToFetch = [yesterday];
                    metaDate = yesterday;
                }

                if (datesToFetch.length > 0) {
                    const eficienciaRes = await pool.query(
                        `SELECT 
                            m.id, m.parent_maquina_id, m.is_maquina_mae, m.exibir_filhos_dashboard,
                            COALESCE(m.nome_producao, m.nome) as maquina,
                            pl.data_ref,
                            COALESCE(SUM(pl.horas_realizadas), 0) as horas_realizadas,
                            COALESCE(mt.horas_meta, 0) as horas_meta
                         FROM maquinas m
                         LEFT JOIN producao_lancamentos pl ON pl.maquina_id = m.id AND pl.data_ref = ANY($2::date[])
                         LEFT JOIN LATERAL (
                             SELECT mt2.horas_meta
                             FROM producao_metas mt2
                             WHERE mt2.maquina_id = m.id 
                               AND mt2.data_inicio <= $3 
                               AND (mt2.data_fim IS NULL OR mt2.data_fim >= $3)
                             ORDER BY mt2.data_inicio DESC
                             LIMIT 1
                         ) mt ON true
                         WHERE m.setor = $1 AND m.escopo_producao = true
                         GROUP BY m.id, m.parent_maquina_id, m.is_maquina_mae, m.exibir_filhos_dashboard, m.nome_producao, m.nome, mt.horas_meta, pl.data_ref`,
                        [dep, datesToFetch, metaDate]
                    );

                    const maquinasRows = eficienciaRes.rows;

                    const maquinasMap = new Map();
                    // Aggregate multiple rows per machine (due to data_ref grouping)
                    for (const row of maquinasRows) {
                        if (!maquinasMap.has(row.id)) {
                            maquinasMap.set(row.id, {
                                ...row,
                                horas_realizadas_total: 0,
                                breakdown: {} // { '2023-10-20': 5.5, '2023-10-21': 2.0 }
                            });
                        }
                        const m = maquinasMap.get(row.id);
                        const hr = Number(row.horas_realizadas) || 0;
                        m.horas_realizadas_total += hr;
                        if (row.data_ref && hr > 0) {
                            const dStr = new Date(row.data_ref).toLocaleDateString("en-CA");
                            m.breakdown[dStr] = (m.breakdown[dStr] || 0) + hr;
                        }
                    }

                    const uniqueMaquinas = Array.from(maquinasMap.values());

                    const childrenByParent = new Map();
                    for (const m of uniqueMaquinas) {
                        if (m.parent_maquina_id) {
                            const list = childrenByParent.get(m.parent_maquina_id) || [];
                            list.push(m);
                            childrenByParent.set(m.parent_maquina_id, list);
                        }
                    }

                    const rowsParsed = [];
                    for (const m of uniqueMaquinas) {
                        let show = true;
                        if (m.parent_maquina_id) {
                            const parent = maquinasMap.get(m.parent_maquina_id);
                            if (parent && parent.exibir_filhos_dashboard === false) show = false;
                        }
                        if (!show) continue;

                        let produzido = m.horas_realizadas_total;
                        let meta = Number(m.horas_meta) || 0;
                        let breakdown = { ...m.breakdown };

                        if (m.is_maquina_mae) {
                            const filhos = childrenByParent.get(m.id) || [];
                            for (const f of filhos) {
                                produzido += f.horas_realizadas_total;
                                meta += Number(f.horas_meta) || 0;
                                // Merge breakdown from children
                                for (const dateStr of Object.keys(f.breakdown)) {
                                    breakdown[dateStr] = (breakdown[dateStr] || 0) + f.breakdown[dateStr];
                                }
                            }
                        }

                        let aderencia = null;
                        if (meta > 0) aderencia = Math.round((produzido / meta) * 1000) / 10;

                        // Sort breakdown by date
                        const sortedBreakdown = Object.keys(breakdown)
                            .sort()
                            .map(d => ({ dataRef: d, horas: breakdown[d] }));

                        rowsParsed.push({
                            maquinaId: m.id,
                            maquinaNome: m.maquina,
                            horasRealizadas: produzido,
                            horasMeta: meta,
                            pct: aderencia,
                            breakdown: sortedBreakdown,
                            isMother: m.is_maquina_mae,
                            isChild: !!m.parent_maquina_id
                        });
                    }

                    // Sort: Mother first, then % ASC
                    rowsParsed.sort((a, b) => {
                        if (a.isMother && !b.isMother) return -1;
                        if (!a.isMother && b.isMother) return 1;
                        const pctA = a.pct ?? -1;
                        const pctB = b.pct ?? -1;
                        return pctA - pctB;
                    });

                    // Total calculation: sum only non-children roots
                    const roots = rowsParsed.filter(r => !r.isChild);
                    const totalRealizado = roots.reduce((s, r) => s + r.horasRealizadas, 0);
                    const totalMeta = roots.reduce((s, r) => s + r.horasMeta, 0);
                    const pctGeral = totalMeta > 0 ? Math.round((totalRealizado / totalMeta) * 1000) / 10 : null;

                    // Exclude children if the parent aggregated them, but wait, frontend expects only the visible rows
                    // Wait, `DashboardProducao` already hid isChild===true?
                    // "Para evitar dupla contagem, somamos APENAS as raízes... e mostramos TUDO?"
                    // Ah, `DashboardProducao` displays mothers and children if they are not hidden.
                    // Keep them all in the UI! Just the % is properly sorted.

                    eficiencia = {
                        dataRef: isMonday ? `${datesToFetch[0]} a ${datesToFetch[datesToFetch.length - 1]}` : metaDate,
                        isAggregated: isMonday,
                        maquinas: rowsParsed.map(r => ({
                            maquina: r.maquinaNome,
                            horasRealizadas: Number(r.horasRealizadas.toFixed(2)),
                            horasMeta: r.horasMeta > 0 ? Number(r.horasMeta.toFixed(2)) : null,
                            pct: r.pct,
                            breakdown: r.breakdown
                        })),
                        eficienciaGeral: pctGeral
                    };
                }
            }

            // ============================================================
            // SAFETY (universal — consolidado empresa toda)
            // ============================================================
            
            // Primeiro verificar se há dados no mês atual
            const safetyCheckCurrentMonth = await pool.query(
                `SELECT COUNT(DISTINCT id)::int AS total
                 FROM safety_observacoes
                 WHERE data_observacao >= $1`,
                [monthStart]
            );
            
            const hasCurrentMonthData = Number(safetyCheckCurrentMonth.rows[0]?.total || 0) > 0;
            
            // Se não há dados no mês atual, buscar o último mês com dados
            let effectiveMonthStart = monthStart;
            let effectiveMonth = month;
            let effectiveYear = year;
            
            if (!hasCurrentMonthData) {
                const lastMonthWithData = await pool.query(
                    `SELECT EXTRACT(YEAR FROM data_observacao)::int AS year,
                            EXTRACT(MONTH FROM data_observacao)::int AS month
                     FROM safety_observacoes
                     WHERE data_observacao < $1
                     ORDER BY data_observacao DESC
                     LIMIT 1`,
                    [monthStart]
                );
                
                if (lastMonthWithData.rows.length > 0) {
                    effectiveYear = lastMonthWithData.rows[0].year;
                    effectiveMonth = lastMonthWithData.rows[0].month;
                    effectiveMonthStart = `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}-01`;
                }
            }
            
            const prevMonth = effectiveMonth === 1 ? 12 : effectiveMonth - 1;
            const prevYear = effectiveMonth === 1 ? effectiveYear - 1 : effectiveYear;
            const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
            const prevMonthEnd = effectiveMonthStart;

            const [
                safetyTotalMesRes,
                safetyTotalMesAntRes,
                safetyRatioRes,
                safetyRatioMesAntRes,
                safetyTopKsbsSegurosRes,
                safetyTopKsbsArriscadosRes,
                safetyTopCausasRes,
                safetyFeedbackRes,
                safetyStopWorkRes,
            ] = await Promise.all([
                // Total observações mês atual (ou último mês com dados)
                pool.query(
                    `SELECT COUNT(DISTINCT id)::int AS total
                     FROM safety_observacoes
                     WHERE data_observacao >= $1`,
                    [effectiveMonthStart]
                ),
                // Total observações mês anterior
                pool.query(
                    `SELECT COUNT(DISTINCT id)::int AS total
                     FROM safety_observacoes
                     WHERE data_observacao >= $1 AND data_observacao < $2`,
                    [prevMonthStart, prevMonthEnd]
                ),
                // Ratio Seguros vs Arriscados (mês atual)
                pool.query(
                    `SELECT
                        COALESCE(SUM(CASE WHEN k.resposta = 'Seguros' THEN 1 ELSE 0 END), 0)::int AS seguros,
                        COALESCE(SUM(CASE WHEN k.resposta = 'Arriscados' THEN 1 ELSE 0 END), 0)::int AS arriscados
                     FROM safety_observacoes_ksbs k
                     JOIN safety_observacoes o ON o.id = k.observacao_id
                     WHERE o.data_observacao >= $1 AND k.resposta IS NOT NULL`,
                    [effectiveMonthStart]
                ),
                // Ratio Seguros vs Arriscados (mês anterior)
                pool.query(
                    `SELECT
                        COALESCE(SUM(CASE WHEN k.resposta = 'Seguros' THEN 1 ELSE 0 END), 0)::int AS seguros,
                        COALESCE(SUM(CASE WHEN k.resposta = 'Arriscados' THEN 1 ELSE 0 END), 0)::int AS arriscados
                     FROM safety_observacoes_ksbs k
                     JOIN safety_observacoes o ON o.id = k.observacao_id
                     WHERE o.data_observacao >= $1 AND o.data_observacao < $2 AND k.resposta IS NOT NULL`,
                    [prevMonthStart, prevMonthEnd]
                ),
                // Top 5 categorias KSBs SEGUROS (mês atual)
                pool.query(
                    `SELECT k.categoria, COUNT(*)::int AS total
                     FROM safety_observacoes_ksbs k
                     JOIN safety_observacoes o ON o.id = k.observacao_id
                     WHERE o.data_observacao >= $1 
                       AND k.resposta = 'Seguros'
                       AND k.categoria IS NOT NULL AND btrim(k.categoria) <> ''
                     GROUP BY k.categoria
                     ORDER BY total DESC
                     LIMIT 5`,
                    [effectiveMonthStart]
                ),
                // Top 5 categorias KSBs ARRISCADOS (mês atual)
                pool.query(
                    `SELECT k.categoria, COUNT(*)::int AS total
                     FROM safety_observacoes_ksbs k
                     JOIN safety_observacoes o ON o.id = k.observacao_id
                     WHERE o.data_observacao >= $1 
                       AND k.resposta = 'Arriscados'
                       AND k.categoria IS NOT NULL AND btrim(k.categoria) <> ''
                     GROUP BY k.categoria
                     ORDER BY total DESC
                     LIMIT 5`,
                    [effectiveMonthStart]
                ),
                // Top causas comportamento inseguro (mês atual, exclui Comportamento seguro)
                pool.query(
                    `SELECT tipo_comportamento AS causa, COUNT(*)::int AS total
                     FROM safety_observacoes
                     WHERE data_observacao >= $1
                       AND causa_comportamento NOT ILIKE '%seguro%'
                       AND tipo_comportamento IS NOT NULL AND btrim(tipo_comportamento) <> ''
                     GROUP BY tipo_comportamento
                     ORDER BY total DESC
                     LIMIT 5`,
                    [effectiveMonthStart]
                ),
                // % feedback dado (mês atual)
                pool.query(
                    `SELECT
                        COUNT(*)::int AS total,
                        COALESCE(SUM(CASE WHEN feedback_dado THEN 1 ELSE 0 END), 0)::int AS com_feedback
                     FROM safety_observacoes
                     WHERE data_observacao >= $1`,
                    [effectiveMonthStart]
                ),
                // Stop Work Authority (mês atual)
                pool.query(
                    `SELECT COALESCE(SUM(CASE WHEN stop_work_authority THEN 1 ELSE 0 END), 0)::int AS total
                     FROM safety_observacoes
                     WHERE data_observacao >= $1`,
                    [effectiveMonthStart]
                ),
            ]);

            const safetyFbRow = safetyFeedbackRes.rows[0] || {};
            const safetyRatioRow = safetyRatioRes.rows[0] || {};
            const safetyRatioAntRow = safetyRatioMesAntRes.rows[0] || {};
            const totalMes = Number(safetyTotalMesRes.rows[0]?.total || 0);
            const totalMesAnt = Number(safetyTotalMesAntRes.rows[0]?.total || 0);

            const safety = totalMes > 0 || totalMesAnt > 0
                ? {
                      totalMes,
                      totalMesAnterior: totalMesAnt,
                      mesReferencia: effectiveMonth,
                      anoReferencia: effectiveYear,
                      ratio: {
                          seguros: Number(safetyRatioRow.seguros || 0),
                          arriscados: Number(safetyRatioRow.arriscados || 0),
                      },
                      ratioMesAnterior: {
                          seguros: Number(safetyRatioAntRow.seguros || 0),
                          arriscados: Number(safetyRatioAntRow.arriscados || 0),
                      },
                      topKsbsSeguros: safetyTopKsbsSegurosRes.rows.map((r: any) => ({
                          categoria: r.categoria,
                          total: Number(r.total),
                      })),
                      topKsbsArriscados: safetyTopKsbsArriscadosRes.rows.map((r: any) => ({
                          categoria: r.categoria,
                          total: Number(r.total),
                      })),
                      topCausas: safetyTopCausasRes.rows.map((r: any) => ({
                          causa: r.causa,
                          total: Number(r.total),
                      })),
                      feedbackPct:
                          Number(safetyFbRow.total) > 0
                              ? Math.round(
                                    (Number(safetyFbRow.com_feedback) / Number(safetyFbRow.total)) * 1000
                                ) / 10
                              : null,
                      stopWorkCount: Number(safetyStopWorkRes.rows[0]?.total || 0),
                  }
                : null;

            // ============================================================
            // RESPONSE — D&C merged
            // ============================================================
            res.json({
                departamento: dep,
                dataRef: today,
                safety,
                quality,
                deliveryCost: {
                    faturamento,
                    eficiencia,
                    custoRefugoMes: quality.custoTotalMes,
                    qtdRefugoMes: quality.qtdTotalMes,
                },
                people: null,
            });
        } catch (e: unknown) {
            logger.error({ err: e }, '[reuniao-diaria] Erro');
            res.status(500).json({ error: 'Erro interno ao buscar dados da reunião diária.' });
        }
    }
);
