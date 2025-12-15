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
    EventoChamado,
    ConcluirChamadoPayload,
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

// GET/POST helpers
export const http = {
    get: <T = unknown>(path: string, opts: { params?: Record<string, unknown>; auth?: AuthParams } = {}): Promise<T> =>
        apiFetch<T>(`${path}${toQuery(opts.params)}`, { auth: opts.auth }),
    post: <T = unknown>(path: string, opts: { data?: unknown; auth?: AuthParams } = {}): Promise<T> =>
        apiFetch<T>(path, { method: "POST", body: opts.data, auth: opts.auth }),
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
            "Content-Type": "application/json",
            "x-user-role": auth.role || "",
            "x-user-email": auth.email || ""
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
        headers: { 'Content-Type': 'application/json', 'x-user-role': auth.role || '', 'x-user-email': auth.email || '' },
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
            "Content-Type": "application/json",
            "x-user-role": auth.role || "manutentor",
            "x-user-email": auth.email || ""
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao atender (${res.status})`);
    return data;
}

export async function adicionarObservacao(id: string, opts: { texto: string } & AuthParams): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}/observacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": opts.role || "", "x-user-email": opts.email || "" },
        body: JSON.stringify({ texto: opts.texto })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao salvar observação (${res.status})`);
    return data;
}

export async function concluirChamado(id: string, payload: ConcluirChamadoPayload, auth: AuthParams): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": auth.role || "", "x-user-email": auth.email || "" },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao concluir (${res.status})`);
    return data;
}

export async function deletarChamado(id: string, auth: AuthParams): Promise<unknown> {
    const res = await fetch(`${BASE}/chamados/${id}`, {
        method: "DELETE",
        headers: { "x-user-role": auth.role || "", "x-user-email": auth.email || "" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao excluir (${res.status})`);
    return data;
}

export async function listarEventosChamado(id: string): Promise<EventoChamado[]> {
    const r = await fetch(`${BASE}/chamados/${id}/eventos`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Erro ao listar eventos (${r.status})`);
    return data.items || [];
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
export async function getMaquinas(q = ""): Promise<Maquina[]> {
    const url = q ? `${BASE}/maquinas?q=${encodeURIComponent(q)}` : `${BASE}/maquinas`;
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
            critico: !!data.critico
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
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || '',
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

// ===== CHECKLIST DIÁRIO =====
export async function addChecklistItem(maquinaId: string, item: string, auth: AuthParams): Promise<unknown> {
    const r = await fetch(`${BASE}/maquinas/${maquinaId}/checklist-add`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || ''
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
            'Content-Type': 'application/json',
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || ''
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
            'Content-Type': 'application/json',
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || ''
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
    const res = await fetch(`${BASE}/usuarios?role=manutentor`, {
        headers: {
            'x-user-role': auth.role || 'gestor',
            'x-user-email': auth.email || ''
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erro ao listar manutentores (${res.status})`);
    return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function criarUsuario(data: UsuarioCreate, auth: AuthParams = {}): Promise<Usuario> {
    const r = await fetch(`${BASE}/usuarios`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
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
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
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
        headers: {
            'x-user-role': (auth?.role || '').toString().toLowerCase(),
            'x-user-email': auth?.email || ''
        }
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao excluir usuário');
    return j;
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
            'Content-Type': 'application/json',
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || '',
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
            'Content-Type': 'application/json',
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || '',
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
        headers: {
            'x-user-role': auth?.role || '',
            'x-user-email': auth?.email || '',
        },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao excluir peça');
    return j;
}

export async function registrarMovimentacao(pecaId: string, mov: Movimentacao, auth: AuthParams = {}): Promise<unknown> {
    const r = await fetch(`${BASE}/pecas/${encodeURIComponent(pecaId)}/movimentacoes`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-role': auth.role || '',
            'x-user-email': auth.email || ''
        },
        body: JSON.stringify(mov)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Falha ao registrar movimentação (${r.status})`);
    return data;
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
