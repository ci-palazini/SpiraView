import { pool } from '../../db';
import { sendEmailViaMSForms } from '../msFormsSender';
import { logger } from '../../logger';
import { env } from '../../config/env';

export const TicketCreatedNotification = {
    /**
     * Envia notificação 'NOVO_CHAMADO'
     */
    async handle(chamado: any) {
        try {
            logger.info(`[TicketCreated] Buscando inscritos para 'NOVO_CHAMADO'...`);
            // 1. Buscar inscritos
            const { rows: recipients } = await pool.query(
                `SELECT u.email, u.nome, u.email_real 
                 FROM notificacoes_config nc
                 JOIN usuarios u ON u.id = nc.usuario_id
                 WHERE nc.evento = 'NOVO_CHAMADO'`
            );

            logger.info(`[TicketCreated] Encontrados ${recipients.length} destinatários.`);

            if (recipients.length === 0) {
                logger.info('[TicketCreated] Abortando: Ninguém inscrito.');
                return;
            }

            // 2. Montar Config do Forms via ENV
            logger.info(`[TicketCreated] Config ENV: FormID=${env.msForms.formId ? 'OK' : 'MISSING'}, SubmitURL=${env.msForms.submitUrl ? 'OK' : 'MISSING'}`);

            if (!env.msForms.isConfigured) {
                logger.error('[TicketCreated] Configuração de MS Forms incompleta no .env');
                return;
            }

            const maquinaNome = chamado.maquina || chamado.maquina_nome || 'N/A';
            const criadoPor = chamado.criado_por || 'Sistema';

            // Assunto Único
            const subject = `Novo Chamado: ${maquinaNome} - ${chamado.tipo}`;

            // 3. Enviar para cada um
            const promessas = recipients.map(async (user) => {
                const emailDestino = user.email_real || user.email;
                if (!emailDestino || !emailDestino.includes('@')) {
                    logger.info(`[TicketCreated] Usuário ${user.nome} sem email válido.`);
                    return;
                }

                // Template HTML
                const body = `
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f6f8" style="padding:30px 0;">
  <tr>
    <td align="center">

      <!-- Card Principal -->
      <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td bgcolor="#0056b3" style="padding:24px; color:white; font-family:Arial, sans-serif;">
            <h1 style="margin:0; font-size:22px;">SpiraView</h1>
            <p style="margin:4px 0 0; font-size:14px; opacity:0.9;">
              Novo Chamado Registrado
            </p>
          </td>
        </tr>

        <!-- Conteúdo -->
        <tr>
          <td style="padding:24px; font-family:Arial, sans-serif; color:#333;">

            <p style="font-size:15px;">
              Olá <strong>${user.nome}</strong>,
            </p>

            <p>
              Um novo chamado foi registrado no sistema.
              Confira os detalhes abaixo:
            </p>

            <!-- Box de Informações -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0; background:#fafafa; border:1px solid #eee; border-radius:6px;">

              <tr>
                <td style="padding:12px 16px; font-weight:bold; width:30%;">Máquina</td>
                <td style="padding:12px 16px;">${maquinaNome}</td>
              </tr>

              <tr bgcolor="#f2f4f7">
                <td style="padding:12px 16px; font-weight:bold;">Tipo</td>
                <td style="padding:12px 16px;">${chamado.tipo}</td>
              </tr>

              <tr>
                <td style="padding:12px 16px; font-weight:bold;">Solicitante</td>
                <td style="padding:12px 16px;">${criadoPor}</td>
              </tr>

              <tr bgcolor="#f2f4f7">
                <td style="padding:12px 16px; font-weight:bold;">Descrição</td>
                <td style="padding:12px 16px;">${chamado.descricao || 'Sem descrição'}</td>
              </tr>

            </table>

            <!-- Botão -->
            <div style="text-align:center; margin:30px 0;">
              <a href="https://ci-spiraview.vercel.app/"
                 style="
                   display:inline-block;
                   background:#0056b3;
                   color:white;
                   padding:14px 28px;
                   text-decoration:none;
                   border-radius:6px;
                   font-weight:bold;
                   font-size:15px;
                 ">
                🔍 Acessar Chamado
              </a>
            </div>

            <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">

            <p style="font-size:12px; color:#777; text-align:center; line-height:1.5;">
              Este é um email automático do SpiraView.<br>
              Por favor, não responda esta mensagem.
            </p>

          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
`.trim();

                try {
                    logger.info(`[TicketCreated] Enviando para ${emailDestino}...`);
                    await sendEmailViaMSForms(
                        { to: emailDestino, subject, body },
                        {
                            formId: env.msForms.formId!,
                            fieldIds: {
                                to: env.msForms.fieldIds.to!,
                                subject: env.msForms.fieldIds.subject!,
                                body: env.msForms.fieldIds.body!,
                            },
                            submitUrl: env.msForms.submitUrl
                        }
                    );
                    logger.info(`[TicketCreated] SUCESSO: Enviado para ${emailDestino}`);
                } catch (err) {
                    logger.error({ err, emailDestino }, '[TicketCreated] ERRO ao enviar email');
                }
            });

            await Promise.all(promessas);

        } catch (error) {
            logger.error({ err: error }, '[TicketCreated] Erro CRÍTICO ao processar TicketCreatedNotification');
        }
    }
};
