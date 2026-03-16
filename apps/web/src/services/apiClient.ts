// src/services/apiClient.ts
// Cliente API tipado para frontend

import type {
    AuthParams,
    NotificacaoConfigUser,
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
    Foto,
    ParetoResponse,
    LoginPayload,
    LoginResponse,
    ChangePasswordPayload,
    ConcluirChamadoPayload,
    LogisticaKpi,
    LogisticaMeta,
    LogisticaDashboardData,
    Kaizen,
    KaizenCreate,
    KamishibaiPergunta,
    KamishibaiAudit,
    PerformAuditPayload,
    KamishibaiDashboardData
} from '../types/api';

// ===== BASE / FALLBACK CONFIG =====
export const PRIMARY_BASE = (
    import.meta.env?.VITE_API_URL ||
    import.meta.env?.VITE_API_BASE ||
    "http://localhost:3000"
).replace(/\/+$/, "");

export const FALLBACK_BASE = (
    import.meta.env?.VITE_API_URL_FALLBACK ||
    "http://localhost:3000" // Em dev local pode ser o mesmo
).replace(/\/+$/, "");

// Session Keys
const STORAGE_KEY_ACTIVE_API = 'spira_active_api';
const STORAGE_KEY_LAST_FAIL = 'spira_last_primary_fail';

// In-memory state
let isProbingPrimary = false;

// Helper to get active API base with safe initialization
function getActiveBase(): string {
    const saved = sessionStorage.getItem(STORAGE_KEY_ACTIVE_API);
    if (saved === FALLBACK_BASE) return FALLBACK_BASE;
    // Default or explicitly Primary
    return PRIMARY_BASE;
}

function setActiveBase(base: string) {
    sessionStorage.setItem(STORAGE_KEY_ACTIVE_API, base);
    if (base === PRIMARY_BASE) {
        sessionStorage.removeItem(STORAGE_KEY_LAST_FAIL);
    }
}

function setPrimaryFailure(cause: string) {
    sessionStorage.setItem(STORAGE_KEY_LAST_FAIL, Date.now().toString());
    if (getActiveBase() !== FALLBACK_BASE) {
        console.warn(`API fallback activated: ${cause} on primary at ${new Date().toLocaleTimeString()}`);
        setActiveBase(FALLBACK_BASE);
        window.dispatchEvent(new CustomEvent('api-fallback-activated', { detail: { cause } }));
    }
}

function getLastPrimaryFail(): number {
    return Number(sessionStorage.getItem(STORAGE_KEY_LAST_FAIL) || 0);
}

// Global active base for use in requests
export let BASE = getActiveBase();

export const isFallbackActive = () => getActiveBase() === FALLBACK_BASE;

// Silent probe for recovery
async function probePrimary(): Promise<void> {
    if (isProbingPrimary || getActiveBase() === PRIMARY_BASE) return;

    const lastFail = getLastPrimaryFail();
    const tenMinutes = 10 * 60 * 1000;
    if (Date.now() - lastFail < tenMinutes) return;

    isProbingPrimary = true;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000); // 2s timeout for probe
        const res = await fetch(`${PRIMARY_BASE}/health`, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);

        if (res.ok) {
            console.info('API primary restored: Fly.io is back online.');
            setActiveBase(PRIMARY_BASE);
            BASE = PRIMARY_BASE;
            window.dispatchEvent(new CustomEvent('api-primary-restored'));
        } else {
            // Se falhou (mesmo sendo um erro 5xx), atualiza o timestamp de falha
            setPrimaryFailure('probe failed');
        }
    } catch {
        // Falha silenciosa de rede
        setPrimaryFailure('probe network error');
    } finally {
        isProbingPrimary = false;
    }
}

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

// Tenta obter o token salvo (usuário logado ou modo TV)
function getLoggedUserToken(): string {
    try {
        const raw = localStorage.getItem('usuario');
        if (raw) {
            const obj = JSON.parse(raw);
            if (obj?.token) return String(obj.token).trim();
        }
    } catch { }
    // Fallback: token do Modo TV (sessionStorage)
    try {
        const tvToken = sessionStorage.getItem('tv_token');
        if (tvToken) return tvToken.trim();
    } catch { }
    return '';
}


function buildAuthHeaders(auth: AuthParams = {}): Record<string, string> {
    const h: Record<string, string> = { 'Accept': 'application/json' };

    const token = getLoggedUserToken();
    if (token) {
        h['Authorization'] = `Bearer ${token}`;
    }

    return h;
}

