// Tipos de resposta da API — fonte de verdade compartilhada entre API e frontend

// ---------- Tipos locais (usados internamente neste arquivo) ----------
type ChamadoStatus = 'Aberto' | 'Em Andamento' | 'Concluido';
type NivelPermissao = 'nenhum' | 'ver' | 'editar';

interface ChecklistItem {
    key?: string;
    texto?: string;
    item?: string;
    ok?: boolean;
    resposta?: string | null;
}

// ---------- Auth ----------
export interface AuthParams {
    role?: string;
    email?: string;
    criadoPorEmail?: string;
}

// ---------- Chamados ----------
export type ChamadoTipo = 'corretiva' | 'preventiva' | 'preditiva';

export interface Chamado {
    id: string;
    maquina?: string;
    maquinaNome?: string;
    maquina_nome?: string;
    maquinaId?: string;
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
    nome_producao?: string;
    setor?: string;
    tag?: string;
    escopo_manutencao?: boolean;
    escopo_producao?: boolean;
    escopo_planejamento?: boolean;
    aliases_producao?: string[];
    parent_maquina_id?: string;
    is_maquina_mae?: boolean;
    exibir_filhos_dashboard?: boolean;
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
    parentId?: string;
    isMaquinaMae?: boolean;
    exibirFilhosDashboard?: boolean;
    escopoManutencao?: boolean;
    escopoProducao?: boolean;
    escopoPlanejamento?: boolean;
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
    matricula?: string;
    ativo?: boolean;
    permissoes?: Record<string, NivelPermissao>;
}

export interface UsuarioCreate {
    nome: string;
    usuario?: string;
    email?: string;
    role?: string;
    funcao?: string;
    senha?: string;
    matricula?: string;
    permissoes?: Record<string, NivelPermissao>;
}

export interface UsuarioVerificarResponse {
    disponivel: boolean;
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
    token?: string;
    permissoes?: Record<string, NivelPermissao>;
    roleId?: string;
    roleNome?: string;
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

// ---------- Conclusão Chamado ----------
export interface ConcluirChamadoPayload {
    tipo?: string;
    causa?: string;
    solucao?: string;
    checklist?: ChecklistItem[];
}

// ---------- Logística ----------
export interface LogisticaMeta {
    id: string;
    mes: number;
    ano: number;
    meta_financeira: number;
    updated_at: string;
}

export interface LogisticaKpi {
    id: string;
    data: string; // YYYY-MM-DD
    faturado_acumulado: number;
    exportacao_acumulado: number;
    devolucoes_dia: number;
    total_linhas: number;
    linhas_atraso: number;
    backlog_atraso: number;
    ottr_ytd: number;
    is_dia_util: boolean;
    updated_at: string;
}

export interface LogisticaDashboardData {
    meta: LogisticaMeta | null;
    items: LogisticaKpi[];
    previousItems: LogisticaKpi[];
}

// ---------- Notificações ----------
export interface NotificacaoConfigUser {
    id: string;
    evento: string;
    usuario_id: string;
    nome: string;
    email: string;
}

// ---------- Melhoria Contínua ----------
export interface Kaizen {
    id: string;
    titulo: string;
    maquina_id?: string;
    maquina_nome?: string;
    status: 'planejado' | 'em_andamento' | 'concluido' | 'padronizado' | string;
    problema_antes?: string;
    solucao_depois?: string;
    ganhos?: string;
    data_implementacao?: string;
    thumbnail_url?: string;
    criado_por?: string;
    criado_em?: string;
    atualizado_em?: string;

