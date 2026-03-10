import { pool } from '../db';
import { sendEmailViaMSForms } from '../services/msFormsSender';
import { env } from '../config/env';
import { logger } from '../logger';

type ReminderEvent = 'PREVENTIVA_D1' | 'PREVENTIVA_D0';

interface PreventiveScheduleRow {
  id: string;
  maquina_nome: string;
  maquina_setor: string | null;
  descricao: string | null;
  inicio_local: string;
  fim_local: string;
}

interface RecipientRow {
  usuario_id: string;
  nome: string;
  email: string | null;
}

const TZ = 'America/Sao_Paulo';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getLocalDateRef(): Promise<string> {
  const { rows } = await pool.query<{ data_ref_local: string }>(
    `SELECT (NOW() AT TIME ZONE $1)::date::text AS data_ref_local`,
    [TZ],
  );
  return rows[0].data_ref_local;
}

async function getRecipients(evento: ReminderEvent): Promise<RecipientRow[]> {
  const { rows } = await pool.query<RecipientRow>(
    `SELECT
       nc.usuario_id,
       u.nome,
       u.email
     FROM notificacoes_config nc
     JOIN usuarios u ON u.id = nc.usuario_id
     WHERE nc.evento = $1`,
    [evento],
  );
  return rows;
}

async function getSchedulesByOffset(daysFromToday: number): Promise<PreventiveScheduleRow[]> {
  const { rows } = await pool.query<PreventiveScheduleRow>(
    `SELECT
       a.id,
       m.nome AS maquina_nome,
       m.setor AS maquina_setor,
       a.descricao,
       to_char(a.start_ts AT TIME ZONE $1, 'DD/MM/YYYY HH24:MI') AS inicio_local,
       to_char(a.end_ts   AT TIME ZONE $1, 'DD/MM/YYYY HH24:MI') AS fim_local
     FROM agendamentos_preventivos a
     JOIN maquinas m ON m.id = a.maquina_id
     WHERE a.status = 'agendado'
       AND DATE(a.start_ts AT TIME ZONE $1) =
           ((NOW() AT TIME ZONE $1)::date + ($2 * INTERVAL '1 day'))::date
     ORDER BY a.start_ts ASC`,
    [TZ, daysFromToday],
  );
  return rows;
}

async function reserveNotification(
  evento: ReminderEvent,
  agendamentoId: string,
  usuarioId: string,
  dataRefLocal: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO notificacoes_enviadas (evento, agendamento_id, usuario_id, data_ref_local)
     VALUES ($1, $2, $3, $4::date)
     ON CONFLICT (evento, agendamento_id, usuario_id, data_ref_local) DO NOTHING
     RETURNING id`,
    [evento, agendamentoId, usuarioId, dataRefLocal],
  );
  return rows[0]?.id ?? null;
}

async function releaseNotificationLock(lockId: string): Promise<void> {
  await pool.query(`DELETE FROM notificacoes_enviadas WHERE id = $1`, [lockId]);
}

function buildEmailContent(evento: ReminderEvent, row: PreventiveScheduleRow) {
  const isD1 = evento === 'PREVENTIVA_D1';

  const headerColor  = isD1 ? '#d97706' : '#c2410c';
  const bgColor      = isD1 ? '#fffbeb' : '#fff7ed';
  const badgeBg      = isD1 ? '#fef3c7' : '#ffedd5';
  const badgeColor   = isD1 ? '#92400e' : '#9a3412';
  const btnColor     = headerColor;
  const icon         = isD1 ? '📅' : '⚙️';
  const badge        = isD1 ? 'D-1 · Amanhã' : 'D0 · Hoje';
  const whenLabel    = isD1 ? 'amanhã' : 'hoje';
  const title        = isD1 ? 'Manutenção Preventiva Agendada' : 'Manutenção Preventiva — Hoje';
  const subjectPrefix = isD1 ? '[PREVENTIVA D-1]' : '[PREVENTIVA D0]';
  const subject = `${subjectPrefix} ${row.maquina_nome} — início ${row.inicio_local}`;

  const body = `
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="${bgColor}" style="padding:30px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td bgcolor="${headerColor}" style="padding:24px; color:white; font-family:Arial, sans-serif;">
            <h1 style="margin:0; font-size:22px;">SpiraView</h1>
            <p style="margin:4px 0 0; font-size:14px; opacity:0.9;">${icon} ${title}</p>
          </td>
        </tr>

        <!-- Conteúdo -->
        <tr>
          <td style="padding:24px; font-family:Arial, sans-serif; color:#333;">

            <!-- Badge de prazo -->
            <div style="text-align:center; margin-bottom:20px;">
              <span style="display:inline-block; background:${badgeBg}; color:${badgeColor}; padding:6px 18px; border-radius:999px; font-weight:bold; font-size:13px; border:1px solid ${badgeColor}33;">
                ${badge}
              </span>
            </div>

            <p style="font-size:15px;">Olá, pessoal,</p>
            <p>Existe uma manutenção preventiva prevista para <strong>${whenLabel}</strong>. Confira os detalhes:</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0; background:#fafafa; border:1px solid #eee; border-radius:6px;">
              <tr>
                <td style="padding:12px 16px; font-weight:bold; width:35%; color:#555;">Máquina</td>
                <td style="padding:12px 16px; font-weight:bold; font-size:16px;">${row.maquina_nome}</td>
              </tr>
              <tr bgcolor="#f2f4f7">
                <td style="padding:12px 16px; font-weight:bold; color:#555;">Setor</td>
                <td style="padding:12px 16px;">${row.maquina_setor || '-'}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px; font-weight:bold; color:#555;">Descrição</td>
                <td style="padding:12px 16px;">${row.descricao || '-'}</td>
              </tr>
              <tr bgcolor="#f2f4f7">
                <td style="padding:12px 16px; font-weight:bold; color:#555;">Início</td>
                <td style="padding:12px 16px;">${row.inicio_local}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px; font-weight:bold; color:#555;">Fim</td>
                <td style="padding:12px 16px;">${row.fim_local}</td>
              </tr>
            </table>

            <div style="text-align:center; margin:30px 0;">
              <a href="${env.appUrl}/calendario-geral"
                 style="display:inline-block; background:${btnColor}; color:white; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:15px;">
                ${icon} Ver no Calendário
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

  return { subject, body };
}

