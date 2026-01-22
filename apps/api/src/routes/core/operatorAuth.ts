import { Router } from 'express';
import { pool } from '../../db';

export const operatorAuthRouter: Router = Router();

/**
 * GET /api/operators/active
 * Lista operadores ativos para seleção no login simplificado ou upload de produção
 * Requer permissão: producao_upload (ver) ou admin
 */
/**
 * @swagger
 * /operators/active:
 *   get:
 *     summary: List active operators
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active operators
 */
operatorAuthRouter.get('/operators/active', async (req, res) => {
    try {
        const user = (req as any).user || {};
        const userRole = (user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';

        // Verificar permissão para listar operadores
        if (!isAdmin && user.id) {
            const { rows: permRows } = await pool.query<{ permissoes: Record<string, string> }>(
                `SELECT r.permissoes 
                 FROM usuarios u
                 JOIN roles r ON u.role_id = r.id OR LOWER(u.role) = LOWER(r.nome)
                 WHERE u.id = $1
                 LIMIT 1`,
                [user.id]
            );

            const permissions = permRows[0]?.permissoes || {};
            const uploadPerm = permissions['producao_upload'] || permissions['producao_colaboradores'];

            if (!uploadPerm || uploadPerm === 'nenhum') {
                return res.status(403).json({ error: 'Sem permissão para listar operadores.' });
            }
        }

        const { rows } = await pool.query(
            `SELECT id, nome
       FROM usuarios
       WHERE LOWER(role) = 'operador'
         AND ativo = true
       ORDER BY nome ASC`
        );

        res.json({ items: rows });
    } catch (e: any) {
        console.error('GET /operators/active error:', e);
        res.status(500).json({ error: 'Erro ao listar operadores.' });
    }
});

/**
 * POST /api/auth/operator-login
 * Login simplificado para operadores usando matrícula
 * Body: { operadorId: string, matricula: string }
 */
operatorAuthRouter.post('/auth/operator-login', async (req, res) => {
    try {
        const operadorId = String(req.body?.operadorId || '').trim();
        const matricula = String(req.body?.matricula || '').trim();

        if (!operadorId) {
            return res.status(400).json({ error: 'Selecione um operador.' });
        }

        if (!matricula || matricula.length < 4) {
            return res.status(400).json({ error: 'Informe a matrícula (4 dígitos).' });
        }

        // Busca operador pelo ID
        const { rows } = await pool.query(
            `SELECT 
         id, 
         nome, 
         email, 
         role,
         matricula,
         COALESCE(funcao, 'Operador de CNC') AS funcao,
         COALESCE(usuario, split_part(LOWER(email), '@', 1)) AS usuario
       FROM usuarios
       WHERE id = $1
         AND LOWER(role) = 'operador'
         AND ativo = true
       LIMIT 1`,
            [operadorId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Operador não encontrado.' });
        }

        const operador = rows[0];

        // Valida matrícula
        if (!operador.matricula) {
            return res.status(401).json({
                error: 'Matrícula não cadastrada. Procure o gestor.'
            });
        }

        if (operador.matricula !== matricula) {
            return res.status(401).json({ error: 'Matrícula inválida.' });
        }

        // Retorna dados do operador (mesmo formato do login tradicional)
        return res.json({
            id: operador.id,
            nome: operador.nome,
            email: operador.email,
            role: operador.role,
            funcao: operador.funcao,
            usuario: operador.usuario
        });

    } catch (e: any) {
        console.error('POST /auth/operator-login error:', e);
        res.status(500).json({ error: 'Erro ao autenticar operador.' });
    }
});