    // Virtual fields for frontend projection
    kamishibaiStatus?: 'OK' | 'NOK' | 'Pendente';
    ultimaAuditoria?: KamishibaiAudit;
}

export interface KaizenCreate {
    titulo: string;
    maquina_id?: string;
    status?: string;
    problema_antes?: string;
    solucao_depois?: string;
    ganhos?: string;
    data_implementacao?: string;
    thumbnail_url?: string;
}

export interface KamishibaiPergunta {
    id: string;
    kaizen_id: string;
    texto_pergunta: string;
    ordem?: number;
    ativo?: boolean;
    criado_em?: string;
}

export interface KamishibaiAudit {
    id: string;
    kaizen_id: string;
    auditor_id: string;
    auditor_nome?: string;
    data_auditoria: string;
    status: 'conforme' | 'nao_conforme' | string;
    observacoes?: string;
    respostas?: KamishibaiResposta[];
}

export interface KamishibaiResposta {
    id: string;
    auditoria_id: string;
    pergunta_id: string;
    is_conforme: boolean;
    observacao?: string;
}

export interface PerformAuditPayload {
    kaizen_id: string;
    status: 'conforme' | 'nao_conforme';
    observacoes?: string;
    respostas: {
        pergunta_id: string;
        is_conforme: boolean;
        observacao?: string;
    }[];
}

export interface KamishibaiDashboardData {
    totalOK: number;
    totalNOK: number;
    totalPendente: number;
}

// ---------- Produção (Novo Módulo Metas) ----------
export interface ProducaoSetor {
    id: string;
    nome: string;
    ordem: number;
    ativo: boolean;
    criadoEm: string;
    atualizadoEm?: string;
}

export interface ProducaoSetorCreate {
    nome: string;
    ordem?: number;
    ativo?: boolean;
}

export interface ProducaoMetaPadrao {
    id: string;
    maquinaId: string;
    ano: number;
    mes: number;
    horasMeta: number;
    atualizadoEm?: string;
}

export interface ProducaoMetaDia {
    id: string;
    maquinaId: string;
    dataRef: string; // YYYY-MM-DD
    horasMeta: number;
    atualizadoEm?: string;
}

export interface MetaUpsertPayload {
    maquinaId: string;
    ano?: number; // Para padrão
    mes?: number; // Para padrão
    dataRef?: string; // Para dia (YYYY-MM-DD)
    horasMeta: number | null; // null para remover override do dia
}

export interface ResultadoDia {
    dia: string;
    horasRealizadas: number;
    horasMeta: number | null;
}

export interface ResultadoMaquina {
    maquinaId: string;
    maquinaNome: string;
    isMaquinaMae?: boolean;
    dias: ResultadoDia[];
    totalRealizado: number;
    totalMeta: number;
}

export interface ResultadoSetor {
    setorId: string | null;
    setorNome: string;
    maquinas: ResultadoMaquina[];
}

export interface ResultadosMensais {
    ano: number;
    mes: number;
    diasMes: string[];
    setores: ResultadoSetor[];
}

export interface MaquinaProducaoConfig {
    id: string;
    nome: string;
    nomeProducao?: string;
    setorProducaoId: string | null;
    ordemProducao: number;
    escopoProducao: boolean;
}

// ---------- EHS / Safety ----------
export interface SafetyCandidato {
    usuarioId: string;
    nome: string;
    score: number;
}

export interface SafetyPendente {
    observadorTexto: string;
    qtdRegistros: number;
    candidatos: SafetyCandidato[];
}

export interface SafetyUploadResumo {
    totalLinhasCsv: number;
    registrosUnicos: number;
    novos: number;
    atualizados: number;
}

export interface SafetyUploadResponse {
    ok: boolean;
    resumo: SafetyUploadResumo;
    pendentes: SafetyPendente[];
}

export interface SafetyResolverPayload {
    resolucoes: Array<{ observadorTexto: string; usuarioId: string }>;
}

export interface SafetyResolverResponse {
    ok: boolean;
    mapeamentosSalvos: number;
    observacoesAtualizadas: number;
}

export interface SafetyComplianceMensal {
    usuarioId: string;
    nome: string;
    funcao: string | null;
    meses: number[];
}

export interface SafetyUploadHistory {
    id: string;
    nome_arquivo: string;
    total_linhas: number;
    registros_novos: number;
    registros_atualizados: number;
    criado_em: string;
    enviado_por: string | null;
    mes_referencia?: string;
}

