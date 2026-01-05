// apps/api/src/routes/producao/upload.ts
import { Router } from 'express';
import { pool, withTx } from '../../db';
import { sseBroadcast } from '../../utils/sse';

export const uploadRouter: Router = Router();

/**
 * Limpa uploads inativos com mais de 48h e seus lançamentos associados
 * Executa silenciosamente após cada novo upload
 */
async function cleanupOldInactiveUploads(): Promise<number> {
    try {
        // Primeiro, deletar lançamentos de uploads inativos antigos
        await pool.query(
            `DELETE FROM producao_lancamentos 
             WHERE upload_id IN (
                 SELECT id FROM producao_uploads 
                 WHERE ativo = FALSE 
                 AND criado_em < NOW() - INTERVAL '48 hours'
             )`
        );

        // Depois, deletar os uploads inativos antigos
        const result = await pool.query(
            `DELETE FROM producao_uploads 
             WHERE ativo = FALSE 
             AND criado_em < NOW() - INTERVAL '48 hours'
             RETURNING id`
        );

        const count = result.rowCount || 0;
        if (count > 0) {
            console.log(`[Cleanup] Removidos ${count} uploads inativos antigos.`);
        }
        return count;
    } catch (e) {
        console.error('[Cleanup] Erro ao limpar uploads antigos:', e);
        return 0;
    }
}

/**
 * Normaliza texto para comparação (remove acentos, lowercase, espaços extras)
 */
function normKey(s: string): string {
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Gera múltiplas variantes de chave para aumentar chances de match.
 * Ex: "CE-TCN 20" -> ["ce tcn 20", "tcn 20", "tcn20", "cetcn20", ...]
 */
function keyVariants(s: string): string[] {
    const base = normKey(s);
    const variants = new Set<string>();
    variants.add(base);

    // Remove prefixo "ce" se existir
    const semCE = base.replace(/^ce\s*/, '');
    variants.add(semCE);

    // Versão sem espaços
    const semEsp = base.replace(/\s+/g, '');
    variants.add(semEsp);
    const semCEEsp = semCE.replace(/\s+/g, '');
    variants.add(semCEEsp);

    // Versão com hífen convertido para espaço e vice-versa
    variants.add(base.replace(/-/g, ' '));
    variants.add(base.replace(/\s+/g, '-'));
    variants.add(semCE.replace(/-/g, ''));

    return [...variants].filter(v => v.length > 0);
}

/**
 * Detecta coluna pelo nome (busca entre aliases)
 */
function detectCol(columns: string[], targets: string[]): string | null {
    const rawCols = columns.map((c) => c.trim());
    const normCols = rawCols.map(normKey);
    const normTargets = targets.map(normKey);

    for (const t of normTargets) {
        const idx = normCols.findIndex((c) => c === t);
        if (idx >= 0) return rawCols[idx];
    }
    for (const t of normTargets) {
        const rx = new RegExp(`(?:^|\\s)${t}(?:\\s|$)`);
        const idx = normCols.findIndex((c) => rx.test(c));
        if (idx >= 0) return rawCols[idx];
    }
    return null;
}

/**
 * Parseia número em formato pt-BR (1.234,56 -> 1234.56)
 */
function parsePtBrNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;

    const s = String(value).trim();
    if (!s) return null;

    // Remove separador de milhar e troca vírgula por ponto
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);

    return Number.isFinite(num) ? num : null;
}

/**
 * Converte data Excel (serial number) ou string para YYYY-MM-DD
 */
function parseDate(input: unknown): string | null {
    if (input == null) return null;

    // Serial do Excel
    if (typeof input === 'number') {
        const baseDate = new Date(1899, 11, 30); // Excel base date
        const date = new Date(baseDate.getTime() + input * 86400000);
        return date.toISOString().slice(0, 10);
    }

    const s = String(input).trim();

    // DD/MM/YYYY ou DD-MM-YYYY
    let m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s|$)/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;

    // YYYY-MM-DD
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // Tenta parse genérico
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
        const d = new Date(t);
        return d.toISOString().slice(0, 10);
    }

    return null;
}

