// src/services/apiClient.ts
// Cliente API tipado para frontend

import type {
    AuthParams,
    Chamado,
    ChamadoCreate,
    ListaChamadosParams,
    ListaChamadosResponse,
    Maquina,
    MaquinaCreate,
    Agendamento,
    AgendamentoCreate,
    AgendamentoUpdate,
    Usuario,
    UsuarioCreate,
    Peca,
    PecaCreate,
    Movimentacao,
    Causa,
    Submissao,
    SubmissaoDiariaCreate,
    ChecklistDiarioItem,
    Foto,
    ParetoResponse,
    AiChatSqlResponse,
    AiTextSearchResponse,
    LoginPayload,
    LoginResponse,
    ChangePasswordPayload,
    SSEMessage,
    SSEHandlers,
    ConcluirChamadoPayload,
    LogisticaKpi,
    LogisticaMeta,
    LogisticaDashboardData,
} from '../types/api';

// ===== BASE =====
export const BASE = (
    import.meta.env?.VITE_API_URL ||
    import.meta.env?.VITE_API_BASE ||
    "http://localhost:3000"
).replace(/\/+$/, "");

// Tenta descobrir o e-mail salvo pelo app
function getLoggedUserEmail(): string {
    try {
        const raw = localStorage.getItem('usuario');
        if (!raw) return '';
        const obj = JSON.parse(raw);
        const email =
            obj?.email ||
            obj?.user?.email ||
            obj?.perfil?.email ||
            obj?.current?.email;
        return email ? String(email).trim().toLowerCase() : '';
    } catch { }
    return '';
}

function getDevEmail(): string {
    try {
        return (localStorage.getItem('devEmail') || '').trim().toLowerCase();
    } catch { }
    return '';
}

function buildAuthHeaders(auth: AuthParams = {}): Record<string, string> {
    const h: Record<string, string> = { 'Accept': 'application/json' };
    const email = String(
        auth?.email ||
        getDevEmail() ||
        getLoggedUserEmail() ||
        ''
    ).trim().toLowerCase();

    if (email) h['x-user-email'] = email;
    if (auth?.role) h['x-user-role'] = String(auth.role).trim().toLowerCase();

    return h;
}

// ===== HTTP base (fetch) =====
function toQuery(params: Record<string, unknown> = {}): string {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        usp.append(k, String(v));
    });
    const s = usp.toString();
    return s ? `?${s}` : "";
}

interface ApiFetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    auth?: AuthParams;
}

async function apiFetch<T = unknown>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
    const { method = "GET", headers = {}, body, auth } = opts;
    const url = `${BASE}${path}`;
    const h: Record<string, string> = { ...buildAuthHeaders(auth), ...headers };
    const init: RequestInit = { method, headers: h };

    if (body !== undefined) {
        if (!("Content-Type" in h)) h["Content-Type"] = "application/json";
        init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    init.signal = ctrl.signal;

    let res: Response;
    try {
        res = await fetch(url, init);
    } finally {
        clearTimeout(t);
    }

    const ct = String(res.headers.get("content-type") || "");
    const isJson = ct.includes("application/json");
    const payload = isJson ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
        const msg = isJson ? (payload?.error || payload?.message || res.statusText) : res.statusText;
        throw new Error(msg || `HTTP ${res.status}`);
    }
    return payload as T;
}

// GET/POST/PUT/DELETE helpers
export const http = {
    get: <T = unknown>(path: string, opts: { params?: Record<string, unknown>; auth?: AuthParams } = {}): Promise<T> =>
        apiFetch<T>(`${path}${toQuery(opts.params)}`, { auth: opts.auth }),
    post: <T = unknown>(path: string, opts: { data?: unknown; auth?: AuthParams } = {}): Promise<T> =>
        apiFetch<T>(path, { method: "POST", body: opts.data, auth: opts.auth }),
    put: <T = unknown>(path: string, opts: { data?: unknown; auth?: AuthParams } = {}): Promise<T> =>
        apiFetch<T>(path, { method: "PUT", body: opts.data, auth: opts.auth }),
    delete: <T = unknown>(path: string, opts: { data?: unknown; auth?: AuthParams } = {}): Promise<T> =>
        apiFetch<T>(path, { method: "DELETE", body: opts.data, auth: opts.auth }),
};

// ===== CHAMADOS =====
export async function criarChamado(data: ChamadoCreate, auth: AuthParams = {}): Promise<Chamado> {
    if (!data.maquinaId && !data.maquinaTag && !data.maquinaNome) {
        throw new Error('Informe maquinaId, maquinaTag ou maquinaNome.');
    }

    const body: Record<string, unknown> = {
        descricao: String(data.descricao || '').trim(),
        tipo: String(data.tipo || 'corretiva'),
    };

    if (data.maquinaId) body.maquinaId = String(data.maquinaId);
    if (data.maquinaTag) body.maquinaTag = String(data.maquinaTag).trim();
    if (data.maquinaNome) body.maquinaNome = String(data.maquinaNome).trim();
    if (data.manutentorEmail) body.manutentorEmail = String(data.manutentorEmail).trim().toLowerCase();
    if (data.checklistItemKey) body.checklistItemKey = String(data.checklistItemKey).trim();
    if (data.item) body.item = String(data.item).trim();

    const res = await fetch(`${BASE}/chamados`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders({ role: auth.role || 'operador', email: auth.email }),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result?.error || `Falha ao criar chamado (${res.status})`);
    return result as Chamado;
}

export async function listarChamadosPorCriador(email: string, page = 1, pageSize = 50): Promise<ListaChamadosResponse> {
    const res = await fetch(
        `${BASE}/chamados?criadoPorEmail=${encodeURIComponent(email)}&page=${page}&pageSize=${pageSize}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Erro ao listar chamados (${res.status})`);
    return data as ListaChamadosResponse;
}

export async function listarChamados(params: ListaChamadosParams = {}): Promise<ListaChamadosResponse> {
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue;
        if (v instanceof Date) {
            p[k] = v.toISOString();
        } else {
            p[k] = String(v);
        }
    }

    const u = new URL(`${BASE}/chamados`);
    Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));

    const res = await fetch(u.toString());
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : { error: await res.text() };
    if (!res.ok) throw new Error(data?.error || `Erro ao listar chamados (${res.status})`);

    const items: Chamado[] = Array.isArray(data) ? data
        : Array.isArray(data?.items) ? data.items
            : [];

    const total = typeof data?.total === 'number' ? data.total : items.length;
    const page = Number(data?.page ?? 1);
    const pageSize = Number(data?.pageSize ?? items.length);
    const hasNext = Boolean(
        typeof data?.hasNext === 'boolean' ? data.hasNext : (page * pageSize < total)
    );

    return { items, total, page, pageSize, hasNext };
}

export async function getChamado(id: string, auth: AuthParams = {}): Promise<Chamado> {
    return apiFetch<Chamado>(`/chamados/${id}`, { auth });
}

