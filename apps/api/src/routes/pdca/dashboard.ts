import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

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

            // ===== RETRABALHO =====
            // Total horas do período
            const retrabalhoQuery = await pool.query(`
                SELECT 
                    COALESCE(SUM(EXTRACT(EPOCH FROM horas_retrabalho::interval)/3600), 0) as total_horas
                FROM qualidade_retrabalho
                WHERE data >= $1 AND data <= $2
            `, [formatDate(dataInicio), formatDate(dataFim)]);

            // Período anterior para comparação
            const retrabalhoAnteriorQuery = await pool.query(`
                SELECT 
                    COALESCE(SUM(EXTRACT(EPOCH FROM horas_retrabalho::interval)/3600), 0) as total_horas
                FROM qualidade_retrabalho
                WHERE data >= $1 AND data <= $2
            `, [formatDate(dataInicioAnterior), formatDate(dataFimAnterior)]);

            // Últimos casos de retrabalho
            const ultimosRetrabalhosQuery = await pool.query(`
                SELECT *
                FROM qualidade_retrabalho
                ORDER BY data DESC, created_at DESC
                LIMIT 6
            `);

            const horasRetrabalho = parseFloat(retrabalhoQuery.rows[0]?.total_horas || 0);
            const horasRetrabalhoAnterior = parseFloat(retrabalhoAnteriorQuery.rows[0]?.total_horas || 0);
            const variacaoRetrabalho = horasRetrabalhoAnterior > 0
                ? ((horasRetrabalho - horasRetrabalhoAnterior) / horasRetrabalhoAnterior) * 100
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
                retrabalho: {
                    horas: Math.round(horasRetrabalho * 100) / 100,
                    horasAnterior: Math.round(horasRetrabalhoAnterior * 100) / 100,
                    variacao: Math.round(variacaoRetrabalho * 10) / 10,
                    variacaoPositiva: variacaoRetrabalho <= 0, // Menos retrabalho é melhor
                    ultimosCasos: ultimosRetrabalhosQuery.rows
                },
                pdca: {
                    planosAbertos: parseInt(pdcaQuery.rows[0]?.planos_abertos || 0),
                    planosEmAndamento: parseInt(pdcaQuery.rows[0]?.planos_em_andamento || 0),
                    planosConcluidos: parseInt(pdcaQuery.rows[0]?.planos_concluidos || 0),
                    acoesPendentes: parseInt(acoesPendentesQuery.rows[0]?.total || 0)
                }
            });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
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
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    });
