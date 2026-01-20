// apps/api/src/routes/manutencao/bot.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../../db";
import { requireAnyPermission } from "../../middlewares/requirePermission";

// ===================================================================
// Pzini ChatBot (rule-based) — SQL seguro com guardrails
// ===================================================================
export const botRouter: Router = Router();

// ------------------------- util: cache simples ----------------------
type CacheVal = { rows: any[]; fields: string[]; ts: number; summary?: string; suggestions?: string[] };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheVal>();
function cacheKey(sql: string, params: any[]) {
  return JSON.stringify([sql, ...params]);
}

// ---------------------------- helpers -------------------------------
const STOPWORDS = new Set(["nos", "nas", "no", "na", "de", "da", "do", "das", "dos", "as", "os", "em", "para", "por", "e"]);

function extractTopN(text: string, def = 5): number {
  const m = text.match(/\btop\s+(\d{1,3})\b/i);
  if (m) return Math.max(1, Math.min(parseInt(m[1], 10), 100));
  const m2 = text.match(/^\s*(\d{1,3})\s+máquinas?\b/i);
  if (m2) return Math.max(1, Math.min(parseInt(m2[1], 10), 100));
  return def;
}

function extractDays(text: string, def = 90): number {
  const mDias = text.match(/(últimos|ultimos)\s+(\d{1,4})\s*dias/i);
  if (mDias) return Math.min(parseInt(mDias[2], 10), 3650);
  const mSem = text.match(/(últimas|ultimas)\s+(\d{1,3})\s*semanas/i);
  if (mSem) return Math.min(parseInt(mSem[2], 10) * 7, 3650);
  const mMes = text.match(/(últimos|ultimos)\s+(\d{1,3})\s*mes(es)?/i);
  if (mMes) return Math.min(parseInt(mMes[2], 10) * 30, 3650);
  return def;
}

/** de 01/08/2025 até 15/09/2025 | entre 01/08 e 15/09/2025 | 2025-08-01 a 2025-09-15 */
function extractDateRange(q: string): { from?: string; to?: string } {
  const norm = q.replace(/\s+/g, " ").trim();
  // dd/mm/yyyy
  const ddmmyyyy = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  const ds: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = ddmmyyyy.exec(norm))) {
    const d = m[1].padStart(2, "0");
    const M = m[2].padStart(2, "0");
    const Y = m[3];
    ds.push(`${Y}-${M}-${d}`);
  }
  if (ds.length >= 2) return { from: ds[0], to: ds[1] };
  if (ds.length === 1) {
    return { from: ds[0], to: undefined };
  }
  // yyyy-mm-dd
  const iso = /(\d{4})-(\d{2})-(\d{2})/g;
  const ds2: string[] = [];
  while ((m = iso.exec(norm))) {
    ds2.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  if (ds2.length >= 2) return { from: ds2[0], to: ds2[1] };
  if (ds2.length === 1) return { from: ds2[0], to: undefined };
  return {};
}

// exige dígito no token p/ evitar “nos/na/no…”
function sanitizeMaybeMachineName(token?: string | null): string | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  if (STOPWORDS.has(t)) return null;
  if (t.length < 2) return null;
  if (!/\d/.test(t)) return null;
  return token.trim();
}

// Ex.: "máquina TCN-19", "máquinas: TCN-19", "máquina do TCN-19"
function maybeExtractMachine(text: string): string | null {
  const re = /máquin[ao]s?\s*(?:de|da|do|na|no|em|:)?\s*(?=\S*\d)([A-Za-z0-9][A-Za-z0-9\-_/\.]{1,})/i;
  const m = (text || "").match(re);
  return sanitizeMaybeMachineName(m?.[1] ?? null);
}

// nomes soltos tipo “tcn-18”
function extractMachineLoose(text: string): string | null {
  const re = /\b([A-Za-z]{2,5}[-_/]?\d{1,3}[A-Za-z0-9\-_/]*)\b/;
  const m = (text || "").match(re);
  return sanitizeMaybeMachineName(m?.[1] ?? null);
}