export async function listarChamadosPorMaquina(maquinaId: string, opts: { status?: string } = {}): Promise<Chamado[]> {
    const u = new URL(`${BASE}/chamados`);
    u.searchParams.set('maquinaId', maquinaId);
    if (opts.status) u.searchParams.set('status', opts.status);
    const r = await fetch(u);
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'Falha ao listar chamados');
    return j.items || j;
}

export async function atribuirChamado(id: string, auth: AuthParams & { manutentorEmail: string }): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}/atribuir`, {
        method: "POST",
        headers: {
            ...buildAuthHeaders(auth),
            "Content-Type": "application/json",
            // override if specific email passed in body is different (not for auth header though)
        },
        body: JSON.stringify({ manutentorEmail: auth.manutentorEmail })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao atribuir (${res.status})`);
    return data;
}

export async function removerAtribuicao(id: string, auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/chamados/${id}/atribuir`, {
        method: 'DELETE',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json'
        },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Erro ao remover atribuição (${r.status})`);
    return data;
}

export async function assumirChamado(id: string, auth: AuthParams = {}): Promise<unknown> {
    return http.post(`/chamados/${id}/assumir`, { data: {}, auth });
}

export async function atualizarStatusChamado(id: string, status: string, auth: AuthParams = {}): Promise<unknown> {
    return http.post(`/chamados/${id}/status`, { data: { status }, auth });
}

export async function atenderChamado(id: string, auth: AuthParams = {}): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}/atender`, {
        method: "POST",
        headers: {
            ...buildAuthHeaders({ ...auth, role: auth.role || "manutentor" }),
            "Content-Type": "application/json",
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao atender (${res.status})`);
    return data;
}

export async function adicionarObservacao(id: string, opts: { texto: string } & AuthParams): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}/observacoes`, {
        method: "POST",
        headers: {
            ...buildAuthHeaders({ role: opts.role, email: opts.email }),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ texto: opts.texto })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao salvar observação (${res.status})`);
    return data;
}

export async function concluirChamado(id: string, payload: ConcluirChamadoPayload, auth: AuthParams): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}/concluir`, {
        method: "POST",
        headers: {
            ...buildAuthHeaders(auth),
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao concluir (${res.status})`);
    return data;
}

export async function deletarChamado(id: string, auth: AuthParams): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}`, {
        method: "DELETE",
        headers: buildAuthHeaders(auth)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao excluir (${res.status})`);
    return data;
}



// ===== FOTOS =====
export async function listarFotosChamado(id: string, auth: AuthParams = {}): Promise<Foto[]> {
    const res = await fetch(`${BASE}/chamados/${encodeURIComponent(id)}/fotos`, {
        headers: buildAuthHeaders(auth),
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json")
        ? await res.json().catch(() => [])
        : { error: await res.text().catch(() => "") };

    if (!res.ok) {
        throw new Error(data?.error || `Erro ao listar fotos do chamado (${res.status})`);
    }

    return Array.isArray(data) ? data : data.items || [];
}

export async function uploadFotoChamado(id: string, file: File | Blob, auth: AuthParams = {}): Promise<Foto> {
    if (!file) {
        throw new Error("Arquivo é obrigatório");
    }

    const formData = new FormData();
    formData.append("file", file);

    const headers = buildAuthHeaders(auth);
    delete headers["Content-Type"];

    const res = await fetch(`${BASE}/chamados/${encodeURIComponent(id)}/fotos`, {
        method: "POST",
        headers,
        body: formData,
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json")
        ? await res.json().catch(() => ({}))
        : { error: await res.text().catch(() => "") };

    if (!res.ok) {
        throw new Error(data?.error || `Erro ao enviar foto do chamado (${res.status})`);
    }

    return data as Foto;
}

// ===== MÁQUINAS =====
export async function getMaquinas(q = "", escopo?: 'manutencao' | 'producao'): Promise<Maquina[]> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (escopo) params.set('escopo', escopo);
    const qs = params.toString();
    const url = qs ? `${BASE}/maquinas?${qs}` : `${BASE}/maquinas`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro ao buscar máquinas: ${res.status}`);
    return res.json();
}

export async function listarMaquinas(params: Record<string, unknown> = {}): Promise<Maquina[]> {
    const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])
    ).toString();

    const res = await fetch(`${BASE}/maquinas${qs ? `?${qs}` : ''}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data?.error || `Erro ao listar máquinas (${res.status})`);
    }
    return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function getMaquina(id: string): Promise<Maquina> {
    const res = await fetch(`${BASE}/maquinas/${id}`);
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };
    if (!res.ok) throw new Error(data?.error || `Erro ao buscar máquina (${res.status})`);
    return data as Maquina;
}

export async function obterMaquina(id: string): Promise<Maquina> {
    const r = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Erro ao obter máquina (${r.status})`);
    return data as Maquina;
}

export async function criarMaquina(data: MaquinaCreate, auth: AuthParams = {}): Promise<Maquina> {
    return http.post<Maquina>(`/maquinas`, {
        data: {
            nome: data.nome,
            tag: data.tag ?? data.nome,
            setor: data.setor ?? null,
            critico: !!data.critico,
            parentId: data.parentId || null,
            isMaquinaMae: !!data.isMaquinaMae,
            exibirFilhosDashboard: !!data.exibirFilhosDashboard,
            escopoManutencao: data.escopoManutencao,
            escopoProducao: data.escopoProducao,
            escopoPlanejamento: data.escopoPlanejamento
        },
        auth,
    });
}

export async function deletarMaquina(id: string, auth: AuthParams = {}): Promise<boolean | unknown> {
    const headers = buildAuthHeaders(auth);

    if (!headers['x-user-email']) {
        const err = new Error('LOGIN_REQUIRED') as Error & { status?: number };
        err.status = 401;
        throw err;
    }

    const res = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
    });

    if (res.status === 204) return true;

    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json')
        ? await res.json().catch(() => ({}))
        : await res.text().catch(() => '');

    if (!res.ok) {
        const err = new Error(
            data?.error || (typeof data === 'string' ? data : `Erro ao excluir máquina (${res.status})`)
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
    }
    return data || true;
}

export async function renomearMaquina(id: string, data: { nome: string; syncTag?: boolean }, auth: AuthParams = {}): Promise<Maquina> {
    const res = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}/nome`, {
        method: 'PATCH',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nome: data.nome, syncTag: data.syncTag ?? true }),
    });

    const ct = res.headers.get('content-type') || '';
    const result = ct.includes('application/json')
        ? await res.json().catch(() => ({}))
        : await res.text().catch(() => '');

    if (!res.ok) {
        const err = new Error(
            result?.error || (typeof result === 'string' ? result : `Erro ao renomear máquina (${res.status})`)
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
    }
    return result as Maquina;
}

