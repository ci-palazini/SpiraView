// src/routes/roles.ts
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { pool, withTx } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { requireAuth } from '../../middlewares/requireAuth';
import { logger } from '../../logger';
import { logAudit } from '../../utils/audit';

const rolesRouter: RouterType = Router();

// Lista de páginas disponíveis com seus grupos
const PAGINAS_DISPONIVEIS = [
    // Geral
    { key: 'inicio', nome: 'Início / Dashboard', grupo: 'Geral' },
    { key: 'reuniao_diaria', nome: 'Reunião Diária SQDCP', grupo: 'Geral' },
    // Manutenção
    { key: 'chamados_abertos', nome: 'Chamados em Aberto', grupo: 'Manutenção' },
    { key: 'historico_chamados', nome: 'Histórico de Chamados', grupo: 'Manutenção' },
    { key: 'meus_chamados', nome: 'Meus Chamados', grupo: 'Manutenção' },
    { key: 'abrir_chamado', nome: 'Abrir Chamado', grupo: 'Manutenção' },
    { key: 'chamados_gestao', nome: 'Atribuir / Gerenciar Chamados', grupo: 'Manutenção' },
    { key: 'maquinas', nome: 'Máquinas', grupo: 'Manutenção' },
    { key: 'calendario', nome: 'Calendário', grupo: 'Manutenção' },
    { key: 'estoque', nome: 'Estoque', grupo: 'Manutenção' },
    { key: 'movimentacoes', nome: 'Movimentações', grupo: 'Manutenção' },
    { key: 'checklists_diarios', nome: 'Checklists Diários', grupo: 'Manutenção' },
    { key: 'checklists_pendencias', nome: 'Justificativa de Pendências', grupo: 'Manutenção' },
    { key: 'analise_falhas', nome: 'Análise de Falhas', grupo: 'Analytics' },
    { key: 'causas_raiz', nome: 'Causas Raiz', grupo: 'Analytics' },
    // Produção
    { key: 'producao_upload', nome: 'Upload de Produção', grupo: 'Produção' },
    { key: 'producao_dashboard', nome: 'Dashboard de Produção', grupo: 'Produção' },
    { key: 'producao_resultados', nome: 'Resultados de Produção', grupo: 'Produção' },
    { key: 'producao_colaboradores', nome: 'Colaboradores', grupo: 'Produção' },
    { key: 'producao_config', nome: 'Configurações de Produção', grupo: 'Produção' },
    // Planejamento
    { key: 'planejamento_dashboard', nome: 'Dashboard de Planejamento', grupo: 'Planejamento' },
    { key: 'planejamento_upload', nome: 'Upload de Capacidade', grupo: 'Planejamento' },
    { key: 'planejamento_config', nome: 'Configuração de Centros', grupo: 'Planejamento' },
    // Qualidade
    { key: 'qualidade_dashboard', nome: 'Dashboard de Qualidade', grupo: 'Qualidade' },
    { key: 'qualidade_comparativo', nome: 'Comparativo de Qualidade', grupo: 'Qualidade' },
    { key: 'qualidade_desempenho', nome: 'Desempenho Individual', grupo: 'Qualidade' },
    { key: 'qualidade_lancamento', nome: 'Lançamento de Refugo', grupo: 'Qualidade' },
    { key: 'qualidade_config', nome: 'Configurações de Qualidade', grupo: 'Qualidade' },
    { key: 'qualidade_retrabalho', nome: 'Retrabalho', grupo: 'Qualidade' },
    { key: 'qualidade_analitico', nome: 'Análise Qualidade', grupo: 'Qualidade' },
    // Logística
    { key: 'logistica_dashboard', nome: 'Dashboard de Logística', grupo: 'Logística' },
    { key: 'logistica_painel', nome: 'Painel Logístico', grupo: 'Logística' },
    { key: 'logistica_princ1', nome: 'Controle Princ. 1', grupo: 'Logística' },
    { key: 'logistica_proposto', nome: 'Faturamento Proposto', grupo: 'Logística' },
    // PDCA
    { key: 'pdca_dashboard', nome: 'Dashboard PDCA', grupo: 'PDCA' },
    { key: 'pdca_planos', nome: 'Planos de Ação', grupo: 'PDCA' },
    // Melhoria Contínua
    { key: 'melhoria_continua', nome: 'Kaizens & Kamishibai', grupo: 'Melhoria Contínua' },
    // EHS
    { key: 'safety', nome: 'EHS / Segurança', grupo: 'EHS' },
    // Configurações
    { key: 'usuarios', nome: 'Gestão de Usuários', grupo: 'Configurações' },
    { key: 'roles', nome: 'Gestão de Níveis de Acesso', grupo: 'Configurações' },
    { key: 'maquinas_config', nome: 'Configuração Global de Máquinas', grupo: 'Configurações' },
    { key: 'notificacoes_config', nome: 'Notificações', grupo: 'Configurações' },
    { key: 'tv_config', nome: 'Modo TV', grupo: 'Configurações' },
];