// ===== HTTP base (fetch) =====
function toQuery(params: Record<string, unknown> = {}): string {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        if (Array.isArray(v)) {
            v.forEach(val => {
                if (val !== undefined && val !== null && val !== "") {
                    usp.append(k, String(val));
                }
            });
        } else {
            usp.append(k, String(v));
        }
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

    // Tenta retorno ao primário em background se estiver no fallback
    if (getActiveBase() === FALLBACK_BASE) {
        probePrimary();
    }

    let currentBase = getActiveBase();

    const h: Record<string, string> = { ...buildAuthHeaders(auth), ...headers };
    const init: RequestInit = { method, headers: h, cache: 'no-store' };

    if (body !== undefined) {
        if (!("Content-Type" in h)) h["Content-Type"] = "application/json";
        init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    // Tenta executar a request
    const doFetch = async (targetBase: string, timeoutMs: number): Promise<Response> => {
        const url = `${targetBase}${path}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            return await fetch(url, { ...init, signal: ctrl.signal });
        } finally {
            clearTimeout(t);
        }
    };

    let res: Response;
    try {
        // Se for o primário, usamos um timeout curto (3s) para detectar bloqueios rapidamente
        // Se já estiver no fallback, usamos o padrão (30s)
        const isPrimary = (currentBase === PRIMARY_BASE);
        const firstTimeout = isPrimary ? 3_000 : 30_000;

        try {
            res = await doFetch(currentBase, firstTimeout);
        } catch (err: any) {
            // Se falhou no primário por timeout ou erro de rede, tenta o fallback
            if (isPrimary && (err.name === 'AbortError' || err.name === 'TypeError' || String(err).includes('NetworkError'))) {
                const cause = err.name === 'AbortError' ? 'timeout' : 'network error';
                setPrimaryFailure(cause);
                BASE = FALLBACK_BASE; // Atualiza a variável global exportada
                res = await doFetch(FALLBACK_BASE, 30_000);
            } else {
                throw err;
            }
        }

        // Se o primário respondeu mas com erro de gateway (502, 503, 504)
        if (isPrimary && [502, 503, 504].includes(res.status)) {
            setPrimaryFailure(`HTTP ${res.status}`);
            BASE = FALLBACK_BASE;
            res = await doFetch(FALLBACK_BASE, 30_000);
        }
    } catch (err) {
        throw err;
    }

    const ct = String(res.headers.get("content-type") || "");
    const isJson = ct.includes("application/json");
    const payload = isJson ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
        if (res.status === 503) {
            console.warn('API Unavailable (503) - Entrando em Modo Manutenção');
            window.dispatchEvent(new CustomEvent('api-maintenance'));
        }

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

// ===== AUTH =====
export async function me(): Promise<Record<string, unknown>> {
    return apiFetch<Record<string, unknown>>('/auth/me');
}

export async function tvLogin(pin: string): Promise<{ token: string; role: string; nome: string }> {
    return apiFetch('/auth/tv-login', { method: 'POST', body: { pin } });
}

export async function getTvConfig(): Promise<{ hasPin: boolean }> {
    return http.get('/settings/tv-config');
}

export async function setTvPin(pin: string): Promise<{ ok: boolean }> {
    return http.put('/settings/tv-pin', { data: { pin } });
}

export async function deleteTvPin(): Promise<{ ok: boolean }> {
    return http.delete('/settings/tv-pin');
}

// ===== CHAMADOS =====
export async function criarChamado(data: ChamadoCreate, auth: AuthParams = {}): Promise<Chamado> {
    if (!data.maquinaId && !data.maquinaNome) {
        throw new Error('Informe maquinaId ou maquinaNome.');
    }

    const body: Record<string, unknown> = {
        descricao: String(data.descricao || '').trim(),
        tipo: String(data.tipo || 'corretiva'),
    };

    if (data.maquinaId) body.maquinaId = String(data.maquinaId);
    if (data.maquinaNome) body.maquinaNome = String(data.maquinaNome).trim();
    if (data.manutentorEmail) body.manutentorEmail = String(data.manutentorEmail).trim().toLowerCase();
    if (data.checklistItemKey) body.checklistItemKey = String(data.checklistItemKey).trim();
    if (data.item) body.item = String(data.item).trim();

    return http.post<Chamado>('/chamados', { data: body, auth });
}

export async function listarChamadosPorCriador(email: string, page = 1, pageSize = 50): Promise<ListaChamadosResponse> {
    return http.get<ListaChamadosResponse>('/chamados', {
        params: { criadoPorEmail: email, page, pageSize },
    });
}

export async function listarChamados(params: ListaChamadosParams = {}): Promise<ListaChamadosResponse> {
    const p: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue;
        if (v instanceof Date) {
            p[k] = v.toISOString();
        } else {
            p[k] = String(v);
        }
    }

    const data = await http.get<any>('/chamados', { params: p });

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

// Badge counts — single request replaces 4 separate listarChamados(pageSize=1)
export interface ChamadoCounts {
    abertos: number;
    emAndamento: number;
    meusAbertos: number;
    meusEmAndamento: number;
}

export async function getChamadoCounts(manutentorEmail?: string): Promise<ChamadoCounts> {
    const params: Record<string, string> = {};
    if (manutentorEmail) params.manutentorEmail = manutentorEmail;
    return http.get<ChamadoCounts>('/chamados/counts', { params });
}

export async function getChamado(id: string, auth: AuthParams = {}): Promise<Chamado> {
    return apiFetch<Chamado>(`/chamados/${id}`, { auth });
}

export async function listarChamadosPorMaquina(maquinaId: string, opts: { status?: string; tipo?: string } = {}): Promise<Chamado[]> {
    const data = await http.get<{ items?: Chamado[] } | Chamado[]>('/chamados', {
        params: { maquinaId, status: opts.status, tipo: opts.tipo },
    });
    return (data as { items?: Chamado[] })?.items || (data as Chamado[]);
}

export async function atribuirChamado(id: string, auth: AuthParams & { manutentorEmail: string }): Promise<unknown> {
    return http.post(`/chamados/${id}/atribuir`, { data: { manutentorEmail: auth.manutentorEmail }, auth });
}

export async function removerAtribuicao(id: string, auth: AuthParams): Promise<unknown> {
    return http.delete(`/chamados/${id}/atribuir`, { auth });
}

export async function atenderChamado(id: string, auth: AuthParams = {}): Promise<unknown> {
    return http.post(`/chamados/${id}/atender`, { data: {}, auth });
}

export async function entrarChamado(id: string, auth: AuthParams = {}): Promise<{ ok: boolean }> {
    return http.post(`/chamados/${id}/entrar`, { data: {}, auth });
}

export async function sairChamado(id: string, auth: AuthParams = {}): Promise<{ ok: boolean }> {
    return http.post(`/chamados/${id}/sair`, { data: {}, auth });
}

export async function adicionarObservacao(id: string, opts: { texto: string } & AuthParams): Promise<unknown> {
    return http.post(`/chamados/${id}/observacoes`, { data: { texto: opts.texto }, auth: opts });
}

export async function concluirChamado(id: string, payload: ConcluirChamadoPayload, auth: AuthParams): Promise<unknown> {
    return http.post(`/chamados/${id}/concluir`, { data: payload, auth });
}

export async function deletarChamado(id: string, auth: AuthParams): Promise<unknown> {
    return http.delete(`/chamados/${id}`, { auth });
}



// ===== FOTOS =====
export async function listarFotosChamado(id: string, auth: AuthParams = {}): Promise<Foto[]> {
    const data = await http.get<{ items?: Foto[] } | Foto[]>(`/chamados/${encodeURIComponent(id)}/fotos`, { auth });
    return Array.isArray(data) ? data : (data as { items?: Foto[] })?.items || [];
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
    return http.get<Maquina[]>('/maquinas', {
        params: { q: q || undefined, escopo },
    });
}

export async function listarMaquinas(params: Record<string, unknown> = {}): Promise<Maquina[]> {
    const data = await http.get<{ items?: Maquina[] } | Maquina[]>('/maquinas', { params });
    return Array.isArray((data as { items?: Maquina[] })?.items)
        ? (data as { items: Maquina[] }).items
        : (Array.isArray(data) ? data as Maquina[] : []);
}

export async function getMaquina(id: string): Promise<Maquina> {
    return http.get<Maquina>(`/maquinas/${id}`);
}

export async function criarMaquina(data: MaquinaCreate, auth: AuthParams = {}): Promise<Maquina> {
    return http.post<Maquina>(`/maquinas`, {
        data: {
            nome: data.nome,
            setor: data.setor ?? null,
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
    return http.delete(`/maquinas/${encodeURIComponent(id)}`, { auth });
}

export async function renomearMaquina(id: string, data: { nome: string; syncTag?: boolean }, auth: AuthParams = {}): Promise<Maquina> {
    return apiFetch<Maquina>(`/maquinas/${encodeURIComponent(id)}/nome`, {
        method: 'PATCH',
        body: { nome: data.nome, syncTag: data.syncTag ?? true },
        auth,
    });
}

// Atualizar máquina mãe
export async function atualizarMaquinaPai(
    id: string,
    parentId: string | null,
    auth: AuthParams = {}
): Promise<{ id: string; nome: string; parent_maquina_id?: string }> {
    return apiFetch(`/maquinas/${encodeURIComponent(id)}/parent`, {
        method: 'PATCH',
        body: { parentId },
        auth,
    });
}

// Atualizar aliases de produção de uma máquina
export async function atualizarAliasesProducao(
    id: string,
    aliases: string[],
    auth: AuthParams = {}
): Promise<{ id: string; nome: string; aliases_producao: string[] }> {
    return apiFetch(`/maquinas/${encodeURIComponent(id)}/aliases-producao`, {
        method: 'PATCH',
        body: { aliases },
        auth,
    });
}

// Atualizar nome de exibição para produção de uma máquina
export async function atualizarNomeProducao(
    id: string,
    nomeProducao: string | null,
    auth: AuthParams = {}
): Promise<{ id: string; nome: string; nome_producao: string | null }> {
    return apiFetch(`/maquinas/${encodeURIComponent(id)}/nome-producao`, {
        method: 'PATCH',
        body: { nomeProducao },
        auth,
    });
}

// ===== CHECKLIST DIÁRIO =====
export async function addChecklistItem(maquinaId: string, item: string, auth: AuthParams): Promise<unknown> {
    return http.post(`/maquinas/${maquinaId}/checklist-add`, { data: { item }, auth });
}

export async function removeChecklistItem(maquinaId: string, item: string, auth: AuthParams): Promise<unknown> {
    return http.post(`/maquinas/${maquinaId}/checklist-remove`, { data: { item }, auth });
}

export async function reorderChecklistItems(maquinaId: string, items: string[], auth: AuthParams): Promise<unknown> {
    return http.post(`/maquinas/${maquinaId}/checklist-reorder`, { data: { items }, auth });
}

export async function enviarChecklistDiaria(data: SubmissaoDiariaCreate): Promise<unknown> {
    return http.post('/checklists/daily/submit', { data });
}

export async function listarSubmissoesDiarias(params: { operadorEmail?: string; date?: string; maquinaId?: string; turno?: string }): Promise<Submissao[]> {
    const data = await http.get<{ items?: Submissao[] } | Submissao[]>('/checklists/daily/submissoes', { params });
    return Array.isArray((data as { items?: Submissao[] })?.items)
        ? (data as { items: Submissao[] }).items
        : (Array.isArray(data) ? data as Submissao[] : []);
}

interface ChecklistOverviewRangeItem {
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

interface ChecklistOverviewItem {
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
    return http.get<Agendamento[]>('/agendamentos', { params });
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
    return http.post(`/agendamentos/${id}/iniciar`, {
        data: { criadoPorEmail: auth.criadoPorEmail || auth.email },
        auth,
    });
}

// ===== USUÁRIOS =====
export async function listarUsuarios(opts: { role?: string } = {}, auth: AuthParams = {}): Promise<Usuario[]> {
    const data = await http.get<{ items?: Usuario[] } | Usuario[]>(`/usuarios`, { params: opts, auth });
    return Array.isArray((data as { items?: Usuario[] })?.items) ? (data as { items: Usuario[] }).items : (data as Usuario[]);
}

export async function listarManutentores(auth: AuthParams = {}): Promise<Usuario[]> {
    // Inclui tanto manutentores quanto líderes de manutenção
    const data = await http.get<{ items?: Usuario[] } | Usuario[]>('/usuarios', {
        params: { roles: 'manutentor,Líder de Manutenção' },
        auth,
    });
    return Array.isArray((data as { items?: Usuario[] })?.items)
        ? (data as { items: Usuario[] }).items
        : (Array.isArray(data) ? data as Usuario[] : []);
}

export async function criarUsuario(data: UsuarioCreate, auth: AuthParams = {}): Promise<Usuario> {
    return http.post<Usuario>('/usuarios', { data, auth });
}

export async function atualizarUsuario(id: string, data: Partial<UsuarioCreate>, auth: AuthParams = {}): Promise<Usuario> {
    return http.put<Usuario>(`/usuarios/${id}`, { data, auth });
}

// ===== NOTIFICAÇÕES =====
export async function listarNotificacoesConfig(evento: string, auth: AuthParams = {}): Promise<NotificacaoConfigUser[]> {
    return http.get<NotificacaoConfigUser[]>(`/notificacoes/config/${evento}`, { auth });
}

export async function adicionarNotificacaoConfig(evento: string, usuario_id: string, auth: AuthParams = {}): Promise<NotificacaoConfigUser> {
    return http.post<NotificacaoConfigUser>(`/notificacoes/config`, {
        data: { evento, usuario_id },
        auth
    });
}

export async function removerNotificacaoConfig(evento: string, usuarioId: string, auth: AuthParams = {}): Promise<void> {
    return http.delete(`/notificacoes/config/${evento}/${usuarioId}`, { auth });
}

export async function excluirUsuario(id: string, auth: AuthParams): Promise<unknown> {
    return http.delete(`/usuarios/${encodeURIComponent(id)}`, { auth });
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
    return http.get<EstatisticasUsuario>(`/usuarios/${id}/estatisticas`, { auth });
}

// ===== PEÇAS / ESTOQUE =====
export async function listarPecas(): Promise<Peca[]> {
    const data = await http.get<{ items?: Peca[] } | Peca[]>('/pecas');
    return (data as { items?: Peca[] })?.items || (data as Peca[]);
}

export async function criarPeca(payload: PecaCreate, auth: AuthParams): Promise<Peca> {
    return http.post<Peca>('/pecas', { data: payload, auth });
}

export async function atualizarPeca(id: string, payload: Partial<PecaCreate>, auth: AuthParams): Promise<Peca> {
    return http.put<Peca>(`/pecas/${encodeURIComponent(id)}`, { data: payload, auth });
}

export async function excluirPeca(id: string, auth: AuthParams): Promise<unknown> {
    return http.delete(`/pecas/${encodeURIComponent(id)}`, { auth });
}

export async function registrarMovimentacao(pecaId: string, mov: Movimentacao, auth: AuthParams = {}): Promise<unknown> {
    return http.post(`/pecas/${encodeURIComponent(pecaId)}/movimentacoes`, { data: mov, auth });
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
    const data = await http.get<{ items?: MovimentacaoHistorico[] }>('/movimentacoes', { params });
    return data.items || [];
}

// ===== CAUSAS =====
export async function listarCausas(): Promise<Causa[]> {
    const data = await http.get<{ items?: Causa[] } | Causa[]>('/causas');
    return (data as { items?: Causa[] })?.items ?? (data as Causa[]);
}

export async function listarCausasRaiz(): Promise<Causa[]> {
    return listarCausas();
}

export async function criarCausa(payload: { nome: string }, auth: AuthParams): Promise<Causa> {
    return http.post<Causa>('/causas', { data: payload, auth });
}

export async function excluirCausa(id: string, auth: AuthParams): Promise<unknown> {
    return http.delete(`/causas/${encodeURIComponent(id)}`, { auth });
}

// ===== ANALYTICS =====
export async function listarParetoCausas(params: { from?: string; to?: string; maquinaId?: string } = {}, auth?: AuthParams): Promise<ParetoResponse> {
    return http.get<ParetoResponse>('/analytics/pareto-causas', { params, auth });
}

// ===== CHECKLIST PREVENTIVA =====
export async function atualizarChecklistChamado(id: string, checklist: unknown, auth: AuthParams = {}): Promise<unknown> {
    return apiFetch(`/chamados/${id}/checklist`, {
        method: 'PATCH',
        body: {
            checklist,
            userEmail: auth.email || getLoggedUserEmail() || ""
        },
        auth,
    });
}

// ===== AUTH =====
export async function login(payload: LoginPayload): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { identifier: payload.userOrEmail, senha: payload.senha },
    });
}

export async function forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
    return http.post<{ ok: boolean; message: string }>('/auth/forgot-password', { data: { email } });
}

export async function resetPassword(payload: { token: string; novaSenha: string }): Promise<{ ok: boolean; message: string }> {
    return http.post<{ ok: boolean; message: string }>('/auth/reset-password', { data: payload });
}

export async function changePassword(payload: ChangePasswordPayload): Promise<{ ok: boolean }> {
    return http.post<{ ok: boolean }>('/auth/change-password', { data: payload });
}

// ===== OPERATOR AUTH =====
export interface OperadorListItem {
    id: string;
    nome: string;
}

export async function listarOperadoresAtivos(): Promise<OperadorListItem[]> {
    const data = await http.get<{ items?: OperadorListItem[] } | OperadorListItem[]>('/operators/active');
    return Array.isArray((data as { items?: OperadorListItem[] })?.items)
        ? (data as { items: OperadorListItem[] }).items
        : (Array.isArray(data) ? data as OperadorListItem[] : []);
}

export async function loginOperador(operadorId: string, matricula: string): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/auth/operator-login', {
        method: 'POST',
        body: { operadorId, matricula },
    });
}

// ===== SSE =====
// Moved to singleton hook: src/hooks/useSSE.ts
// connectSSE and subscribeSSE removed — use useSSE('topic', callback) instead.

// ===== PRODUÇÃO =====
export interface ProducaoMeta {
    id: string;
    maquinaId: string;
    maquinaNome: string;
    dataInicio: string;
    dataFim?: string;
    horasMeta: number;
    criadoEm: string;
    atualizadoEm: string;
}

export interface ProducaoResumoDiario {
    maquinaId: string;
    maquinaNome: string;

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
    const data = await http.get<{ items?: ProducaoMeta[] }>('/producao/metas', { params });
    return data.items || [];
}

export async function criarMetaProducao(payload: { maquinaId: string; dataInicio: string; dataFim?: string; horasMeta: number }, auth: AuthParams): Promise<ProducaoMeta> {
    return http.post<ProducaoMeta>('/producao/metas', { data: payload, auth });
}

// Lançamentos

// Rendimento
export async function listarResumoDiarioProducao(params: { dataRef?: string; dataInicio?: string; dataFim?: string } = {}): Promise<ProducaoResumoDiario[]> {
    const data = await http.get<{ items?: ProducaoResumoDiario[] }>('/producao/resumo-diario', { params });
    return data.items || [];
}

// Uploads
export async function listarUploadsProducao(params: { dataRef?: string } = {}): Promise<ProducaoUpload[]> {
    const data = await http.get<{ items?: ProducaoUpload[] }>('/producao/uploads', { params });
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
    return http.get('/producao/uploads/historico', { params });
}

export interface UltimoUpload {
    id: string;
    dataRef: string;
    criadoEm: string;
    nomeArquivo: string;
}

export async function buscarUltimoUploadProducao(): Promise<UltimoUpload | null> {
    const data = await http.get<{ upload?: UltimoUpload }>('/producao/uploads/ultimo');
    return data.upload || null;
}

export async function uploadLancamentosProducao(rows: Record<string, unknown>[], nomeArquivo: string, auth: AuthParams): Promise<{
    ok: boolean;
    resultados: Array<{ dataRef: string; uploadId: string; linhasProcessadas: number; horasTotal: number }>;
    erros: Array<{ linha: number; erro: string }>;
    resumo: { totalLinhas: number; linhasValidas: number; linhasComErro: number; datasProcessadas: number };
}> {
    return http.post('/producao/lancamentos/upload', { data: { rows, nomeArquivo }, auth });
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
    return apiFetch<Maquina>(`/maquinas/${id}/escopo`, {
        method: 'PATCH',
        body: payload,
        auth,
    });
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
    return http.get<FuncionarioMeta[]>('/producao/metas/funcionarios');
}

export async function fetchFuncionariosDia(dataISO: string): Promise<any[]> {
    return http.get<any[]>('/producao/indicadores/funcionarios/dia', { params: { data: dataISO } });
}

export async function fetchFuncionariosMes(anoMesISO: string): Promise<any[]> {
    return http.get<any[]>('/producao/indicadores/funcionarios/mes', { params: { anoMes: anoMesISO } });
}

export async function upsertFuncionarioMeta(payload: FuncionarioMeta, auth: AuthParams = {}): Promise<unknown> {
    return http.post('/producao/metas/funcionarios', { data: payload, auth });
}

// Detalhe de um upload de produção
export interface ProducaoLancamentoDetalhe {
    id: string;
    maquinaId: string;
    maquinaNome: string;
    maquinaNomeProducao?: string | null;
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
        maquinaNomeProducao?: string | null;
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
    return http.get<ProducaoUploadDetalhe>(`/producao/uploads/${uploadId}`);
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

interface RoleCreate {
    nome: string;
    descricao?: string;
    permissoes: Record<string, NivelPermissao>;
}

interface RoleUpdate {
    nome: string;
    descricao?: string;
    permissoes: Record<string, NivelPermissao>;
}

// Listar todas as páginas disponíveis para permissões
export async function listarPaginasPermissao(auth: AuthParams = {}): Promise<PaginaPermissao[]> {
    const data = await http.get<{ items?: PaginaPermissao[] }>('/roles/pages', { auth });
    return data.items || [];
}

// Listar todos os roles (requer permissão roles: ver)
export async function listarRoles(auth: AuthParams = {}): Promise<Role[]> {
    const data = await http.get<{ items?: Role[] }>('/roles', { auth });
    return data.items || [];
}

// Listar roles para dropdowns (não requer permissão especial)
export async function listarRolesOptions(auth: AuthParams = {}): Promise<{ id: string; nome: string }[]> {
    const data = await http.get<{ items?: { id: string; nome: string }[] }>('/roles/options', { auth });
    return data.items || [];
}

// Criar novo role
export async function criarRole(payload: RoleCreate, auth: AuthParams = {}): Promise<Role> {
    return http.post<Role>('/roles', { data: payload, auth });
}

// Atualizar role
export async function atualizarRole(id: string, payload: RoleUpdate, auth: AuthParams = {}): Promise<Role> {
    return http.put<Role>(`/roles/${id}`, { data: payload, auth });
}

// Excluir role
export async function excluirRole(id: string, auth: AuthParams = {}): Promise<void> {
    await http.delete(`/roles/${id}`, { auth });
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
    setor: string | null;
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

// Upload de reserva de capacidade
export async function uploadCapacidade(rows: Record<string, unknown>[], nomeArquivo: string, auth: AuthParams): Promise<CapacidadeUploadResult> {
    return http.post<CapacidadeUploadResult>('/planejamento/capacidade/upload', { data: { rows, nomeArquivo }, auth });
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
    return http.get('/planejamento/capacidade/resumo', {
        params: uploadId ? { uploadId } : {},
        auth,
    });
}

// Listar uploads de capacidade
export async function listarUploadsCapacidade(auth: AuthParams): Promise<CapacidadeUpload[]> {
    const data = await http.get<{ items?: CapacidadeUpload[] }>('/planejamento/capacidade/uploads', { auth });
    return data.items || [];
}

// Tipo para máquina com configurações de planejamento
export interface MaquinaPlanejamento {
    id: string;
    nome: string;
    nomeProducao: string | null;
    tag: string;
    setorOriginal: string;
    capacidadeHoras: number;
    aliasesPlanejamento: string[];
    escopoPlanejamento: boolean;
    setorPlanejamento?: string | null;
}

// Listar máquinas com escopo planejamento
export async function listarMaquinasPlanejamento(auth: AuthParams): Promise<MaquinaPlanejamento[]> {
    const data = await http.get<{ items?: MaquinaPlanejamento[] }>('/planejamento/capacidade/maquinas', { auth });
    return data.items || [];
}

// Atualizar capacidade/aliases de uma máquina
export async function atualizarMaquinaPlanejamento(
    id: string,
    payload: { capacidadeHoras?: number; aliasesPlanejamento?: string[]; escopoPlanejamento?: boolean; setorPlanejamento?: string },
    auth: AuthParams
): Promise<MaquinaPlanejamento> {
    return apiFetch<MaquinaPlanejamento>(`/planejamento/capacidade/maquinas/${id}`, {
        method: 'PATCH',
        body: payload,
        auth,
    });
}

// ===== QUALIDADE / REFUGOS =====
export async function listarRefugos(params: { page?: number; limit?: number; dataInicio?: string; dataFim?: string; origem?: string | string[]; responsavel?: string | string[]; tipo?: string; tipoLancamento?: string } = {}, auth: AuthParams = {}): Promise<{ items: any[]; meta: any }> {
    const res = await http.get<{ items: any[]; meta: any }>(`/qualidade/refugos`, { params, auth });
    return res;
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

// ===== QUALIDADE / RETRABALHO CONFIGURAÇÕES =====

export async function listarNaoConformidades(todos = false): Promise<QualidadeOpcao[]> {
    return http.get<QualidadeOpcao[]>('/qualidade/nao-conformidades', { params: { todos } });
}

export async function criarNaoConformidade(nome: string, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.post<QualidadeOpcao>('/qualidade/nao-conformidades', { data: { nome }, auth });
}

export async function editarNaoConformidade(id: number, data: { nome?: string; ativo?: boolean }, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.put<QualidadeOpcao>(`/qualidade/nao-conformidades/${id}`, { data, auth });
}

export async function getNaoConformidadeUsage(id: number): Promise<{ count: number }> {
    return http.get<{ count: number }>(`/qualidade/nao-conformidades/${id}/usage`);
}

export async function deletarNaoConformidade(id: number, transferToId?: number, auth: AuthParams = {}): Promise<unknown> {
    return http.delete(`/qualidade/nao-conformidades/${id}`, { data: { transferToId }, auth });
}

export async function listarSolicitantes(todos = false): Promise<QualidadeOpcao[]> {
    return http.get<QualidadeOpcao[]>('/qualidade/solicitantes', { params: { todos } });
}

export async function criarSolicitante(nome: string, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.post<QualidadeOpcao>('/qualidade/solicitantes', { data: { nome }, auth });
}

export async function editarSolicitante(id: number, data: { nome?: string; ativo?: boolean }, auth: AuthParams = {}): Promise<QualidadeOpcao> {
    return http.put<QualidadeOpcao>(`/qualidade/solicitantes/${id}`, { data, auth });
}

export async function getSolicitanteUsage(id: number): Promise<{ count: number }> {
    return http.get<{ count: number }>(`/qualidade/solicitantes/${id}/usage`);
}

export async function deletarSolicitante(id: number, transferToId?: number, auth: AuthParams = {}): Promise<unknown> {
    return http.delete(`/qualidade/solicitantes/${id}`, { data: { transferToId }, auth });
}

export async function listarResponsaveis(params: { dataInicio?: string; dataFim?: string; origem?: string; tipo?: string; tipoLancamento?: string } = {}, auth: AuthParams = {}): Promise<string[]> {
    const res = await http.get<{ items: string[] }>(`/qualidade/analytics/responsaveis`, { params, auth });
    return res.items || [];
}

// ===== QUALITY COMPARISON =====
export interface QualityComparisonPeriod {
    label: string;
    totalCost: number;
    totalQuantity: number;
    count: number;
    topDefects: { motivo: string; custo: number }[];
    topOrigens: { origem: string; custo: number }[];
    topResponsaveis: { responsavel: string; custo: number }[];
}

export interface QualityComparisonDelta {
    costDiff: number;
    costPctChange: number;
    countDiff: number;
    quantityDiff: number;
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
    origem?: string | string[];
    responsavel?: string | string[];
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
    return http.put<LogisticaKpi>(`/logistica/kpis/${data}`, { data: payload, auth });
}

export async function saveLogisticaMeta(mes: number, ano: number, meta_financeira: number, auth: AuthParams = {}): Promise<LogisticaMeta> {
    return http.put<LogisticaMeta>(`/logistica/metas/${mes}/${ano}`, { data: { meta_financeira }, auth });
}

// ===== LOGÍSTICA — NOTAS DE EMBARQUE (PAINEL) =====

export interface NotaEmbarque {
    id: string;
    upload_id: string;
    ordem_venda: string;
    nome_cliente: string;
    transportadora: string;
    nota_fiscal: string;
    valor_net: number;
    peso_bruto: number;
    qtd_volume: number;
    data_emissao: string;
    tipo_operacao: string;
    condicoes_entrega: string;
    tipo_frete: string;
    valor_moeda: number;
    dias_atraso: number;
    uploaded_at: string;
    uploaded_by: string | null;
}

export interface NotasEmbarqueUploadResult {
    uploadId: string;
    inserted: number;
    errors: { linha: number; erro: string }[];
    message: string;
}

export interface NotasEmbarqueResponse {
    items: NotaEmbarque[];
    uploadInfo: {
        uploadId: string;
        uploadedAt: string;
        uploadedBy: string | null;
        uploaderName: string | null;
        totalRows: number;
    } | null;
}

export async function uploadNotasEmbarque(rows: Record<string, unknown>[], auth: AuthParams = {}): Promise<NotasEmbarqueUploadResult> {
    return http.post<NotasEmbarqueUploadResult>('/logistica/notas-embarque/upload', { data: { rows }, auth });
}

export async function getNotasEmbarque(auth: AuthParams = {}): Promise<NotasEmbarqueResponse> {
    return http.get<NotasEmbarqueResponse>('/logistica/notas-embarque', { auth });
}

export async function deleteNotasEmbarque(uploadId: string, auth: AuthParams = {}): Promise<{ deleted: number }> {
    return http.delete<{ deleted: number }>(`/logistica/notas-embarque/${uploadId}`, { auth });
}

// ===== LOGÍSTICA — PRINC 1 =====

export interface Princ1Item {
    id: string;
    upload_id: string;
    numero_item: string;
    nome_item: string;
    configuracao: string;
    estoque_fisico: number;
    deposito: string;
    localizacao: string;
    numero_lote: string;
    numero_serie: string;
    data_entrada: string;
    dias_atraso: number;
}

export interface Princ1UploadResult {
    uploadId: string;
    inserted: number;
    errors: { linha: number; erro: string }[];
    message: string;
}

export interface Princ1Response {
    items: Princ1Item[];
    uploadInfo: {
        uploadId: string;
        nomeArquivo: string;
        criadoEm: string;
        uploadPorEmail: string | null;
        uploadPorNome: string | null;
        totalRows: number;
    } | null;
}

export async function uploadPrinc1(rows: Record<string, unknown>[], fileName: string, auth: AuthParams = {}): Promise<Princ1UploadResult> {
    return http.post<Princ1UploadResult>('/logistica/princ1/upload', { data: { rows, fileName }, auth });
}

export async function getPrinc1(auth: AuthParams = {}): Promise<Princ1Response> {
    return http.get<Princ1Response>('/logistica/princ1', { auth });
}

export async function deletePrinc1(uploadId: string, auth: AuthParams = {}): Promise<{ deleted: number }> {
    return http.delete<{ deleted: number }>(`/logistica/princ1/${uploadId}`, { auth });
}

// ===== LOGÍSTICA — FATURAMENTO PROPOSTO (HTML) =====

export interface LogisticaPropostoItem {
    id: string;
    upload_id: string;
    canal_vendas: number | null;
    canal_descricao: string;
    roteiro_separacao: string;
    data_hora: string | null;
    ordem_venda: string;
    conta_cliente: string;
    nome_cliente: string;
    numero_item: string;
    configuracao: string;
    filial: string;
    tipo_destino: string;
    localizacao: string;
    valor_net: number;
    cidade: string;
    estado: string;
    dias_desde_proposta: number;
}

export interface LogisticaPropostoUploadResult {
    uploadId: string | null;
    inserted: number;
    errors: { linha: number; erro: string }[];
    message: string;
}

export interface LogisticaPropostoResponse {
    items: LogisticaPropostoItem[];
    uploadInfo: {
        uploadId: string;
        nomeArquivo: string;
        criadoEm: string;
        uploadPorEmail: string | null;
        uploadPorNome: string | null;
        totalRows: number;
    } | null;
}

export async function uploadLogisticaProposto(
    rows: Record<string, unknown>[],
    fileName: string,
    auth: AuthParams = {}
): Promise<LogisticaPropostoUploadResult> {
    return http.post<LogisticaPropostoUploadResult>('/logistica/proposto/upload', { data: { rows, fileName }, auth });
}

export async function getLogisticaProposto(auth: AuthParams = {}): Promise<LogisticaPropostoResponse> {
    return http.get<LogisticaPropostoResponse>('/logistica/proposto', { auth });
}

export async function deleteLogisticaProposto(uploadId: string, auth: AuthParams = {}): Promise<{ deleted: number }> {
    return http.delete<{ deleted: number }>(`/logistica/proposto/${uploadId}`, { auth });
}

// ---------- Melhoria Contínua - Kaizen ----------
export async function listarKaizens(
    params: { maquinaId?: string; status?: string; page?: number; limit?: number } = {},
    auth: AuthParams = {}
): Promise<{ data: Kaizen[]; meta: { total: number; page: number; limit: number } }> {
    return http.get('/melhoria-continua/kaizens', { params, auth });
}

export async function getKaizen(id: string, auth: AuthParams = {}): Promise<Kaizen> {
    return http.get<Kaizen>(`/melhoria-continua/kaizens/${id}`, { auth });
}

export async function criarKaizen(data: KaizenCreate, auth: AuthParams = {}): Promise<Kaizen> {
    return http.post<Kaizen>('/melhoria-continua/kaizens', { data, auth });
}

export async function atualizarKaizen(id: string, data: Partial<KaizenCreate>, auth: AuthParams = {}): Promise<Kaizen> {
    return http.put<Kaizen>(`/melhoria-continua/kaizens/${id}`, { data, auth });
}

export async function deletarKaizen(id: string, auth: AuthParams = {}): Promise<void> {
    return http.delete(`/melhoria-continua/kaizens/${id}`, { auth });
}

export async function uploadKaizenThumbnail(id: string, file: File, auth: AuthParams = {}): Promise<{ thumbnail_url: string }> {
    const formData = new FormData();
    formData.append("file", file);

    const headers = buildAuthHeaders(auth);

    const BASE = (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE || "http://localhost:3000").replace(/\/+$/, "");
    const res = await fetch(`${BASE}/melhoria-continua/kaizens/${id}/thumbnail`, {
        method: "POST",
        headers,
        body: formData,
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

// ---------- Melhoria Contínua - Kamishibai ----------
export async function getKamishibaiPerguntas(kaizenId: string, auth: AuthParams = {}): Promise<KamishibaiPergunta[]> {
    const res = await http.get<KamishibaiPergunta[]>(`/melhoria-continua/kamishibai/${kaizenId}/perguntas`, { auth });
    return res || [];
}

export async function configKamishibaiPerguntas(
    kaizenId: string,
    perguntas: { texto_pergunta: string; ordem?: number }[],
    auth: AuthParams = {}
): Promise<KamishibaiPergunta[]> {
    const res = await http.post<KamishibaiPergunta[]>(`/melhoria-continua/kamishibai/${kaizenId}/perguntas`, { data: perguntas, auth });
    return res || [];
}

export async function realizarAuditoriaKamishibai(
    kaizenId: string,
    payload: PerformAuditPayload,
    auth: AuthParams = {}
): Promise<KamishibaiAudit> {
    return http.post<KamishibaiAudit>(`/melhoria-continua/kamishibai/auditoria`, { data: payload, auth });
}

export async function getKamishibaiDashboard(auth: AuthParams = {}): Promise<KamishibaiDashboardData> {
    const res = await http.get<any>('/melhoria-continua/kamishibai/dashboard', { auth });
    if (res?.resumo) {
        return {
            totalOK: res.resumo.conforme || 0,
            totalNOK: res.resumo.nao_conforme || 0,
            totalPendente: res.resumo.pendente || 0,
        };
    }
    return { totalOK: 0, totalNOK: 0, totalPendente: 0 };
}

export async function getKamishibaiHistorico(kaizenId?: string, auth: AuthParams = {}): Promise<any[]> {
    const url = kaizenId ? `/melhoria-continua/kamishibai/historico/${kaizenId}` : '/melhoria-continua/kamishibai/historico';
    const res = await http.get<any[]>(url, { auth });
    return res || [];
}