// Atualizar máquina mãe
export async function atualizarMaquinaPai(
    id: string,
    parentId: string | null,
    auth: AuthParams = {}
): Promise<{ id: string; nome: string; parent_maquina_id?: string }> {
    const res = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}/parent`, {
        method: 'PATCH',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parentId }),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(result?.error || 'Erro ao atualizar máquina mãe');
    }
    return result;
}

// Atualizar aliases de produção de uma máquina
export async function atualizarAliasesProducao(
    id: string,
    aliases: string[],
    auth: AuthParams = {}
): Promise<{ id: string; nome: string; aliases_producao: string[] }> {
    const res = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}/aliases-producao`, {
        method: 'PATCH',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aliases }),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(result?.error || 'Erro ao atualizar aliases');
    }
    return result;
}

// ===== CHECKLIST DIÁRIO =====
export async function addChecklistItem(maquinaId: string, item: string, auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/maquinas/${maquinaId}/checklist-add`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao adicionar item');
    return j;
}

export async function removeChecklistItem(maquinaId: string, item: string, auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/maquinas/${maquinaId}/checklist-remove`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao remover item');
    return j;
}

export async function getChecklistDiario(maquinaId: string): Promise<ChecklistDiarioItem[]> {
    const r = await fetch(`${BASE}/maquinas/${maquinaId}/checklist-diario`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Erro ao buscar checklist diário (${r.status})`);
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
    return items;
}

export async function reorderChecklistItems(maquinaId: string, items: string[], auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/maquinas/${maquinaId}/checklist-reorder`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao reordenar itens');
    return j;
}

export async function enviarChecklistDiaria(data: SubmissaoDiariaCreate): Promise<unknown> {
    const res = await fetch(`${BASE}/checklists/daily/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'operador',
            'x-user-email': data.operadorEmail || '',
        },
        body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result?.error || `Falha ao enviar checklist diário (${res.status})`);
    return result;
}

export async function listarSubmissoesDiarias(params: { operadorEmail?: string; date?: string; maquinaId?: string; turno?: string }): Promise<Submissao[]> {
    const qs = new URLSearchParams();
    if (params.operadorEmail) qs.set('operadorEmail', params.operadorEmail);
    if (params.date) qs.set('date', params.date);
    if (params.maquinaId) qs.set('maquinaId', params.maquinaId);
    if (params.turno) qs.set('turno', params.turno);

    const r = await fetch(`${BASE}/checklists/daily/submissoes?${qs.toString()}`);
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
        throw new Error(data?.error || `Erro ao listar submissões diárias (${r.status})`);
    }
    return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function registrarSubmissaoDiaria(data: SubmissaoDiariaCreate): Promise<unknown> {
    const r = await fetch(`${BASE}/checklists/daily/submissoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(result?.error || `Erro ao registrar submissão (${r.status})`);
    return result;
}

export interface ChecklistOverviewRangeItem {
    id: string; // machine id
    nome: string;
    hasChecklist: boolean;
    days: Array<{
        date: string; // YYYY-MM-DD
        t1Ok: boolean;
        t2Ok: boolean;
    }>;
}

export async function getChecklistOverviewRange(start: string, end: string): Promise<ChecklistOverviewRangeItem[]> {
    const r = await http.get<{ items: ChecklistOverviewRangeItem[] }>(`/checklists/overview/range`, { params: { start, end } });
    return r.items || [];
}

export interface ChecklistOverviewItem {
    id: string; // machine id
    nome: string;
    hasChecklist: boolean;
    turno1Ok: boolean;
    turno2Ok: boolean;
    turno1Nomes: string[];
    turno2Nomes: string[];
    lastSubmissionAt: string | null;
}

export async function getChecklistOverview(date: string): Promise<ChecklistOverviewItem[]> {
    const r = await http.get<{ items: ChecklistOverviewItem[] }>(`/checklists/overview`, { params: { date } });
    return r.items || [];
}

// ===== AGENDAMENTOS =====
export async function listarAgendamentos(params: Record<string, unknown> = {}): Promise<Agendamento[]> {
    const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])
    ).toString();
    const res = await fetch(`${BASE}/agendamentos?${qs}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Erro ao listar agendamentos (${res.status})`);
    return data;
}

export async function criarAgendamento(data: AgendamentoCreate, auth: AuthParams = {}): Promise<Agendamento> {
    return http.post<Agendamento>(`/agendamentos`, { data, auth });
}

export async function atualizarAgendamento(id: string, data: AgendamentoUpdate, auth: AuthParams = {}): Promise<Agendamento> {
    return apiFetch<Agendamento>(`/agendamentos/${id}`, {
        method: "PATCH",
        body: data,
        auth,
    });
}

export async function excluirAgendamento(id: string, auth: AuthParams = {}): Promise<unknown> {
    return apiFetch(`/agendamentos/${id}`, {
        method: "DELETE",
        auth,
    });
}

