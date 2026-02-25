
interface TeamsMessagePayload {
    message: string;
}

interface TeamsFormsConfig {
    formId: string;
    fieldIdMessage: string;
    submitUrl?: string;
}

/**
 * Envia uma mensagem para o Teams utilizando o Microsoft Forms como proxy.
 * Requer configuração prévia do Form ID e do ID do campo de mensagem.
 */
export async function sendTeamsMessageViaMSForms(
    payload: TeamsMessagePayload,
    config: TeamsFormsConfig
): Promise<void> {
    const { formId, fieldIdMessage, submitUrl: customUrl } = config;

    const answersList = [
        { questionId: fieldIdMessage, answer1: payload.message },
    ];

    const requestBody = {
        startDate: new Date().toISOString(),
        submitDate: new Date().toISOString(),
        answers: JSON.stringify(answersList)
    };

    const submitUrl = customUrl || `https://forms.office.com/formapi/api/${formId}/users/anonymous/responses`;

    const response = await fetch(submitUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SpiraView-Backend/1.0'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        let txt = '';
        try {
            txt = await response.text();
        } catch { }
        throw new Error(`MS Teams Forms Error ${response.status}: ${txt}`);
    }
}

interface EmailPayload {
    to: string;
    subject: string;
    body: string;
}

interface FormsConfig {
    formId: string;
    fieldIds: {
        to: string;
        subject: string;
        body: string;
    };
    submitUrl?: string;
}

/**
 * Envia um email utilizando o Microsoft Forms como proxy.
 * Requer configuração prévia do Form ID e dos IDs dos campos.
 */
export async function sendEmailViaMSForms(
    payload: EmailPayload,
    config: FormsConfig
): Promise<void> {
    const { formId, fieldIds, submitUrl: customUrl } = config;

    // Helper to format for JSON API
    const answersList = [];
    if (payload.to && fieldIds.to) answersList.push({ questionId: fieldIds.to, answer1: payload.to });
    if (payload.subject && fieldIds.subject) answersList.push({ questionId: fieldIds.subject, answer1: payload.subject });
    if (payload.body && fieldIds.body) answersList.push({ questionId: fieldIds.body, answer1: payload.body });

    // MS Forms expects 'answers' to be a STRINGIFIED JSON
    const requestBody = {
        startDate: new Date().toISOString(),
        submitDate: new Date().toISOString(),
        answers: JSON.stringify(answersList)
    };

    // Use custom URL only if explicitly provided, else fallback to standard anonymous endpoint
    const submitUrl = customUrl || `https://forms.office.com/formapi/api/${formId}/users/anonymous/responses`;

    const response = await fetch(submitUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SpiraView-Backend/1.0'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        let txt = '';
        try {
            txt = await response.text();
        } catch { }
        throw new Error(`MS Forms Error ${response.status}: ${txt}`);
    }
}
