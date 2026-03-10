//apps/api/src/routes/core/auth.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../../db';
import { env } from '../../config/env';
import { sendEmailViaMSForms } from '../../services/msFormsSender';
import rateLimit from 'express-rate-limit';
import { logger } from '../../logger';
import { logAudit } from '../../utils/audit';
import { validateBody } from '../../middlewares/validateBody';
import { requireAuth } from '../../middlewares/requireAuth';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Informe usuário ou e-mail.').max(254),
  senha: z.string().min(6, 'Senha muito curta.').max(128),
});

const changePasswordSchema = z.object({
  email: z.string().email().max(254).optional(),
  senhaAtual: z.string().max(128).optional().default(''),
  novaSenha: z.string().min(6, 'Nova senha muito curta.').max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido.').max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token inválido.'),
  novaSenha: z.string().min(6, 'Nova senha muito curta.').max(128),
});

const tvLoginSchema = z.object({
  pin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN deve conter apenas dígitos.'),
});



export const authRouter: Router = Router();

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 5 login requests per windowMs
  message: { error: 'Muitas tentativas de login. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const meLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' },
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
authRouter.post('/auth/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const raw = req.body.identifier.trim().toLowerCase();
    const senha = req.body.senha;

    // aceita "usuario" ou "email"
    const usuario = raw.includes('@') ? raw.split('@')[0] : raw;

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email,
              COALESCE(r.nome, 'Operador') AS role,
              COALESCE(u.funcao, 'Colaborador') AS funcao,
              COALESCE(u.usuario, split_part(LOWER(COALESCE(u.email,'')), '@', 1)) AS usuario,
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
        // Inclui permissões no token para evitar DB query em cada request autenticado
        permissoes: u.permissoes || {},
      },
      env.auth.jwtSecret,
      { expiresIn: '7d' } // Token válido por 7 dias
    );

    // Audit: registra login bem-sucedido (fire-and-forget, sem bloquear resposta)
    pool.connect().then(async (client) => {
      try {
        await logAudit(client, {
          tabela: 'usuarios', registroId: u.id, acao: 'LOGIN',
          dadosNovos: { email: u.email },
          usuarioId: u.id, usuarioNome: u.nome, ip: req.ip,
        });
      } finally {
        client.release();
      }
    }).catch((err) => logger.warn({ err }, 'Falha ao registrar audit de login'));

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
    logger.error({ err: e }, '[AUTH LOGIN ERROR]');
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
authRouter.get('/auth/me', meLimiter, requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email,
              COALESCE(r.nome, 'Operador') AS role,
              COALESCE(u.funcao, 'Colaborador') AS funcao,
              COALESCE(u.usuario, split_part(LOWER(COALESCE(u.email,'')), '@', 1)) AS usuario,
              r.id AS role_id,
              r.nome AS role_nome,
              r.permissoes
         FROM usuarios u
         LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
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
    logger.error({ err: e }, '[AUTH ME ERROR]');
    res.status(500).json({ error: 'Erro interno ao buscar usuário.' });
  }
});

