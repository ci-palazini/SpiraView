import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { z } from "zod";
import { pool, withTx } from "../../db";
import { requirePermission } from "../../middlewares/requirePermission";

export const kamishibaiRouter: ExpressRouter = Router();

// Zod schemas for validation
const perguntaSchema = z.object({
    texto_pergunta: z.string().min(1, "A pergunta é obrigatória"),
    ordem: z.number().int().default(0),
    ativo: z.boolean().default(true),
});

const auditoriaSubmitSchema = z.object({
    kaizen_id: z.string().uuid(),
    status: z.enum(["conforme", "nao_conforme"]),
    observacoes: z.string().optional(),
    respostas: z.array(z.object({
        pergunta_id: z.string().uuid(),
        is_conforme: z.boolean(),
        observacao: z.string().optional()
    }))
});

/**
 * GET /api/melhoria-continua/kamishibai/:kaizenId/perguntas
 * Buscar perguntas configuradas para um Kaizen
 */
/**
 * @swagger
 * /melhoria-continua/kamishibai/{kaizenId}/perguntas:
 *   get:
 *     summary: Lista perguntas ativas do checklist de um Kaizen
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kaizenId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de perguntas
 */
kamishibaiRouter.get("/:kaizenId/perguntas", requirePermission("melhoria_continua", "ver"), async (req, res) => {
    try {
        const { kaizenId } = req.params;

        const { rows } = await pool.query(
            `SELECT * FROM kamishibai_perguntas WHERE kaizen_id = $1 AND ativo = true ORDER BY ordem ASC`,
            [kaizenId]
        );

        res.json(rows);
    } catch (error) {
        console.error("Erro ao buscar perguntas:", error);
        res.status(500).json({ error: "Erro ao buscar perguntas do Kamishibai." });
    }
});

/**
 * POST /api/melhoria-continua/kamishibai/:kaizenId/perguntas
 * Configurar as perguntas de um Kaizen (Atualização em Massa)
 */
/**
 * @swagger
 * /melhoria-continua/kamishibai/{kaizenId}/perguntas:
 *   post:
 *     summary: Substitui o checklist de perguntas de um Kaizen
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kaizenId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Perguntas atualizadas
 *       400:
 *         description: Dados inválidos
 */
kamishibaiRouter.post("/:kaizenId/perguntas", requirePermission("melhoria_continua", "editar"), async (req, res) => {
    try {
        const { kaizenId } = req.params;
        const perguntasInput = z.array(perguntaSchema).parse(req.body);

        await withTx(async (client) => {
            // Deletar as antigas (em um sistema real, poderíamos inativar em vez de excluir para não quebrar histórico visual se necessário,
            // mas como o histórico de respostas guarda o ID da pergunta e cascade=false para respostas, podemos excluir ou soft-delete. 
            // Por simplicidade na config atual baseada em excluir/reinserir, removeremos as nao preenchidas).
            // Uma abordagem melhor é marcar ativo = false nas antigas não enviadas.

            // Para simplificar a POC, vamos assumir que as respostar armazenam o ID da pergunta de forma relacional.
            // E remover logicamente.
            await client.query(`UPDATE kamishibai_perguntas SET ativo = false WHERE kaizen_id = $1`, [kaizenId]);

            // Inserir as novas (uma a uma ou em lote)
            for (const p of perguntasInput) {
                await client.query(`
          INSERT INTO kamishibai_perguntas (kaizen_id, texto_pergunta, ordem, ativo)
          VALUES ($1, $2, $3, $4)
        `, [kaizenId, p.texto_pergunta, p.ordem, p.ativo]);
            }
        });

        const { rows } = await pool.query(
            `SELECT * FROM kamishibai_perguntas WHERE kaizen_id = $1 AND ativo = true ORDER BY ordem ASC`,
            [kaizenId]
        );

        res.status(200).json(rows);
    } catch (error) {
        console.error("Erro ao configurar perguntas:", error);
        if (error instanceof z.ZodError) {
            const detalhe = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
            return res.status(400).json({ error: `Dados inválidos: ${detalhe}`, details: error.errors });
        }
        res.status(500).json({ error: "Erro interno ao configurar Kamishibai." });
    }
});