// status normalizados
function extractStatus(q: string): string | undefined {
  if (/abert[oa]s?/i.test(q)) return "Aberto";
  if (/andament|em andamento|atendid|andando|progresso/i.test(q)) return "Em Andamento";
  if (/conclu[ií]d|fechad|finalizad|resolvid/i.test(q)) return "Concluido";
  return undefined;
}
function extractTipo(q: string): string | undefined {
  if (/preventiv/i.test(q)) return "preventiva";
  if (/preditiv/i.test(q)) return "preditiva";
  if (/corretiv/i.test(q)) return "corretiva";
  return undefined;
}
function extractCausa(q: string): string | undefined {
  const m = q.match(/\b(el[eé]tric[ao]|mec[aâ]nic[ao]|vazament[oa]|falha\s+de\s+lubrifica[cç][aã]o)\b/i);
  return m ? m[0] : undefined;
}

// “em X minutos/horas/dias”
function extractThreshold(q: string): { minutes?: number } | undefined {
  const m1 = q.match(/(\d{1,4})\s*min(utos)?/i);
  if (m1) return { minutes: parseInt(m1[1], 10) };
  const m2 = q.match(/(\d{1,3})\s*hora(s)?/i);
  if (m2) return { minutes: parseInt(m2[1], 10) * 60 };
  const m3 = q.match(/(\d{1,3})\s*dias?/i);
  if (m3) return { minutes: parseInt(m3[1], 10) * 24 * 60 };
  return undefined;
}

// WHERE de tempo em SQL (com params)
function whereTempoSQL(
  col: string,
  range?: { from?: string; to?: string },
  days?: number,
  params: any[] = []
) {
  const parts: string[] = [];
  if (range?.from && range?.to) {
    params.push(range.from, range.to);
    parts.push(`${col} BETWEEN $${params.length - 1} AND $${params.length}`);
  } else if (range?.from) {
    params.push(range.from);
    parts.push(`${col} >= $${params.length}`);
  } else if (range?.to) {
    params.push(range.to);
    parts.push(`${col} <= $${params.length}`);
  } else if (typeof days === "number") {
    params.push(days);
    parts.push(`${col} >= now() - ($${params.length} || ' days')::interval`);
  }
  return { sql: parts.length ? parts.join(" AND ") : "TRUE", params };
}

/* -------------------- CTE: “quem atendeu” via observações ------------------ */
// Lê chamado_observacoes e extrai o NOME do texto “Chamado atendido por …”,
// pegando o ÚLTIMO registro por chamado.
function cteAtendentes() {
  return `
    atend_raw AS (
      SELECT
        o.chamado_id,
        o.criado_em AS atendido_em,
        COALESCE(
          NULLIF(
            REGEXP_REPLACE(
              COALESCE(o.texto, o.mensagem, ''),
              '^\\s*Chamado\\s+atendido\\s+por\\s+', '', 'i'
            ), ''
          ),
          COALESCE(NULLIF(o.autor_nome,''), 'Sistema')
        ) AS manutentor_nome
      FROM public.chamado_observacoes o
      WHERE (o.texto ILIKE 'Chamado atendido por %' OR o.mensagem ILIKE 'Chamado atendido por %')
    ),
    atend_ult AS (
      SELECT DISTINCT ON (chamado_id)
        chamado_id, atendido_em, TRIM(manutentor_nome) AS manutentor_nome
      FROM atend_raw
      ORDER BY chamado_id, atendido_em DESC
    )`;
}

// ---------------------------- Tipos de regra -------------------------
type RuleKind =
  | "top_machines"
  | "causes_general"
  | "causes_by_machine"
  | "causes_by_machine_grouped"
  | "mtta_by_machine"
  | "mtta_one"
  | "mttr_by_machine"
  | "mttr_one"
  | "trend_weekly"
  | "status_count"
  | "recent_calls_by_machine"
  | "top_manutentores"
  | "list_manutentores"
  | "count_manutentores"
  | "sla_atendimento";