authRouter.post('/auth/change-password', requireAuth, validateBody(changePasswordSchema), async (req, res) => {
  try {
    const bodyEmail = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    let targetId: string | undefined = userId;

    if (bodyEmail && bodyEmail !== userEmail) {
      // Tentativa de mudar senha de outrem — só Admin pode
      const { rows: adminCheck } = await pool.query(
        `SELECT r.nome FROM usuarios u 
             JOIN roles r ON u.role_id = r.id 
             WHERE u.id = $1`,
        [userId]
      );

      const isRealAdmin = adminCheck.length > 0 && adminCheck[0].nome.toLowerCase() === 'admin';

      if (!isRealAdmin) {
        return res.status(403).json({ error: 'Apenas administradores podem alterar senhas de outros usuários.' });
      }

      // Buscar o ID do alvo pelo email informado
      const { rows: targetRows } = await pool.query(
        `SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [bodyEmail]
      );
      if (!targetRows.length) return res.status(404).json({ error: 'Usuário alvo não encontrado.' });
      targetId = targetRows[0].id;
    }

    if (!targetId) return res.status(401).json({ error: 'Não autenticado.' });

    const senhaAtual = String(req.body.senhaAtual || '');
    const novaSenha = String(req.body.novaSenha);

    const { rows } = await pool.query(
      `SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1`,
      [targetId]
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
    logger.error({ err: e }, '[AUTH CHANGE-PASSWORD ERROR]');
    res.status(500).json({ error: 'Erro interno ao alterar senha.' });
  }
});

const tvLoginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /auth/tv-login
 * Autenticação do Modo TV via PIN global de 4 dígitos.
 * Retorna JWT com role 'tv' e permissões read-only embutidas.
 */
authRouter.post('/auth/tv-login', tvLoginLimiter, validateBody(tvLoginSchema), async (req, res) => {
  try {
    const { pin } = req.body as { pin: string };

    const { rows } = await pool.query<{ value: string | null }>(
      `SELECT value FROM system_settings WHERE key = 'tv_pin_hash' LIMIT 1`
    );

    if (!rows.length || !rows[0].value) {
      return res.status(503).json({ error: 'PIN do Modo TV não configurado. Contate o administrador.' });
    }

    const ok = await bcrypt.compare(pin, rows[0].value);
    if (!ok) {
      return res.status(401).json({ error: 'PIN inválido.' });
    }

    const token = jwt.sign(
      {
        id: 'tv-global',
        email: 'tv@system.local',
        role: 'tv',
        nome: 'Modo TV',
        usuario: 'tv',
        permissoes: {},
      },
      env.auth.jwtSecret,
      { expiresIn: '24h' }
    );

    return res.json({ token, role: 'tv', nome: 'Modo TV' });
  } catch (e: any) {
    logger.error({ err: e }, '[AUTH TV-LOGIN ERROR]');
    res.status(500).json({ error: 'Erro interno ao autenticar modo TV.' });
  }
});


const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente mais tarde.' },
});

authRouter.post('/auth/forgot-password', forgotPasswordLimiter, validateBody(forgotPasswordSchema), async (req, res) => {
  try {
    const emailInput = req.body.email.trim().toLowerCase();

    const { rows } = await pool.query(
      `SELECT id, nome, email, senha_hash FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [emailInput]
    );

    if (!rows.length) {
      return res.json({ ok: true, message: 'Se o e-mail existir, um link de recuperação será enviado.' });
    }

    const u = rows[0];
    const targetEmail = u.email;

    const secret = env.auth.jwtSecret + (u.senha_hash || '');
    const token = jwt.sign(
      { id: u.id, type: 'password_reset' },
      secret,
      { expiresIn: '15m' }
    );

    const resetLink = `${env.appUrl}/reset-password?token=${token}&email=${encodeURIComponent(u.email)}`;

    const bodyHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-bottom: 1px solid #e2e8f0;">
          <h2 style="color: #0f172a; margin: 0;">SpiraView</h2>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <h3 style="color: #1e293b; margin-top: 0;">Recuperação de Senha</h3>
          <p style="color: #475569; font-size: 16px; line-height: 1.5;">Olá <strong>${u.nome}</strong>,</p>
          <p style="color: #475569; font-size: 16px; line-height: 1.5;">Recebemos uma solicitação para redefinir a senha da sua conta no SpiraView. Se foi você, clique no botão abaixo para criar uma nova senha:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Redefinir Minha Senha</a>
          </div>
          <p style="color: #ef4444; font-size: 14px; text-align: center;">Este link é válido por <strong>15 minutos</strong>.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          <p style="color: #94a3b8; font-size: 14px; margin-bottom: 0;">Se você não solicitou essa redefinição, pode ignorar este e-mail com segurança. Sua senha permanecerá inalterada.</p>
        </div>
        <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
          &copy; ${new Date().getFullYear()} SpiraView. Todos os direitos reservados.
        </div>
      </div>
    `;

    if (env.msForms.isConfigured && targetEmail) {
      await sendEmailViaMSForms(
        {
          to: targetEmail,
          subject: 'Recuperação de Senha - SpiraView',
          body: bodyHtml
        },
        env.msForms as any
      );
    } else {
      logger.warn({
        msg: 'Forgot password request ignored because MS Forms is not configured',
        link: resetLink
      });
    }

    res.json({ ok: true, message: 'Se o e-mail existir, um link de recuperação será enviado.' });
  } catch (e: any) {
    logger.error({ err: e }, '[AUTH FORGOT-PASSWORD ERROR]');
    res.status(500).json({ error: 'Erro interno ao processar recuperação de senha.' });
  }
});

authRouter.post('/auth/reset-password', validateBody(resetPasswordSchema), async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    const decodedUnverified = jwt.decode(token) as any;
    if (!decodedUnverified || !decodedUnverified.id || decodedUnverified.type !== 'password_reset') {
      return res.status(400).json({ error: 'Token inválido ou malformado.' });
    }

    const { rows } = await pool.query(
      `SELECT id, senha_hash FROM usuarios WHERE id = $1 LIMIT 1`,
      [decodedUnverified.id]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'Token inválido (usuário não encontrado).' });
    }

    const u = rows[0];
    const secret = env.auth.jwtSecret + (u.senha_hash || '');

    try {
      jwt.verify(token, secret);
    } catch (err: any) {
      return res.status(400).json({ error: 'Link de recuperação expirado ou inválido (já utilizado?).' });
    }

    const hash = await bcrypt.hash(novaSenha, 10);
    await pool.query(`UPDATE usuarios SET senha_hash=$2 WHERE id=$1`, [u.id, hash]);

    res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
  } catch (e: any) {
    logger.error({ err: e }, '[AUTH RESET-PASSWORD ERROR]');
    res.status(500).json({ error: 'Erro interno ao redefinir a senha.' });
  }
});