/**
 * POST /api/melhoria-continua/kamishibai/auditoria
 * Registrar uma nova auditoria Kamishibai (Semanal)
 */
/**
 * @swagger
 * /melhoria-continua/kamishibai/auditoria:
 *   post:
 *     summary: Registra uma auditoria Kamishibai com respostas granulares
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Auditoria registrada
 *       400:
 *         description: Dados inválidos
 */
kamishibaiRouter.post("/auditoria", requirePermission("melhoria_continua", "editar"), async (req: any, res: any) => {
    try {
        const data = auditoriaSubmitSchema.parse(req.body);
        const userId = req.user!.id;

        const auditoriaId = await withTx(async (client) => {
            // 1. Criar Auditoria
            const auditRes = await client.query(`
        INSERT INTO kamishibai_auditorias (kaizen_id, auditor_id, status, observacoes)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [data.kaizen_id, userId, data.status, data.observacoes || null]);

            const aId = auditRes.rows[0].id;

            // 2. Inserir Respostas
            for (const resp of data.respostas) {
                await client.query(`
          INSERT INTO kamishibai_respostas (auditoria_id, pergunta_id, is_conforme, observacao)
          VALUES ($1, $2, $3, $4)
        `, [aId, resp.pergunta_id, resp.is_conforme, resp.observacao || null]);
            }

            return aId;
        });

        // Retorna a auditoria criada completa
        const { rows } = await pool.query(`SELECT * FROM kamishibai_auditorias WHERE id = $1`, [auditoriaId]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error("Erro ao registrar auditoria:", error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Dados inválidos", details: error.errors });
        }
        res.status(500).json({ error: "Erro interno ao registrar Auditoria Kamishibai." });
    }
});

/**
 * GET /api/melhoria-continua/kamishibai/dashboard
 * Obter status agregado para exibir os selos verde/amarelo/vermelho
 */
/**
 * @swagger
 * /melhoria-continua/kamishibai/dashboard:
 *   get:
 *     summary: Retorna contagem agregada de status OK/NOK/Pendente de todos os Kaizens
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resumo do dashboard Kamishibai
 */
kamishibaiRouter.get("/dashboard", requirePermission("melhoria_continua", "ver"), async (req, res) => {
    try {
        // Retorna o status de TODOS os kaizens para preencher o board principal.
        // Lógica: 
        // Pendente (Amarelo) = Nenhuma auditoria nos últimos 7 dias.
        // Conforme (Verde) = Última auditoria (dentro de 7d) deu Conforme.
        // Não Conforme (Vermelho) = Última auditoria (dentro de 7d) deu Não Conforme.

        // Isso pode ser uma view, mas deixamos uma query agregada aqui.
        const query = `
      WITH UltimaAuditoria AS (
        SELECT kaizen_id, status, data_auditoria,
               ROW_NUMBER() OVER(PARTITION BY kaizen_id ORDER BY data_auditoria DESC) as rn
        FROM kamishibai_auditorias
      )
      SELECT 
        k.id as kaizen_id,
        k.titulo,
        ua.status as ultimo_status,
        ua.data_auditoria,
        CASE 
          WHEN ua.data_auditoria IS NULL THEN 'pendente'
          WHEN ua.data_auditoria < (NOW() - INTERVAL '7 days') THEN 'pendente'
          ELSE ua.status 
        END as status_kamishibai
      FROM kaizens k
      LEFT JOIN UltimaAuditoria ua ON k.id = ua.kaizen_id AND ua.rn = 1
      WHERE k.status != 'planejado' -- Assume-se que um planejado não precisa de Kamishibai ainda.
    `;

        const { rows } = await pool.query(query);

        const count = {
            conforme: rows.filter(r => r.status_kamishibai === 'conforme').length,
            nao_conforme: rows.filter(r => r.status_kamishibai === 'nao_conforme').length,
            pendente: rows.filter(r => r.status_kamishibai === 'pendente').length,
            total: rows.length
        };

        res.json({
            resumo: count,
            kaizens: rows
        });
    } catch (error) {
        console.error("Erro ao buscar dashboard kamishibai:", error);
        res.status(500).json({ error: "Erro interno." });
    }
});

/**
 * GET /api/melhoria-continua/kamishibai/historico
 * Obter log historico global de auditorias
 */
/**
 * @swagger
 * /melhoria-continua/kamishibai/historico:
 *   get:
 *     summary: Histórico global de auditorias Kamishibai
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de auditorias com respostas
 */
kamishibaiRouter.get("/historico", requirePermission("melhoria_continua", "ver"), async (req, res) => {
    try {
        const { rows } = await pool.query(`
        SELECT a.id, a.data_auditoria, a.status, a.observacoes, u.email as auditor_email, u.nome as auditor_nome,
               k.titulo as kaizen_titulo, k.id as kaizen_id, m.nome as maquina_nome,
               COALESCE(
                 (SELECT json_agg(json_build_object(
                     'pergunta_id', r.pergunta_id,
                     'is_conforme', r.is_conforme,
                     'observacao', r.observacao,
                     'texto_pergunta', p.texto_pergunta
                 ))
                 FROM kamishibai_respostas r
                 JOIN kamishibai_perguntas p ON r.pergunta_id = p.id
                 WHERE r.auditoria_id = a.id),
                 '[]'::json
               ) as respostas
        FROM kamishibai_auditorias a
        LEFT JOIN usuarios u ON a.auditor_id = u.id
        LEFT JOIN kaizens k ON a.kaizen_id = k.id
        LEFT JOIN maquinas m ON k.maquina_id = m.id
        ORDER BY a.data_auditoria DESC
      `);

        res.json(rows);
    } catch (error) {
        console.error("Erro ao buscar histórico kamishibai global:", error);
        res.status(500).json({ error: "Erro interno." });
    }
});

/**
 * GET /api/melhoria-continua/kamishibai/historico/:kaizenId
 * Obter log historico semanal de um kaizen 
 */
/**
 * @swagger
 * /melhoria-continua/kamishibai/historico/{kaizenId}:
 *   get:
 *     summary: Histórico de auditorias de um Kaizen específico
 *     tags: [MelhoriaContinua]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kaizenId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de auditorias do Kaizen
 */
kamishibaiRouter.get("/historico/:kaizenId", requirePermission("melhoria_continua", "ver"), async (req, res) => {
    try {
        const { kaizenId } = req.params;

        const { rows } = await pool.query(`
        SELECT a.id, a.data_auditoria, a.status, a.observacoes, u.email as auditor_email, u.nome as auditor_nome,
               COALESCE(
                 (SELECT json_agg(json_build_object(
                     'pergunta_id', r.pergunta_id,
                     'is_conforme', r.is_conforme,
                     'observacao', r.observacao,
                     'texto_pergunta', p.texto_pergunta
                 ))
                 FROM kamishibai_respostas r
                 JOIN kamishibai_perguntas p ON r.pergunta_id = p.id
                 WHERE r.auditoria_id = a.id),
                 '[]'::json
               ) as respostas
        FROM kamishibai_auditorias a
        LEFT JOIN usuarios u ON a.auditor_id = u.id
        WHERE a.kaizen_id = $1
        ORDER BY a.data_auditoria DESC
      `, [kaizenId]);

        res.json(rows);
    } catch (error) {
        console.error("Erro ao buscar histórico kamishibai:", error);
        res.status(500).json({ error: "Erro interno." });
    }
});
