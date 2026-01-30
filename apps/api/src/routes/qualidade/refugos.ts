import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const refugosRouter: Router = Router();

// GET /qualidade/refugos - Listar refugos
// Permite quem tem visualização de dashboard OU lançamento
refugosRouter.get('/qualidade/refugos',
    requirePermission('qualidade_lancamento', 'ver'), // Simplificação: assume que lancamento 'ver' é o basico
    async (req, res) => {
        try {
            const dataInicio = req.query.dataInicio as string;
            const dataFim = req.query.dataFim as string;
            const origem = req.query.origem as string;

            const params: any[] = [];
            let where = '1=1';

            if (dataInicio) {
                params.push(dataInicio);
                where += ` AND qr.data_ocorrencia >= $${params.length}`;
            }
            if (dataFim) {
                params.push(dataFim);
                where += ` AND qr.data_ocorrencia <= $${params.length}`;
            }
            if (origem) {
                params.push(origem);
                where += ` AND qr.origem = $${params.length}`;
            }

            const { rows } = await pool.query(
                `SELECT 
                qr.*,
                u.nome as criado_por_nome
             FROM qualidade_refugos qr
             LEFT JOIN usuarios u ON u.id = qr.criado_por_id
             WHERE ${where}
             ORDER BY qr.data_ocorrencia DESC, qr.created_at DESC`,
                params
            );

            res.json({ items: rows });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// POST /qualidade/refugos - Novo Lançamento
refugosRouter.post('/qualidade/refugos',
    requirePermission('qualidade_lancamento', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const {
                data_ocorrencia,
                origem_referencia,
                codigo_item,
                descricao_item,
                motivo_defeito,
                quantidade,
                custo,
                origem,
                responsavel_nome,
                numero_ncr
            } = req.body;

            if (!data_ocorrencia || !codigo_item || !motivo_defeito || !origem) {
                return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
            }

            const insert = await pool.query(
                `INSERT INTO qualidade_refugos (
                data_ocorrencia, origem_referencia, codigo_item, descricao_item, 
                motivo_defeito, quantidade, custo, origem, responsavel_nome, numero_ncr, criado_por_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id`,
                [
                    data_ocorrencia, origem_referencia, codigo_item, descricao_item,
                    motivo_defeito, quantidade || 0, custo || 0, origem, responsavel_nome, numero_ncr, user?.id
                ]
            );

            res.status(201).json({ id: insert.rows[0].id, ok: true });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// GET /qualidade/dashboard - KPIs
refugosRouter.get('/qualidade/dashboard',
    requirePermission('qualidade_dashboard', 'ver'),
    async (req, res) => {
        try {
            const dataInicio = req.query.dataInicio as string;
            const dataFim = req.query.dataFim as string;

            const params: any[] = [];
            let where = '1=1';

            if (dataInicio) {
                params.push(dataInicio);
                where += ` AND data_ocorrencia >= $${params.length}`;
            }
            if (dataFim) {
                params.push(dataFim);
                where += ` AND data_ocorrencia <= $${params.length}`;
            }

            // Total Custo
            const custoTotalQuery = await pool.query(
                `SELECT SUM(custo) as total FROM qualidade_refugos WHERE ${where}`, params
            );

            // Top 5 Defeitos
            const defeitosQuery = await pool.query(
                `SELECT motivo_defeito, SUM(quantidade) as qtd, SUM(custo) as custo 
             FROM qualidade_refugos 
             WHERE ${where} 
             GROUP BY motivo_defeito 
             ORDER BY custo DESC 
             LIMIT 5`, params
            );

            // Custo por Origem (Antigo Setor)
            const origemQuery = await pool.query(
                `SELECT origem, SUM(custo) as custo 
             FROM qualidade_refugos 
             WHERE ${where} 
             GROUP BY origem 
             ORDER BY custo DESC`, params
            );

            res.json({
                kpis: {
                    custoTotal: custoTotalQuery.rows[0]?.total || 0
                },
                defeitos: defeitosQuery.rows,
                origens: origemQuery.rows // Renamed from setores
            });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

