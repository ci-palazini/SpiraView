// apps/api/src/routes/planejamento/capacidade.ts
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

const capacidadeRouter: RouterType = Router();

// =============================================
// Tipos e Interfaces
// =============================================

interface ResumoCapacidade {
    maquinaId: string | null;
    centroTrabalho: string;
    setor: string | null;
    cargaHoras: number;
    cargaOP: number;
    capacidade: number;
    capacidadeRestante: number;
    sobrecarga: boolean;
    percentualOcupacao: number;
}

interface MaquinaCache {
    id: string;
    nome: string;
    aliases: string[];
    capacidade: number;
}

// =============================================
// Helper: Normaliza nome de coluna
// =============================================

function normalizeColumnName(col: string): string {
    return col
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

// =============================================
// Helper: Cálculo de Dias Úteis (seg-sex)
// =============================================

function isBusinessDay(date: Date): boolean {
    const day = date.getDay();
    return day !== 0 && day !== 6; // 0 = domingo, 6 = sábado
}

function countBusinessDaysInMonth(year: number, month: number): number {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let count = 0;
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        if (isBusinessDay(d)) count++;
    }
    return count;
}

function countRemainingBusinessDays(today: Date): number {
    const year = today.getFullYear();
    const month = today.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    let count = 0;
    // Inclui o dia atual se for dia útil
    for (let d = new Date(today); d <= lastDay; d.setDate(d.getDate() + 1)) {
        if (isBusinessDay(d)) count++;
    }
    return count;
}

function countPassedBusinessDays(today: Date): number {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    let count = 0;
    // Count from 1st day of month up to today (inclusive)
    for (let d = new Date(firstDay); d <= today; d.setDate(d.getDate() + 1)) {
        if (isBusinessDay(d)) count++;
    }
    return count;
}

function getRemainingCapacityRatio(): number {
    const today = new Date();
    const totalDays = countBusinessDaysInMonth(today.getFullYear(), today.getMonth());
    const remainingDays = countRemainingBusinessDays(today);
    if (totalDays === 0) return 0;
    return remainingDays / totalDays;
}

function findColumn(row: Record<string, unknown>, ...possibleNames: string[]): unknown {
    for (const key of Object.keys(row)) {
        const normalized = normalizeColumnName(key);
        for (const name of possibleNames) {
            if (normalized === name || normalized.includes(name)) {
                return row[key];
            }
        }
    }
    return undefined;
}

// =============================================
// Helper: Build machine lookup cache (ONE query)
// =============================================

async function buildMaquinaCache(): Promise<Map<string, MaquinaCache>> {
    const { rows } = await pool.query(`
        SELECT id, nome, COALESCE(aliases_planejamento, '{}') as aliases, COALESCE(capacidade_horas, 0) as capacidade
        FROM maquinas
        WHERE escopo_planejamento = TRUE
    `);

    const cache = new Map<string, MaquinaCache>();

    for (const m of rows) {
        const maq: MaquinaCache = {
            id: m.id,
            nome: m.nome || '',
            aliases: m.aliases || [],
            capacidade: parseFloat(m.capacidade) || 0,
        };

        // Index by lowercase nome
        cache.set(maq.nome.toLowerCase(), maq);



        // Index by each alias
        for (const alias of maq.aliases) {
            cache.set(alias.toLowerCase(), maq);
        }
    }

    return cache;
}

// =============================================
// POST /capacidade/upload
// Upload de arquivo Excel com reservas - OPTIMIZED FOR 10k+ ROWS
// =============================================

/**
 * @swagger
 * /capacidade/upload:
 *   post:
 *     summary: Upload capacity planning data
 *     tags: [Planejamento]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rows, nomeArquivo]
 *             properties:
 *               nomeArquivo:
 *                 type: string
 *               rows:
 *                 type: array
 *     responses:
 *       201:
 *         description: Upload created
 */
