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
            const tipo = req.query.tipo as string;
            const tipoLancamento = req.query.tipoLancamento as string;

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = (page - 1) * limit;

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
            if (tipo && (tipo === 'INTERNO' || tipo === 'EXTERNO')) {
                params.push(tipo);
                where += ` AND EXISTS (SELECT 1 FROM qualidade_origens qo WHERE qo.nome = qr.origem AND qo.tipo = $${params.length})`;
            }
            if (tipoLancamento) {
                params.push(tipoLancamento);
                where += ` AND qr.tipo_lancamento = $${params.length}`;
            }

            const responsavel = req.query.responsavel as string;
            if (responsavel) {
                params.push(responsavel);
                where += ` AND qr.responsavel_nome = $${params.length}`;
            }

            // Count total
            const countQuery = await pool.query(
                `SELECT COUNT(*) as total FROM qualidade_refugos qr WHERE ${where}`,
                params
            );
            const total = parseInt(countQuery.rows[0].total);

            // Fetch data
            const query = `
                SELECT 
                    qr.*,
                    u.nome as criado_por_nome
                FROM qualidade_refugos qr
                LEFT JOIN usuarios u ON u.id = qr.criado_por_id
                WHERE ${where}
                ORDER BY qr.data_ocorrencia DESC, qr.created_at DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `;

            const { rows } = await pool.query(query, [...params, limit, offset]);

            res.json({
                items: rows,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
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
                numero_ncr,
                tipo_lancamento
            } = req.body;

            if (!data_ocorrencia || !codigo_item || !motivo_defeito || !origem) {
                return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
            }

            const insert = await pool.query(
                `INSERT INTO qualidade_refugos (
                data_ocorrencia, origem_referencia, codigo_item, descricao_item, 
                motivo_defeito, quantidade, custo, origem, responsavel_nome, numero_ncr, criado_por_id, tipo_lancamento
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id`,
                [
                    data_ocorrencia, origem_referencia, codigo_item, descricao_item,
                    motivo_defeito, quantidade || 0, custo || 0, origem, responsavel_nome, numero_ncr, user?.id,
                    tipo_lancamento || 'REFUGO'
                ]
            );

            res.status(201).json({ id: insert.rows[0].id, ok: true });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });


// PUT /qualidade/refugos/:id - Atualizar
refugosRouter.put('/qualidade/refugos/:id',
    requirePermission('qualidade_lancamento', 'editar'),
    async (req, res) => {
        try {
            const { id } = req.params;
            // Support both wrapped in data (standard in this app) or direct body
            const payload = req.body.data || req.body;

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
                numero_ncr,
                tipo_lancamento
            } = payload;

            const update = await pool.query(
                `UPDATE qualidade_refugos SET
                data_ocorrencia = $1, origem_referencia = $2, codigo_item = $3, 
                descricao_item = $4, motivo_defeito = $5, quantidade = $6, 
                custo = $7, origem = $8, responsavel_nome = $9, numero_ncr = $10, tipo_lancamento = $12
                WHERE id = $11`,
                [
                    data_ocorrencia, origem_referencia, codigo_item, descricao_item,
                    motivo_defeito, quantidade, custo, origem, responsavel_nome, numero_ncr, id,
                    tipo_lancamento || 'REFUGO'
                ]
            );

            // Check if any row was actually updated
            if ((update as any).rowCount === 0) {
                return res.status(404).json({ error: 'Registro não encontrado ou sem alteração.' });
            }

            res.json({ ok: true });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// DELETE /qualidade/refugos/:id - Excluir
refugosRouter.delete('/qualidade/refugos/:id',
    requirePermission('qualidade_lancamento', 'editar'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const del = await pool.query('DELETE FROM qualidade_refugos WHERE id = $1', [id]);

            if ((del as any).rowCount === 0) {
                return res.status(404).json({ error: 'Registro não encontrado.' });
            }

            res.json({ ok: true });
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
            const tipo = req.query.tipo as string;
            const tipoLancamento = req.query.tipoLancamento as string;
            const origem = req.query.origem as string;

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
            if (origem) {
                params.push(origem);
                where += ` AND origem = $${params.length}`;
            }
            if (tipo && (tipo === 'INTERNO' || tipo === 'EXTERNO')) {
                params.push(tipo);
                where += ` AND EXISTS (SELECT 1 FROM qualidade_origens qo WHERE qo.nome = qualidade_refugos.origem AND qo.tipo = $${params.length})`;
            }
            if (tipoLancamento) {
                params.push(tipoLancamento);
                where += ` AND tipo_lancamento = $${params.length}`;
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

            // Custo por Responsável
            const responsaveisQuery = await pool.query(
                `SELECT responsavel_nome, SUM(custo) as custo 
             FROM qualidade_refugos 
             WHERE ${where} 
             GROUP BY responsavel_nome 
             ORDER BY custo DESC 
             LIMIT 10`, params
            );

            res.json({
                kpis: {
                    custoTotal: custoTotalQuery.rows[0]?.total || 0
                },
                defeitos: defeitosQuery.rows,
                origens: origemQuery.rows, // Renamed from setores
                responsaveis: responsaveisQuery.rows
            });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