async function notifyEvent(evento: ReminderEvent, daysFromToday: number, dataRefLocal: string): Promise<void> {
  const schedules = await getSchedulesByOffset(daysFromToday);
  logger.info({ evento, totalAgendamentos: schedules.length }, '[PreventiveReminder] Agendamentos encontrados');
  if (!schedules.length) return;

  const recipients = await getRecipients(evento);
  logger.info({ evento, totalDestinatarios: recipients.length }, '[PreventiveReminder] Destinatarios encontrados');
  if (!recipients.length) return;

  for (const item of schedules) {
    // Reservar locks e coletar emails dos destinatários ainda não notificados
    const lockedIds: string[] = [];
    const emailsValidos: string[] = [];

    for (const recipient of recipients) {
      const emailDestino = recipient.email;
      if (!emailDestino || !emailDestino.includes('@')) continue;

      const lockId = await reserveNotification(evento, item.id, recipient.usuario_id, dataRefLocal);
      if (!lockId) continue; // Já notificado

      lockedIds.push(lockId);
      emailsValidos.push(emailDestino);
    }

    if (!emailsValidos.length) continue;

    const toField = emailsValidos.join(';');
    const { subject, body } = buildEmailContent(evento, item);
    try {
      await sendEmailViaMSForms(
        { to: toField, subject, body },
        {
          formId: env.msForms.formId!,
          fieldIds: {
            to: env.msForms.fieldIds.to!,
            subject: env.msForms.fieldIds.subject!,
            body: env.msForms.fieldIds.body!,
          },
          submitUrl: env.msForms.submitUrl,
        },
      );
      logger.info(
        { evento, agendamentoId: item.id, totalDestinatarios: emailsValidos.length },
        '[PreventiveReminder] Email enviado',
      );
      await sleep(300);
    } catch (err) {
      // Liberar locks para permitir nova tentativa
      for (const lockId of lockedIds) {
        await releaseNotificationLock(lockId);
      }
      logger.error(
        { err, evento, agendamentoId: item.id, toField },
        '[PreventiveReminder] Falha ao enviar email',
      );
    }
  }
}

export async function checkPreventiveMaintenanceReminders(): Promise<void> {
  logger.info('[PreventiveReminder] Iniciando processamento de lembretes de preventiva...');

  if (!env.msForms.isConfigured) {
    logger.warn('[PreventiveReminder] MS_FORMS_* incompleto; lembretes de preventiva desabilitados.');
    return;
  }

  const dataRefLocal = await getLocalDateRef();
  await notifyEvent('PREVENTIVA_D1', 1, dataRefLocal);
  await notifyEvent('PREVENTIVA_D0', 0, dataRefLocal);

  logger.info('[PreventiveReminder] Processamento concluido.');
}

if (require.main === module) {
  checkPreventiveMaintenanceReminders().catch((error) => {
    logger.error({ err: error }, '[PreventiveReminder] Erro fatal');
    process.exit(1);
  });
}