export async function iniciarAgendamento(id: string, auth: AuthParams): Promise<{ ok: boolean; chamadoId?: string }> {
    const res = await fetch(`${BASE}/agendamentos/${id}/iniciar`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-user-role": auth.role || "manutentor",
            "x-user-email": auth.email || auth.criadoPorEmail || ""
        },
        body: JSON.stringify({ criadoPorEmail: auth.criadoPorEmail || auth.email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Erro ao iniciar (${res.status})`);
    return data;
}

// ===== USUÁRIOS =====
export async function listarUsuarios(opts: { role?: string } = {}, auth: AuthParams = {}): Promise<Usuario[]> {
    const data = await http.get<{ items?: Usuario[] } | Usuario[]>(`/usuarios`, { params: opts, auth });
    return Array.isArray((data as { items?: Usuario[] })?.items) ? (data as { items: Usuario[] }).items : (data as Usuario[]);
}

export async function listarManutentores(auth: AuthParams = {}): Promise<Usuario[]> {
    // Inclui tanto manutentores quanto líderes de manutenção
    const roles = encodeURIComponent('manutentor,Líder de Manutenção');
    const res = await fetch(`${BASE}/usuarios?roles=${roles}`, {
        headers: buildAuthHeaders({ ...auth, role: auth.role || 'gestor industrial' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao listar manutentores (${res.status})`);
    return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function criarUsuario(data: UsuarioCreate, auth: AuthParams = {}): Promise<Usuario> {
    const r = await fetch(`${BASE}/usuarios`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json?.error || `Falha ao criar usuário (${r.status})`);
    return json as Usuario;
}

export async function atualizarUsuario(id: string, data: Partial<UsuarioCreate>, auth: AuthParams = {}): Promise<Usuario> {
    const r = await fetch(`${BASE}/usuarios/${id}`, {
        method: 'PUT',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json?.error || `Falha ao atualizar usuário (${r.status})`);
    return json as Usuario;
}

export async function excluirUsuario(id: string, auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/usuarios/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(auth)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao excluir usuário');
    return j;
}

export interface EstatisticasUsuario {
    role: string;
    usuario: { id: string; nome: string; role: string; matricula?: string };
    estatisticas: {
        // Operador
        checklistsTotal?: number;
        checklistsMes?: number;
        chamadosAbertos?: number;
        itensProblema?: number;
        // Manutentor
        chamadosAtribuidos?: number;
        emAndamento?: number;
        concluidos?: number;
        concluidosMes?: number;
        tempoMedioHoras?: string;
    };
}

export async function obterEstatisticasUsuario(id: string, auth: AuthParams = {}): Promise<EstatisticasUsuario> {
    const r = await fetch(`${BASE}/usuarios/${id}/estatisticas`, {
        headers: buildAuthHeaders({ ...auth, role: auth.role || 'gestor' })
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json?.error || `Falha ao obter estatísticas (${r.status})`);
    return json as EstatisticasUsuario;
}

// ===== PEÇAS / ESTOQUE =====
export async function listarPecas(): Promise<Peca[]> {
    const r = await fetch(`${BASE}/pecas`);
    const ct = r.headers.get('content-type') || '';
    const j = ct.includes('application/json') ? await r.json() : { error: await r.text() };
    if (!r.ok) throw new Error(j?.error || 'Falha ao listar peças');
    return j.items || j;
}

export async function criarPeca(payload: PecaCreate, auth: AuthParams): Promise<Peca> {
    const r = await fetch(`${BASE}/pecas`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao criar peça');
    return j as Peca;
}

export async function atualizarPeca(id: string, payload: Partial<PecaCreate>, auth: AuthParams): Promise<Peca> {
    const r = await fetch(`${BASE}/pecas/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao atualizar peça');
    return j as Peca;
}

export async function excluirPeca(id: string, auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/pecas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(auth),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao excluir peça');
    return j;
}

export async function registrarMovimentacao(pecaId: string, mov: Movimentacao, auth: AuthParams = {}): Promise<unknown> {
    const r = await fetch(`${BASE}/pecas/${encodeURIComponent(pecaId)}/movimentacoes`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(mov)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Falha ao registrar movimentação (${r.status})`);
    return data;
}

// Tipo para movimentação no histórico
export interface MovimentacaoHistorico {
    id: string;
    pecaId: string;
    pecaCodigo: string;
    pecaNome: string;
    tipo: 'entrada' | 'saida';
    quantidade: number;
    descricao: string | null;
    usuarioEmail: string | null;
    usuarioNome: string | null;
    criadoEm: string;
    estoqueApos: number | null;
}

// Listar histórico de movimentações
export async function listarMovimentacoes(params: {
    pecaId?: string;
    tipo?: 'entrada' | 'saida';
    dataInicio?: string;
    dataFim?: string;
    limit?: number;
} = {}): Promise<MovimentacaoHistorico[]> {
    const qs = new URLSearchParams();
    if (params.pecaId) qs.set('pecaId', params.pecaId);
    if (params.tipo) qs.set('tipo', params.tipo);
    if (params.dataInicio) qs.set('dataInicio', params.dataInicio);
    if (params.dataFim) qs.set('dataFim', params.dataFim);
    if (params.limit) qs.set('limit', String(params.limit));

    const r = await fetch(`${BASE}/movimentacoes?${qs.toString()}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Falha ao listar movimentações (${r.status})`);
    return data.items || [];
}

// ===== CAUSAS =====
export async function listarCausas(): Promise<Causa[]> {
    const r = await fetch(`${BASE}/causas`);
    const ct = r.headers.get('content-type') || '';
    const j = ct.includes('application/json') ? await r.json() : { error: await r.text() };
    if (!r.ok) throw new Error(j?.error || `Falha ao listar causas (${r.status})`);
    return j.items ?? j;
}

export async function listarCausasRaiz(): Promise<Causa[]> {
    return listarCausas();
}

export async function criarCausa(payload: { nome: string }, auth: AuthParams): Promise<Causa> {
    const r = await fetch(`${BASE}/causas`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || ''
        },
        body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao criar causa');
    return j as Causa;
}

export async function excluirCausa(id: string, auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/causas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || ''
        }
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao excluir causa');
    return j;
}

// ===== ANALYTICS =====
export async function listarParetoCausas(params: { from?: string; to?: string; maquinaId?: string } = {}, auth?: AuthParams): Promise<ParetoResponse> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.maquinaId) qs.set("maquinaId", params.maquinaId);

    const url = `${BASE}/analytics/pareto-causas${qs.toString() ? `?${qs}` : ""}`;
    const res = await fetch(url, { headers: buildAuthHeaders(auth) });

    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Falha ao listar pareto (HTTP ${res.status})`);
    }
    return res.json();
}

// ===== AI =====
export async function aiChatSql(opts: { question: string; noCache?: boolean }, auth: AuthParams = {}): Promise<AiChatSqlResponse> {
    if (!opts.question || !String(opts.question).trim()) {
        throw new Error('question é obrigatório');
    }

    const res = await fetch(`${BASE}/ai/chat/sql`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question: opts.question, noCache: !!opts.noCache })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao executar SQL (${res.status})`);
    return data as AiChatSqlResponse;
}

export async function aiTextSearch(opts: { q: string; limit?: number }, auth: AuthParams = {}): Promise<AiTextSearchResponse> {
    if (!opts.q || !String(opts.q).trim()) {
        throw new Error('q é obrigatório');
    }

    const res = await fetch(`${BASE}/ai/chat/text`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: opts.q, limit: opts.limit ?? 20 })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro no FTS (${res.status})`);
    return data as AiTextSearchResponse;
}

// ===== CHECKLIST PREVENTIVA =====
export async function enviarChecklistPreventiva(chamadoId: string, data: { respostas: Record<string, unknown> }): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${chamadoId}/checklist/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    const ct = res.headers.get("content-type") || "";
    const result = ct.includes("application/json") ? await res.json() : { error: await res.text() };
    if (!res.ok) throw new Error(result?.error || `Erro ao enviar checklist (${res.status})`);
    return result;
}

export async function atualizarChecklistChamado(id: string, checklist: unknown, auth: AuthParams = {}): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}/checklist`, {
        method: 'PATCH',
        headers: {
            ...buildAuthHeaders({ role: auth.role || "manutentor", email: auth.email }),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            checklist,
            userEmail: auth.email || getLoggedUserEmail() || ""
        }),
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : { error: await res.text() };
    if (!res.ok) throw new Error(data?.error || `Erro ao salvar checklist (${res.status})`);
    return data;
}

