
/**
 * Service to send emails via Microsoft Forms submission using the Backend Proxy.
 * 
 * @note The Form MUST be set to "Anyone can respond" (Public).
 */

import { http } from "./apiClient";

export interface EmailPayload {
    to: string;
    subject: string;
    body: string;
}

export interface FormConfig {
    formId: string;
    fieldIds: {
        to: string;      // ID field for "Destinatário"
        subject: string; // ID field for "Assunto"
        body: string;    // ID field for "Mensagem"
    };
    submitUrl?: string;
}

/**
 * Sends an email by calling basic API proxy which submits to MS Forms.
 * @param payload Email details (to, subject, body)
 * @param config Form ID and Field IDs mappings
 */
export async function sendEmailViaForms(payload: EmailPayload, config: FormConfig): Promise<void> {
    // Calls POST /core/email/send (assuming coreRouter is mounted at /core or root?)
    // Wait, in index.ts: app.use(coreRouter); and coreRouter.use('/email', emailRouter);
    // So path is /email/send

    await http.post('/email/send', {
        data: {
            payload,
            config
        }
    });

    console.log("Email request sent to backend proxy.");
}
