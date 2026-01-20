// src/routes/roles.ts
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

const rolesRouter: RouterType = Router();

// Lista de páginas disponíveis com seus grupos
const PAGINAS_DISPONIVEIS = [
    // Manutenção
    { key: 'inicio', nome: 'Início / Dashboard', grupo: 'Geral' },
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
    { key: 'analise_falhas', nome: 'Análise de Falhas', grupo: 'Analytics' },
    { key: 'causas_raiz', nome: 'Causas Raiz', grupo: 'Analytics' },
    // Produção
    { key: 'producao_upload', nome: 'Upload de Produção', grupo: 'Produção' },
    { key: 'producao_dashboard', nome: 'Dashboard de Produção', grupo: 'Produção' },
    { key: 'producao_colaboradores', nome: 'Colaboradores', grupo: 'Produção' },
    { key: 'producao_config', nome: 'Configurações de Produção', grupo: 'Produção' },
    // Planejamento
    { key: 'planejamento_dashboard', nome: 'Dashboard de Planejamento', grupo: 'Planejamento' },
    { key: 'planejamento_upload', nome: 'Upload de Capacidade', grupo: 'Planejamento' },
    { key: 'planejamento_config', nome: 'Configuração de Centros', grupo: 'Planejamento' },
    // Configurações
    { key: 'usuarios', nome: 'Gestão de Usuários', grupo: 'Configurações' },
    { key: 'roles', nome: 'Gestão de Níveis de Acesso', grupo: 'Configurações' },
];

// GET /roles/pages - Listar páginas disponíveis para permissões
rolesRouter.get('/pages', (_req: Request, res: Response) => {
    res.json({ items: PAGINAS_DISPONIVEIS });
});

// GET /roles/options - Listar roles para dropdowns (não exige permissão de gestão de roles)
// Usado em páginas como Gerir Utilizadores onde o usuário precisa apenas listar os roles para atribuir
rolesRouter.get('/options', async (_req: Request, res: Response) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, nome
            FROM roles
            ORDER BY nome ASC
        `);
        res.json({ items: rows });
    } catch (e: any) {
        console.error('Erro ao listar roles (options):', e);
        res.status(500).json({ error: 'Erro ao listar níveis de acesso' });
    }
});

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
        console.error('Erro ao listar roles:', e);
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
        console.error('Erro ao buscar role:', e);
        res.status(500).json({ error: 'Erro ao buscar nível de acesso' });
    }
});

// POST /roles - Criar novo role (requer editar)
rolesRouter.post('/', requirePermission('roles', 'editar'), async (req: Request, res: Response) => {
    try {
        const { nome, descricao, permissoes } = req.body;

        if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        // Verificar se já existe role com esse nome
        const existing = await pool.query(
            'SELECT id FROM roles WHERE LOWER(nome) = LOWER($1)',
            [nome.trim()]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Já existe um nível de acesso com esse nome' });
        }

        const { rows } = await pool.query(`
            INSERT INTO roles (nome, descricao, permissoes, is_system)
            VALUES ($1, $2, $3, FALSE)
            RETURNING 
                id,
                nome,
                descricao,
                permissoes,
                is_system AS "isSystem",
                criado_em AS "criadoEm"
        `, [nome.trim(), descricao || null, JSON.stringify(permissoes || {})]);

        res.status(201).json(rows[0]);
    } catch (e: any) {
        console.error('Erro ao criar role:', e);
        res.status(500).json({ error: 'Erro ao criar nível de acesso' });
    }
});

// PUT /roles/:id - Atualizar role (requer editar)
rolesRouter.put('/:id', requirePermission('roles', 'editar'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { nome, descricao, permissoes } = req.body;

        // Verificar se é role do sistema
        const check = await pool.query('SELECT is_system FROM roles WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Nível de acesso não encontrado' });
        }

        // Permitir edição apenas de nome, descrição e permissões de roles do sistema
        // mas não permitir exclusão
        if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        // Verificar se já existe outro role com esse nome
        const existing = await pool.query(
            'SELECT id FROM roles WHERE LOWER(nome) = LOWER($1) AND id != $2',
            [nome.trim(), id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Já existe outro nível de acesso com esse nome' });
        }

        const { rows } = await pool.query(`
            UPDATE roles
            SET nome = $2,
                descricao = $3,
                permissoes = $4,
                atualizado_em = NOW()
            WHERE id = $1
            RETURNING 
                id,
                nome,
                descricao,
                permissoes,
                is_system AS "isSystem",
                criado_em AS "criadoEm",
                atualizado_em AS "atualizadoEm"
        `, [id, nome.trim(), descricao || null, JSON.stringify(permissoes || {})]);

        res.json(rows[0]);
    } catch (e: any) {
        console.error('Erro ao atualizar role:', e);
        res.status(500).json({ error: 'Erro ao atualizar nível de acesso' });
    }
});

// DELETE /roles/:id - Excluir role (requer editar, apenas não-sistema)
rolesRouter.delete('/:id', requirePermission('roles', 'editar'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Verificar se é role do sistema
        const check = await pool.query('SELECT is_system, nome FROM roles WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Nível de acesso não encontrado' });
        }
        if (check.rows[0].is_system) {
            return res.status(403).json({
                error: `O nível de acesso "${check.rows[0].nome}" é do sistema e não pode ser excluído`
            });
        }

        // Verificar se há usuários usando esse role
        const usersCheck = await pool.query(
            'SELECT COUNT(*) as count FROM usuarios WHERE role_id = $1',
            [id]
        );
        if (parseInt(usersCheck.rows[0].count) > 0) {
            return res.status(400).json({
                error: 'Não é possível excluir: existem usuários usando este nível de acesso'
            });
        }

        await pool.query('DELETE FROM roles WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e: any) {
        console.error('Erro ao excluir role:', e);
        res.status(500).json({ error: 'Erro ao excluir nível de acesso' });
    }
});

export default rolesRouter;