// ===== AUTH =====
export async function login(payload: LoginPayload): Promise<LoginResponse> {
    const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: payload.userOrEmail, senha: payload.senha })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Falha no login (${r.status})`);
    return data as LoginResponse;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<{ ok: boolean }> {
    const r = await fetch(`${BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-email': payload.email || ''
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Falha ao alterar senha (${r.status})`);
    return data as { ok: boolean };
}

// ===== OPERATOR AUTH =====
export interface OperadorListItem {
    id: string;
    nome: string;
}

export async function listarOperadoresAtivos(): Promise<OperadorListItem[]> {
    const r = await fetch(`${BASE}/operators/active`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Falha ao listar operadores (${r.status})`);
    return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function loginOperador(operadorId: string, matricula: string): Promise<LoginResponse> {
    const r = await fetch(`${BASE}/auth/operator-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operadorId, matricula })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Falha no login de operador (${r.status})`);
    return data as LoginResponse;
}

// ===== SSE =====
export function connectSSE(handlers: SSEHandlers = {}): () => void {
    const es = new EventSource(`${BASE}/events`);
    es.addEventListener('hello', e => handlers.hello?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('chamados', e => handlers.chamados?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('agendamentos', e => handlers.agendamentos?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('checklist', e => handlers.checklist?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('pecas', e => handlers.pecas?.(JSON.parse((e as MessageEvent).data)));
    es.onerror = (err) => handlers.onError?.(err);
    es.onopen = () => handlers.onOpen?.();
    return () => es.close();
}

export function subscribeSSE(onEvent: (msg: SSEMessage) => void, opts: { email?: string } = {}): () => void {
    const qs = new URLSearchParams();
    if (opts.email) qs.set('email', opts.email);

    const url = `${BASE}/events${qs.toString() ? `?${qs}` : ''}`;

    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
        console.warn('EventSource não disponível; subscribeSSE será no-op.');
        return () => { };
    }

    const es = new EventSource(url, { withCredentials: false });

    es.onmessage = (ev) => {
        if (!ev?.data) return;
        try {
            const data = JSON.parse(ev.data);
            if (typeof onEvent === 'function') onEvent(data);
        } catch {
            if (typeof onEvent === 'function') onEvent({ raw: ev.data });
        }
    };

    es.onerror = (err) => {
        console.warn('SSE error', err);
    };

    return () => {
        try { es.close(); } catch { }
    };
}

// ===== PRODUÇÃO =====
export interface ProducaoMeta {
    id: string;
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    dataInicio: string;
    dataFim?: string;
    horasMeta: number;
    criadoEm: string;
    atualizadoEm: string;
}

export interface ProducaoLancamento {
    id: string;
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    dataRef: string;
    turno?: '1º' | '2º';
    horasRealizadas: number;
    observacao?: string;
    lancadoPorNome?: string;
    uploadId?: string;
    criadoEm: string;
}

export interface ProducaoRendimento {
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    maquinaSetor?: string;
    dataRef: string;
    turno?: string;
    horasRealizadas: number;
    horasMeta: number;
    percentualAtingido?: number;
    statusMeta: 'sem_meta' | 'atingido' | 'parcial' | 'abaixo';
    lancadoPorNome?: string;
    criadoEm: string;
}

export interface ProducaoResumoDiario {
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    dataRef: string;
    horasDia: number;
    metaDia: number;
    percentualDia?: number;
    qtdLancamentos: number;
    ultimaAtualizacaoEm?: string; // Timestamp da última atualização real das horas (lógica de justiça)
}

export interface ProducaoUpload {
    id: string;
    nomeArquivo: string;
    dataRef: string;
    linhasTotal: number;
    linhasSucesso: number;
    linhasErro: number;
    horasTotal: number;
    ativo: boolean;
    uploadPorNome?: string;
    criadoEm: string;
}

// Metas
export async function listarMetasProducao(params: { maquinaId?: string; vigente?: boolean } = {}): Promise<ProducaoMeta[]> {
    const qs = new URLSearchParams();
    if (params.maquinaId) qs.set('maquinaId', params.maquinaId);
    if (params.vigente) qs.set('vigente', 'true');
    const r = await fetch(`${BASE}/producao/metas?${qs}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar metas');
    return data.items || [];
}

export async function criarMetaProducao(payload: { maquinaId: string; dataInicio: string; dataFim?: string; horasMeta: number }, auth: AuthParams): Promise<ProducaoMeta> {
    const r = await fetch(`${BASE}/producao/metas`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao criar meta');
    return data;
}

export async function atualizarMetaProducao(id: string, payload: { dataInicio: string; dataFim?: string; horasMeta: number }, auth: AuthParams): Promise<{ ok: boolean }> {
    const r = await fetch(`${BASE}/producao/metas/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao atualizar meta');
    return data;
}

export async function excluirMetaProducao(id: string, auth: AuthParams): Promise<{ ok: boolean }> {
    const r = await fetch(`${BASE}/producao/metas/${id}`, {
        method: 'DELETE',
        headers: {
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao excluir meta');
    return data;
}

// Lançamentos
export async function listarLancamentosProducao(params: { maquinaId?: string; dataRef?: string; dataInicio?: string; dataFim?: string } = {}): Promise<ProducaoLancamento[]> {
    const qs = new URLSearchParams();
    if (params.maquinaId) qs.set('maquinaId', params.maquinaId);
    if (params.dataRef) qs.set('dataRef', params.dataRef);
    if (params.dataInicio) qs.set('dataInicio', params.dataInicio);
    if (params.dataFim) qs.set('dataFim', params.dataFim);
    const r = await fetch(`${BASE}/producao/lancamentos?${qs}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar lançamentos');
    return data.items || [];
}

export async function criarLancamentoProducao(payload: { maquinaId: string; dataRef: string; turno?: string; horasRealizadas: number; observacao?: string }, auth: AuthParams): Promise<ProducaoLancamento> {
    const r = await fetch(`${BASE}/producao/lancamentos`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao criar lançamento');
    return data;
}

export async function excluirLancamentoProducao(id: string, auth: AuthParams): Promise<{ ok: boolean }> {
    const r = await fetch(`${BASE}/producao/lancamentos/${id}`, {
        method: 'DELETE',
        headers: {
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao excluir lançamento');
    return data;
}

// Rendimento
export async function listarRendimentoProducao(params: { maquinaId?: string; dataInicio?: string; dataFim?: string } = {}): Promise<ProducaoRendimento[]> {
    const qs = new URLSearchParams();
    if (params.maquinaId) qs.set('maquinaId', params.maquinaId);
    if (params.dataInicio) qs.set('dataInicio', params.dataInicio);
    if (params.dataFim) qs.set('dataFim', params.dataFim);
    const r = await fetch(`${BASE}/producao/rendimento?${qs}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar rendimento');
    return data.items || [];
}

export async function listarResumoDiarioProducao(params: { dataRef?: string; dataInicio?: string; dataFim?: string } = {}): Promise<ProducaoResumoDiario[]> {
    const qs = new URLSearchParams();
    if (params.dataRef) qs.set('dataRef', params.dataRef);
    if (params.dataInicio) qs.set('dataInicio', params.dataInicio);
    if (params.dataFim) qs.set('dataFim', params.dataFim);
    const r = await fetch(`${BASE}/producao/resumo-diario?${qs}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar resumo');
    return data.items || [];
}

// Uploads
export async function listarUploadsProducao(params: { dataRef?: string } = {}): Promise<ProducaoUpload[]> {
    const qs = new URLSearchParams();
    if (params.dataRef) qs.set('dataRef', params.dataRef);
    const r = await fetch(`${BASE}/producao/uploads?${qs}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar uploads');
    return data.items || [];
}

// Histórico de uploads arquivados (auditoria)
export interface ProducaoUploadHistorico {
    id: string;
    uploadId: string;
    nomeArquivo: string;
    dataRef: string;
    linhasTotal: number;
    horasTotal: number;
    uploadPorNome: string | null;
    criadoEm: string;
    arquivadoEm: string;
    motivo: string;
}

export async function listarHistoricoUploadsProducao(params: { dataRef?: string; limite?: number } = {}): Promise<{
    items: ProducaoUploadHistorico[];
    total: number;
    nota: string;
}> {
    const qs = new URLSearchParams();
    if (params.dataRef) qs.set('dataRef', params.dataRef);
    if (params.limite) qs.set('limite', String(params.limite));
    const r = await fetch(`${BASE}/producao/uploads/historico?${qs}`);
    const data = await r.json().catch(() => ({ items: [], total: 0, nota: '' }));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar histórico');
    return data;
}

export interface UltimoUpload {
    id: string;
    dataRef: string;
    criadoEm: string;
    nomeArquivo: string;
}

export async function buscarUltimoUploadProducao(): Promise<UltimoUpload | null> {
    const r = await fetch(`${BASE}/producao/uploads/ultimo`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao buscar último upload');
    return data.upload || null;
}

export async function uploadLancamentosProducao(rows: Record<string, unknown>[], nomeArquivo: string, auth: AuthParams): Promise<{
    ok: boolean;
    resultados: Array<{ dataRef: string; uploadId: string; linhasProcessadas: number; horasTotal: number }>;
    erros: Array<{ linha: number; erro: string }>;
    resumo: { totalLinhas: number; linhasValidas: number; linhasComErro: number; datasProcessadas: number };
}> {
    const r = await fetch(`${BASE}/producao/lancamentos/upload`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        },
        body: JSON.stringify({ rows, nomeArquivo })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao fazer upload');
    return data;
}

// Escopos de máquina
export async function atualizarEscopoMaquina(
    id: string,
    payload: {
        escopoManutencao?: boolean;
        escopoProducao?: boolean;
        escopoPlanejamento?: boolean;
        setor?: string | null;
        isMaquinaMae?: boolean;
        exibirFilhosDashboard?: boolean;
    },
    auth: AuthParams
): Promise<Maquina> {
    const r = await fetch(`${BASE}/maquinas/${id}/escopo`, {
        method: 'PATCH',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao atualizar escopo');
    return data;
}

// ===== FUNCIONÁRIOS IMETAS =====
export interface FuncionarioMeta {
    id?: number;
    matricula: string;
    nome: string;
    meta_diaria_horas: number;
    ativo: boolean;
}

export async function fetchFuncionariosMeta(): Promise<FuncionarioMeta[]> {
    const r = await fetch(`${BASE}/producao/metas/funcionarios`);
    const data = await r.json().catch(() => []);
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar metas');
    return data;
}

export async function fetchFuncionariosDia(dataISO: string): Promise<any[]> {
    const r = await fetch(`${BASE}/producao/indicadores/funcionarios/dia?data=${dataISO}`);
    const data = await r.json().catch(() => []);
    if (!r.ok) throw new Error(data?.error || 'Erro ao buscar produção dia');
    return data;
}

export async function fetchFuncionariosMes(anoMesISO: string): Promise<any[]> {
    const r = await fetch(`${BASE}/producao/indicadores/funcionarios/mes?anoMes=${anoMesISO}`);
    const data = await r.json().catch(() => []);
    if (!r.ok) throw new Error(data?.error || 'Erro ao buscar produção mês');
    return data;
}

export async function upsertFuncionarioMeta(payload: FuncionarioMeta, auth: AuthParams = {}): Promise<unknown> {
    const r = await fetch(`${BASE}/producao/metas/funcionarios`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders({ ...auth, role: auth.role || 'gestor' }),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao salvar meta');
    return data;
}

// Detalhe de um upload de produção
export interface ProducaoLancamentoDetalhe {
    id: string;
    maquinaId: string;
    maquinaNome: string;
    maquinaTag: string | null;
    dataRef: string;
    turno: string | null;
    horasRealizadas: number;
    observacao: string | null;
}

export interface ProducaoUploadDetalhe {
    upload: ProducaoUpload;
    lancamentos: ProducaoLancamentoDetalhe[];
    porMaquina: Array<{
        maquinaId: string;
        maquinaNome: string;
        maquinaTag: string | null;
        total: number;
        lancamentos: ProducaoLancamentoDetalhe[];
    }>;
    resumo: {
        totalMaquinas: number;
        totalLancamentos: number;
        totalHoras: number;
    };
}

export async function buscarDetalheUploadProducao(uploadId: string): Promise<ProducaoUploadDetalhe> {
    const r = await fetch(`${BASE}/producao/uploads/${uploadId}`, {
        headers: { 'Content-Type': 'application/json' }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao buscar detalhes do upload');
    return data;
}


// ===== ROLES (Níveis de Acesso) =====

export type NivelPermissao = 'nenhum' | 'ver' | 'editar';

export interface Role {
    id: string;
    nome: string;
    descricao: string | null;
    permissoes: Record<string, NivelPermissao>;
    isSystem: boolean;
    criadoEm: string;
    atualizadoEm?: string;
}

export interface PaginaPermissao {
    key: string;
    nome: string;
    grupo: string;
}

export interface RoleCreate {
    nome: string;
    descricao?: string;
    permissoes: Record<string, NivelPermissao>;
}

export interface RoleUpdate {
    nome: string;
    descricao?: string;
    permissoes: Record<string, NivelPermissao>;
}

// Listar todas as páginas disponíveis para permissões
export async function listarPaginasPermissao(auth: AuthParams = {}): Promise<PaginaPermissao[]> {
    const r = await fetch(`${BASE}/roles/pages`, {
        headers: buildAuthHeaders(auth)
    });
    const data = await r.json().catch(() => ({ items: [] }));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar páginas');
    return data.items || [];
}

// Listar todos os roles (requer permissão roles: ver)
export async function listarRoles(auth: AuthParams = {}): Promise<Role[]> {
    const r = await fetch(`${BASE}/roles`, {
        headers: buildAuthHeaders(auth)
    });
    const data = await r.json().catch(() => ({ items: [] }));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar níveis de acesso');
    return data.items || [];
}

// Listar roles para dropdowns (não requer permissão especial)
export async function listarRolesOptions(auth: AuthParams = {}): Promise<{ id: string; nome: string }[]> {
    const r = await fetch(`${BASE}/roles/options`, {
        headers: buildAuthHeaders(auth)
    });
    const data = await r.json().catch(() => ({ items: [] }));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar níveis de acesso');
    return data.items || [];
}

// Obter role por ID
export async function buscarRole(id: string, auth: AuthParams = {}): Promise<Role> {
    const r = await fetch(`${BASE}/roles/${id}`, {
        headers: buildAuthHeaders(auth)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao buscar nível de acesso');
    return data;
}

// Criar novo role
export async function criarRole(payload: RoleCreate, auth: AuthParams = {}): Promise<Role> {
    const r = await fetch(`${BASE}/roles`, {
        method: 'POST',
        headers: {
            ...buildAuthHeaders({ ...auth, role: auth.role || 'gestor' }),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao criar nível de acesso');
    return data;
}

// Atualizar role
export async function atualizarRole(id: string, payload: RoleUpdate, auth: AuthParams = {}): Promise<Role> {
    const r = await fetch(`${BASE}/roles/${id}`, {
        method: 'PUT',
        headers: {
            ...buildAuthHeaders({ ...auth, role: auth.role || 'gestor' }),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao atualizar nível de acesso');
    return data;
}

// Excluir role
export async function excluirRole(id: string, auth: AuthParams = {}): Promise<void> {
    const r = await fetch(`${BASE}/roles/${id}`, {
        method: 'DELETE',
        headers: {
            ...buildAuthHeaders({ ...auth, role: auth.role || 'gestor' }),
            'Content-Type': 'application/json',
        }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao excluir nível de acesso');
}

// ===== PLANEJAMENTO - CAPACIDADE =====

export interface CapacidadeUploadResult {
    ok: boolean;
    uploadId: string;
    resumo: {
        totalLinhas: number;
        linhasValidas: number;
        linhasComErro: number;
    };
    erros: Array<{ linha: number; erro: string }>;
}

export interface ResumoCapacidade {
    centroTrabalho: string;
    cargaHoras: number;
    cargaOP: number;
    capacidade: number;
    capacidadeRestante: number;
    sobrecarga: boolean;
    percentualOcupacao: number;
}

export interface CapacidadeUpload {
    id: string;
    nomeArquivo: string;
    linhasTotal: number;
    linhasSucesso: number;
    linhasErro: number;
    ativo: boolean;
    uploadPorEmail: string | null;
    criadoEm: string;
}

export interface CentroTrabalho {
    id: string;
    centroTrabalho: string;
    capacidadeHoras: number;
    criadoEm?: string;
    atualizadoEm?: string;
}

// Upload de reserva de capacidade
export async function uploadCapacidade(rows: Record<string, unknown>[], nomeArquivo: string, auth: AuthParams): Promise<CapacidadeUploadResult> {
    const r = await fetch(`${BASE}/planejamento/capacidade/upload`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        },
        body: JSON.stringify({ rows, nomeArquivo })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao fazer upload');
    return data;
}

// Listar resumo de capacidade por centro de trabalho
export async function listarResumoCapacidade(auth: AuthParams, uploadId?: string): Promise<{
    items: ResumoCapacidade[];
    uploadId?: string;
    lastUploadDate?: string;
    calculation?: {
        totalBusinessDays: number;
        remainingBusinessDays: number;
        passedBusinessDays: number;
        currentDate: string;
    };
}> {
    const qs = new URLSearchParams();
    if (uploadId) qs.set('uploadId', uploadId);
    const r = await fetch(`${BASE}/planejamento/capacidade/resumo?${qs}`, {
        headers: {
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        }
    });
    const data = await r.json().catch(() => ({ items: [] }));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar resumo');
    return data;
}

// Listar uploads de capacidade
export async function listarUploadsCapacidade(auth: AuthParams): Promise<CapacidadeUpload[]> {
    const r = await fetch(`${BASE}/planejamento/capacidade/uploads`, {
        headers: {
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        }
    });
    const data = await r.json().catch(() => ({ items: [] }));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar uploads');
    return data.items || [];
}

// Tipo para máquina com configurações de planejamento
export interface MaquinaPlanejamento {
    id: string;
    nome: string;
    tag: string;
    capacidadeHoras: number;
    aliasesPlanejamento: string[];
    escopoPlanejamento: boolean;
}

// Listar máquinas com escopo planejamento
export async function listarMaquinasPlanejamento(auth: AuthParams): Promise<MaquinaPlanejamento[]> {
    const r = await fetch(`${BASE}/planejamento/capacidade/maquinas`, {
        headers: buildAuthHeaders(auth)
    });
    const data = await r.json().catch(() => ({ items: [] }));
    if (!r.ok) throw new Error(data?.error || 'Erro ao listar máquinas');
    return data.items || [];
}

// Atualizar capacidade/aliases de uma máquina
export async function atualizarMaquinaPlanejamento(
    id: string,
    payload: { capacidadeHoras?: number; aliasesPlanejamento?: string[]; escopoPlanejamento?: boolean },
    auth: AuthParams
): Promise<MaquinaPlanejamento> {
    const r = await fetch(`${BASE}/planejamento/capacidade/maquinas/${id}`, {
        method: 'PATCH',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Erro ao atualizar máquina');
    return data;
}

// ===== QUALIDADE / REFUGOS =====
export async function listarRefugos(params: { page?: number; limit?: number; dataInicio?: string; dataFim?: string; origem?: string; responsavel?: string; tipo?: string; tipoLancamento?: string } = {}, auth: AuthParams = {}): Promise<{ items: any[]; meta: any }> {
    const res = await http.get<{ items: any[]; meta: any }>(`/qualidade/refugos`, { params, auth });
    return res;
}

export async function criarRefugo(data: any, auth: AuthParams = {}): Promise<{ id: number; ok: boolean }> {
    return http.post<{ id: number; ok: boolean }>('/qualidade/refugos', { data, auth });
}

export async function editarRefugo(id: number, data: any, auth: AuthParams = {}): Promise<{ ok: boolean }> {
    return http.put<{ ok: boolean }>(`/qualidade/refugos/${id}`, { data, auth });
}

export async function excluirRefugo(id: number, auth: AuthParams = {}): Promise<{ ok: boolean }> {
    return http.delete<{ ok: boolean }>(`/qualidade/refugos/${id}`, { auth });
}

// ===== QUALIDADE / CONFIGURAÇÕES =====
export interface QualidadeOpcao {
    id: number;
    nome: string;
    ativo: boolean;
    tipo?: 'INTERNO' | 'EXTERNO';
}

export async function listarOrigens(todos = false, tipo?: string): Promise<QualidadeOpcao[]> {
    return http.get<QualidadeOpcao[]>('/qualidade/origens', { params: { todos, tipo } });
}

export async function criarOrigem(nome: string, tipo: 'INTERNO' | 'EXTERNO' = 'EXTERNO', auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.post<QualidadeOpcao>('/qualidade/origens', { data: { nome, tipo }, auth });
}

export async function editarOrigem(id: number, data: { nome?: string; ativo?: boolean; tipo?: 'INTERNO' | 'EXTERNO' }, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.put<QualidadeOpcao>(`/qualidade/origens/${id}`, { data, auth });
}

export async function listarMotivos(todos = false): Promise<QualidadeOpcao[]> {
    return http.get<QualidadeOpcao[]>('/qualidade/motivos', { params: { todos } });
}

export async function criarMotivo(nome: string, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.post<QualidadeOpcao>('/qualidade/motivos', { data: { nome }, auth });
}

export async function editarMotivo(id: number, data: { nome?: string; ativo?: boolean }, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.put<QualidadeOpcao>(`/qualidade/motivos/${id}`, { data, auth });
}

export async function listarResponsaveisSettings(todos = false): Promise<QualidadeOpcao[]> {
    return http.get<QualidadeOpcao[]>('/qualidade/responsaveis', { params: { todos } });
}

export async function criarResponsavel(nome: string, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.post<QualidadeOpcao>('/qualidade/responsaveis', { data: { nome }, auth });
}

export async function editarResponsavel(id: number, data: { nome?: string; ativo?: boolean }, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.put<QualidadeOpcao>(`/qualidade/responsaveis/${id}`, { data, auth });
}

export async function getResponsavelUsage(id: number): Promise<{ count: number }> {
    return http.get<{ count: number }>(`/qualidade/responsaveis/${id}/usage`);
}

export async function deletarResponsavel(id: number, transferToId?: number, auth: AuthParams = {}): Promise<unknown> {
    return http.delete(`/qualidade/responsaveis/${id}`, { data: { transferToId }, auth });
}

export async function getOrigemUsage(id: number): Promise<{ count: number }> {
    return http.get<{ count: number }>(`/qualidade/origens/${id}/usage`);
}

export async function deletarOrigem(id: number, transferToId?: number, auth: AuthParams = {}): Promise<unknown> {
    return http.delete(`/qualidade/origens/${id}`, { data: { transferToId }, auth });
}

export async function getMotivoUsage(id: number): Promise<{ count: number }> {
    return http.get<{ count: number }>(`/qualidade/motivos/${id}/usage`);
}

export async function deletarMotivo(id: number, transferToId?: number, auth: AuthParams = {}): Promise<unknown> {
    return http.delete(`/qualidade/motivos/${id}`, { data: { transferToId }, auth });
}

// ===== QUALITY ANALYTICS =====
export interface QualityAnalyticSummary {
    totalCost: number;
    costLastMonth: number;
    costLastYear: number;
    topResponsible: { name: string; cost: number }[];
    topOrigins: { name: string; cost: number }[];
}

export interface QualityAnalyticTrend {
    period: string;
    cost: number;
}

export interface QualityAnalyticDetail {
    name: string;
    totalCost: number;
    count: number;
    lastOccurrence: string;
}

export async function getQualityAnalyticsSummary(params: { dataInicio?: string; dataFim?: string; origem?: string; responsavel?: string; tipo?: string; tipoLancamento?: string } = {}, auth: AuthParams = {}): Promise<QualityAnalyticSummary> {
    const res = await http.get<QualityAnalyticSummary>(`/qualidade/analytics/summary`, { params, auth });
    return res;
}

export async function getQualityAnalyticsTrends(params: { dataInicio?: string; dataFim?: string; origem?: string; responsavel?: string; tipo?: string; tipoLancamento?: string } = {}, auth: AuthParams = {}): Promise<{ trends: QualityAnalyticTrend[] }> {
    const res = await http.get<{ trends: QualityAnalyticTrend[] }>(`/qualidade/analytics/trends`, { params, auth });
    return res;
}

export async function getQualityAnalyticsDetails(params: { dataInicio?: string; dataFim?: string; origem?: string; responsavel?: string; tipo?: string; tipoLancamento?: string } = {}, auth: AuthParams = {}): Promise<{ items: QualityAnalyticDetail[]; originItems: QualityAnalyticDetail[] }> {
    const res = await http.get<{ items: QualityAnalyticDetail[]; originItems: QualityAnalyticDetail[] }>(`/qualidade/analytics/details`, { params, auth });
    return res;
}

export async function listarResponsaveis(params: { dataInicio?: string; dataFim?: string; origem?: string; tipo?: string; tipoLancamento?: string } = {}, auth: AuthParams = {}): Promise<string[]> {
    const res = await http.get<{ items: string[] }>(`/qualidade/analytics/responsaveis`, { params, auth });
    return res.items || [];
}

// ===== QUALITY COMPARISON =====
export interface QualityComparisonPeriod {
    label: string;
    totalCost: number;
    count: number;
    topDefects: { motivo: string; custo: number }[];
    topOrigens: { origem: string; custo: number }[];
    topResponsaveis: { responsavel: string; custo: number }[];
}

export interface QualityComparisonDelta {
    costDiff: number;
    costPctChange: number;
    countDiff: number;
}

export interface QualityComparisonResponse {
    periodA: QualityComparisonPeriod;
    periodB: QualityComparisonPeriod;
    delta: QualityComparisonDelta;
}

export interface QualityComparisonParams {
    dataInicioA: string;
    dataFimA: string;
    dataInicioB: string;
    dataFimB: string;
    origem?: string;
    responsavel?: string;
    tipo?: string;
    tipoLancamento?: string;
}

export async function getQualityComparison(params: QualityComparisonParams, auth: AuthParams = {}): Promise<QualityComparisonResponse> {
    return http.get<QualityComparisonResponse>(`/qualidade/analytics/compare`, { params: params as any, auth });
}

// ===== LOGISTICA =====
export async function getLogisticaKpis(mes: number, ano: number, auth: AuthParams = {}): Promise<LogisticaDashboardData> {
    return http.get<LogisticaDashboardData>(`/logistica/kpis`, { params: { mes, ano }, auth });
}

export async function saveLogisticaKpi(data: string, payload: Partial<LogisticaKpi>, auth: AuthParams = {}): Promise<LogisticaKpi> {
    const res = await fetch(`${BASE}/logistica/kpis/${data}`, {
        method: 'PUT',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Erro ao salvar KPI (${res.status})`);
    return json as LogisticaKpi;
}

export async function saveLogisticaMeta(mes: number, ano: number, meta_financeira: number, auth: AuthParams = {}): Promise<LogisticaMeta> {
    const res = await fetch(`${BASE}/logistica/metas/${mes}/${ano}`, {
        method: 'PUT',
        headers: {
            ...buildAuthHeaders(auth),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ meta_financeira })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Erro ao salvar Meta (${res.status})`);
    return json as LogisticaMeta;
}