// GET /roles/pages - Listar páginas disponíveis para permissões
rolesRouter.get('/pages', (_req: Request, res: Response) => {
    res.json({ items: PAGINAS_DISPONIVEIS });
});

// GET /roles/options - Listar roles para dropdowns (não exige permissão de gestão de roles)
// Usado em páginas como Gerir Utilizadores onde o usuário precisa apenas listar os roles para atribuir
rolesRouter.get('/options', requireAuth, async (_req: Request, res: Response) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, nome
            FROM roles
            WHERE is_system = TRUE
            ORDER BY nome ASC
        `);
        res.json({ items: rows });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro ao listar roles (options):');
        res.status(500).json({ error: 'Erro ao listar níveis de acesso' });
    }
});

/**
 * @swagger
 * /roles:
 *   get:
 *     summary: List all roles
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles including permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                      type: object
 *                      properties:
 *                        id:
 *                          type: string
 *                        nome:
 *                          type: string
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
// GET /roles - Listar todos os roles (requer ver)
rolesRouter.get('/', requirePermission('roles', 'ver'), async (_req: Request, res: Response) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                id,
                nome,
                descricao,
                permissoes,
                is_system AS "isSystem",
                criado_em AS "criadoEm",
                atualizado_em AS "atualizadoEm"
            FROM roles
            ORDER BY is_system DESC, nome ASC
        `);
        res.json({ items: rows });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro ao listar roles:');
        res.status(500).json({ error: 'Erro ao listar níveis de acesso' });
    }
});

// GET /roles/:id - Obter role específico (requer ver)
rolesRouter.get('/:id', requirePermission('roles', 'ver'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`
            SELECT 
                id,
                nome,
                descricao,
                permissoes,
                is_system AS "isSystem",
                criado_em AS "criadoEm",
                atualizado_em AS "atualizadoEm"
            FROM roles
            WHERE id = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Nível de acesso não encontrado' });
        }

        res.json(rows[0]);
    } catch (e: any) {
        logger.error({ err: e }, 'Erro ao buscar role:');
        res.status(500).json({ error: 'Erro ao buscar nível de acesso' });
    }
});

// POST /roles - Bloqueado (roles são inerentes ao sistema)
rolesRouter.post('/', (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Níveis de acesso são definidos pelo sistema. Não é possível criar novos.' });
});

// PUT /roles/:id - Bloqueado (roles são inerentes ao sistema)
rolesRouter.put('/:id', (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Níveis de acesso são definidos pelo sistema. Não é possível atualizar.' });
});

// DELETE /roles/:id - Bloqueado (roles são inerentes ao sistema)
rolesRouter.delete('/:id', (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Níveis de acesso são definidos pelo sistema. Não é possível deletar.' });
});

export default rolesRouter;
