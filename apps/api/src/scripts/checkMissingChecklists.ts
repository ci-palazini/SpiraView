import { pool } from '../db';
import { sendEmailViaMSForms } from '../services/msFormsSender';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { env } from '../config/env';

interface MissingItem {
    maquina_id: string;
    maquina_nome: string;
    turno: string;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Verifica se houve checklists perdidos no dia anterior (ou data especifica)
 * e envia notificacoes por email.
 * 
 * @param targetDateStr Opcional. Data no formato 'yyyy-MM-dd'. Se nao informado, usa "ontem".
 */
export async function checkMissingChecklists(targetDateStr?: string) {
    console.log('[CheckMissingChecklists] Iniciando verificacao...');

    let dataRef: string;
    let dataFormatada: string;

    if (targetDateStr) {
        // Usa a data fornecida
        const parts = targetDateStr.split('-');
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        dataRef = targetDateStr;
        dataFormatada = format(dateObj, 'dd/MM/yyyy', { locale: ptBR });
    } else {
        // Usa "ontem"
        const ontem = subDays(new Date(), 1);
        dataRef = format(ontem, 'yyyy-MM-dd');
        dataFormatada = format(ontem, 'dd/MM/yyyy', { locale: ptBR });
    }

    console.log(`[CheckMissingChecklists] Data referencia: ${dataRef}`);

    // 2. Buscar maquinas que EXIGEM checklist (tem checklist_diario configurado e não vazio)
    // E que estao no escopo de manutencao
    const { rows: maquinas } = await pool.query(
        `SELECT id, nome 
         FROM maquinas 
         WHERE escopo_manutencao = true 
           AND jsonb_array_length(COALESCE(checklist_diario, '[]'::jsonb)) > 0`
    );

    console.log(`[CheckMissingChecklists] Total maquinas com checklist: ${maquinas.length}`);

    // 3. Para cada maquina, verificar se houve submissao no Turno 1 e Turno 2
    const missing: MissingItem[] = [];

    for (const maq of maquinas) {
        // Verificar Turno 1
        const { rows: t1 } = await pool.query(
            `SELECT 1 FROM checklist_submissoes 
             WHERE maquina_id = $1 
               AND data_ref = $2 
               AND turno = '1º' 
             LIMIT 1`,
            [maq.id, dataRef]
        );

        if (t1.length === 0) {
            missing.push({ maquina_id: maq.id, maquina_nome: maq.nome, turno: '1º' });
        }

        // Verificar Turno 2
        const { rows: t2 } = await pool.query(
            `SELECT 1 FROM checklist_submissoes 
             WHERE maquina_id = $1 
               AND data_ref = $2 
               AND turno = '2º' 
             LIMIT 1`,
            [maq.id, dataRef]
        );

        if (t2.length === 0) {
            missing.push({ maquina_id: maq.id, maquina_nome: maq.nome, turno: '2º' });
        }
    }

    console.log(`[CheckMissingChecklists] Total pendencias encontradas: ${missing.length}`);

    if (missing.length === 0) {
        console.log('[CheckMissingChecklists] Tudo OK. Nenhuma pendencia.');
        return;
    }

    // 4. Inserir pendencias na tabela checklist_pendencias (ON CONFLICT DO NOTHING)
    for (const item of missing) {
        await pool.query(
            `INSERT INTO checklist_pendencias (maquina_id, data_ref, turno, status)
             VALUES ($1, $2, $3, 'PENDENTE')
             ON CONFLICT (maquina_id, data_ref, turno) DO NOTHING`,
            [item.maquina_id, dataRef, item.turno]
        );
    }

    // 5. Agrupar por turno para enviar notificacoes
    const missingT1 = missing.filter(m => m.turno === '1º');
    const missingT2 = missing.filter(m => m.turno === '2º');

    // 6. Enviar Notificacoes
    const notifyTurno = async (turnoLabel: string, items: MissingItem[], eventKey: string) => {
        if (items.length === 0) return;

        // Buscar destinatarios
        const { rows: users } = await pool.query(
            `SELECT u.email, u.nome, u.email_real 
             FROM notificacoes_config nc
             JOIN usuarios u ON u.id = nc.usuario_id
             WHERE nc.evento = $1`,
            [eventKey]
        );

        if (users.length === 0) {
            console.log(`[CheckMissingChecklists] Sem inscritos para ${eventKey}`);
            return;
        }

        const emailsValidos = users
            .map((u) => u.email_real || u.email)
            .filter((e): e is string => !!e && e.includes('@'));

        if (emailsValidos.length === 0) {
            console.log(`[CheckMissingChecklists] Sem emails válidos para ${eventKey}`);
            return;
        }

        const toField = emailsValidos.join(';');
        const subject = `[ALERTA] Checklists Pendentes - ${turnoLabel} - ${dataFormatada}`;

        const body = `
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f6f8" style="padding:30px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td bgcolor="#d32f2f" style="padding:24px; color:white; font-family:Arial, sans-serif;">
            <h1 style="margin:0; font-size:22px;">SpiraView</h1>
            <p style="margin:4px 0 0; font-size:14px; opacity:0.9;">
              Pendência de Checklists
            </p>
          </td>
        </tr>

        <!-- Conteúdo -->
        <tr>
          <td style="padding:24px; font-family:Arial, sans-serif; color:#333;">
            <p style="font-size:15px;">
              Olá, pessoal,
            </p>
            <p>
              Identificamos que as seguintes máquinas não tiveram o checklist enviado no <strong>${turnoLabel}</strong> do dia <strong>${dataFormatada}</strong>:
            </p>

            <!-- Lista de Pendências -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0; background:#fafafa; border:1px solid #eee; border-radius:6px;">
              <tr>
                <td style="padding:12px 16px; font-weight:bold; border-bottom:1px solid #eee;">Máquinas Afetadas</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;">
                  <ul style="margin:0; padding-left:20px; line-height:1.6;">
                    ${items.map(i => `<li>${i.maquina_nome}</li>`).join('')}
                  </ul>
                </td>
              </tr>
            </table>

            <p style="font-size:14px; color:#555;">
              Para regularizar a situação, por favor acesse o sistema e justifique o não envio.
            </p>

            <!-- Botão -->
            <div style="text-align:center; margin:30px 0;">
              <a href="https://ci-spiraview.vercel.app/checklists-pendencias"
                 style="
                   display:inline-block;
                   background:#d32f2f;
                   color:white;
                   padding:14px 28px;
                   text-decoration:none;
                   border-radius:6px;
                   font-weight:bold;
                   font-size:15px;
                 ">
                📋 Justificar Agora
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
`;

        try {
            if (!env.msForms.isConfigured) {
                console.warn('[CheckMissingChecklists] MS_FORMS_* incompleto, pulando envio de email.');
                return;
            }

            await sendEmailViaMSForms(
                { to: toField, subject, body },
                {
                    formId: env.msForms.formId!,
                    fieldIds: {
                        to: env.msForms.fieldIds.to!,
                        subject: env.msForms.fieldIds.subject!,
                        body: env.msForms.fieldIds.body!
                    },
                    submitUrl: env.msForms.submitUrl
                }
            );
            console.log(`[CheckMissingChecklists] Email enviado para ${emailsValidos.length} destinatário(s) (${eventKey})`);
        } catch (err) {
            console.error(`[CheckMissingChecklists] Erro ao enviar para ${toField}:`, err);
        }
    };

    // Enviar Turno 1
    await notifyTurno('1º Turno', missingT1, 'checklist_pendente_turno1');

    // Enviar Turno 2
    await notifyTurno('2º Turno', missingT2, 'checklist_pendente_turno2');

    console.log('[CheckMissingChecklists] Finalizado.');
}

// Se executado diretamente via linha de comando
if (require.main === module) {
    checkMissingChecklists().catch(e => {
        console.error(e);
        process.exit(1);
    });
}