function ruleBasedSql(questionRaw: string): { kind: RuleKind; sql: string; params: any[]; ctx: any } {
  const q0 = questionRaw || "";
  const q = q0.toLowerCase();

  const topN = extractTopN(q0, 5);
  const range = extractDateRange(q0);
  const days = range.from || range.to ? undefined : extractDays(q0, 90);

  const status = extractStatus(q0);
  const onlyClosed = /(conclu[ií]d|fechad|finalizad|resolvid)/i.test(q0);
  const tipo = extractTipo(q0);
  const cause = extractCausa(q0);

  const mFrom = maybeExtractMachine(q0);
  const mLoose = extractMachineLoose(q0);
  const machine = mFrom || mLoose || undefined;

  const threshold = extractThreshold(q0);

  // 1) Top máquinas por nº de chamados
  if (
    /(top\s*\d+.*máquinas|máquinas.*top\s*\d+|(?:qual|que)\s.*máquina.*(?:mais|que mais).*(?:chamados|problemas?|falhas?|paradas?|defeitos?)|^\s*\d{1,3}\s+máquinas?.*mais.*chamados|máquina.*(?:mais|que mais).*(?:chamados|problemas?|falhas?|paradas?|defeitos?))/i
      .test(q)
  ) {
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);
    const w2: string[] = [w.sql];
    if (status) {
      params.push(status);
      w2.push(`status = $${params.length}`);
    }
    if (tipo) {
      params.push(tipo);
      w2.push(`LOWER(tipo) = LOWER($${params.length})`);
    }
    return {
      kind: "top_machines",
      sql: `
        SELECT maquina_nome, COUNT(*) AS chamados
        FROM v_chamados_analiticos
        WHERE ${w2.join(" AND ")}
        GROUP BY maquina_nome
        ORDER BY chamados DESC
        LIMIT ${topN}
      `,
      params,
      ctx: { range, days, status, tipo, topN },
    };
  }

  // 2) Causas — geral / por máquina / “por máquina” (agrupado máquina+causa)
  if (/causas?|principal(e|)s\s*causas?|natureza dos problemas?/i.test(q)) {
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);

    if (/por\s+máquin|por\s+maquin/i.test(q) && !machine) {
      return {
        kind: "causes_by_machine_grouped",
        sql: `
          SELECT maquina_nome, causa_nome, COUNT(*) AS ocorrencias
          FROM v_chamados_analiticos
          WHERE ${w.sql}
          GROUP BY maquina_nome, causa_nome
          ORDER BY ocorrencias DESC
          LIMIT ${topN * 10}
        `,
        params,
        ctx: { range, days, topN },
      };
    }

    if (machine) {
      params.push(machine);
      return {
        kind: "causes_by_machine",
        sql: `
          SELECT causa_nome, COUNT(*) AS ocorrencias
          FROM v_chamados_analiticos
          WHERE maquina_nome = $${params.length}
            AND ${w.sql}
          GROUP BY causa_nome
          ORDER BY ocorrencias DESC
          LIMIT ${topN}
        `,
        params,
        ctx: { range, days, machine, topN },
      };
    }

    const w2: string[] = [w.sql];
    if (cause) {
      params.push(cause);
      w2.push(`LOWER(causa_nome) = LOWER($${params.length})`);
    }
    return {
      kind: "causes_general",
      sql: `
        SELECT causa_nome, COUNT(*) AS ocorrencias
        FROM v_chamados_analiticos
        WHERE ${w2.join(" AND ")}
        GROUP BY causa_nome
        ORDER BY ocorrencias DESC
        LIMIT ${topN}
      `,
      params,
      ctx: { range, days, cause, topN },
    };
  }

  // 3) MTTA
  if (/mtta|tempo.*atendiment|ack|atendimento médio/i.test(q)) {
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);
    if (machine) {
      params.push(machine);
      return {
        kind: "mtta_one",
        sql: `
          SELECT
            $${params.length}::text AS maquina,
            ROUND(AVG(tempo_ate_atendimento_min)::numeric, 2) AS mtta_min
          FROM v_chamados_analiticos
          WHERE maquina_nome = $${params.length}
            AND ${w.sql}
        `,
        params,
        ctx: { range, days, machine },
      };
    }
    return {
      kind: "mtta_by_machine",
      sql: `
        SELECT
          maquina_nome,
          ROUND(AVG(tempo_ate_atendimento_min)::numeric, 2) AS mtta_min
        FROM v_chamados_analiticos
        WHERE ${w.sql}
        GROUP BY maquina_nome
        ORDER BY mtta_min ASC NULLS LAST
        LIMIT ${topN}
      `,
      params,
      ctx: { range, days, topN },
    };
  }

  // 4) MTTR
  if (/mttr|tempo.*reparo|tempo.*conclus/i.test(q)) {
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);
    if (machine) {
      params.push(machine);
      return {
        kind: "mttr_one",
        sql: `
          SELECT
            $${params.length}::text AS maquina,
            ROUND(AVG(tempo_total_min)::numeric, 2) AS mttr_min
          FROM v_chamados_analiticos
          WHERE maquina_nome = $${params.length}
            AND ${w.sql}
        `,
        params,
        ctx: { range, days, machine },
      };
    }
    return {
      kind: "mttr_by_machine",
      sql: `
        SELECT
          maquina_nome,
          ROUND(AVG(tempo_total_min)::numeric, 2) AS mttr_min
        FROM v_chamados_analiticos
        WHERE ${w.sql}
        GROUP BY maquina_nome
        ORDER BY mttr_min ASC NULLS LAST
        LIMIT ${topN}
      `,
      params,
      ctx: { range, days, topN },
    };
  }

  // 5) Linha do tempo semanal
  if (/linha\s+de\s+tempo|evolu[cç][aã]o|semanal|por\s+semana|trend/i.test(q)) {
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);
    return {
      kind: "trend_weekly",
      sql: `
        SELECT DATE_TRUNC('week', criado_em) AS semana, COUNT(*) AS chamados
        FROM v_chamados_analiticos
        WHERE ${w.sql}
        GROUP BY 1
        ORDER BY 1
      `,
      params,
      ctx: { range, days },
    };
  }

  // 6) Contagem por status
  if (/status(es)?|abertos?|em andamento|conclu[ií]dos?|fechados?/i.test(q) && /quant|cont|qtd|n[úu]mero|total/i.test(q)) {
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);
    return {
      kind: "status_count",
      sql: `
        SELECT status, COUNT(*) AS quantidade
        FROM v_chamados_analiticos
        WHERE ${w.sql}
        GROUP BY status
        ORDER BY quantidade DESC
      `,
      params,
      ctx: { range, days },
    };
  }

  // 7) Últimos N chamados (opcionalmente de uma máquina)
  if (/(últimos|ultimos)\s+\d+\s+chamados|recentes|mais recentes/i.test(q) || (/listar|mostrar/i.test(q) && /\bchamados\b/i.test(q))) {
    const n = extractTopN(q0, 10);
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);
    const w2: string[] = [w.sql];
    if (machine) {
      params.push(machine);
      w2.push(`maquina_nome = $${params.length}`);
    }
    if (onlyClosed) w2.push(`status = 'Concluido'`);
    return {
      kind: "recent_calls_by_machine",
      sql: `
        SELECT
          id, maquina_nome, status,
          causa_nome, criado_em, atendido_em, concluido_em
        FROM v_chamados_analiticos
        WHERE ${w2.join(" AND ")}
        ORDER BY criado_em DESC
        LIMIT ${n}
      `,
      params,
      ctx: { range, days, topN: n, machine },
    };
  }

  // 8) Ranking de manutentores (quem mais atendeu) — via observações
  if (/\b(manutentor(?:es)?|t[ée]cnic[oa]s?)\b.*\b(mais|top|ranking|atendeu|atendimentos?)\b/i.test(q0)) {
    const params: any[] = [];
    const w = whereTempoSQL("c.criado_em", range, days, params);
    const filtroMaquina = machine ? `AND c.maquina_nome = $${params.push(machine)}` : "";

    return {
      kind: "top_manutentores",
      sql: `
        WITH ${cteAtendentes()}
        SELECT
          au.manutentor_nome AS nome,
          COUNT(*) AS chamados_atendidos
        FROM atend_ult au
        JOIN public.v_chamados_analiticos c
          ON c.id = au.chamado_id
        WHERE ${w.sql}
          ${filtroMaquina}
        GROUP BY au.manutentor_nome
        ORDER BY chamados_atendidos DESC
        LIMIT ${topN}
      `,
      params,
      ctx: { range, days, topN, machine },
    };
  }

  // 9) Listar / contar manutentores — via observações (não depende de tabela usuarios)
  if (/\bmanutentor(?:es)?\b|\bt[ée]cnic[oa]s?\b/i.test(q0)) {
    const querContar = /\b(quantos?|qtd|n[úu]mero|contagem|total)\b/i.test(q0);
    const params: any[] = [];
    const w = whereTempoSQL("c.criado_em", range, days, params);
    if (querContar) {
      const filtroMaquina = machine ? `AND c.maquina_nome = $${params.push(machine)}` : "";
      return {
        kind: "count_manutentores",
        sql: `
          WITH ${cteAtendentes()}
          SELECT COUNT(DISTINCT au.manutentor_nome) AS manutentores
          FROM atend_ult au
          JOIN public.v_chamados_analiticos c
            ON c.id = au.chamado_id
          WHERE ${w.sql} ${filtroMaquina}
        `,
        params,
        ctx: { range, days, machine },
      };
    }
    // lista com contagem
    const filtroMaquina = machine ? `AND c.maquina_nome = $${params.push(machine)}` : "";
    return {
      kind: "list_manutentores",
      sql: `
        WITH ${cteAtendentes()}
        SELECT au.manutentor_nome AS nome, COUNT(*) AS atendimentos
        FROM atend_ult au
        JOIN public.v_chamados_analiticos c
          ON c.id = au.chamado_id
        WHERE ${w.sql} ${filtroMaquina}
        GROUP BY au.manutentor_nome
        ORDER BY nome
      `,
      params,
      ctx: { range, days, machine },
    };
  }

  // 10) SLA de atendimento (<= X minutos)
  if (/\bsla\b|\batendimento.*(<=|até|no m[aá]ximo|em)\s+\d+/i.test(q0)) {
    const thr = threshold?.minutes ?? 60; // padrão 60 min
    const params: any[] = [thr];
    const w = whereTempoSQL("criado_em", range, days, params);
    return {
      kind: "sla_atendimento",
      sql: `
        SELECT
          ROUND(100.0 * AVG(CASE WHEN tempo_ate_atendimento_min <= $1 THEN 1 ELSE 0 END), 2) AS pct_dentro_sla,
          ROUND(AVG(tempo_ate_atendimento_min)::numeric, 2) AS mtta_min
        FROM v_chamados_analiticos
        WHERE ${w.sql}
      `,
      params,
      ctx: { range, days, thr },
    };
  }

  // Fallback: evolução semanal
  {
    const params: any[] = [];
    const w = whereTempoSQL("criado_em", range, days, params);
    return {
      kind: "trend_weekly",
      sql: `
        SELECT DATE_TRUNC('week', criado_em) AS semana, COUNT(*) AS chamados
        FROM v_chamados_analiticos
        WHERE ${w.sql}
        GROUP BY 1
        ORDER BY 1
      `,
      params,
      ctx: { range, days },
    };
  }
}

