//apps/api/src/routes/core/auth.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { pool } from '../../db';
import { env } from '../../config/env';
import rateLimit from 'express-rate-limit';



export const authRouter: Router = Router();

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 5 login requests per windowMs
  message: { error: 'Muitas tentativas de login. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
authRouter.post('/auth/login', loginLimiter, async (req, res) => {
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

    const token = jwt.sign(
      {
        id: u.id,
        email: u.email,
        role: u.role,
        nome: u.nome,
        usuario: u.usuario,
      },
      env.auth.jwtSecret,
      { expiresIn: '7d' } // Token válido por 7 dias
    );

    return res.json({
      id: u.id,
      nome: u.nome,
      email: u.email,
      role: u.role,
      funcao: u.funcao,
      usuario: u.usuario,
      roleId: u.role_id,
      roleNome: u.role_nome,
      permissoes: u.permissoes || {},
      token, // <--- Retorna o token JWT
    });
  } catch (e: any) {
    console.error('[AUTH LOGIN ERROR]', e);
    res.status(500).json({ error: 'Erro interno ao processar login.' });
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
    const email = req.user?.email;
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
    console.error('[AUTH ME ERROR]', e);
    res.status(500).json({ error: 'Erro interno ao buscar usuário.' });
  }
});

authRouter.post('/auth/change-password', async (req, res) => {
  try {
    const bodyEmail = String(req.body?.email || '').trim().toLowerCase();
    const userEmail = req.user?.email;
    const isAdmin = req.isAdmin === true; // Setado pelo middleware requirePermission ou userFromHeader (se aplicável), mas aqui pode não ter passado por lá.
    // Melhor: verificar role do token ou do banco. Como change-password é autenticado, req.user existe.
    // Mas req.user.role vem do token. O ideal é confiar no que tá no token "por enquanto" OU buscar no banco se quisermos ser ultra seguros.
    // Como a task diz "blindar rota", vamos assumir:
    // 1. Se tem bodyEmail e é diferente de userEmail -> Só permite se for Admin.

    let targetEmail = userEmail;

    if (bodyEmail && bodyEmail !== userEmail) {
      // Tentativa de mudar senha de outrem
      // Verificar se quem está pedindo é admin REAL (buscando no banco pra garantir)
      const { rows: adminCheck } = await pool.query(
        `SELECT r.nome FROM usuarios u 
             JOIN roles r ON u.role_id = r.id 
             WHERE u.email = $1`,
        [userEmail]
      );

      const isRealAdmin = adminCheck.length > 0 && adminCheck[0].nome.toLowerCase() === 'admin';

      if (!isRealAdmin) {
        return res.status(403).json({ error: 'Apenas administradores podem alterar senhas de outros usuários.' });
      }
      targetEmail = bodyEmail;
    }

    if (!targetEmail) return res.status(401).json({ error: 'Não autenticado.' });

    const senhaAtual = String(req.body?.senhaAtual || '');
    const novaSenha = String(req.body?.novaSenha || '');

    if (novaSenha.length < 6) return res.status(400).json({ error: 'Nova senha muito curta.' });

    const { rows } = await pool.query(
      `SELECT id, senha_hash FROM usuarios WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [targetEmail]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const u = rows[0];

    // Se já existe senha, exige confirmação da atual
    if (u.senha_hash) {
      const ok = await bcrypt.compare(senhaAtual, u.senha_hash);
      if (!ok) return res.status(400).json({ error: 'Senha atual inválida.' });
    }
    // Caso ainda não exista senha (migração), permitimos definir sem exigir a atual

    const hash = await bcrypt.hash(novaSenha, 10);
    await pool.query(`UPDATE usuarios SET senha_hash=$2 WHERE id=$1`, [u.id, hash]);

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[AUTH CHANGE-PASSWORD ERROR]', e);
    res.status(500).json({ error: 'Erro interno ao alterar senha.' });
  }
});

