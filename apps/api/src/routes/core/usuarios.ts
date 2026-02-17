import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../../db';
import { roleToFuncao } from '../../utils/roles';
import { requirePermission, requireAnyPermission } from '../../middlewares/requirePermission';

export const usuariosRouter: Router = Router();

/**
 * @swagger
 * /usuarios:
 *   get:
 *     summary: List users
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by single role
 *       - in: query
 *         name: roles
 *         schema:
 *           type: string
 *         description: Filter by multiple roles (comma separated)
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive users
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
// GET /usuarios - listar usuários (requer 'usuarios:ver' OU 'chamados_gestao:ver' OU 'producao_colaboradores:ver')
usuariosRouter.get('/usuarios', requireAnyPermission(['usuarios', 'chamados_gestao', 'producao_colaboradores'], 'ver'), async (req, res) => {
  try {
    // Suporta 'role' (único) ou 'roles' (múltiplos separados por vírgula)
    const rawRole = (req.query.role as string | undefined) ?? '';
    const rawRoles = (req.query.roles as string | undefined) ?? '';
    const role = rawRole.trim().toLowerCase().replace(/[:;,.]+$/, '');

    // Parse múltiplos roles se fornecido
    const rolesArray = rawRoles
      ? rawRoles.split(',').map(r => r.trim().toLowerCase()).filter(Boolean)
      : [];

    const includeInactive =
      String(req.query.includeInactive || 'false').toLowerCase() === 'true';

    const where: string[] = [];
    const params: any[] = [];

    // Filtro por role(s) — usa r.nome (da tabela roles) via JOIN
    if (rolesArray.length > 0) {
      // Múltiplos roles via parâmetro 'roles'
      const placeholders = rolesArray.map((_, i) => `LOWER($${params.length + i + 1})`).join(', ');
      params.push(...rolesArray);
      where.push(`LOWER(r.nome) IN (${placeholders})`);
    } else if (role && role !== 'all' && role !== 'todos') {
      // Role único via parâmetro 'role'
      params.push(role);
      where.push(`LOWER(r.nome) = LOWER($${params.length})`);
    }

    // por padrão, só ativos
    if (!includeInactive) {
      where.push(`u.ativo = true`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         u.id,
         u.nome,
         u.usuario,
         u.email,
         u.email_real,
         r.nome AS role,
         u.role_id,
         COALESCE(
           u.funcao,
           r.nome,
           'Colaborador'
         ) AS funcao,
         u.ativo,
         u.matricula
       FROM usuarios u
       LEFT JOIN roles r ON u.role_id = r.id
       ${whereSQL}
       ORDER BY u.nome ASC`,
      params
    );

    res.json({ items: rows });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});


/**
 * @swagger
 * /usuarios:
 *   post:
 *     summary: Create a new user
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, usuario, email, role]
 *             properties:
 *               nome:
 *                 type: string
 *               usuario:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *               funcao:
 *                 type: string
 *               senha:
 *                 type: string
 *               matricula:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         $ref: '#/components/schemas/Error'
 */