// ------------------------- summaries & sugestões --------------------
function sumCounts(rows: any[], field = "chamados") {
  return rows.reduce((acc, r) => acc + Number(r[field] ?? 0), 0);
}
function humanList(items: string[], max = 3) {
  const xs = items.slice(0, max);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} e ${xs[1]}`;
  return `${xs.slice(0, xs.length - 1).join(", ")} e ${xs.slice(-1)[0]}`;
}

function summarize(kind: RuleKind, rows: any[], ctx: any): string | undefined {
  if (!rows?.length) return "Sem resultados no período solicitado.";
  switch (kind) {
    case "top_machines": {
      const total = sumCounts(rows, "chamados");
      const tops = rows.slice(0, 3).map(r => `${r.maquina_nome} (${r.chamados})`);
      return `${rows[0].maquina_nome} lidera; top ${Math.min(3, rows.length)}: ${humanList(tops)}. Total no período: ${total}.`;
    }
    case "causes_by_machine": {
      const total = sumCounts(rows, "ocorrencias");
      const tops = rows.slice(0, 3).map(r => `${r.causa_nome ?? "—"} (${r.ocorrencias})`);
      return `Causas mais frequentes: ${humanList(tops)}. Total de ocorrências: ${total}.`;
    }
    case "causes_general": {
      const total = sumCounts(rows, "ocorrencias");
      const tops = rows.slice(0, 3).map(r => `${r.causa_nome ?? "—"} (${r.ocorrencias})`);
      return `Causas mais incidentes: ${humanList(tops)}. Total de ocorrências: ${total}.`;
    }
    case "mtta_by_machine":
    case "mtta_one": {
      if (kind === "mtta_one") {
        const m = rows[0];
        return `MTTA médio da ${ctx.machine}: ${m.mtta_min ?? "—"} min.`;
      }
      const tops = rows.slice(0, 3).map(r => `${r.maquina_nome} (${r.mtta_min} min)`);
      return `Menores MTTAs: ${humanList(tops)}.`;
    }
    case "mttr_by_machine":
    case "mttr_one": {
      if (kind === "mttr_one") {
        const m = rows[0];
        return `MTTR médio da ${ctx.machine}: ${m.mttr_min ?? "—"} min.`;
      }
      const tops = rows.slice(0, 3).map(r => `${r.maquina_nome} (${r.mttr_min} min)`);
      return `Menores MTTRs: ${humanList(tops)}.`;
    }
    case "status_count": {
      const tops = rows.slice(0, 3).map(r => `${r.status} (${r.quantidade})`);
      return `Distribuição por status: ${humanList(tops)}.`;
    }
    case "recent_calls_by_machine": {
      return ctx.machine
        ? `Chamados mais recentes da ${ctx.machine} (até ${ctx.topN}).`
        : `Chamados mais recentes (até ${ctx.topN}).`;
    }
    case "top_manutentores": {
      const tops = rows.slice(0, 3).map(r => `${r.nome} (${r.chamados_atendidos})`);
      return `Técnicos que mais atenderam: ${humanList(tops)}.`;
    }
    case "count_manutentores": {
      return `Total de manutentores (com atendimentos no período): ${rows?.[0]?.manutentores ?? 0}.`;
    }
    case "list_manutentores": {
      return `Manutentores com atendimentos no período: ${rows.length}.`;
    }
    case "sla_atendimento": {
      const r = rows[0];
      return `SLA (≤ ${ctx.thr} min): ${r.pct_dentro_sla}% dentro, MTTA médio ${r.mtta_min} min.`;
    }
    default:
      return undefined;
  }
}

function suggest(kind: RuleKind, rows: any[], ctx: any): string[] {
  const out: string[] = [];
  if (kind === "top_machines" && rows?.[0]?.maquina_nome) {
    const m = rows[0].maquina_nome;
    out.push(
      `Quais as principais causas da ${m} nos últimos 90 dias?`,
      `MTTA da ${m} nos últimos 90 dias`,
      `MTTR da ${m} nos últimos 90 dias`,
      `/fts vazament`
    );
  } else if (kind === "causes_by_machine" && ctx?.machine) {
    out.push(
      `Linha de tempo semanal dos chamados nos últimos 90 dias`,
      `MTTR da ${ctx.machine} nos últimos 90 dias`,
      `/fts ${ctx.machine}`
    );
  } else if (kind === "recent_calls_by_machine" && ctx?.machine) {
    out.push(
      `Quais as principais causas da ${ctx.machine} nos últimos 90 dias?`,
      `MTTA da ${ctx.machine} nos últimos 90 dias`
    );
  } else if (kind === "top_manutentores") {
    out.push(
      `MTTA por máquina nos últimos 90 dias`,
      `MTTR por máquina nos últimos 90 dias`,
      `Status dos chamados no período`
    );
  } else {
    out.push(
      `As 5 máquinas com mais chamados`,
      `Principais causas por máquina nos últimos 120 dias`,
      `MTTA por máquina nos últimos 90 dias`,
      `MTTR por máquina nos últimos 90 dias`,
      `/fts vazament`
    );
  }
  return out;
}

// ------------------------- coerce numéricos -------------------------
function coerceRow(r: any) {
  const out: any = { ...r };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
      const n = Number(v);
      if (!Number.isNaN(n)) out[k] = n;
    }
  }
  return out;
}

// ===================================================================
// Rotas
// ===================================================================

// Usuário com permissão de analytics
botRouter.post("/ai/chat/sql", requireAnyPermission(['analise_falhas', 'causas_raiz'], 'ver'), async (req: Request, res: Response) => {
  try {
    const question = String(req.body?.question ?? "").trim();
    const noCache = Boolean(req.body?.noCache);
    if (!question) return res.status(400).json({ error: "question é obrigatório" });

    const { kind, sql, params, ctx } = ruleBasedSql(question);

    const key = cacheKey(sql, params);
    if (!noCache && cache.has(key)) {
      const c = cache.get(key)!;
      if (Date.now() - c.ts < CACHE_TTL_MS) {
        return res.json({
          sql,
          rows: c.rows,
          fields: c.fields,
          source: "rules+cache",
          summary: c.summary,
          suggestions: c.suggestions,
        });
      }
      cache.delete(key);
    }

    const t0 = Date.now();
    const result = await pool.query(sql, params);
    const ms = Date.now() - t0;

    const fields = result.fields.map(f => f.name);
    const rows = result.rows.map(coerceRow);

    const summary = summarize(kind, rows, ctx);
    const suggestions = suggest(kind, rows, ctx);

    cache.set(key, { rows, fields, ts: Date.now(), summary, suggestions });

    res.json({ sql, rows, fields, source: "rules", ms, summary, suggestions });
  } catch (e: any) {
    console.error("[ERROR /ai/chat/sql]", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// FTS nas observações (requer analytics)
botRouter.post("/ai/chat/text", requireAnyPermission(['analise_falhas', 'causas_raiz'], 'ver'), async (req: Request, res: Response) => {
  try {
    const q = String((req.body?.q ?? "")).trim();
    const limit = Math.min(Number(req.body?.limit ?? 20) || 20, 100);
    if (!q) return res.status(400).json({ error: "q é obrigatório" });

    const sql = `
      SELECT id,
             ts_rank_cd(fts_obs, plainto_tsquery('portuguese',$1)) AS rank
      FROM chamados
      WHERE fts_obs @@ plainto_tsquery('portuguese',$1)
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    const t0 = Date.now();
    const result = await pool.query(sql, [q]);
    const ms = Date.now() - t0;

    res.json({ sql, rows: result.rows, ms });
  } catch (e: any) {
    console.error("[ERROR /ai/chat/text]", e);
    if (String(e).includes('column "fts_obs" does not exist')) {
      return res.status(500).json({
        error: "FTS indisponível: coluna fts_obs não existe em chamados. Rode o script de criação do FTS antes.",
      });
    }
    res.status(500).json({ error: String(e?.message || e) });
  }
});
