import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../../db';

export const authRouter: Router = Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Username or email
 *               senha:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 nome:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
authRouter.post('/auth/login', async (req, res) => {
  try {
    const raw = String(req.body?.identifier || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');

    if (!raw) return res.status(400).json({ error: 'Informe Usuário ou e-mail.' });
    if (senha.length < 6) return res.status(400).json({ error: 'Senha muito curta.' });

    // aceita "usuario" ou "email"
    const usuario = raw.includes('@') ? raw.split('@')[0] : raw;

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.role,
              COALESCE(u.funcao,
                CASE
                  WHEN LOWER(u.role)='gestor'     THEN 'Gestor'
                  WHEN LOWER(u.role)='manutentor' THEN 'Técnico Eletromecânico'
                  ELSE 'Operador de CNC'
                END) AS funcao,
              COALESCE(u.usuario, split_part(LOWER(u.email),'@',1)) AS usuario,
              u.senha_hash,
              r.id AS role_id,
              r.nome AS role_nome,
              r.permissoes
         FROM usuarios u
         LEFT JOIN roles r ON u.role_id = r.id
                           OR LOWER(u.role) = LOWER(r.nome)
        WHERE LOWER(u.email) = LOWER($1)
           OR LOWER(u.usuario) = LOWER($2)
        LIMIT 1`,
      [raw, usuario]
    );

    if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const u = rows[0];

    // *** EXIGIR senha SEMPRE ***
    if (!u.senha_hash) {
      // antes permitia login sem senha; agora bloqueia
      return res.status(401).json({ error: 'Senha não definida. Defina a senha primeiro.' });
    }
    const ok = await bcrypt.compare(senha, u.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' });

    return res.json({
      id: u.id,
      nome: u.nome,
      email: u.email,
      role: u.role,
      funcao: u.funcao,
      usuario: u.usuario,
      roleId: u.role_id,
      roleNome: u.role_nome,
      permissoes: u.permissoes || {}
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obter dados do usuário logado
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Dados do usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 nome:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Não autenticado
 */
authRouter.get('/auth/me', async (req, res) => {
  try {
    const email = req.user?.email || req.header('x-user-email');
    if (!email) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.role,
              COALESCE(u.funcao,
                CASE
                  WHEN LOWER(u.role)='gestor'     THEN 'Gestor'
                  WHEN LOWER(u.role)='manutentor' THEN 'Técnico Eletromecânico'
                  ELSE 'Operador de CNC'
                END) AS funcao,
              COALESCE(u.usuario, split_part(LOWER(u.email),'@',1)) AS usuario,
              r.id AS role_id,
              r.nome AS role_nome,
              r.permissoes
         FROM usuarios u
         LEFT JOIN roles r ON u.role_id = r.id
                           OR LOWER(u.role) = LOWER(r.nome)
        WHERE LOWER(u.email) = LOWER($1)
        LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const u = rows[0];

    return res.json({
      id: u.id,
      nome: u.nome,
      email: u.email,
      role: u.role,
      funcao: u.funcao,
      usuario: u.usuario,
      roleId: u.role_id,
      roleNome: u.role_nome,
      permissoes: u.permissoes || {}
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

authRouter.post('/auth/change-password', async (req, res) => {
  try {
    const bodyEmail = String(req.body?.email || '').trim().toLowerCase();
    const headerEmail = String(req.headers['x-user-email'] || '').trim().toLowerCase();
    const email = bodyEmail || headerEmail;
    const senhaAtual = String(req.body?.senhaAtual || '');
    const novaSenha = String(req.body?.novaSenha || '');

    if (!email) return res.status(400).json({ error: 'Informe o e-mail.' });
    if (novaSenha.length < 6) return res.status(400).json({ error: 'Nova senha muito curta.' });

    const { rows } = await pool.query(
      `SELECT id, senha_hash FROM usuarios WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado.' });

    const u = rows[0];

    // Se jÃ¡ existe senha, exige confirmaÃ§Ã£o da atual
    if (u.senha_hash) {
      const ok = await bcrypt.compare(senhaAtual, u.senha_hash);
      if (!ok) return res.status(400).json({ error: 'Senha atual invÃ¡lida.' });
    }
    // Caso ainda nÃ£o exista senha (migraÃ§Ã£o), permitimos definir sem exigir a atual

    const hash = await bcrypt.hash(novaSenha, 10);
    await pool.query(`UPDATE usuarios SET senha_hash=$2 WHERE id=$1`, [u.id, hash]);

    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

