import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { z } from "zod";
import { pool, withTx } from "../../db";
import { requirePermission } from "../../middlewares/requirePermission";
import multer from "multer";
import { storageProvider } from "../../utils/storage";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Tipo de arquivo não suportado. Apenas imagens são permitidas."));
        }
    }
});

export const kaizenRouter: ExpressRouter = Router();

// Zod schemas for validation
const kaizenSchema = z.object({
    titulo: z.string().min(1, "O título é obrigatório").max(255),
    maquina_id: z.string().uuid().nullable().optional(),
    status: z.enum(["planejado", "em_andamento", "concluido", "padronizado"]).default("planejado"),
    problema_antes: z.string().optional(),
    solucao_depois: z.string().optional(),
    ganhos: z.string().optional(),
    data_implementacao: z.string().optional(), // YYYY-MM-DD
    thumbnail_url: z.string().nullable().optional(),
});

/**
 * GET /api/melhoria-continua/kaizens
 * Listar Kaizens com filtros opcionais
 */
/**
 * @swagger
 * /melhoria-continua/kaizens:
 *   get:
 *     summary: Lista Kaizens com status do Kamishibai agregado
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [planejado, em_andamento, concluido, padronizado] }
 *     responses:
 *       200:
 *         description: Lista paginada de Kaizens
 */
kaizenRouter.get("/", requirePermission("melhoria_continua", "ver"), async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.max(1, Number(limit));
        const offset = (pageNum - 1) * limitNum;

        let query = `
      WITH UltimaAuditoria AS (
        SELECT kaizen_id, status, data_auditoria,
               ROW_NUMBER() OVER(PARTITION BY kaizen_id ORDER BY data_auditoria DESC) as rn
        FROM kamishibai_auditorias
      )
      SELECT k.*, m.nome as maquina_nome, u.email as criado_por_email,
             CASE 
               WHEN k.status = 'planejado' THEN 'planejado'
               WHEN ua.data_auditoria IS NULL THEN 'Pendente'
               WHEN ua.data_auditoria < (NOW() - INTERVAL '7 days') THEN 'Pendente'
               WHEN ua.status = 'nao_conforme' THEN 'NOK'
               WHEN ua.status = 'conforme' THEN 'OK'
               ELSE 'Pendente'
             END as "kamishibaiStatus"
      FROM kaizens k
      LEFT JOIN maquinas m ON k.maquina_id = m.id
      LEFT JOIN usuarios u ON k.criado_por = u.id
      LEFT JOIN UltimaAuditoria ua ON k.id = ua.kaizen_id AND ua.rn = 1
      WHERE 1=1
    `;
        const params: any[] = [];

        if (status) {
            params.push(status);
            query += ` AND k.status = $${params.length}`;
        }

        query += ` ORDER BY k.data_implementacao DESC NULLS LAST, k.criado_em DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limitNum, offset);

        const { rows } = await pool.query(query, params);

        // Contagem total
        let countQuery = "SELECT COUNT(*) FROM kaizens WHERE 1=1";
        const countParams: any[] = [];
        if (status) {
            countParams.push(status);
            countQuery += ` AND status = $${countParams.length}`;
        }
        const { rows: countRows } = await pool.query(countQuery, countParams);

        const kaizensWithUrl = rows.map((k) => {
            if (k.thumbnail_url && !k.thumbnail_url.startsWith('http')) {
                k.thumbnail_url = storageProvider.getPublicUrl(k.thumbnail_url, 'kaizen-fotos');
            }
            return k;
        });

        res.json({
            data: kaizensWithUrl,
            meta: {
                total: parseInt(countRows[0].count, 10),
                page: pageNum,
                limit: limitNum,
            },
        });
    } catch (error) {
        console.error("Erro ao listar kaizens:", error);
        res.status(500).json({ error: "Erro ao buscar kaizens." });
    }
});

/**
 * GET /api/melhoria-continua/kaizens/:id
 * Buscar detalhes de um Kaizen e suas perguntas configuradas
 */
/**
 * @swagger
 * /melhoria-continua/kaizens/{id}:
 *   get:
 *     summary: Busca detalhes de um Kaizen, perguntas e última auditoria
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Kaizen detalhado
 *       404:
 *         description: Kaizen não encontrado
 */
kaizenRouter.get("/:id", requirePermission("melhoria_continua", "ver"), async (req, res) => {
    try {
        const { id } = req.params;

        const { rows } = await pool.query(`
      SELECT k.*, m.nome as maquina_nome, u.email as criado_por_email
      FROM kaizens k
      LEFT JOIN maquinas m ON k.maquina_id = m.id
      LEFT JOIN usuarios u ON k.criado_por = u.id
      WHERE k.id = $1
    `, [id]);

        if (!rows.length) {
            return res.status(404).json({ error: "Kaizen não encontrado." });
        }

        const kaizen = rows[0];

        // Buscar perguntas ativas e status do último Kamishibai
        const { rows: perguntas } = await pool.query(
            `SELECT * FROM kamishibai_perguntas WHERE kaizen_id = $1 AND ativo = true ORDER BY ordem ASC`,
            [id]
        );

        const { rows: ultimasAuditorias } = await pool.query(
            `SELECT * FROM kamishibai_auditorias WHERE kaizen_id = $1 ORDER BY data_auditoria DESC LIMIT 1`,
            [id]
        );

        if (kaizen.thumbnail_url && !kaizen.thumbnail_url.startsWith('http')) {
            kaizen.thumbnail_url = storageProvider.getPublicUrl(kaizen.thumbnail_url, 'kaizen-fotos');
        }

        res.json({
            ...kaizen,
            perguntas_configuradas: perguntas,
            ultima_auditoria: ultimasAuditorias.length ? ultimasAuditorias[0] : null
        });
    } catch (error) {
        console.error("Erro ao buscar kaizen:", error);
        res.status(500).json({ error: "Erro ao buscar kaizen." });
    }
});

/**
 * POST /api/melhoria-continua/kaizens
 * Criar um novo Kaizen
 */
/**
 * @swagger
 * /melhoria-continua/kaizens:
 *   post:
 *     summary: Cria um novo Kaizen
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Kaizen criado
 *       400:
 *         description: Dados inválidos
 */
kaizenRouter.post("/", requirePermission("melhoria_continua", "editar"), async (req: any, res) => {
    try {
        const data = kaizenSchema.parse(req.body);
        const userId = req.user!.id;

        const query = `
      INSERT INTO kaizens (
        titulo, maquina_id, status, problema_antes, solucao_depois, 
        ganhos, data_implementacao, thumbnail_url, criado_por
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

        const params = [
            data.titulo,
            data.maquina_id || null,
            data.status,
            data.problema_antes || null,
            data.solucao_depois || null,
            data.ganhos || null,
            data.data_implementacao || null,
            data.thumbnail_url || null,
            userId
        ];

        const { rows } = await pool.query(query, params);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error("Erro ao criar kaizen:", error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Dados inválidos", details: error.errors });
        }
        res.status(500).json({ error: "Erro interno ao criar Kaizen." });
    }
});