// POST /usuarios - criar usuário (requer editar)
usuariosRouter.post('/usuarios', requirePermission('usuarios', 'editar'), async (req, res) => {
  try {
    let { nome, usuario, email, email_real, role, funcao, senha, matricula } = req.body || {};
    nome = String(nome || '').trim();
    usuario = String(usuario || '').trim().toLowerCase();
    email = String(email || '').trim().toLowerCase();
    email_real = email_real ? String(email_real).trim().toLowerCase() : null;
    role = String(role || '').trim().toLowerCase();
    funcao = String(funcao || '').trim();
    matricula = matricula !== undefined ? String(matricula).trim() : null;

    if (!nome || !usuario || !email || !role) {
      return res.status(400).json({ error: 'Campos obrigatÃ³rios: nome, usuario, email, role.' });
    }

    // FunÃ§Ã£o padrÃ£o baseada no role (se nÃ£o vier)
    if (!funcao) {
      funcao = roleToFuncao(role);
    }

    // senha_hash (opcional)
    let senha_hash: string | null = null;
    if (typeof senha === 'string' && senha.trim().length >= 6) {
      senha_hash = await bcrypt.hash(senha.trim(), 10);
    }

    // Buscar role_id a partir do nome do role
    const { rows: roleRows } = await pool.query(
      `SELECT id FROM roles WHERE LOWER(nome) = LOWER($1) LIMIT 1`,
      [role]
    );
    const roleId = roleRows[0]?.id || null;

    // Inserção
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, usuario, email, email_real, role_id, funcao, senha_hash, matricula)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, nome, usuario, email, email_real, role_id, funcao, matricula`,
      [nome, usuario, email, email_real, roleId, funcao, senha_hash, matricula]
    );

    res.status(201).json(rows[0]);
  } catch (e: any) {
    // conflitos de unique (usuario/email)
    if (String(e?.code) === '23505') {
      return res.status(409).json({ error: 'UsuÃ¡rio ou e-mail jÃ¡ existente.' });
    }
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// PUT /usuarios/:id - atualizar usuário (requer editar)
usuariosRouter.put('/usuarios/:id', requirePermission('usuarios', 'editar'), async (req, res) => {
  try {
    const id = String(req.params.id);

    let { nome, usuario, email, email_real, role, funcao, senha, matricula } = req.body || {};
    nome = nome !== undefined ? String(nome).trim() : undefined;
    usuario = usuario !== undefined ? String(usuario).trim().toLowerCase() : undefined;
    email = email !== undefined ? String(email).trim().toLowerCase() : undefined;
    email_real = email_real !== undefined ? (email_real ? String(email_real).trim().toLowerCase() : null) : undefined;
    role = role !== undefined ? String(role).trim().toLowerCase() : undefined;
    funcao = funcao !== undefined ? String(funcao).trim() : undefined;
    matricula = matricula !== undefined ? String(matricula).trim() : undefined;

    // Monta SET dinÃ¢mico
    const sets: string[] = [];
    const params: any[] = [];
    const add = (sql: string, v: any) => { params.push(v); sets.push(`${sql}=$${params.length}`); };

    if (nome !== undefined) add('nome', nome);
    if (usuario !== undefined) add('usuario', usuario);
    if (email !== undefined) add('email', email);
    if (email_real !== undefined) add('email_real', email_real);
    if (role !== undefined) {
      // Buscar role_id a partir do nome do role
      const { rows: roleRows } = await pool.query(
        `SELECT id FROM roles WHERE LOWER(nome) = LOWER($1) LIMIT 1`,
        [role]
      );
      if (roleRows[0]?.id) {
        add('role_id', roleRows[0].id);
      }
    }
    if (role !== undefined && funcao === undefined) {
      funcao = roleToFuncao(role);
    }
    if (funcao !== undefined) add('funcao', funcao);
    if (matricula !== undefined) add('matricula', matricula);

    // Reset de senha se informado
    if (typeof senha === 'string') {
      if (senha.trim().length < 6) return res.status(400).json({ error: 'Senha muito curta.' });
      const hash = await bcrypt.hash(senha.trim(), 10);
      add('senha_hash', hash);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${sets.join(', ')}
        WHERE id=$${params.length}
      RETURNING id, nome, usuario, email, role_id, funcao, matricula`,
      params
    );

    if (!rows.length) return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado.' });
    res.json(rows[0]);
  } catch (e: any) {
    if (String(e?.code) === '23505') {
      return res.status(409).json({ error: 'UsuÃ¡rio ou e-mail jÃ¡ existente.' });
    }
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /usuarios/:id - desativar usuário (requer editar)
usuariosRouter.delete('/usuarios/:id', requirePermission('usuarios', 'editar'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const ts = Date.now(); // sufixo para evitar conflito de unique

    const upd = await pool.query(
      `UPDATE usuarios
          SET ativo   = false,
              email   = CASE WHEN email   IS NOT NULL THEN email   || '.inactive.' || $2 ELSE email   END,
              usuario = CASE WHEN usuario IS NOT NULL THEN usuario || '.inactive.' || $2 ELSE usuario END
        WHERE id = $1 AND ativo = true
        RETURNING id`,
      [id, ts]
    );

    if (!upd.rowCount) {
      return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado ou jÃ¡ inativo.' });
    }
    res.json({ ok: true, id });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /usuarios/:id/estatisticas - estatísticas de usuário (requer ver)
usuariosRouter.get('/usuarios/:id/estatisticas', requirePermission('usuarios', 'ver'), async (req, res) => {
  try {
    const id = String(req.params.id);

    // Busca dados do usuário com role via JOIN
    const userResult = await pool.query(
      `SELECT u.id, u.nome, r.nome AS role, u.matricula
       FROM usuarios u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const user = userResult.rows[0];
    const role = (user.role || '').toLowerCase();

    // Datas para filtros
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (role === 'operador') {
      // Estatísticas para operadores
      const [checklistsTotal, checklistsMes, chamadosAbertos, itensProblema] = await Promise.all([
        // Total de checklists enviados pelo operador
        pool.query(
          `SELECT COUNT(*) as total FROM checklist_submissoes WHERE operador_id = $1`,
          [id]
        ),
        // Checklists nos últimos 30 dias
        pool.query(
          `SELECT COUNT(*) as total FROM checklist_submissoes 
           WHERE operador_id = $1 AND criado_em >= NOW() - INTERVAL '30 days'`,
          [id]
        ),
        // Chamados abertos pelo operador (via criado_por_id)
        pool.query(
          `SELECT COUNT(*) as total FROM chamados 
           WHERE criado_por_id = $1`,
          [id]
        ),
        // Itens com problema reportados (NAO no checklist)
        pool.query(
          `SELECT COUNT(*) as total FROM checklist_submissoes cs
           WHERE cs.operador_id = $1 
           AND EXISTS (
             SELECT 1 FROM jsonb_each_text(cs.respostas::jsonb) r 
             WHERE LOWER(r.value) = 'nao'
           )`,
          [id]
        ),
      ]);

      return res.json({
        role: 'operador',
        usuario: user,
        estatisticas: {
          checklistsTotal: parseInt(checklistsTotal.rows[0]?.total || '0'),
          checklistsMes: parseInt(checklistsMes.rows[0]?.total || '0'),
          chamadosAbertos: parseInt(chamadosAbertos.rows[0]?.total || '0'),
          itensProblema: parseInt(itensProblema.rows[0]?.total || '0'),
        }
      });
    }

    if (role === 'manutentor') {
      // Estatísticas para manutentores
      const [chamadosAtribuidos, emAndamento, concluidos, concluidosMes, tempoMedio] = await Promise.all([
        // Total de chamados atribuídos
        pool.query(
          `SELECT COUNT(*) as total FROM chamados WHERE manutentor_id = $1`,
          [id]
        ),
        // Chamados em andamento
        pool.query(
          `SELECT COUNT(*) as total FROM chamados 
           WHERE manutentor_id = $1 AND LOWER(status) = 'em andamento'`,
          [id]
        ),
        // Chamados concluídos
        pool.query(
          `SELECT COUNT(*) as total FROM chamados 
           WHERE manutentor_id = $1 AND LOWER(status) IN ('concluido', 'concluído')`,
          [id]
        ),
        // Chamados concluídos no mês
        pool.query(
          `SELECT COUNT(*) as total FROM chamados 
           WHERE manutentor_id = $1 
           AND LOWER(status) IN ('concluido', 'concluído')
           AND atualizado_em >= $2`,
          [id, startOfMonth.toISOString()]
        ),
        // Tempo médio de resolução (em horas)
        pool.query(
          `SELECT AVG(EXTRACT(EPOCH FROM (atualizado_em - criado_em)) / 3600) as media_horas
           FROM chamados 
           WHERE manutentor_id = $1 
           AND LOWER(status) IN ('concluido', 'concluído')
           AND atualizado_em IS NOT NULL 
           AND criado_em IS NOT NULL`,
          [id]
        ),
      ]);

      return res.json({
        role: 'manutentor',
        usuario: user,
        estatisticas: {
          chamadosAtribuidos: parseInt(chamadosAtribuidos.rows[0]?.total || '0'),
          emAndamento: parseInt(emAndamento.rows[0]?.total || '0'),
          concluidos: parseInt(concluidos.rows[0]?.total || '0'),
          concluidosMes: parseInt(concluidosMes.rows[0]?.total || '0'),
          tempoMedioHoras: parseFloat(tempoMedio.rows[0]?.media_horas || '0').toFixed(1),
        }
      });
    }

    // Gestor ou outro role: retorna básico
    return res.json({
      role: role,
      usuario: user,
      estatisticas: {}
    });

  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});


