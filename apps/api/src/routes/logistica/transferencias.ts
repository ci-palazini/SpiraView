// apps/api/src/routes/logistica/transferencias.ts
import { Router } from 'express';
import { pool } from '../../db';
import { logger } from '../../logger';
import { requirePermission } from '../../middlewares/requirePermission';
import { listResponse } from '../../utils/response';

export const transferenciasRouter: Router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────

/** Remove diacritics, lowercase, trim — for accent-insensitive key matching */
function normKey(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Pre-normalize all row keys once and return a lookup map */
function buildNormMap(row: Record<string, unknown>): Map<string, string> {
    const map = new Map<string, string>();
    for (const key of Object.keys(row)) {
        map.set(normKey(key), key);
    }
    return map;
}

function getField(row: Record<string, unknown>, normMap: Map<string, string>, ...keys: string[]): unknown {
    // 1. Exact match
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    // 2. Case-insensitive match
    for (const key of keys) {
        const lower = key.toLowerCase();
        for (const [rk, origKey] of normMap.entries()) {
            if (rk === lower && row[origKey] !== undefined && row[origKey] !== null && row[origKey] !== '') {
                return row[origKey];
            }
        }
    }
    // 3. Accent+case-insensitive match
    for (const key of keys) {
        const norm = normKey(key);
        const origKey = normMap.get(norm);
        if (origKey && row[origKey] !== undefined && row[origKey] !== null && row[origKey] !== '') {
            return row[origKey];
        }
    }
    return '';
}

function parsePtBrNumber(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return isNaN(raw) ? null : raw;
    const s = String(raw).trim();
    if (!s) return null;
    if (s.includes(',')) {
        const cleaned = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

/**
 * Parse date from CSV "Lançado em" column.
 * Handles: "DD/MM/YYYY HH:MM", ISO strings, JS Date objects, Excel serial numbers.
 */
function parseLancadoEm(raw: unknown): { dataRef: string; lancadoEm: string } | null {
    if (raw === null || raw === undefined || raw === '') return null;

    // JS Date object (XLSX may convert date-like cells)
    if (raw instanceof Date) {
        const iso = raw.toISOString();
        const dateStr = iso.substring(0, 10);
        const timeStr = iso.substring(11, 19);
        return { dataRef: dateStr, lancadoEm: `${dateStr}T${timeStr}-03:00` };
    }

    // Excel serial number
    if (typeof raw === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dt = new Date(excelEpoch.getTime() + raw * 86400000);
        const iso = dt.toISOString();
        const dateStr = iso.substring(0, 10);
        const timeStr = iso.substring(11, 19);
        return { dataRef: dateStr, lancadoEm: `${dateStr}T${timeStr}-03:00` };
    }

    const s = String(raw).trim();
    if (!s) return null;

    // DD/MM/YYYY HH:MM (primary ERP format)
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        const yyyy = m[3];
        const hh = m[4].padStart(2, '0');
        const min = m[5];
        const dataRef = `${yyyy}-${mm}-${dd}`;
        const lancadoEm = `${dataRef}T${hh}:${min}:00-03:00`;
        return { dataRef, lancadoEm };
    }

    // Already ISO (YYYY-MM-DD...)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return { dataRef: s.substring(0, 10), lancadoEm: s };
    }

    // DD/MM/YYYY only (no time)
    const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dm) {
        const dd = dm[1].padStart(2, '0');
        const mm = dm[2].padStart(2, '0');
        const dataRef = `${dm[3]}-${mm}-${dd}`;
        return { dataRef, lancadoEm: `${dataRef}T00:00:00-03:00` };
    }

    return null;
}

type TipoTransferencia = 'transferencia_princ' | 'consumo' | 'manual' | 'estorno' | 'nf' | 'outro';

interface ParsedRow {
    diario: string;
    descricao: string;
    tipo: TipoTransferencia;
    itemCodigo: string | null;
    opNumero: string | null;
    opCodigo: string | null;
    lancadoPor: string | null;
    criadoPor: string | null;
    linhas: number | null;
    lancado: boolean | null;
    dataRef: string;
    lancadoEm: string;
}

function classifyRow(descricao: string): { tipo: TipoTransferencia; itemCodigo: string | null; opNumero: string | null; opCodigo: string | null } {
    const d = descricao || '';

    if (d.startsWith('Transf. PRINC')) {
        const itemMatch = d.match(/Item:\s*(\S+)/);
        return {
            tipo: 'transferencia_princ',
            itemCodigo: itemMatch ? itemMatch[1].trim() : null,
            opNumero: null,
            opCodigo: null,
        };
    }

    if (d.startsWith('Consumo L.Separação') || d.startsWith('Consumo L.Separacao')) {
        const opNumMatch = d.match(/OP:\s*(\d+)/);
        const opCodMatch = d.match(/\/(OP\d+)/);
        return {
            tipo: 'consumo',
            itemCodigo: null,
            opNumero: opNumMatch ? opNumMatch[1] : null,
            opCodigo: opCodMatch ? opCodMatch[1] : null,
        };
    }

    if (d.toLowerCase().startsWith('transferia')) {
        return { tipo: 'manual', itemCodigo: null, opNumero: null, opCodigo: null };
    }

    if (d.toLowerCase().includes('estorno')) {
        return { tipo: 'estorno', itemCodigo: null, opNumero: null, opCodigo: null };
    }

    if (/ NF:/i.test(d) || d.toLowerCase().startsWith('nf ')) {
        return { tipo: 'nf', itemCodigo: null, opNumero: null, opCodigo: null };
    }

    return { tipo: 'outro', itemCodigo: null, opNumero: null, opCodigo: null };
}

function parseLancado(raw: unknown): boolean | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).toLowerCase().trim();
    if (s === 'sim' || s === '1' || s === 'true') return true;
    if (s === '0' || s === 'não' || s === 'nao' || s === 'false') return false;
    return null;
}

// ── POST /logistica/transferencias-upload ─────────────────────────────────

transferenciasRouter.post(
    '/logistica/transferencias-upload',
    requirePermission('logistica_transferencias', 'editar'),
    async (req, res) => {
        const { rows, nomeArquivo } = req.body as {
            rows: Record<string, unknown>[];
            nomeArquivo?: string;
        };

        if (!Array.isArray(rows) || rows.length === 0) {
            res.status(400).json({ ok: false, message: 'Nenhuma linha recebida.' });
            return;
        }

        const user = (req as any).user;
        const uploadPorId = user?.id ?? null;
        const uploadPorNome = user?.nome ?? user?.email ?? null;
        const arquivo = nomeArquivo || 'transferencias.csv';

        const parsed: ParsedRow[] = [];
        const errors: { linha: number; erro: string }[] = [];


        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const linha = i + 2; // header is line 1
            const nm = buildNormMap(row);

            const rawLancadoEm = getField(row, nm, 'Lançado em', 'Lancado em', 'lancado_em', 'lancado em', 'data');
            const dt = parseLancadoEm(rawLancadoEm);
            if (!dt) {
                errors.push({ linha, erro: `"Lançado em" inválido: "${rawLancadoEm}"` });
                continue;
            }

            const diario = String(getField(row, nm, 'Diário', 'Diario', 'diario') || '').trim();
            if (!diario) {
                errors.push({ linha, erro: 'Coluna "Diário" vazia.' });
                continue;
            }

            const descricao = String(getField(row, nm, 'Descrição', 'Descricao', 'descricao', 'descrição') || '').trim();
            const { tipo, itemCodigo, opNumero, opCodigo } = classifyRow(descricao);

            const lancadoPor = String(getField(row, nm, 'Lançado por', 'Lancado por', 'lancado_por') || '').trim() || null;
            const criadoPor = String(getField(row, nm, 'Criado por', 'criado_por', 'criado por') || '').trim() || null;
            const linhas = parsePtBrNumber(getField(row, nm, 'Linhas', 'linhas'));
            const lancado = parseLancado(getField(row, nm, 'Lançado', 'Lancado', 'lancado'));

            parsed.push({
                diario,
                descricao,
                tipo,
                itemCodigo,
                opNumero,
                opCodigo,
                lancadoPor,
                criadoPor,
                linhas,
                lancado,
                dataRef: dt.dataRef,
                lancadoEm: dt.lancadoEm,
            });
        }

        if (parsed.length === 0) {
            res.status(400).json({
                ok: false,
                message: 'Nenhuma linha válida encontrada.',
                inserted: 0,
                errors,
                datasProcessadas: [],
            });
            return;
        }

        // Group unique dates
        const datasSet = new Set(parsed.map(r => r.dataRef));
        const datasProcessadas = Array.from(datasSet).sort();

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Deactivate previous uploads for the same dates and delete their records
            for (const dataRef of datasProcessadas) {
                const old = await client.query<{ id: string }>(
                    `SELECT id FROM logistica_transferencias_uploads
                     WHERE ativo = TRUE AND $1 = ANY(datas_processadas)`,
                    [dataRef]
                );
                for (const { id } of old.rows) {
                    await client.query(
                        `DELETE FROM logistica_transferencias WHERE upload_id = $1`,
                        [id]
                    );
                    await client.query(
                        `UPDATE logistica_transferencias_uploads SET ativo = FALSE WHERE id = $1`,
                        [id]
                    );
                }
            }

            // Insert new upload record
            const uploadRes = await client.query<{ id: string }>(
                `INSERT INTO logistica_transferencias_uploads
                 (nome_arquivo, total_linhas, linhas_sucesso, linhas_erro, datas_processadas, upload_por_id, upload_por_nome)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [arquivo, rows.length, parsed.length, errors.length, datasProcessadas, uploadPorId, uploadPorNome]
            );
            const uploadId = uploadRes.rows[0].id;

            // Batch insert records via unnest
            if (parsed.length > 0) {
                const diarios = parsed.map(r => r.diario);
                const descricoes = parsed.map(r => r.descricao);
                const tipos = parsed.map(r => r.tipo);
                const itemCodigos = parsed.map(r => r.itemCodigo);
                const opNumeros = parsed.map(r => r.opNumero);
                const opCodigos = parsed.map(r => r.opCodigo);
                const lancadosPor = parsed.map(r => r.lancadoPor);
                const criadosPor = parsed.map(r => r.criadoPor);
                const linhasList = parsed.map(r => r.linhas);
                const lancadosList = parsed.map(r => r.lancado);
                const lancadosEm = parsed.map(r => r.lancadoEm);
                const dataRefs = parsed.map(r => r.dataRef);

                await client.query(
                    `INSERT INTO logistica_transferencias
                     (upload_id, diario, descricao, tipo, item_codigo, op_numero, op_codigo,
                      lancado_por, criado_por, linhas, lancado, lancado_em, data_ref)
                     SELECT $1, unnest($2::text[]), unnest($3::text[]), unnest($4::text[]),
                            unnest($5::text[]), unnest($6::text[]), unnest($7::text[]),
                            unnest($8::text[]), unnest($9::text[]), unnest($10::numeric[]),
                            unnest($11::boolean[]), unnest($12::timestamptz[]), unnest($13::date[])`,
                    [
                        uploadId,
                        diarios, descricoes, tipos,
                        itemCodigos, opNumeros, opCodigos,
                        lancadosPor, criadosPor, linhasList,
                        lancadosList, lancadosEm, dataRefs,
                    ]
                );
            }

            await client.query('COMMIT');

            res.json({
                ok: true,
                message: `${parsed.length} movimentações importadas com sucesso.`,
                inserted: parsed.length,
                errors,
                datasProcessadas,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            logger.error({ err }, 'transferencias upload error');
            res.status(500).json({ ok: false, message: 'Erro ao processar upload.', inserted: 0, errors: [], datasProcessadas: [] });
        } finally {
            client.release();
        }
    }
);

// ── GET /logistica/transferencias/uploads ─────────────────────────────────

transferenciasRouter.get(
    '/logistica/transferencias/uploads',
    requirePermission('logistica_transferencias', 'ver'),
    async (req, res) => {
        const { dataRef } = req.query as { dataRef?: string };

        const whereClause = dataRef
            ? `WHERE ativo = TRUE AND $1 = ANY(datas_processadas)`
            : `WHERE ativo = TRUE`;
        const params = dataRef ? [dataRef] : [];

        const { rows } = await pool.query(
            `SELECT id,
                    nome_arquivo AS "nomeArquivo",
                    total_linhas AS "totalLinhas",
                    linhas_sucesso AS "linhasSucesso",
                    linhas_erro AS "linhasErro",
                    datas_processadas AS "datasProcessadas",
                    upload_por_nome AS "uploadPorNome",
                    ativo,
                    created_at AS "criadoEm"
             FROM logistica_transferencias_uploads
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT 60`,
            params
        );
        listResponse(res, rows);
    }
);

// ── DELETE /logistica/transferencias/uploads/:id ──────────────────────────

transferenciasRouter.delete(
    '/logistica/transferencias/uploads/:id',
    requirePermission('logistica_transferencias', 'editar'),
    async (req, res) => {
        const { id } = req.params;
        const { rowCount } = await pool.query(
            `UPDATE logistica_transferencias_uploads SET ativo = FALSE WHERE id = $1 AND ativo = TRUE`,
            [id]
        );
        if (!rowCount) {
            res.status(404).json({ error: 'Upload não encontrado.' });
            return;
        }
        await pool.query(`DELETE FROM logistica_transferencias WHERE upload_id = $1`, [id]);
        res.json({ deleted: rowCount });
    }
);

// ── GET /logistica/transferencias/analytics ───────────────────────────────

transferenciasRouter.get(
    '/logistica/transferencias/analytics',
    requirePermission('logistica_transferencias', 'ver'),
    async (req, res) => {
        const mes = parseInt(String(req.query.mes)) || new Date().getMonth() + 1;
        const ano = parseInt(String(req.query.ano)) || new Date().getFullYear();
        const dia = parseInt(String(req.query.dia)) || 0;

        let dataInicio: string;
        let dataFim: string;

        if (dia > 0) {
            const padDia = String(dia).padStart(2, '0');
            const padMes = String(mes).padStart(2, '0');
            const dateStr = `${ano}-${padMes}-${padDia}`;
            dataInicio = dateStr;
            dataFim = dateStr;
        } else {
            const padMes = String(mes).padStart(2, '0');
            dataInicio = `${ano}-${padMes}-01`;
            dataFim = new Date(ano, mes, 0).toISOString().substring(0, 10);
        }

        try {
            // Optimized: All 5 queries use direct table references with indexed columns
            // No N+1 problem — all run in parallel (Promise.all)

            // 1. Por Colaborador e Tipo
            const qColab = pool.query(`
                SELECT
                    COALESCE(criado_por, 'Desconhecido') as colaborador,
                    tipo,
                    COUNT(*)::int as total
                FROM logistica_transferencias
                WHERE data_ref BETWEEN $1 AND $2
                GROUP BY 1, 2
            `, [dataInicio, dataFim]);

            // 2. Volume Diário e Tipo
            const qDia = pool.query(`
                SELECT
                    data_ref::text as data,
                    tipo,
                    COUNT(*)::int as total
                FROM logistica_transferencias
                WHERE data_ref BETWEEN $1 AND $2
                GROUP BY 1, 2
                ORDER BY 1
            `, [dataInicio, dataFim]);

            // 3. Por Hora
            const qHora = pool.query(`
                SELECT
                    EXTRACT(HOUR FROM lancado_em AT TIME ZONE 'America/Sao_Paulo')::int as hora,
                    COUNT(*)::int as total
                FROM logistica_transferencias
                WHERE data_ref BETWEEN $1 AND $2
                GROUP BY 1
                ORDER BY 1
            `, [dataInicio, dataFim]);

            // 4. Top OPs
            const qOps = pool.query(`
                SELECT
                    op_numero as "opNumero",
                    MAX(op_codigo) as "opCodigo",
                    COUNT(*)::int as total
                FROM logistica_transferencias
                WHERE data_ref BETWEEN $1 AND $2
                  AND op_numero IS NOT NULL AND op_numero != ''
                GROUP BY 1
                ORDER BY total DESC
                LIMIT 20
            `, [dataInicio, dataFim]);

            // 5. Top Itens
            const qItens = pool.query(`
                SELECT
                    item_codigo as "itemCodigo",
                    COUNT(*)::int as total
                FROM logistica_transferencias
                WHERE data_ref BETWEEN $1 AND $2
                  AND item_codigo IS NOT NULL AND item_codigo != ''
                GROUP BY 1
                ORDER BY total DESC
                LIMIT 20
            `, [dataInicio, dataFim]);

            const [rColab, rDia, rHora, rOps, rItens] = await Promise.all([qColab, qDia, qHora, qOps, qItens]);

            // Processar Colaboradores
            const colabMap = new Map<string, any>();
            rColab.rows.forEach(r => {
                if (!colabMap.has(r.colaborador)) {
                    colabMap.set(r.colaborador, { 
                        colaborador: r.colaborador, 
                        total: 0, transferenciasPrinc: 0, consumos: 0, manuais: 0, estornos: 0, nf: 0, outro: 0 
                    });
                }
                const c = colabMap.get(r.colaborador);
                const count = r.total;
                c.total += count;
                if (r.tipo === 'transferencia_princ') c.transferenciasPrinc += count;
                else if (r.tipo === 'consumo') c.consumos += count;
                else if (r.tipo === 'manual') c.manuais += count;
                else if (r.tipo === 'estorno') c.estornos += count;
                else if (r.tipo === 'nf') c.nf += count;
                else c.outro += count;
            });

            const porColaborador = Array.from(colabMap.values())
                .map(c => ({
                    ...c,
                    percentualEstornos: c.total > 0 ? Math.round((c.estornos / c.total) * 100 * 10) / 10 : 0
                }))
                .sort((a, b) => b.total - a.total);

            // Processar Volume Diário
            const diaMap = new Map<string, any>();
            rDia.rows.forEach(r => {
                if (!diaMap.has(r.data)) {
                    diaMap.set(r.data, { data: r.data, total: 0, porTipo: {} });
                }
                const d = diaMap.get(r.data);
                d.total += r.total;
                d.porTipo[r.tipo] = (d.porTipo[r.tipo] || 0) + r.total;
            });
            const volumeDiario = Array.from(diaMap.values());

            // Processar Por Hora
            const porHora = Array.from({ length: 24 }, (_, i) => ({
                hora: i,
                total: rHora.rows.find(rh => rh.hora === i)?.total || 0
            }));

            // Resumo
            const totalMovimentacoes = porColaborador.reduce((s, c) => s + c.total, 0);
            const porTipoResumo: Record<string, number> = {};
            rColab.rows.forEach(r => {
                porTipoResumo[r.tipo] = (porTipoResumo[r.tipo] || 0) + r.total;
            });

            res.json({
                periodo: { mes, ano, dia: dia || undefined },
                resumo: {
                    totalMovimentacoes,
                    porTipo: porTipoResumo,
                    totalColaboradores: porColaborador.length,
                    datasComDados: diaMap.size,
                },
                porColaborador,
                volumeDiario,
                porHora,
                topOps: rOps.rows,
                topItens: rItens.rows,
            });
        } catch (err) {
            logger.error({ err, mes, ano, dia }, 'Erro ao carregar analytics de transferências');
            res.status(500).json({ error: 'Erro ao processar dados' });
        }
    }
);

/**
 * Detalhamento de movimentações por colaborador/período
 * GET /logistica/transferencias/analytics/detalhes?mes=3&ano=2026&dia=0&colaborador=NOME&page=1&pageSize=200
 */
transferenciasRouter.get(
    '/logistica/transferencias/analytics/detalhes',
    requirePermission('logistica_transferencias', 'ver'),
    async (req, res) => {
        const mes = parseInt(String(req.query.mes)) || new Date().getMonth() + 1;
        const ano = parseInt(String(req.query.ano)) || new Date().getFullYear();
        const dia = parseInt(String(req.query.dia)) || 0;
        const page = Math.max(1, parseInt(String(req.query.page)) || 1);
        const pageSize = Math.min(500, Math.max(10, parseInt(String(req.query.pageSize)) || 200));
        const colaborador = String(req.query.colaborador || '');

        if (!colaborador) {
            return res.status(400).json({ error: 'Colaborador é obrigatório' });
        }

        let dataInicio: string;
        let dataFim: string;

        if (dia > 0 && dia <= 31) {
            const padDia = String(dia).padStart(2, '0');
            const padMes = String(mes).padStart(2, '0');
            const dateStr = `${ano}-${padMes}-${padDia}`;
            dataInicio = dateStr;
            dataFim = dateStr;
        } else {
            const padMes = String(mes).padStart(2, '0');
            dataInicio = `${ano}-${padMes}-01`;
            const lastDay = new Date(ano, mes, 0).getDate();
            dataFim = `${ano}-${padMes}-${lastDay}`;
        }

        try {
            const offset = (page - 1) * pageSize;

            const query = `
                SELECT
                    id,
                    data_ref,
                    diario,
                    descricao,
                    tipo,
                    item_codigo,
                    op_numero,
                    op_codigo,
                    linhas,
                    lancado,
                    lancado_em,
                    criado_por
                FROM logistica_transferencias
                WHERE data_ref >= $1 AND data_ref <= $2
                  AND COALESCE(criado_por, 'Desconhecido') = $3
                ORDER BY lancado_em DESC, data_ref DESC, id ASC
                LIMIT $4 OFFSET $5
            `;

            const qCount = pool.query(`
                SELECT COUNT(*)::int as total
                FROM logistica_transferencias
                WHERE data_ref >= $1 AND data_ref <= $2
                  AND COALESCE(criado_por, 'Desconhecido') = $3
            `, [dataInicio, dataFim, colaborador]);

            const qRows = pool.query(query, [dataInicio, dataFim, colaborador, pageSize, offset]);

            const [rCount, rRows] = await Promise.all([qCount, qRows]);

            const total = rCount.rows[0].total;
            const hasNext = offset + pageSize < total;

            res.json({
                items: rRows.rows,
                total,
                page,
                pageSize,
                hasNext,
                totalPages: Math.ceil(total / pageSize),
                colaborador,
                periodo: { mes, ano, dia: dia || undefined }
            });
        } catch (err) {
            logger.error({ err, colaborador, mes, ano, dia }, 'Erro ao buscar detalhes de transferências');
            res.status(500).json({ error: 'Erro interno ao buscar detalhes' });
        }
    }
);
