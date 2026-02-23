
import { Router } from 'express';
import { logger } from '../../logger';

const router = Router();

router.post('/send', async (req, res) => {
    try {
        const { payload, config } = req.body;

        if (!payload || !config) {
            return res.status(400).json({ error: "Missing payload or config" });
        }

        const { formId, fieldIds, submitUrl: customUrl } = config;

        // Helper to format for JSON API
        const answersList = [];
        if (payload.to && fieldIds.to) answersList.push({ questionId: fieldIds.to, answer1: payload.to });
        if (payload.subject && fieldIds.subject) answersList.push({ questionId: fieldIds.subject, answer1: payload.subject });
        if (payload.body && fieldIds.body) answersList.push({ questionId: fieldIds.body, answer1: payload.body });

        // MS Forms expects 'answers' to be a STRINGIFIED JSON, not the array itself.
        const requestBody = {
            startDate: new Date().toISOString(),
            submitDate: new Date().toISOString(),
            answers: JSON.stringify(answersList)
        };

        // Use custom URL if provided, otherwise fallback to anonymous (which might fail with 405)
        const submitUrl = customUrl || `https://forms.office.com/formapi/api/${formId}/users/anonymous/responses`;

        console.log('[EmailProxy] Submitting to:', submitUrl);

        const response = await fetch(submitUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(requestBody)
        });

        const resText = await response.text();

        if (!response.ok) {
            logger.error({ err: response.status, resText }, '[EmailProxy] MS Forms Failed:');
            return res.status(response.status).json({ error: "Upstream Error", details: resText });
        }

        return res.json({ success: true, status: response.status, data: resText });

    } catch (error) {
        logger.error({ err: error }, '[EmailProxy] POST Error:');
        return res.status(500).json({ error: String(error) });
    }
});

export const emailRouter: Router = router;