capacidadeRouter.post(
    '/capacidade/upload',
    express.json({ limit: '10mb' }),
    requirePermission('planejamento_upload', 'editar'),
    async (req: Request, res: Response) => {
        const startTime = Date.now();

        try {
            const { rows, nomeArquivo } = req.body;
            const userEmail = req.user?.email || null;

            if (!Array.isArray(rows) || rows.length === 0) {
                return res.status(400).json({ error: 'Nenhuma linha enviada' });
            }

            console.log(`[Upload Capacidade] Processando ${rows.length} linhas...`);

            // 1. Build machine cache ONCE (instead of query per row)
            const maquinaCache = await buildMaquinaCache();
            console.log(`[Upload Capacidade] Cache de ${maquinaCache.size} máquinas carregado`);

            // 2. Process rows in memory (fast)
            const processedRows: Array<{
                maquinaId: string | null;
                centroTrabalhoOriginal: string;
                numeroItem: string;
                nomeItem: string;
                referencia: string;
                numero: string;
                horas: number;
                status: string;
                tipoTrabalho: string;
                data: string;
                dataAcao: string;
            }> = [];
            const erros: Array<{ linha: number; erro: string }> = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i] as Record<string, unknown>;
                const lineNum = i + 2;

                const centroTrabalho = String(findColumn(row, 'centro_de_trabalho', 'centro_trabalho') || '').trim();
                const horasRaw = findColumn(row, 'horas');

                if (!centroTrabalho) {
                    erros.push({ linha: lineNum, erro: 'Centro de trabalho não encontrado' });
                    continue;
                }

                let horas = 0;
                if (typeof horasRaw === 'number') {
                    horas = horasRaw;
                } else if (typeof horasRaw === 'string') {
                    horas = parseFloat(horasRaw.replace(',', '.')) || 0;
                }

                if (horas <= 0) {
                    erros.push({ linha: lineNum, erro: `Horas inválidas: ${horasRaw}` });
                    continue;
                }

                // Fast lookup from cache
                const maquina = maquinaCache.get(centroTrabalho.toLowerCase());

                processedRows.push({
                    maquinaId: maquina?.id || null,
                    centroTrabalhoOriginal: centroTrabalho,
                    numeroItem: String(findColumn(row, 'n_do_item', 'numero_item') || '').trim(),
                    nomeItem: String(findColumn(row, 'nome_do_item', 'nome_item') || '').trim(),
                    referencia: String(findColumn(row, 'referencia') || '').trim(),
                    numero: String(findColumn(row, 'numero') || '').trim(),
                    horas,
                    status: String(findColumn(row, 'status') || '').trim(),
                    tipoTrabalho: String(findColumn(row, 'tipo_de_trabalho', 'tipo_trabalho') || '').trim(),
                    data: String(findColumn(row, 'data') || ''),
                    dataAcao: String(findColumn(row, 'data_de_acao', 'data_acao') || ''),
                });
            }

            if (processedRows.length === 0) {
                return res.status(400).json({ error: 'Nenhuma linha válida', erros });
            }

            console.log(`[Upload Capacidade] ${processedRows.length} linhas válidas, ${erros.length} com erro`);

            // 3. Batch insert using UNNEST (VERY FAST - single query for all rows)
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Delete ALL previous reservation data to avoid database bloat
                // Keep upload metadata in planejamento_uploads for auditing
                const deleteResult = await client.query('DELETE FROM planejamento_reservas');
                console.log(`[Upload Capacidade] Deletadas ${deleteResult.rowCount} reservas anteriores`);

                // Create upload record
                const uploadResult = await client.query(`
                    INSERT INTO planejamento_uploads (nome_arquivo, linhas_total, linhas_sucesso, linhas_erro, upload_por_email)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                `, [nomeArquivo, rows.length, processedRows.length, erros.length, userEmail]);

                const uploadId = uploadResult.rows[0].id;

                // Prepare arrays for UNNEST batch insert
                const maquinaIds: (string | null)[] = [];
                const centros: string[] = [];
                const numeroItems: string[] = [];
                const nomeItems: string[] = [];
                const referencias: string[] = [];
                const numeros: string[] = [];
                const horasArr: number[] = [];
                const statusArr: string[] = [];
                const tiposTrabalho: string[] = [];
                const datas: string[] = [];
                const datasAcao: string[] = [];

                for (const r of processedRows) {
                    maquinaIds.push(r.maquinaId);
                    centros.push(r.centroTrabalhoOriginal);
                    numeroItems.push(r.numeroItem);
                    nomeItems.push(r.nomeItem);
                    referencias.push(r.referencia);
                    numeros.push(r.numero);
                    horasArr.push(r.horas);
                    statusArr.push(r.status);
                    tiposTrabalho.push(r.tipoTrabalho);
                    datas.push(r.data);
                    datasAcao.push(r.dataAcao);
                }

                // Single INSERT with UNNEST - handles 11k rows in ~1-2 seconds
                await client.query(`
                    INSERT INTO planejamento_reservas (
                        upload_id, maquina_id, centro_trabalho_original, numero_item, nome_item,
                        referencia, numero_op, horas, status, tipo_trabalho,
                        data_programada, data_acao
                    )
                    SELECT 
                        $1::uuid,
                        UNNEST($2::uuid[]),
                        UNNEST($3::text[]),
                        UNNEST($4::text[]),
                        UNNEST($5::text[]),
                        UNNEST($6::text[]),
                        UNNEST($7::text[]),
                        UNNEST($8::numeric[]),
                        UNNEST($9::text[]),
                        UNNEST($10::text[]),
                        UNNEST($11::text[]),
                        UNNEST($12::text[])
                `, [
                    uploadId,
                    maquinaIds,
                    centros,
                    numeroItems,
                    nomeItems,
                    referencias,
                    numeros,
                    horasArr,
                    statusArr,
                    tiposTrabalho,
                    datas,
                    datasAcao,
                ]);

                await client.query('COMMIT');

                const matched = processedRows.filter(r => r.maquinaId).length;
                const elapsed = Date.now() - startTime;
                console.log(`[Upload Capacidade] Concluído em ${elapsed}ms`);

                res.status(201).json({
                    ok: true,
                    uploadId,
                    resumo: {
                        totalLinhas: rows.length,
                        linhasValidas: processedRows.length,
                        linhasComErro: erros.length,
                        centrosVinculados: matched,
                        centrosNaoVinculados: processedRows.length - matched,
                        tempoMs: elapsed,
                    },
                    erros: erros.slice(0, 10),
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (err: any) {
            logger.error({ err: err }, 'Erro no upload de capacidade:');
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    }
);

// =============================================
// GET /capacidade/uploads/tv/ultimo - PUBLIC (for TV mode, no auth)
// =============================================

capacidadeRouter.get(
    '/capacidade/uploads/tv/ultimo',
    async (_req: Request, res: Response) => {
        try {
            const { rows } = await pool.query(`
                SELECT 
                    id, 
                    nome_arquivo AS "nomeArquivo",
                    criado_em AS "criadoEm"
                FROM planejamento_uploads
                WHERE ativo = true
                ORDER BY criado_em DESC
                LIMIT 1
            `);

            if (rows.length === 0) {
                return res.json({ upload: null });
            }

            res.json({ upload: rows[0] });
        } catch (err: any) {
            logger.error({ err: err }, 'Erro ao buscar último upload TV:');
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    }
);

// =============================================
// GET /capacidade/resumo/tv - PUBLIC (for TV mode, no auth)
// =============================================

capacidadeRouter.get(
    '/capacidade/resumo/tv',
    async (req: Request, res: Response) => {
        try {
            const lastUpload = await pool.query(`
                SELECT id FROM planejamento_uploads 
                WHERE ativo = true 
                ORDER BY criado_em DESC LIMIT 1
            `);
            if (lastUpload.rows.length === 0) {
                return res.json({ items: [], message: 'Nenhum upload encontrado' });
            }
            const targetUploadId = lastUpload.rows[0].id;

            const { rows: dados } = await pool.query(`
                SELECT 
                    m.id as maquina_id,
                    COALESCE(m.nome_producao, m.nome) as centro_trabalho,
                    m.setor,
                    COALESCE(SUM(pr.horas), 0) as carga_horas,
                    COALESCE(SUM(CASE WHEN pr.status IN ('Liberado', 'Iniciado') THEN pr.horas ELSE 0 END), 0) as carga_op,
                    COALESCE(m.capacidade_horas, 0) as capacidade
                FROM maquinas m
                LEFT JOIN planejamento_reservas pr ON pr.maquina_id = m.id AND pr.upload_id = $1
                WHERE m.escopo_planejamento = TRUE
                GROUP BY m.id, m.nome, m.nome_producao, m.setor, m.capacidade_horas
                ORDER BY COALESCE(m.nome_producao, m.nome)
            `, [targetUploadId]);

            const today = new Date();
            const totalBusinessDays = countBusinessDaysInMonth(today.getFullYear(), today.getMonth());
            const passedBusinessDays = countPassedBusinessDays(today);
            const capacityRatio = getRemainingCapacityRatio();

            const items: ResumoCapacidade[] = dados.map((d: any) => {
                const cargaHoras = parseFloat(d.carga_horas) || 0;
                const cargaOP = parseFloat(d.carga_op) || 0;
                const capacidade = parseFloat(d.capacidade) || 0;
                const capacidadeRestante = Math.round(capacidade * capacityRatio * 10) / 10;
                return {
                    maquinaId: d.maquina_id,
                    centroTrabalho: d.centro_trabalho,
                    setor: d.setor || null,
                    cargaHoras,
                    cargaOP,
                    capacidade,
                    capacidadeRestante,
                    sobrecarga: cargaHoras > capacidade && capacidade > 0,
                    percentualOcupacao: capacidade > 0 ? Math.round((cargaHoras / capacidade) * 100) : 0,
                };
            });

            res.json({
                items,
                uploadId: targetUploadId,
                calculation: {
                    totalBusinessDays,
                    passedBusinessDays
                }
            });
        } catch (err: any) {
            logger.error({ err: err }, 'Erro ao buscar resumo TV:');
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    }
);

// =============================================
// GET /capacidade/resumo
// =============================================

capacidadeRouter.get(
    '/capacidade/resumo',
    requirePermission('planejamento_dashboard', 'ver'),
    async (req: Request, res: Response) => {
        try {
            const { uploadId } = req.query;

            let targetUploadId = uploadId as string | undefined;
            let lastUploadDate: string | undefined;

            if (!targetUploadId) {
                const lastUpload = await pool.query(`
                    SELECT id, criado_em FROM planejamento_uploads 
                    WHERE ativo = true 
                    ORDER BY criado_em DESC LIMIT 1
                `);
                if (lastUpload.rows.length === 0) {
                    return res.json({ items: [], message: 'Nenhum upload encontrado' });
                }
                targetUploadId = lastUpload.rows[0].id;
                lastUploadDate = lastUpload.rows[0].criado_em;
            } else {
                // Fetch created_at for the specific uploadId if provided
                const specificUpload = await pool.query(`SELECT criado_em FROM planejamento_uploads WHERE id = $1`, [targetUploadId]);
                if (specificUpload.rows.length > 0) {
                    lastUploadDate = specificUpload.rows[0].criado_em;
                }
            }

            const { rows: dados } = await pool.query(`
                SELECT 
                    m.id as maquina_id,
                    COALESCE(m.nome_producao, m.nome) as centro_trabalho,
                    m.setor,
                    COALESCE(SUM(pr.horas), 0) as carga_horas,
                    COALESCE(SUM(CASE WHEN pr.status IN ('Liberado', 'Iniciado') THEN pr.horas ELSE 0 END), 0) as carga_op,
                    COALESCE(m.capacidade_horas, 0) as capacidade
                FROM maquinas m
                LEFT JOIN planejamento_reservas pr ON pr.maquina_id = m.id AND pr.upload_id = $1
                WHERE m.escopo_planejamento = TRUE
                GROUP BY m.id, m.nome, m.nome_producao, m.setor, m.capacidade_horas
                ORDER BY COALESCE(m.nome_producao, m.nome)
            `, [targetUploadId]);

            const today = new Date();
            const totalBusinessDays = countBusinessDaysInMonth(today.getFullYear(), today.getMonth());
            const remainingBusinessDays = countRemainingBusinessDays(today);
            const passedBusinessDays = countPassedBusinessDays(today);
            const capacityRatio = getRemainingCapacityRatio();

            const items: ResumoCapacidade[] = dados.map((d: any) => {
                const cargaHoras = parseFloat(d.carga_horas) || 0;
                const cargaOP = parseFloat(d.carga_op) || 0;
                const capacidade = parseFloat(d.capacidade) || 0;
                const capacidadeRestante = Math.round(capacidade * capacityRatio * 10) / 10;
                return {
                    maquinaId: d.maquina_id,
                    centroTrabalho: d.centro_trabalho,
                    setor: d.setor || null,
                    cargaHoras,
                    cargaOP,
                    capacidade,
                    capacidadeRestante,
                    sobrecarga: cargaHoras > capacidade && capacidade > 0,
                    percentualOcupacao: capacidade > 0 ? Math.round((cargaHoras / capacidade) * 100) : 0,
                };
            });

            res.json({
                items,
                uploadId: targetUploadId,
                lastUploadDate,
                calculation: {
                    totalBusinessDays,
                    remainingBusinessDays,
                    passedBusinessDays,
                    currentDate: new Date().toISOString()
                }
            });
        } catch (err: any) {
            logger.error({ err: err }, 'Erro ao buscar resumo:');
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    }
);

// =============================================
// GET /capacidade/uploads
// =============================================

capacidadeRouter.get(
    '/capacidade/uploads',
    requirePermission('planejamento_dashboard', 'ver'),
    async (_req: Request, res: Response) => {
        try {
            const { rows } = await pool.query(`
                SELECT 
                    pu.id, pu.nome_arquivo AS "nomeArquivo", 
                    pu.linhas_total AS "linhasTotal", 
                    pu.linhas_sucesso AS "linhasSucesso",
                    pu.linhas_erro AS "linhasErro",
                    pu.ativo,
                    COALESCE(u.nome, pu.upload_por_email) AS "uploadPorNome",
                    pu.criado_em AS "criadoEm"
                FROM planejamento_uploads pu
                LEFT JOIN usuarios u ON u.email = pu.upload_por_email
                ORDER BY pu.criado_em DESC
                LIMIT 20
            `);
            res.json({ items: rows });
        } catch (err: any) {
            logger.error({ err: err }, 'Erro ao listar uploads:');
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    }
);

// =============================================
// GET /capacidade/maquinas
// =============================================

capacidadeRouter.get(
    '/capacidade/maquinas',
    requirePermission('planejamento_config', 'ver'),
    async (_req: Request, res: Response) => {
        try {
            const { rows } = await pool.query(`
                SELECT 
                    id, nome,
                    nome_producao AS "nomeProducao",
                    COALESCE(capacidade_horas, 0) AS "capacidadeHoras",
                    COALESCE(aliases_planejamento, '{}') AS "aliasesPlanejamento",
                    escopo_planejamento AS "escopoPlanejamento"
                FROM maquinas
                WHERE escopo_planejamento = TRUE
                ORDER BY COALESCE(nome_producao, nome)
            `);
            res.json({ items: rows });
        } catch (err: any) {
            logger.error({ err: err }, 'Erro ao listar máquinas:');
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    }
);

// =============================================
// PATCH /capacidade/maquinas/:id
// =============================================

capacidadeRouter.patch(
    '/capacidade/maquinas/:id',
    requirePermission('planejamento_config', 'editar'),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { capacidadeHoras, aliasesPlanejamento, escopoPlanejamento } = req.body;

            const sets: string[] = [];
            const params: any[] = [id];

            if (capacidadeHoras !== undefined) {
                params.push(parseFloat(capacidadeHoras) || 0);
                sets.push(`capacidade_horas = $${params.length}`);
            }

            if (aliasesPlanejamento !== undefined) {
                const aliases = Array.isArray(aliasesPlanejamento)
                    ? aliasesPlanejamento.map((a: unknown) => String(a).trim()).filter(Boolean)
                    : [];
                params.push(aliases);
                sets.push(`aliases_planejamento = $${params.length}`);
            }

            if (escopoPlanejamento !== undefined) {
                params.push(!!escopoPlanejamento);
                sets.push(`escopo_planejamento = $${params.length}`);
            }

            if (sets.length === 0) {
                return res.status(400).json({ error: 'Nenhum campo para atualizar' });
            }

            const { rows } = await pool.query(`
                UPDATE maquinas 
                SET ${sets.join(', ')}, atualizado_em = NOW()
                WHERE id = $1
                RETURNING 
                    id, nome, tag,
                    COALESCE(capacidade_horas, 0) AS "capacidadeHoras",
                    COALESCE(aliases_planejamento, '{}') AS "aliasesPlanejamento",
                    escopo_planejamento AS "escopoPlanejamento"
            `, params);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Máquina não encontrada' });
            }

            res.json(rows[0]);
        } catch (err: any) {
            logger.error({ err: err }, 'Erro ao atualizar máquina:');
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    }
);

export { capacidadeRouter };
