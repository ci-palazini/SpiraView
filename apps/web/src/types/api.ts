// src/types/api.ts
// Tipos compartilhados para a API

// ---------- Auth ----------
export interface AuthParams {
    role?: string;
    email?: string;
    criadoPorEmail?: string;
}

// ---------- Chamados ----------
export type ChamadoTipo = 'corretiva' | 'preventiva' | 'preditiva';
export type ChamadoStatus = 'Aberto' | 'Em Andamento' | 'Concluido';

export interface Chamado {
    id: string;
    maquina?: string;
    maquinaNome?: string;
    maquina_nome?: string;
    maquinaId?: string;
    maquinaTag?: string;
    tipo?: ChamadoTipo | string;
    status?: ChamadoStatus | string;
    descricao?: string;
    assunto?: string;
    criado_em?: string;
    criadoEm?: string;
    criado_por?: string;
    criadoPorEmail?: string;
    atribuido_a?: string;
    manutentorEmail?: string;
    concluido_em?: string;
    causa?: string;
    solucao?: string;
    checklist?: ChecklistItem[];
    observacoes?: Observacao[];
}

export interface ChamadoCreate {
    maquinaTag?: string;
    maquinaNome?: string;
    maquinaId?: string;
    descricao: string;
    manutentorEmail?: string;
    tipo?: ChamadoTipo;
    checklistItemKey?: string;
    item?: string;
    status?: string;
    criadoPorEmail?: string;
}

export interface ChecklistItem {
    key?: string;
    texto?: string;
    item?: string;
    ok?: boolean;
    resposta?: string;
}

export interface Observacao {
    id?: string;
    texto?: string;
    autor?: string;
    criado_em?: string;
}

export interface ListaChamadosParams {
    status?: string;
    tipo?: string;
    maquinaId?: string;
    criadoPorEmail?: string;
    manutentorEmail?: string;
    page?: number;
    pageSize?: number;
    from?: string | Date;
    to?: string | Date;
}

export interface ListaChamadosResponse {
    items: Chamado[];
    total: number;
    page: number;
    pageSize: number;
    hasNext: boolean;
}

// ---------- Máquinas ----------
export interface Maquina {
    id: string;
    nome: string;
    tag?: string;
    setor?: string;
    critico?: boolean;
    checklist_diario?: string[];
    checklistDiario?: string[];
    chamadosAtivos?: Chamado[];
    historicoChecklist?: HistoricoDia[];
    checklistHistorico?: Submissao[];
}

export interface MaquinaCreate {
    nome: string;
    tag?: string;
    setor?: string;
    critico?: boolean;
}

// ---------- Agendamentos ----------
export type AgendamentoStatus = 'agendado' | 'iniciado' | 'concluido';

export interface Agendamento {
    id: string;
    maquinaId?: string;
    maquina_nome?: string;
    maquinaNome?: string;
    descricao?: string;
    date?: string;
    data_agendada?: string;
    start?: string;
    end?: string;
    start_ts?: string;
    status?: AgendamentoStatus | string;
    itens_checklist?: unknown[];
    itensChecklist?: unknown[];
    concluido_em?: string;
    concluidoEm?: string;
    data_original?: string;
    originalStart?: string;
}

export interface AgendamentoCreate {
    maquinaId: string;
    descricao: string;
    itensChecklist?: string[];
    date?: string;
    start?: string;
    end?: string;
}

export interface AgendamentoUpdate {
    start?: string;
    end?: string;
    status?: string;
}

// ---------- Usuários ----------
export interface Usuario {
    id: string;
    nome: string;
    usuario?: string;
    email?: string;
    role?: string;
    funcao?: string;
}

export interface UsuarioCreate {
    nome: string;
    usuario?: string;
    email?: string;
    role?: string;
    funcao?: string;
    senha?: string;
}

// ---------- Peças / Estoque ----------
export interface Peca {
    id: string;
    codigo?: string;
    nome: string;
    categoria?: string;
    unidade?: string;
    estoqueAtual?: number;
    estoqueMinimo?: number;
    localizacao?: string;
}

export interface PecaCreate {
    codigo?: string;
    nome: string;
    categoria?: string;
    estoqueAtual?: number;
    estoqueMinimo?: number;
    localizacao?: string;
}

export interface Movimentacao {
    tipo: 'entrada' | 'saida';
    quantidade: number;
    descricao?: string;
}

// ---------- Causas-Raiz ----------
export interface Causa {
    id: string;
    nome: string;
}

// ---------- Checklists ----------
export interface HistoricoDia {
    dia: string;
    turno1_ok?: boolean;
    turno2_ok?: boolean;
    turno1_operadores?: string;
    turno2_operadores?: string;
}

export interface Submissao {
    id?: string;
    criado_em?: string;
    operador_nome?: string;
    operadorNome?: string;
    operadorEmail?: string;
    maquinaId?: string;
    maquinaNome?: string;
    turno?: string;
    date?: string;
    respostas?: Record<string, string>;
}

export interface ChecklistDiarioItem {
    id?: string;
    texto?: string;
    ordem?: number;
}

export interface SubmissaoDiariaCreate {
    operadorEmail?: string;
    operadorNome?: string;
    maquinaId?: string;
    maquinaNome?: string;
    date?: string;
    turno?: string;
    respostas?: Record<string, string>;
}

// ---------- Fotos ----------
export interface Foto {
    id: string;
    url?: string;
    caminho?: string;
    mimeType?: string;
    tamanhoBytes?: number;
    criadoEm?: string;
    autorNome?: string;
}

// ---------- Analytics ----------
export interface ParetoItem {
    causa: string;
    count: number;
    pct?: number;
    acumulado?: number;
}

export interface ParetoResponse {
    total: number;
    items: ParetoItem[];
    from?: string;
    to?: string;
}

export interface AiChatSqlResponse {
    sql: string;
    rows: Record<string, unknown>[];
    fields?: string[];
    source?: string;
    summary?: string;
    suggestions?: string[];
}

export interface AiTextSearchResponse {
    sql: string;
    rows: Record<string, unknown>[];
}

// ---------- Auth ----------
export interface LoginPayload {
    userOrEmail: string;
    senha: string;
}

export interface LoginResponse {
    id: string;
    nome: string;
    email: string;
    role: string;
    funcao?: string;
    usuario?: string;
}

export interface ChangePasswordPayload {
    email: string;
    senhaAtual: string;
    novaSenha: string;
}

// ---------- SSE ----------
export interface SSEMessage {
    topic?: string;
    action?: string;
    id?: string;
    raw?: string;
    [key: string]: unknown;
}

export interface SSEHandlers {
    hello?: (data: unknown) => void;
    chamados?: (data: unknown) => void;
    agendamentos?: (data: unknown) => void;
    checklist?: (data: unknown) => void;
    pecas?: (data: unknown) => void;
    onError?: (err: Event) => void;
    onOpen?: () => void;
}

// ---------- Eventos ----------
export interface EventoChamado {
    id?: string;
    tipo?: string;
    descricao?: string;
    criado_em?: string;
    autor?: string;
}

// ---------- Conclusão Chamado ----------
export interface ConcluirChamadoPayload {
    tipo?: string;
    causa?: string;
    solucao?: string;
    checklist?: ChecklistItem[];
}
