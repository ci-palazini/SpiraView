// apps/api/src/routes/safety/upload.ts
import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';
import { jaroWinkler } from '../../utils/fuzzy';
import type { SafetyPendente, SafetyCandidato } from '@spiraview/shared';

export const ehsUploadRouter: Router = Router();

// Fuzzy matching thresholds
const AUTO_MATCH_THRESHOLD = 0.85;
const CANDIDATE_THRESHOLD = 0.60;
const MAX_CANDIDATES = 3;

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
                .json({ error: 'Coluna "Data de Observação" não encontrada no CSV.' });
        }

        let mes_referencia: string | null = null;
        for (const row of inputRows) {
            const colObs = cols.data_observacao;
            if (colObs && row[colObs]) {
                const dataObs = parseDate(String(row[colObs]));
                if (dataObs) {
                    mes_referencia = dataObs.substring(0, 7);
                    break;
                }
            }
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

        // Preparar arrays para UPSERT em lote (UNNEST) — evita N round trips ao BD
        const batchRegistroIds: number[] = [];
        const batchDataObs: (string | null)[] = [];
        const batchObservador: (string | null)[] = [];
        const batchNumPessoas: number[] = [];
        const batchDescricao: (string | null)[] = [];
        const batchDepartamento: (string | null)[] = [];
        const batchLocalizacao: (string | null)[] = [];
        const batchTipoObservador: (string | null)[] = [];
        const batchCausaComportamento: (string | null)[] = [];
        const batchTipoComportamento: (string | null)[] = [];
        const batchFeedback: boolean[] = [];
        const batchStopWork: boolean[] = [];
        const batchResultado: (string | null)[] = [];
        const batchDataFechamento: (string | null)[] = [];
        const batchRegistroFechado: boolean[] = [];
        const batchFatores: (string | null)[] = [];
        const batchQualCausa: (string | null)[] = [];
        const batchModelo: (string | null)[] = [];

        for (const [registroId, { row }] of grouped) {
            const getVal = (field: string): string | null => {
                const col = cols[field];
                if (!col) return null;
                const v = row[col];
                return v != null ? String(v).trim() : null;
            };
            const dataObs = parseDate(getVal('data_observacao'));
            if (!dataObs) continue;

            batchRegistroIds.push(registroId);
            batchDataObs.push(dataObs);
            batchObservador.push(getVal('observador'));
            batchNumPessoas.push(Number(getVal('num_pessoas')) || 1);
            batchDescricao.push(getVal('descricao'));
            batchDepartamento.push(getVal('departamento'));
            batchLocalizacao.push(getVal('localizacao'));
            batchTipoObservador.push(getVal('tipo_observador'));
            batchCausaComportamento.push(getVal('causa_comportamento'));
            batchTipoComportamento.push(getVal('tipo_comportamento'));
            batchFeedback.push(parseBool(getVal('feedback')));
            batchStopWork.push(parseBool(getVal('stop_work')));
            batchResultado.push(getVal('resultado'));
            batchDataFechamento.push(parseDate(getVal('data_fechamento')));
            batchRegistroFechado.push(parseBool(getVal('registro_fechado')));
            batchFatores.push(getVal('fatores'));
            batchQualCausa.push(getVal('qual_causa'));
            batchModelo.push(getVal('modelo'));
        }

        if (batchRegistroIds.length === 0) {
            return res.status(400).json({ error: 'Nenhum registro válido encontrado.' });
        }

        const userId = (req as any).userId || null;

        await client.query('BEGIN');

        // Query 1: UPSERT em lote via UNNEST — 1 round trip para N registros
        const upsertResult = await client.query(
            `INSERT INTO safety_observacoes (
                registro_id, data_observacao, observador, num_pessoas,
                descricao, departamento, localizacao, tipo_observador,
                causa_comportamento, tipo_comportamento,
                feedback_dado, stop_work_authority,
                resultado_conversa, data_fechamento, registro_fechado,
                fatores_contribuintes, qual_causa, modelo
            )
            SELECT * FROM UNNEST(
                $1::int[], $2::date[], $3::text[], $4::int[],
                $5::text[], $6::text[], $7::text[], $8::text[],
                $9::text[], $10::text[],
                $11::bool[], $12::bool[],
                $13::text[], $14::date[], $15::bool[],
                $16::text[], $17::text[], $18::text[]
            ) AS t(
                registro_id, data_observacao, observador, num_pessoas,
                descricao, departamento, localizacao, tipo_observador,
                causa_comportamento, tipo_comportamento,
                feedback_dado, stop_work_authority,
                resultado_conversa, data_fechamento, registro_fechado,
                fatores_contribuintes, qual_causa, modelo
            )
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
            RETURNING id, registro_id, (xmax = 0) AS is_new`,
            [
                batchRegistroIds, batchDataObs, batchObservador, batchNumPessoas,
                batchDescricao, batchDepartamento, batchLocalizacao, batchTipoObservador,
                batchCausaComportamento, batchTipoComportamento,
                batchFeedback, batchStopWork,
                batchResultado, batchDataFechamento, batchRegistroFechado,
                batchFatores, batchQualCausa, batchModelo,
            ]
        );

        // Mapear registro_id → obs UUID e contar novos/atualizados
        let novos = 0;
        let atualizados = 0;
        const obsIdByRegistroId = new Map<number, string>();
        for (const row of upsertResult.rows) {
            obsIdByRegistroId.set(row.registro_id, row.id);
            if (row.is_new) novos++;
            else atualizados++;
        }

        // Query 2: DELETE em lote de todos os KSBs afetados — 1 round trip
        const allObsIds = Array.from(obsIdByRegistroId.values());
        await client.query(
            'DELETE FROM safety_observacoes_ksbs WHERE observacao_id = ANY($1::uuid[])',
            [allObsIds]
        );

        // Query 3: INSERT em lote de todos os KSBs — 1 round trip
        const ksbObsIds: string[] = [];
        const ksbCategorias: string[] = [];
        const ksbRespostas: (string | null)[] = [];

        for (const [registroId, { ksbs }] of grouped) {
            const obsId = obsIdByRegistroId.get(registroId);
            if (!obsId || ksbs.length === 0) continue;
            for (const ksb of ksbs) {
                ksbObsIds.push(obsId);
                ksbCategorias.push(ksb.categoria);
                ksbRespostas.push(ksb.resposta);
            }
        }

        if (ksbObsIds.length > 0) {
            await client.query(
                `INSERT INTO safety_observacoes_ksbs (observacao_id, categoria, resposta)
                 SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[])`,
                [ksbObsIds, ksbCategorias, ksbRespostas]
            );
        }

        // Registrar upload no histórico
        await client.query(
            `INSERT INTO safety_uploads (nome_arquivo, total_linhas, registros_novos, registros_atualizados, enviado_por_id, mes_referencia)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [nomeArquivo || 'upload.csv', inputRows.length, novos, atualizados, userId, mes_referencia]
        );

        await client.query('COMMIT');

        // === Post-transaction: fuzzy matching (non-critical, errors are logged but don't fail the upload) ===
        let pendentes: SafetyPendente[] = [];
        try {
            // 1. Collect unique observer texts from this upload batch
            const observadorTextos = new Set<string>();
            for (const [, { row }] of grouped) {
                const obsCol = cols.observador;
                if (obsCol) {
                    const val = row[obsCol];
                    if (val != null && String(val).trim()) {
                        observadorTextos.add(String(val).trim());
                    }
                }
            }

            if (observadorTextos.size > 0) {
                const textos = Array.from(observadorTextos);

                // 2. Check cache: existing mappings
                const { rows: existingMap } = await pool.query(
                    `SELECT observador_texto, usuario_id FROM safety_observador_mapeamentos
                     WHERE observador_texto = ANY($1)`,
                    [textos]
                );
                const mapped = new Set(existingMap.map((r: { observador_texto: string }) => r.observador_texto));

                // Auto-apply cached mappings
                for (const m of existingMap) {
                    await pool.query(
                        `UPDATE safety_observacoes SET usuario_id = $1
                         WHERE observador = $2 AND usuario_id IS NULL`,
                        [m.usuario_id, m.observador_texto]
                    );
                }

                // 3. For unmapped texts, load active users and count observations in one query each
                const unmapped = textos.filter((t) => !mapped.has(t));
                if (unmapped.length > 0) {
                    const [{ rows: usuarios }, { rows: countRows }] = await Promise.all([
                        pool.query(`SELECT id, nome FROM usuarios WHERE ativo = true`),
                        // Batch COUNT: one query for all unmapped texts instead of N individual queries
                        pool.query(
                            `SELECT observador, COUNT(*)::int AS cnt
                             FROM safety_observacoes
                             WHERE observador = ANY($1) AND usuario_id IS NULL
                             GROUP BY observador`,
                            [unmapped]
                        ),
                    ]);

                    const countByText = new Map<string, number>(
                        countRows.map((r: { observador: string; cnt: number }) => [r.observador, r.cnt])
                    );

                    // Collect auto-matches for batch DB operations
                    const autoMatchTextos: string[] = [];
                    const autoMatchUsuarioIds: string[] = [];

                    for (const texto of unmapped) {
                        const qtdRegistros = countByText.get(texto) ?? 0;

                        const scored: SafetyCandidato[] = usuarios
                            .map((u: { id: string; nome: string }) => ({
                                usuarioId: u.id,
                                nome: u.nome,
                                score: jaroWinkler(texto, u.nome),
                            }))
                            .sort((a: SafetyCandidato, b: SafetyCandidato) => b.score - a.score);

                        const best = scored[0];

                        if (best && best.score >= AUTO_MATCH_THRESHOLD) {
                            autoMatchTextos.push(texto);
                            autoMatchUsuarioIds.push(best.usuarioId);
                            logger.info(
                                { observador: texto, usuario: best.nome, score: best.score },
                                '[ehs/upload] Auto-matched observer'
                            );
                        } else {
                            const candidatos = scored
                                .filter((c: SafetyCandidato) => c.score >= CANDIDATE_THRESHOLD)
                                .slice(0, MAX_CANDIDATES);
                            pendentes.push({ observadorTexto: texto, qtdRegistros, candidatos });
                        }
                    }

                    // Batch auto-match: save all mappings + update all observations in 2 queries
                    if (autoMatchTextos.length > 0) {
                        await Promise.all([
                            pool.query(
                                `INSERT INTO safety_observador_mapeamentos (observador_texto, usuario_id, criado_por_id)
                                 SELECT UNNEST($1::text[]), UNNEST($2::uuid[]), $3
                                 ON CONFLICT (observador_texto) DO UPDATE SET usuario_id = EXCLUDED.usuario_id`,
                                [autoMatchTextos, autoMatchUsuarioIds, userId]
                            ),
                            pool.query(
                                `UPDATE safety_observacoes SET usuario_id = data.uid
                                 FROM (SELECT UNNEST($1::text[]) AS obs, UNNEST($2::uuid[]) AS uid) AS data
                                 WHERE safety_observacoes.observador = data.obs
                                   AND safety_observacoes.usuario_id IS NULL`,
                                [autoMatchTextos, autoMatchUsuarioIds]
                            ),
                        ]);
                    }
                }
            }
        } catch (fuzzyErr) {
            logger.error({ err: fuzzyErr }, '[ehs/upload] Fuzzy matching failed (non-critical)');
        }

        res.json({
            ok: true,
            resumo: {
                totalLinhasCsv: inputRows.length,
                registrosUnicos: grouped.size,
                novos,
                atualizados,
            },
            pendentes,
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
ehsUploadRouter.get('/ehs/uploads', requirePermission('safety', 'ver'), async (req, res) => {
    try {
        const { mes } = req.query;
        let query = `
             SELECT su.id, su.nome_arquivo, su.total_linhas, su.registros_novos,
                    su.registros_atualizados, su.criado_em, su.mes_referencia,
                    u.nome as enviado_por
             FROM safety_uploads su
             LEFT JOIN usuarios u ON u.id = su.enviado_por_id
        `;
        const params: any[] = [];
        if (typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes)) {
            query += ` WHERE su.mes_referencia = $1`;
            params.push(mes);
        }
        
        query += ` ORDER BY su.criado_em DESC LIMIT 20`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (e: unknown) {
        logger.error({ err: e }, '[ehs/uploads] Erro ao listar uploads');
        res.status(500).json({ error: 'Erro interno.' });
    }
});
