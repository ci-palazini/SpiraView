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

// Tenta obter o token salvo
function getLoggedUserToken(): string {
    try {
        const raw = localStorage.getItem('usuario');
        if (!raw) return '';
        const obj = JSON.parse(raw);
        return obj?.token ? String(obj.token).trim() : '';
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
    const url = `${BASE}${path}`;
    const h: Record<string, string> = { ...buildAuthHeaders(auth), ...headers };
    const init: RequestInit = { method, headers: h, cache: 'no-store' };

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

// ===== AUTH =====
export async function me(): Promise<Record<string, unknown>> {
    return apiFetch<Record<string, unknown>>('/auth/me');
}

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

export async function getChamado(id: string, auth: AuthParams = {}): Promise<Chamado> {
    return apiFetch<Chamado>(`/chamados/${id}`, { auth });
}

export async function listarChamadosPorMaquina(maquinaId: string, opts: { status?: string } = {}): Promise<Chamado[]> {
    const data = await http.get<{ items?: Chamado[] } | Chamado[]>('/chamados', {
        params: { maquinaId, status: opts.status },
    });
    return (data as { items?: Chamado[] })?.items || (data as Chamado[]);
}

export async function atribuirChamado(id: string, auth: AuthParams & { manutentorEmail: string }): Promise<unknown> {
    return http.post(`/chamados/${id}/atribuir`, { data: { manutentorEmail: auth.manutentorEmail }, auth });
}

export async function removerAtribuicao(id: string, auth: AuthParams): Promise<unknown> {
    return http.delete(`/chamados/${id}/atribuir`, { auth });
}

export async function assumirChamado(id: string, auth: AuthParams = {}): Promise<unknown> {
    return http.post(`/chamados/${id}/assumir`, { data: {}, auth });
}

export async function atualizarStatusChamado(id: string, status: string, auth: AuthParams = {}): Promise<unknown> {
    return http.post(`/chamados/${id}/status`, { data: { status }, auth });
}

export async function atenderChamado(id: string, auth: AuthParams = {}): Promise<unknown> {
    return http.post(`/chamados/${id}/atender`, { data: {}, auth });
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

export async function obterMaquina(id: string): Promise<Maquina> {
    return http.get<Maquina>(`/maquinas/${encodeURIComponent(id)}`);
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

export async function getChecklistDiario(maquinaId: string): Promise<ChecklistDiarioItem[]> {
    const data = await http.get<{ items?: ChecklistDiarioItem[] } | ChecklistDiarioItem[]>(
        `/maquinas/${maquinaId}/checklist-diario`
    );
    return Array.isArray((data as { items?: ChecklistDiarioItem[] })?.items)
        ? (data as { items: ChecklistDiarioItem[] }).items
        : (Array.isArray(data) ? data as ChecklistDiarioItem[] : []);
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

export async function registrarSubmissaoDiaria(data: SubmissaoDiariaCreate): Promise<unknown> {
    return http.post('/checklists/daily/submissoes', { data });
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

// ===== AI =====
export async function aiChatSql(opts: { question: string; noCache?: boolean }, auth: AuthParams = {}): Promise<AiChatSqlResponse> {
    if (!opts.question || !String(opts.question).trim()) {
        throw new Error('question é obrigatório');
    }
    return http.post<AiChatSqlResponse>('/ai/chat/sql', {
        data: { question: opts.question, noCache: !!opts.noCache },
        auth,
    });
}

export async function aiTextSearch(opts: { q: string; limit?: number }, auth: AuthParams = {}): Promise<AiTextSearchResponse> {
    if (!opts.q || !String(opts.q).trim()) {
        throw new Error('q é obrigatório');
    }
    return http.post<AiTextSearchResponse>('/ai/chat/text', {
        data: { q: opts.q, limit: opts.limit ?? 20 },
        auth,
    });
}

// ===== CHECKLIST PREVENTIVA =====
export async function enviarChecklistPreventiva(chamadoId: string, data: { respostas: Record<string, unknown> }): Promise<unknown> {
    return http.post(`/chamados/${chamadoId}/checklist/submit`, { data });
}

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
    const data = await http.get<{ items?: ProducaoMeta[] }>('/producao/metas', { params });
    return data.items || [];
}

export async function criarMetaProducao(payload: { maquinaId: string; dataInicio: string; dataFim?: string; horasMeta: number }, auth: AuthParams): Promise<ProducaoMeta> {
    return http.post<ProducaoMeta>('/producao/metas', { data: payload, auth });
}

export async function atualizarMetaProducao(id: string, payload: { dataInicio: string; dataFim?: string; horasMeta: number }, auth: AuthParams): Promise<{ ok: boolean }> {
    return http.put<{ ok: boolean }>(`/producao/metas/${id}`, { data: payload, auth });
}

export async function excluirMetaProducao(id: string, auth: AuthParams): Promise<{ ok: boolean }> {
    return http.delete<{ ok: boolean }>(`/producao/metas/${id}`, { auth });
}

// Lançamentos
export async function listarLancamentosProducao(params: { maquinaId?: string; dataRef?: string; dataInicio?: string; dataFim?: string } = {}): Promise<ProducaoLancamento[]> {
    const data = await http.get<{ items?: ProducaoLancamento[] }>('/producao/lancamentos', { params });
    return data.items || [];
}

export async function criarLancamentoProducao(payload: { maquinaId: string; dataRef: string; turno?: string; horasRealizadas: number; observacao?: string }, auth: AuthParams): Promise<ProducaoLancamento> {
    return http.post<ProducaoLancamento>('/producao/lancamentos', { data: payload, auth });
}

export async function excluirLancamentoProducao(id: string, auth: AuthParams): Promise<{ ok: boolean }> {
    return http.delete<{ ok: boolean }>(`/producao/lancamentos/${id}`, { auth });
}

// Rendimento
export async function listarRendimentoProducao(params: { maquinaId?: string; dataInicio?: string; dataFim?: string } = {}): Promise<ProducaoRendimento[]> {
    const data = await http.get<{ items?: ProducaoRendimento[] }>('/producao/rendimento', { params });
    return data.items || [];
}

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

// Obter role por ID
export async function buscarRole(id: string, auth: AuthParams = {}): Promise<Role> {
    return http.get<Role>(`/roles/${id}`, { auth });
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
    tag: string;
    capacidadeHoras: number;
    aliasesPlanejamento: string[];
    escopoPlanejamento: boolean;
}

// Listar máquinas com escopo planejamento
export async function listarMaquinasPlanejamento(auth: AuthParams): Promise<MaquinaPlanejamento[]> {
    const data = await http.get<{ items?: MaquinaPlanejamento[] }>('/planejamento/capacidade/maquinas', { auth });
    return data.items || [];
}

// Atualizar capacidade/aliases de uma máquina
export async function atualizarMaquinaPlanejamento(
    id: string,
    payload: { capacidadeHoras?: number; aliasesPlanejamento?: string[]; escopoPlanejamento?: boolean },
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
