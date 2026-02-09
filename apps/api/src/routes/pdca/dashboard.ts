import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const dashboardRouter: Router = Router();

// GET /pdca/dashboard - Dashboard consolidado
dashboardRouter.get('/pdca/dashboard',
    requirePermission('pdca_dashboard', 'ver'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const days = parseInt(req.query.days as string) || 7;
            const companyId = user?.company_id;

            // Período atual
            const dataFim = new Date();
            const dataInicio = new Date();
            dataInicio.setDate(dataInicio.getDate() - days);

            // Período anterior (para comparação)
            const dataFimAnterior = new Date(dataInicio);
            dataFimAnterior.setDate(dataFimAnterior.getDate() - 1);
            const dataInicioAnterior = new Date(dataFimAnterior);
            dataInicioAnterior.setDate(dataInicioAnterior.getDate() - days);

            const formatDate = (d: Date) => d.toISOString().split('T')[0];
            const hoje = formatDate(new Date());

            // ===== PRODUÇÃO =====
            // Total do período
            const producaoQuery = await pool.query(`
                SELECT 
                    COALESCE(SUM(horas_realizadas), 0) as horas_produzidas
                FROM producao_lancamentos
                WHERE data_ref >= $1 AND data_ref <= $2
            `, [formatDate(dataInicio), formatDate(dataFim)]);

            // Período anterior para comparação
            const producaoAnteriorQuery = await pool.query(`
                SELECT COALESCE(SUM(horas_realizadas), 0) as horas_produzidas
                FROM producao_lancamentos
                WHERE data_ref >= $1 AND data_ref <= $2
            `, [formatDate(dataInicioAnterior), formatDate(dataFimAnterior)]);

            // Último dia disponível
            const producaoUltimoDiaQuery = await pool.query(`
                SELECT 
                    data_ref,
                    COALESCE(SUM(horas_realizadas), 0) as horas
                FROM producao_lancamentos
                WHERE data_ref <= $1
                GROUP BY data_ref
                ORDER BY data_ref DESC
                LIMIT 1
            `, [hoje]);

            const horasProduzidas = parseFloat(producaoQuery.rows[0]?.horas_produzidas || 0);
            const horasProduzidasAnterior = parseFloat(producaoAnteriorQuery.rows[0]?.horas_produzidas || 0);
            const variacaoProducao = horasProduzidasAnterior > 0
                ? ((horasProduzidas - horasProduzidasAnterior) / horasProduzidasAnterior) * 100
                : 0;
            const ultimoDiaProducao = producaoUltimoDiaQuery.rows[0] || null;

            // ===== MANUTENÇÃO =====
            const manutencaoQuery = await pool.query(`
                SELECT COUNT(*) as chamados_abertos
                FROM chamados
                WHERE status IN ('aberto', 'em_andamento', 'Aberto', 'Em Andamento')
            `);

            const manutencaoAnteriorQuery = await pool.query(`
                SELECT COUNT(*) as chamados_abertos
                FROM chamados
                WHERE status IN ('aberto', 'em_andamento', 'Aberto', 'Em Andamento')
                AND criado_em <= $1
            `, [formatDate(dataFimAnterior)]);

            // Último chamado aberto (mais recente)
            const ultimoChamadoQuery = await pool.query(`
                SELECT c.id, c.descricao, c.status, c.criado_em, m.nome as maquina_nome
                FROM chamados c
                LEFT JOIN maquinas m ON m.id = c.maquina_id
                WHERE c.status IN ('aberto', 'em_andamento', 'Aberto', 'Em Andamento')
                ORDER BY c.criado_em DESC
                LIMIT 1
            `);

            const chamadosAbertos = parseInt(manutencaoQuery.rows[0]?.chamados_abertos || 0);
            const chamadosAbertosAnterior = parseInt(manutencaoAnteriorQuery.rows[0]?.chamados_abertos || 0);
            const variacaoManutencao = chamadosAbertosAnterior > 0
                ? ((chamadosAbertos - chamadosAbertosAnterior) / chamadosAbertosAnterior) * 100
                : 0;
            const ultimoChamado = ultimoChamadoQuery.rows[0] || null;

            // ===== QUALIDADE =====
            const qualidadeQuery = await pool.query(`
                SELECT 
                    COALESCE(SUM(custo), 0) as custo_refugo,
                    COUNT(*) as quantidade_refugo
                FROM qualidade_refugos
                WHERE data_ocorrencia >= $1 AND data_ocorrencia <= $2
            `, [formatDate(dataInicio), formatDate(dataFim)]);

            const qualidadeAnteriorQuery = await pool.query(`
                SELECT COALESCE(SUM(custo), 0) as custo_refugo
                FROM qualidade_refugos
                WHERE data_ocorrencia >= $1 AND data_ocorrencia <= $2
            `, [formatDate(dataInicioAnterior), formatDate(dataFimAnterior)]);

            const custoRefugo = parseFloat(qualidadeQuery.rows[0]?.custo_refugo || 0);
            const quantidadeRefugo = parseInt(qualidadeQuery.rows[0]?.quantidade_refugo || 0);
            const custoRefugoAnterior = parseFloat(qualidadeAnteriorQuery.rows[0]?.custo_refugo || 0);
            const variacaoQualidade = custoRefugoAnterior > 0
                ? ((custoRefugo - custoRefugoAnterior) / custoRefugoAnterior) * 100
                : 0;

            // Últimos casos de refugo - incluindo numero_ncr
            const ultimosCasosQuery = await pool.query(`
                SELECT numero_ncr, data_ocorrencia, codigo_item, descricao_item, custo, responsavel_nome, origem
                FROM qualidade_refugos
                ORDER BY data_ocorrencia DESC, created_at DESC
                LIMIT 10
            `);

            // ===== LOGÍSTICA / FATURAMENTO =====
            // Acumulado do mês atual (sempre mensal, não 7 dias)
            const mesAtual = new Date().getMonth() + 1;
            const anoAtual = new Date().getFullYear();
            const primeiroDiaMes = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;

            // Pegar o último registro do mês (que já é acumulado)
            const faturamentoQuery = await pool.query(`
                SELECT 
                    faturado_acumulado,
                    data
                FROM logistica_kpis_diario
                WHERE EXTRACT(MONTH FROM data) = $1 
                AND EXTRACT(YEAR FROM data) = $2
                ORDER BY data DESC
                LIMIT 1
            `, [mesAtual, anoAtual]);

            const faturamentoMetaQuery = await pool.query(`
                SELECT meta_financeira
                FROM logistica_metas
                WHERE mes = $1 AND ano = $2
                LIMIT 1
            `, [mesAtual, anoAtual]);

            // Mês anterior para comparação
            const mesAnterior = mesAtual === 1 ? 12 : mesAtual - 1;
            const anoMesAnterior = mesAtual === 1 ? anoAtual - 1 : anoAtual;

            const faturamentoAnteriorQuery = await pool.query(`
                SELECT faturado_acumulado
                FROM logistica_kpis_diario
                WHERE EXTRACT(MONTH FROM data) = $1 
                AND EXTRACT(YEAR FROM data) = $2
                ORDER BY data DESC
                LIMIT 1
            `, [mesAnterior, anoMesAnterior]);

            const faturadoAcumulado = parseFloat(faturamentoQuery.rows[0]?.faturado_acumulado || 0);
            const metaFaturamento = parseFloat(faturamentoMetaQuery.rows[0]?.meta_financeira || 0);
            const faturadoMesAnterior = parseFloat(faturamentoAnteriorQuery.rows[0]?.faturado_acumulado || 0);
            const variacaoFaturamento = faturadoMesAnterior > 0
                ? ((faturadoAcumulado - faturadoMesAnterior) / faturadoMesAnterior) * 100
                : 0;

            // ===== PDCA =====
            const pdcaParams: any[] = [];
            let pdcaWhere = '1=1';
            if (companyId) {
                pdcaParams.push(companyId);
                pdcaWhere += ` AND company_id = $${pdcaParams.length}`;
            }

            const pdcaQuery = await pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'aberto') as planos_abertos,
                    COUNT(*) FILTER (WHERE status = 'em_andamento') as planos_em_andamento,
                    COUNT(*) FILTER (WHERE status = 'concluido') as planos_concluidos
                FROM pdca_planos
                WHERE ${pdcaWhere}
            `, pdcaParams);

            const acoesPendentesQuery = await pool.query(`
                SELECT COUNT(*) as total
                FROM pdca_causas c
                JOIN pdca_planos p ON p.id = c.plano_id
                WHERE c.data_realizada IS NULL
                ${companyId ? 'AND p.company_id = $1' : ''}
            `, companyId ? [companyId] : []);

            res.json({
                periodo: {
                    inicio: formatDate(dataInicio),
                    fim: formatDate(dataFim),
                    dias: days
                },
                producao: {
                    horasProduzidas: Math.round(horasProduzidas * 100) / 100,
                    horasAnterior: Math.round(horasProduzidasAnterior * 100) / 100,
                    variacao: Math.round(variacaoProducao * 10) / 10,
                    variacaoPositiva: variacaoProducao >= 0,
                    ultimoDia: ultimoDiaProducao ? {
                        data: ultimoDiaProducao.data_ref,
                        horas: Math.round(parseFloat(ultimoDiaProducao.horas) * 100) / 100
                    } : null
                },
                manutencao: {
                    chamadosAbertos,
                    chamadosAnterior: chamadosAbertosAnterior,
                    variacao: Math.round(variacaoManutencao * 10) / 10,
                    variacaoPositiva: variacaoManutencao <= 0,
                    ultimoChamado: ultimoChamado ? {
                        id: ultimoChamado.id,
                        descricao: ultimoChamado.descricao,
                        maquina: ultimoChamado.maquina_nome,
                        data: ultimoChamado.criado_em
                    } : null
                },
                qualidade: {
                    custoRefugo: Math.round(custoRefugo * 100) / 100,
                    custoAnterior: Math.round(custoRefugoAnterior * 100) / 100,
                    quantidadeRefugo,
                    variacao: Math.round(variacaoQualidade * 10) / 10,
                    variacaoPositiva: variacaoQualidade <= 0,
                    ultimosCasos: ultimosCasosQuery.rows.map(r => ({
                        ncr: r.numero_ncr,
                        data: r.data_ocorrencia,
                        item: r.codigo_item,
                        descricao: r.descricao_item,
                        custo: parseFloat(r.custo),
                        responsavel: r.responsavel_nome,
                        origem: r.origem
                    }))
                },
                faturamento: {
                    acumuladoMes: Math.round(faturadoAcumulado * 100) / 100,
                    acumuladoMesAnterior: Math.round(faturadoMesAnterior * 100) / 100,
                    meta: Math.round(metaFaturamento * 100) / 100,
                    percentualMeta: metaFaturamento > 0 ? Math.round((faturadoAcumulado / metaFaturamento) * 1000) / 10 : 0,
                    mesReferencia: `${String(mesAtual).padStart(2, '0')}/${anoAtual}`,
                    mesAnteriorReferencia: `${String(mesAnterior).padStart(2, '0')}/${anoMesAnterior}`,
                    variacaoMesAnterior: Math.round(variacaoFaturamento * 10) / 10,
                    variacaoPositiva: variacaoFaturamento >= 0
                },
                pdca: {
                    planosAbertos: parseInt(pdcaQuery.rows[0]?.planos_abertos || 0),
                    planosEmAndamento: parseInt(pdcaQuery.rows[0]?.planos_em_andamento || 0),
                    planosConcluidos: parseInt(pdcaQuery.rows[0]?.planos_concluidos || 0),
                    acoesPendentes: parseInt(acoesPendentesQuery.rows[0]?.total || 0)
                }
            });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// GET /pdca/audit/:entidade/:id - Histórico de alterações
dashboardRouter.get('/pdca/audit/:entidade/:id',
    requirePermission('pdca_planos', 'ver'),
    async (req, res) => {
        try {
            const { entidade, id } = req.params;

            const query = await pool.query(`
                SELECT a.*, u.nome as usuario_nome
                FROM pdca_audit_log a
                LEFT JOIN usuarios u ON u.id = a.usuario_id
                WHERE a.entidade = $1 AND a.entidade_id = $2
                ORDER BY a.created_at DESC
            `, [entidade, id]);

            res.json(query.rows);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });
