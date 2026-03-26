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
        return { dataRef: iso.substring(0, 10), lancadoEm: iso };
    }

    // Excel serial number
    if (typeof raw === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dt = new Date(excelEpoch.getTime() + raw * 86400000);
        const iso = dt.toISOString();
        return { dataRef: iso.substring(0, 10), lancadoEm: iso };
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

        const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const dataFim = new Date(ano, mes, 0).toISOString().substring(0, 10); // last day of month

        // Main analytics query: per-row breakdown
        const { rows } = await pool.query<{
            criado_por: string;
            tipo: string;
            data_ref: string;
            hora: number;
            op_numero: string | null;
            op_codigo: string | null;
            item_codigo: string | null;
            total: string;
        }>(
            `SELECT
                COALESCE(criado_por, 'Desconhecido') AS criado_por,
                tipo,
                data_ref::text,
                EXTRACT(HOUR FROM lancado_em AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
                op_numero,
                op_codigo,
                item_codigo,
                COUNT(*)::text AS total
             FROM logistica_transferencias lt
             JOIN logistica_transferencias_uploads ltu ON lt.upload_id = ltu.id
             WHERE ltu.ativo = TRUE
               AND lt.data_ref BETWEEN $1 AND $2
             GROUP BY criado_por, tipo, data_ref, hora, op_numero, op_codigo, item_codigo
             ORDER BY data_ref`,
            [dataInicio, dataFim]
        );

        // Aggregate porColaborador
        const colaboradorMap = new Map<string, {
            total: number;
            transferenciasPrinc: number;
            consumos: number;
            manuais: number;
            estornos: number;
            nf: number;
            outro: number;
        }>();

        // Aggregate volumeDiario
        const diaMap = new Map<string, { total: number; porTipo: Record<string, number> }>();

        // Aggregate porHora
        const horaMap = new Map<number, number>();

        // Aggregate topOps
        const opMap = new Map<string, { opCodigo: string; total: number }>();

        // Aggregate topItens
        const itemMap = new Map<string, number>();

        for (const r of rows) {
            const count = parseInt(r.total);
            const col = r.criado_por;
            const tipo = r.tipo;

            // Colaborador
            if (!colaboradorMap.has(col)) {
                colaboradorMap.set(col, { total: 0, transferenciasPrinc: 0, consumos: 0, manuais: 0, estornos: 0, nf: 0, outro: 0 });
            }
            const colData = colaboradorMap.get(col)!;
            colData.total += count;
            if (tipo === 'transferencia_princ') colData.transferenciasPrinc += count;
            else if (tipo === 'consumo') colData.consumos += count;
            else if (tipo === 'manual') colData.manuais += count;
            else if (tipo === 'estorno') colData.estornos += count;
            else if (tipo === 'nf') colData.nf += count;
            else colData.outro += count;

            // Volume diário
            if (!diaMap.has(r.data_ref)) {
                diaMap.set(r.data_ref, { total: 0, porTipo: {} });
            }
            const diaData = diaMap.get(r.data_ref)!;
            diaData.total += count;
            diaData.porTipo[tipo] = (diaData.porTipo[tipo] || 0) + count;

            // Por hora
            horaMap.set(r.hora, (horaMap.get(r.hora) || 0) + count);

            // Top OPs
            if (r.op_numero) {
                const key = r.op_numero;
                if (!opMap.has(key)) opMap.set(key, { opCodigo: r.op_codigo || '', total: 0 });
                opMap.get(key)!.total += count;
            }

            // Top itens
            if (r.item_codigo) {
                itemMap.set(r.item_codigo, (itemMap.get(r.item_codigo) || 0) + count);
            }
        }

        const porColaborador = Array.from(colaboradorMap.entries())
            .map(([colaborador, d]) => ({
                colaborador,
                ...d,
                percentualEstornos: d.total > 0 ? Math.round((d.estornos / d.total) * 100 * 10) / 10 : 0,
            }))
            .sort((a, b) => b.total - a.total);

        const volumeDiario = Array.from(diaMap.entries())
            .map(([data, d]) => ({ data, ...d }))
            .sort((a, b) => a.data.localeCompare(b.data));

        const porHora = Array.from({ length: 24 }, (_, hora) => ({
            hora,
            total: horaMap.get(hora) || 0,
        }));

        const topOps = Array.from(opMap.entries())
            .map(([opNumero, d]) => ({ opNumero, opCodigo: d.opCodigo, total: d.total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 20);

        const topItens = Array.from(itemMap.entries())
            .map(([itemCodigo, total]) => ({ itemCodigo, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 20);

        // Resumo
        const totalMovimentacoes = porColaborador.reduce((s, c) => s + c.total, 0);
        const porTipo: Record<string, number> = {};
        for (const c of porColaborador) {
            porTipo['transferencia_princ'] = (porTipo['transferencia_princ'] || 0) + c.transferenciasPrinc;
            porTipo['consumo'] = (porTipo['consumo'] || 0) + c.consumos;
            porTipo['manual'] = (porTipo['manual'] || 0) + c.manuais;
            porTipo['estorno'] = (porTipo['estorno'] || 0) + c.estornos;
            porTipo['nf'] = (porTipo['nf'] || 0) + c.nf;
            porTipo['outro'] = (porTipo['outro'] || 0) + c.outro;
        }

        res.json({
            periodo: { mes, ano },
            resumo: {
                totalMovimentacoes,
                porTipo,
                totalColaboradores: porColaborador.length,
                datasComDados: diaMap.size,
            },
            porColaborador,
            volumeDiario,
            porHora,
            topOps,
            topItens,
        });
    }
);
