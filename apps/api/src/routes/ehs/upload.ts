// apps/api/src/routes/safety/upload.ts
import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

export const ehsUploadRouter: Router = Router();

// ===== Helpers =====

/** Remove acentos + lowercase */
function norm(s: string): string {
    return (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function parseBool(val: string | null | undefined): boolean {
    if (!val) return false;
    const v = norm(val);
    return v === 'sim' || v === 'yes' || v === 'verdadeiro' || v === 'true' || v === '1';
}

function parseDate(val: string | null | undefined): string | null {
    if (!val || !val.trim()) return null;
    const s = val.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return s.split('T')[0] || null;
}

/** Map de aliases para detectar colunas */
const COL_ALIASES: Record<string, string[]> = {
    registro_id: ['id de registro', 'id registro', 'registro'],
    ksbs_obs: ['ksbs/observacoes', 'ksbs/observações', 'observacoes', 'observações'],
    ksbs_resp: ['ksbs/responder', 'responder'],
    data_observacao: [
        'detalhes iniciais/data de observacao',
        'detalhes iniciais/data de observação',
        'data de observacao',
        'data observacao',
        'data de observação',
    ],
    observador: ['detalhes iniciais/observador', 'observador'],
    num_pessoas: [
        'detalhes iniciais/numero de pessoas observadas',
        'detalhes iniciais/número de pessoas observadas',
        'numero de pessoas',
        'número de pessoas',
    ],
    descricao: ['detalhes iniciais/descricao', 'detalhes iniciais/descrição', 'descricao', 'descrição'],
    departamento: [
        'detalhes iniciais/departamento de reporteres',
        'detalhes iniciais/departamento de repórteres',
        'departamento de reporteres',
        'departamento',
    ],
    localizacao: [
        'detalhes iniciais/localizacao',
        'detalhes iniciais/localização',
        'localizacao',
        'localização',
    ],
    tipo_observador: [
        'detalhes iniciais/quem e o observador?',
        'detalhes iniciais/quem é o observador?',
        'quem e o observador',
    ],
    causa_comportamento: [
        'detalhes iniciais/causa do comportamento observado',
        'causa do comportamento observado',
        'causa do comportamento',
    ],
    tipo_comportamento: [
        'detalhes iniciais/tipo de comportamento observado',
        'tipo de comportamento observado',
        'tipo de comportamento',
    ],
    feedback: [
        'detalhes iniciais/foi dado feedback?',
        'foi dado feedback?',
        'foi dado feedback',
        'feedback',
    ],
    stop_work: [
        'detalhes iniciais/a autoridade de parada de trabalho foi iniciada como resultado deste bbs?',
        'autoridade de parada de trabalho',
        'stop work',
        'parada de trabalho',
    ],
    resultado: [
        'fechar registro/resultado da conversa e acoes imediatas',
        'fechar registro/resultado da conversa e ações imediatas',
        'resultado da conversa',
    ],
    data_fechamento: [
        'fechar registro/data / hora de fechamento do registro',
        'data de fechamento',
        'data fechamento',
    ],
    registro_fechado: ['fechar registro/registro fechado', 'registro fechado'],
    fatores: ['fechar registro/fatores contribuintes', 'fatores contribuintes'],
    qual_causa: ['fechar registro/qual foi a causa', 'qual foi a causa'],
    modelo: ['detalhes iniciais/modelo', 'modelo'],
};

function detectCol(keys: string[]): Record<string, string | null> {
    const normedKeys = keys.map((k) => ({ orig: k, norm: norm(k) }));
    const result: Record<string, string | null> = {};

    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
        let found: string | null = null;
        for (const alias of aliases) {
            const match = normedKeys.find((k) => k.norm === alias || k.norm.includes(alias));
            if (match) {
                found = match.orig;
                break;
            }
        }
        result[field] = found;
    }
    return result;
}

// ===== Endpoints =====

/**
 * POST /ehs/upload
 * Recebe linhas parseadas do CSV e insere/atualiza observações BBS.
 */
ehsUploadRouter.post('/ehs/upload', requirePermission('safety', 'editar'), async (req, res) => {
    const client = await pool.connect();
    try {
        const { nomeArquivo, inputRows } = req.body as {
            nomeArquivo?: string;
            inputRows?: Record<string, unknown>[];
        };

        if (!inputRows || !Array.isArray(inputRows) || inputRows.length === 0) {
            return res.status(400).json({ error: 'Nenhuma linha fornecida.' });
        }

        // Detectar colunas
        const sampleKeys = Object.keys(inputRows[0]);
        const cols = detectCol(sampleKeys);

        if (!cols.registro_id) {
            return res.status(400).json({ error: 'Coluna "ID de registro" não encontrada no CSV.' });
        }
        if (!cols.data_observacao) {
            return res
                .status(400)
                .json({ error: 'Coluna "Data de Observação" não encontrada no CSV.' });
        }

        // Agrupar por registro_id para deduplicar e coletar KSBs
        const grouped = new Map<
            number,
            {
                row: Record<string, unknown>;
                ksbs: Array<{ categoria: string; resposta: string | null }>;
            }
        >();

        for (const row of inputRows) {
            const rid = Number(cols.registro_id ? row[cols.registro_id] : null);
            if (!rid || isNaN(rid)) continue;

            if (!grouped.has(rid)) {
                grouped.set(rid, { row: row as Record<string, unknown>, ksbs: [] });
            }

            // Coletar KSBs (a plataforma duplica linhas para cada KSB)
            const ksbCat = cols.ksbs_obs ? String(row[cols.ksbs_obs] || '').trim() : '';
            const ksbResp = cols.ksbs_resp ? String(row[cols.ksbs_resp] || '').trim() : '';
            const normalizedResp = ksbResp || null;
            if (ksbCat) {
                const entry = grouped.get(rid)!;
                const already = entry.ksbs.some(
                    (k) => k.categoria === ksbCat && k.resposta === normalizedResp
                );
                if (!already) {
                    entry.ksbs.push({ categoria: ksbCat, resposta: normalizedResp });
                }
            }
        }

        if (grouped.size === 0) {
            return res.status(400).json({ error: 'Nenhum registro válido encontrado.' });
        }

        await client.query('BEGIN');

        let novos = 0;
        let atualizados = 0;
        const userId = (req as any).userId || null;

        for (const [registroId, { row, ksbs }] of grouped) {
            const getVal = (field: string): string | null => {
                const col = cols[field];
                if (!col) return null;
                const v = row[col];
                return v != null ? String(v).trim() : null;
            };

            const dataObs = parseDate(getVal('data_observacao'));
            if (!dataObs) continue;

            // UPSERT observação
            const upsertResult = await client.query(
                `INSERT INTO safety_observacoes (
                    registro_id, data_observacao, observador, num_pessoas,
                    descricao, departamento, localizacao, tipo_observador,
                    causa_comportamento, tipo_comportamento,
                    feedback_dado, stop_work_authority,
                    resultado_conversa, data_fechamento, registro_fechado,
                    fatores_contribuintes, qual_causa, modelo
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                ON CONFLICT (registro_id) DO UPDATE SET
                    data_observacao = EXCLUDED.data_observacao,
                    observador = EXCLUDED.observador,
                    num_pessoas = EXCLUDED.num_pessoas,
                    descricao = EXCLUDED.descricao,
                    departamento = EXCLUDED.departamento,
                    localizacao = EXCLUDED.localizacao,
                    tipo_observador = EXCLUDED.tipo_observador,
                    causa_comportamento = EXCLUDED.causa_comportamento,
                    tipo_comportamento = EXCLUDED.tipo_comportamento,
                    feedback_dado = EXCLUDED.feedback_dado,
                    stop_work_authority = EXCLUDED.stop_work_authority,
                    resultado_conversa = EXCLUDED.resultado_conversa,
                    data_fechamento = EXCLUDED.data_fechamento,
                    registro_fechado = EXCLUDED.registro_fechado,
                    fatores_contribuintes = EXCLUDED.fatores_contribuintes,
                    qual_causa = EXCLUDED.qual_causa,
                    modelo = EXCLUDED.modelo,
                    atualizado_em = NOW()
                RETURNING (xmax = 0) AS is_new, id`,
                [
                    registroId,
                    dataObs,
                    getVal('observador'),
                    Number(getVal('num_pessoas')) || 1,
                    getVal('descricao'),
                    getVal('departamento'),
                    getVal('localizacao'),
                    getVal('tipo_observador'),
                    getVal('causa_comportamento'),
                    getVal('tipo_comportamento'),
                    parseBool(getVal('feedback')),
                    parseBool(getVal('stop_work')),
                    getVal('resultado'),
                    parseDate(getVal('data_fechamento')),
                    parseBool(getVal('registro_fechado')),
                    getVal('fatores'),
                    getVal('qual_causa'),
                    getVal('modelo'),
                ]
            );

            const obsId = upsertResult.rows[0].id;
            const isNew = upsertResult.rows[0].is_new;

            if (isNew) novos++;
            else atualizados++;

            // Substituir KSBs existentes (batch insert otimizado)
            await client.query('DELETE FROM safety_observacoes_ksbs WHERE observacao_id = $1', [
                obsId,
            ]);

            if (ksbs.length > 0) {
                const ksbValues = ksbs.map((_, i) =>
                    `($1, $${i * 2 + 2}, $${i * 2 + 3})`
                ).join(', ');
                const ksbParams = [obsId, ...ksbs.flatMap(k => [k.categoria, k.resposta])];
                await client.query(
                    `INSERT INTO safety_observacoes_ksbs (observacao_id, categoria, resposta)
                     VALUES ${ksbValues}`,
                    ksbParams
                );
            }
        }

        // Registrar upload no histórico
        await client.query(
            `INSERT INTO safety_uploads (nome_arquivo, total_linhas, registros_novos, registros_atualizados, enviado_por_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [nomeArquivo || 'upload.csv', inputRows.length, novos, atualizados, userId]
        );

        await client.query('COMMIT');

        res.json({
            ok: true,
            resumo: {
                totalLinhasCsv: inputRows.length,
                registrosUnicos: grouped.size,
                novos,
                atualizados,
            },
        });
    } catch (e: unknown) {
        await client.query('ROLLBACK').catch(() => { });
        logger.error({ err: e }, '[ehs/upload] Erro ao processar upload');
        res.status(500).json({ error: 'Erro interno ao processar upload de segurança.' });
    } finally {
        client.release();
    }
});

/**
 * GET /ehs/uploads
 * Lista histórico de uploads de segurança.
 */
ehsUploadRouter.get('/ehs/uploads', requirePermission('safety', 'ver'), async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT su.id, su.nome_arquivo, su.total_linhas, su.registros_novos,
                    su.registros_atualizados, su.criado_em,
                    u.nome as enviado_por
             FROM safety_uploads su
             LEFT JOIN usuarios u ON u.id = su.enviado_por_id
             ORDER BY su.criado_em DESC
             LIMIT 20`
        );
        res.json(result.rows);
    } catch (e: unknown) {
        logger.error({ err: e }, '[ehs/uploads] Erro ao listar uploads');
        res.status(500).json({ error: 'Erro interno.' });
    }
});