/**
 * PUT /api/melhoria-continua/kaizens/:id
 * Atualizar um Kaizen
 */
/**
 * @swagger
 * /melhoria-continua/kaizens/{id}:
 *   put:
 *     summary: Atualiza um Kaizen existente
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Kaizen atualizado
 *       404:
 *         description: Kaizen não encontrado
 */
kaizenRouter.put("/:id", requirePermission("melhoria_continua", "editar"), async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const data = kaizenSchema.parse(req.body);

        const query = `
      UPDATE kaizens SET
        titulo = $1,
        maquina_id = $2,
        status = $3,
        problema_antes = $4,
        solucao_depois = $5,
        ganhos = $6,
        data_implementacao = $7,
        thumbnail_url = COALESCE($8, thumbnail_url),
        atualizado_em = timezone('utc'::text, now())
      WHERE id = $9
      RETURNING *
    `;

        const params = [
            data.titulo,
            data.maquina_id || null,
            data.status,
            data.problema_antes || null,
            data.solucao_depois || null,
            data.ganhos || null,
            data.data_implementacao || null,
            data.thumbnail_url || null,
            id
        ];

        const { rows } = await pool.query(query, params);

        if (!rows.length) {
            return res.status(404).json({ error: "Kaizen não encontrado." });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Erro ao atualizar kaizen:", error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Dados inválidos", details: error.errors });
        }
        res.status(500).json({ error: "Erro interno ao atualizar Kaizen." });
    }
});

/**
 * DELETE /api/melhoria-continua/kaizens/:id
 * Excluir um Kaizen e apagar em cascata (ON DELETE CASCADE está no DB)
 */
/**
 * @swagger
 * /melhoria-continua/kaizens/{id}:
 *   delete:
 *     summary: Remove um Kaizen e seus dados em cascata
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Removido com sucesso
 *       404:
 *         description: Kaizen não encontrado
 */
kaizenRouter.delete("/:id", requirePermission("melhoria_continua", "editar"), async (req: any, res: any) => {
    try {
        const { id } = req.params;

        const { rowCount } = await pool.query(`DELETE FROM kaizens WHERE id = $1`, [id]);

        if (rowCount === 0) {
            return res.status(404).json({ error: "Kaizen não encontrado." });
        }

        res.status(204).send();
    } catch (error) {
        console.error("Erro ao excluir kaizen:", error);
        res.status(500).json({ error: "Erro ao excluir kaizen." });
    }
});

/**
 * POST /api/melhoria-continua/kaizens/:id/thumbnail
 * Upload e atualização do thumbnail do Kaizen
 */
kaizenRouter.post("/:id/thumbnail", requirePermission("melhoria_continua", "editar"), upload.single("file"), async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "Arquivo não enviado." });
        }

        // Verifica se kaizen existe
        const { rows } = await pool.query(`SELECT id, thumbnail_url FROM kaizens WHERE id = $1`, [id]);
        if (!rows.length) {
            return res.status(404).json({ error: "Kaizen não encontrado." });
        }

        const oldPath = rows[0].thumbnail_url;

        // Define storage path
        const ext = file.originalname.split('.').pop();
        const path = `kaizens/${id}/thumbnail-${Date.now()}.${ext}`;

        // Upload to storage
        const uploadedPath = await storageProvider.uploadFile(path, file.buffer, file.mimetype, 'kaizen-fotos');

        // Update DB
        await pool.query(`UPDATE kaizens SET thumbnail_url = $1 WHERE id = $2`, [uploadedPath, id]);

        // Delete old file if it wasn't an external HTTP link
        if (oldPath && !oldPath.startsWith('http')) {
            try {
                await storageProvider.deleteFile(oldPath, 'kaizen-fotos');
            } catch (e) {
                console.error("Erro ao deletar thumbnail antigo:", e);
            }
        }

        const publicUrl = storageProvider.getPublicUrl(uploadedPath, 'kaizen-fotos');

        res.json({ ok: true, thumbnail_url: publicUrl, storage_path: uploadedPath });
    } catch (error) {
        console.error("Erro no upload do thumbnail:", error);
        res.status(500).json({ error: "Erro no upload do thumbnail." });
    }
});