// Tipo de linha parseada
interface ParsedRow {
    dataRef: string;
    maquinaId: string;
    maquinaNome: string;
    turno: string | null;
    horasRealizadas: number;
    observacao: string | null;
    excelRow: number;
    matriculaOperador: string | null; // Adicionado
}

// Tipo de erro de processamento
interface RowError {
    linha: number;
    erro: string;
}

/**
 * POST /producao/lancamentos/upload
 * 
 * Recebe o Excel já parseado como JSON (array de objetos)
 * Frontend deve usar xlsx para converter o arquivo antes de enviar
 */
uploadRouter.post('/producao/lancamentos/upload', async (req, res) => {
    try {
        const auth = (req as any).user || {};

        // Verificação de permissão granular (producao_upload: editar)
        const userRole = (auth.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';

        if (!isAdmin) {
            // Buscar permissões do role do usuário
            const { rows: permRows } = await pool.query<{ permissoes: Record<string, string> }>(
                `SELECT r.permissoes 
                 FROM usuarios u
                 JOIN roles r ON u.role_id = r.id OR LOWER(u.role) = LOWER(r.nome)
                 WHERE u.id = $1
                 LIMIT 1`,
                [auth.id]
            );

            const permissions = permRows[0]?.permissoes || {};
            const uploadPerm = permissions['producao_upload'];

            if (uploadPerm !== 'editar') {
                return res.status(403).json({ error: 'Sem permissão para upload de produção.' });
            }
        }

        const { rows: inputRows, nomeArquivo } = req.body || {};

        if (!Array.isArray(inputRows) || !inputRows.length) {
            return res.status(400).json({ error: 'Envie um array de linhas (rows) do Excel.' });
        }

        // 1. Detectar colunas
        const headers = Object.keys(inputRows[0] || {});

        const colData = detectCol(headers, [
            'data', 'data wip', 'wip', 'data do wip', 'data_ref', 'dataref',
            'dia', 'date', 'dt', 'data ref', 'data referencia', 'data referência', 'mes', 'mês'
        ]);
        const colMaquina = detectCol(headers, [
            'categoria', 'centro', 'grupo', 'maquina', 'máquina', 'equipamento',
            'maq', 'equip', 'nome', 'tag', 'ativo', 'codigo', 'código',
            'nome maquina', 'nome máquina', 'cod maquina', 'cod máquina',
            'equipment', 'asset', 'machine', 'recurso'
        ]);
        const colHoras = detectCol(headers, [
            'aliquota', 'alíquota', 'aliquota h', 'alíquota h',
            'aliquota horas', 'alíquota horas', 'total horas', 'horas totais',
            'qtd horas', 'quantidade de horas', 'total h',
            'horas', 'horas_realizadas', 'horasrealizadas', 'hora',
            'producao', 'produção', 'total', 'qtd', 'quantidade',
            'hrs', 'h', 'horas producao', 'horas produção', 'hours', 'valor'
        ]);
        const colTurno = detectCol(headers, ['turno', 'shift', 'periodo', 'período']);
        const colObs = detectCol(headers, ['obs', 'observacao', 'observação', 'observacoes', 'nota', 'notas', 'comentario', 'comentário']);

        // Nova coluna: Matrícula / Colaborador
        const colMatricula = detectCol(headers, ['matricula', 'matrícula', 'funcionario', 'funcionário', 'colaborador', 'operador', 'op']);

        if (!colData || !colMaquina || !colHoras) {
            const missing = [
                !colData ? 'Data' : null,
                !colMaquina ? 'Máquina' : null,
                !colHoras ? 'Horas' : null,
            ].filter(Boolean).join(', ');
            return res.status(400).json({
                error: `Colunas obrigatórias não encontradas: ${missing}`,
                colunasEncontradas: headers,
                dica: 'Renomeie as colunas no Excel para: Data, Máquina, Horas'
            });
        }

        // 2. Buscar máquinas com escopo_producao (incluindo aliases)
        const { rows: maquinas } = await pool.query(
            `SELECT id, nome, tag, aliases_producao FROM maquinas WHERE escopo_producao = TRUE`
        );

        // Mapeamento por alias/nome/tag normalizado
        // Prioridade: aliases definidos pelo usuário > nome > tag
        const maqByKey = new Map<string, { id: string; nome: string }>();
        for (const m of maquinas) {
            const maqInfo = { id: m.id, nome: m.nome };

            // 1. Registra aliases definidos pelo usuário (maior prioridade)
            const aliases: string[] = m.aliases_producao || [];
            for (const alias of aliases) {
                if (alias && alias.trim()) {
                    // Registra alias normalizado
                    const normAlias = normKey(alias);
                    maqByKey.set(normAlias, maqInfo);
                    // Também registra variantes do alias
                    for (const v of keyVariants(alias)) {
                        if (!maqByKey.has(v)) {
                            maqByKey.set(v, maqInfo);
                        }
                    }
                }
            }

            // 2. Registra variantes do nome (não sobrescreve alias)
            for (const v of keyVariants(m.nome)) {
                if (!maqByKey.has(v)) {
                    maqByKey.set(v, maqInfo);
                }
            }

            // 3. Registra variantes da tag (menor prioridade)
            if (m.tag) {
                for (const v of keyVariants(m.tag)) {
                    if (!maqByKey.has(v)) {
                        maqByKey.set(v, maqInfo);
                    }
                }
            }
        }

        // 3. Processar linhas
        const parsed: ParsedRow[] = [];
        const errors: RowError[] = [];

        for (let i = 0; i < inputRows.length; i++) {
            const raw = inputRows[i];
            const excelRow = i + 2; // +1 para header, +1 para 1-indexed

            // Data
            const dataRef = parseDate(raw[colData]);
            if (!dataRef) {
                errors.push({ linha: excelRow, erro: `Data inválida: ${raw[colData]}` });
                continue;
            }

            // Máquina - tenta múltiplas variantes
            const maqRaw = String(raw[colMaquina] || '').trim();
            if (!maqRaw) {
                errors.push({ linha: excelRow, erro: 'Máquina vazia' });
                continue;
            }

            // Tenta encontrar a máquina usando várias variantes da chave
            let maq: { id: string; nome: string } | undefined;
            for (const varKey of keyVariants(maqRaw)) {
                maq = maqByKey.get(varKey);
                if (maq) break;
            }

            if (!maq) {
                errors.push({ linha: excelRow, erro: `Máquina não encontrada ou sem escopo produção: "${maqRaw}"` });
                continue;
            }

            // Horas (permite negativos para estornos)
            const horas = parsePtBrNumber(raw[colHoras]);
            if (horas === null) {
                errors.push({ linha: excelRow, erro: `Horas inválidas: ${raw[colHoras]}` });
                continue;
            }

            // Turno (opcional)
            let turno: string | null = null;
            if (colTurno) {
                const turnoRaw = String(raw[colTurno] || '').trim();
                if (turnoRaw) {
                    if (['1', '1º', '1o', '1°', 'primeiro'].includes(turnoRaw.toLowerCase())) {
                        turno = '1º';
                    } else if (['2', '2º', '2o', '2°', 'segundo'].includes(turnoRaw.toLowerCase())) {
                        turno = '2º';
                    }
                }
            }

            // Observação (opcional)
            const observacao = colObs ? String(raw[colObs] || '').trim() || null : null;

            // Matrícula (Opcional - mas importante para o novo recurso)
            let matriculaOperador: string | null = null;
            if (colMatricula) {
                const rawMat = String(raw[colMatricula] || '').trim();
                // Extrai apenas dígitos e limita a 8 caracteres (ou ajuste conforme necessidade)
                const onlyDigits = (rawMat.match(/\d+/)?.[0] ?? '');
                // Assume que matrícula deve ter pelo menos X digitos para ser válida, aqui aceitando > 0
                if (onlyDigits.length > 0) {
                    matriculaOperador = onlyDigits.slice(0, 20); // Limite seguro
                }
            }

            parsed.push({
                dataRef,
                maquinaId: maq.id,
                maquinaNome: maq.nome,
                turno,
                horasRealizadas: horas,
                observacao,
                excelRow,
                matriculaOperador // Adicionado
            });
        }

        if (!parsed.length) {
            return res.status(400).json({
                error: 'Nenhuma linha válida para processar.',
                erros: errors,
            });
        }

        // 4. Agrupar por data para criar upload
        const byDate = new Map<string, ParsedRow[]>();
        for (const p of parsed) {
            const arr = byDate.get(p.dataRef) || [];
            arr.push(p);
            byDate.set(p.dataRef, arr);
        }

        // 5. Persistir usando transação
        const resultados: Array<{
            dataRef: string;
            uploadId: string;
            linhasProcessadas: number;
            horasTotal: number;
        }> = [];

        await withTx(async (client) => {
            for (const [dataRef, rowsForDate] of byDate.entries()) {
                const horasTotal = rowsForDate.reduce((s, r) => s + r.horasRealizadas, 0);

                // PRIMEIRO: Desativar uploads anteriores do mesmo dia (antes de inserir o novo)
                await client.query(
                    `UPDATE producao_uploads SET ativo = FALSE WHERE data_ref = $1`,
                    [dataRef]
                );

                // Criar registro de upload (agora pode ser ativo pois não há outro ativo)
                const uploadRes = await client.query(
                    `INSERT INTO producao_uploads 
           (nome_arquivo, data_ref, linhas_total, linhas_sucesso, linhas_erro, horas_total, ativo, upload_por_id, upload_por_nome)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
           RETURNING id`,
                    [
                        nomeArquivo || 'upload.xlsx',
                        dataRef,
                        rowsForDate.length,
                        rowsForDate.length,
                        0,
                        horasTotal,
                        auth.id || null,
                        auth.nome || null,
                    ]
                );
                const uploadId = uploadRes.rows[0].id;

                // Remover lançamentos anteriores deste dia (do upload anterior)
                // Nota: com a nova lógica, estamos substituindo todo o dia
                await client.query(
                    `DELETE FROM producao_lancamentos 
           WHERE data_ref = $1 AND upload_id IN (
             SELECT id FROM producao_uploads WHERE data_ref = $1 AND ativo = FALSE
           )`,
                    [dataRef]
                );

                // Inserir lançamentos em BATCH (muito mais rápido para grandes volumes)

                // 1. Buscar horas atuais para detectar mudanças (lógica de justiça)
                // Se as horas não mudaram, preservamos o timestamp antigo
                const horasAtuaisRes = await client.query(
                    `SELECT maquina_id, turno, COALESCE(matricula_operador, '') as matricula_operador, 
                            horas_realizadas, horas_referencia_em
                     FROM producao_lancamentos 
                     WHERE data_ref = $1`,
                    [dataRef]
                );

                // Mapa: "maquinaId|turno|matricula" -> { horas, refEm }
                const horasAntigas = new Map<string, { horas: number; refEm: string | null }>();
                for (const row of horasAtuaisRes.rows) {
                    const key = `${row.maquina_id}|${row.turno || ''}|${row.matricula_operador}`;
                    horasAntigas.set(key, {
                        horas: Number(row.horas_realizadas) || 0,
                        refEm: row.horas_referencia_em,
                    });
                }

                // 2. Prepara arrays para UNNEST
                const maquinaIds: string[] = [];
                const dataRefs: string[] = [];
                const turnos: (string | null)[] = [];
                const horasRealizadas: number[] = [];
                const observacoes: (string | null)[] = [];
                const uploadIds: string[] = [];
                const lancadoPorIds: (string | null)[] = [];
                const lancadoPorNomes: (string | null)[] = [];
                const lancadoPorEmails: (string | null)[] = [];
                const matriculasOperador: (string | null)[] = [];
                const horasReferenciaEm: (string | null)[] = []; // NOVO: timestamp de referência

                const agora = new Date().toISOString();

                for (const row of rowsForDate) {
                    maquinaIds.push(row.maquinaId);
                    dataRefs.push(row.dataRef);
                    turnos.push(row.turno);
                    horasRealizadas.push(row.horasRealizadas);
                    observacoes.push(row.observacao);
                    uploadIds.push(uploadId);
                    lancadoPorIds.push(auth.id || null);
                    lancadoPorNomes.push(auth.nome || null);
                    lancadoPorEmails.push(auth.email || null);
                    matriculasOperador.push(row.matriculaOperador || null);

                    // 3. Lógica de justiça: preservar timestamp se horas não mudaram
                    const key = `${row.maquinaId}|${row.turno || ''}|${row.matriculaOperador || ''}`;
                    const antiga = horasAntigas.get(key);

                    if (antiga && antiga.horas === row.horasRealizadas && antiga.refEm) {
                        // Horas não mudaram - preservar timestamp antigo
                        horasReferenciaEm.push(antiga.refEm);
                    } else {
                        // Horas mudaram ou é novo registro - usar timestamp atual
                        horasReferenciaEm.push(agora);
                    }
                }

                // 4. Batch INSERT com horas_referencia_em
                await client.query(
                    `INSERT INTO producao_lancamentos 
                     (maquina_id, data_ref, turno, horas_realizadas, observacao, upload_id, lancado_por_id, lancado_por_nome, lancado_por_email, matricula_operador, horas_referencia_em)
                     SELECT * FROM UNNEST(
                         $1::uuid[], $2::date[], $3::text[], $4::numeric[], $5::text[], 
                         $6::uuid[], $7::uuid[], $8::text[], $9::text[], $10::text[], $11::timestamptz[]
                     )
                     ON CONFLICT (maquina_id, data_ref, turno, COALESCE(matricula_operador, ''))
                     DO UPDATE SET 
                       horas_realizadas = EXCLUDED.horas_realizadas,
                       observacao = EXCLUDED.observacao,
                       upload_id = EXCLUDED.upload_id,
                       horas_referencia_em = EXCLUDED.horas_referencia_em,
                       atualizado_em = NOW()`,
                    [
                        maquinaIds,
                        dataRefs,
                        turnos,
                        horasRealizadas,
                        observacoes,
                        uploadIds,
                        lancadoPorIds,
                        lancadoPorNomes,
                        lancadoPorEmails,
                        matriculasOperador,
                        horasReferenciaEm
                    ]
                );

                resultados.push({
                    dataRef,
                    uploadId,
                    linhasProcessadas: rowsForDate.length,
                    horasTotal,
                });
            }
        });

        // SSE broadcast
        sseBroadcast({ topic: 'producao_lancamentos', action: 'bulk_upload' });

        // Limpar uploads inativos antigos (executa em background, não bloqueia resposta)
        cleanupOldInactiveUploads().catch(() => { /* silent */ });

        res.json({
            ok: true,
            resultados,
            erros: errors,
            resumo: {
                totalLinhas: inputRows.length,
                linhasValidas: parsed.length,
                linhasComErro: errors.length,
                datasProcessadas: resultados.length,
            },
        });
    } catch (e: any) {
        console.error('Erro no upload de produção:', e);
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/uploads - Listar histórico de uploads
uploadRouter.get('/producao/uploads', async (req, res) => {
    try {
        const dataRef = req.query.dataRef as string | undefined;

        const params: any[] = [];
        let where = '1=1';

        if (dataRef) {
            params.push(dataRef);
            where += ` AND data_ref = $${params.length}`;
        }

        const { rows } = await pool.query(
            `SELECT
        id,
        nome_arquivo AS "nomeArquivo",
        data_ref AS "dataRef",
        linhas_total AS "linhasTotal",
        linhas_sucesso AS "linhasSucesso",
        linhas_erro AS "linhasErro",
        horas_total AS "horasTotal",
        ativo,
        upload_por_nome AS "uploadPorNome",
        criado_em AS "criadoEm"
      FROM producao_uploads
      WHERE ${where}
      ORDER BY criado_em DESC
      LIMIT 100`,
            params
        );

        res.json({ items: rows });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/uploads/ultimo - Retorna o último upload ativo (para TV/kiosk)
uploadRouter.get('/producao/uploads/ultimo', async (_req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT
                id,
                data_ref AS "dataRef",
                criado_em AS "criadoEm",
                nome_arquivo AS "nomeArquivo"
            FROM producao_uploads
            WHERE ativo = TRUE
            ORDER BY data_ref DESC, criado_em DESC
            LIMIT 1`
        );

        if (!rows.length) {
            return res.json({ upload: null });
        }

        res.json({ upload: rows[0] });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// GET /producao/uploads/:id - Detalhes de um upload específico
uploadRouter.get('/producao/uploads/:id', async (req, res) => {
    try {
        const id = String(req.params.id);

        // Buscar header do upload
        const { rows: uploads } = await pool.query(
            `SELECT
                id,
                nome_arquivo AS "nomeArquivo",
                data_ref AS "dataRef",
                linhas_total AS "linhasTotal",
                linhas_sucesso AS "linhasSucesso",
                linhas_erro AS "linhasErro",
                horas_total AS "horasTotal",
                ativo,
                upload_por_nome AS "uploadPorNome",
                criado_em AS "criadoEm"
            FROM producao_uploads
            WHERE id = $1`,
            [id]
        );

        if (!uploads.length) {
            return res.status(404).json({ error: 'Upload não encontrado.' });
        }

        const upload = uploads[0];

        // Buscar lançamentos associados a este upload
        const { rows: lancamentos } = await pool.query(
            `SELECT
                l.id,
                l.maquina_id AS "maquinaId",
                m.nome AS "maquinaNome",
                m.tag AS "maquinaTag",
                l.data_ref AS "dataRef",
                l.turno,
                l.horas_realizadas AS "horasRealizadas",
                l.observacao
            FROM producao_lancamentos l
            LEFT JOIN maquinas m ON m.id = l.maquina_id
            WHERE l.upload_id = $1
            ORDER BY m.nome, l.turno`,
            [id]
        );

        // Agrupar por máquina para exibição
        const porMaquina = new Map<string, { maquinaId: string; maquinaNome: string; maquinaTag: string | null; total: number; lancamentos: typeof lancamentos }>();

        for (const l of lancamentos) {
            const key = l.maquinaId;
            if (!porMaquina.has(key)) {
                porMaquina.set(key, {
                    maquinaId: l.maquinaId,
                    maquinaNome: l.maquinaNome || 'Desconhecida',
                    maquinaTag: l.maquinaTag,
                    total: 0,
                    lancamentos: [],
                });
            }
            const grupo = porMaquina.get(key)!;
            grupo.total += Number(l.horasRealizadas || 0);
            grupo.lancamentos.push(l);
        }

        res.json({
            upload,
            lancamentos,
            porMaquina: [...porMaquina.values()].sort((a, b) => b.total - a.total),
            resumo: {
                totalMaquinas: porMaquina.size,
                totalLancamentos: lancamentos.length,
                totalHoras: lancamentos.reduce((s, l) => s + Number(l.horasRealizadas || 0), 0),
            },
        });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// POST /producao/uploads/:id/ativar - Tornar um upload ativo
uploadRouter.post('/producao/uploads/:id/ativar', async (req, res) => {
    try {
        const auth = (req as any).user || {};
        const userRole = (auth.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';

        if (!isAdmin) {
            // Buscar permissões do role do usuário
            const { rows: permRows } = await pool.query<{ permissoes: Record<string, string> }>(
                `SELECT r.permissoes 
                 FROM usuarios u
                 JOIN roles r ON u.role_id = r.id OR LOWER(u.role) = LOWER(r.nome)
                 WHERE u.id = $1
                 LIMIT 1`,
                [auth.id]
            );

            const permissions = permRows[0]?.permissoes || {};
            const uploadPerm = permissions['producao_upload'];

            if (uploadPerm !== 'editar') {
                return res.status(403).json({ error: 'Sem permissão.' });
            }
        }

        const id = String(req.params.id);

        // Buscar upload
        const { rows: uploads } = await pool.query(
            `SELECT id, data_ref FROM producao_uploads WHERE id = $1`,
            [id]
        );
        if (!uploads.length) {
            return res.status(404).json({ error: 'Upload não encontrado.' });
        }

        const dataRef = uploads[0].data_ref;

        await withTx(async (client) => {
            // Desativar outros do mesmo dia
            await client.query(
                `UPDATE producao_uploads SET ativo = FALSE WHERE data_ref = $1`,
                [dataRef]
            );
            // Ativar este
            await client.query(
                `UPDATE producao_uploads SET ativo = TRUE WHERE id = $1`,
                [id]
            );
        });

        sseBroadcast({ topic: 'producao_uploads', action: 'activated', id });
        res.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});
