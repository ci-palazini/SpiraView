// src/services/apiClient.js
// ===== BASE =====
export const BASE = (
  import.meta.env?.VITE_API_URL ||
  import.meta.env?.VITE_API_BASE || // compat antigo
  "http://localhost:3000"
).replace(/\/+$/, "");

// Tenta descobrir o e-mail salvo pelo app (ajuste as chaves se necessario)
function getLoggedUserEmail() {
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

function getDevEmail() {
  try {
    return (localStorage.getItem('devEmail') || '').trim().toLowerCase();
  } catch { }
  return '';
}

function buildAuthHeaders(auth = {}) {
  const h = { 'Accept': 'application/json' };
  const email = String(
    auth?.email ||
    getDevEmail() ||
    getLoggedUserEmail() ||
    ''
  ).trim().toLowerCase();

  if (email) h['x-user-email'] = email;
  // papel via header é opcional; o back usa o role do DB
  if (auth?.role) h['x-user-role'] = String(auth.role).trim().toLowerCase();

  return h;
}

// ===== HTTP base (fetch) =====

function toQuery(params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    usp.append(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
}

async function apiFetch(path, { method = "GET", headers = {}, body, auth } = {}) {
  const url = `${BASE}${path}`;
  const h = { ...buildAuthHeaders(auth), ...headers };
  const init = { method, headers: h };

  if (body !== undefined) {
    // envia JSON por padrão
    if (!("Content-Type" in h)) h["Content-Type"] = "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  // Abort por segurança (timeout simples)
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  init.signal = ctrl.signal;

  let res;
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
  return payload;
}

// GET/POST helpers
export const http = {
  get: (path, { params, ...opts } = {}) => apiFetch(`${path}${toQuery(params)}`, opts),
  post: (path, { data, ...opts } = {}) => apiFetch(path, { method: "POST", body: data, ...opts }),
};

export async function criarChamado({
  maquinaTag,
  maquinaNome,
  maquinaId,
  descricao,
  manutentorEmail,
  tipo,
  checklistItemKey,
  item,
  status,
  criadoPorEmail,
  ...extras
}, auth = {}) {
  if (!maquinaId && !maquinaTag && !maquinaNome) {
    throw new Error('Informe maquinaId, maquinaTag ou maquinaNome.');
  }

  const body = {
    descricao: String(descricao || '').trim(),
    // default do nosso fluxo
    tipo: String(tipo || 'corretiva'),
    ...extras
  };

  if (maquinaId) body.maquinaId = String(maquinaId);
  if (maquinaTag) body.maquinaTag = String(maquinaTag).trim();
  if (maquinaNome) body.maquinaNome = String(maquinaNome).trim();
  if (manutentorEmail) body.manutentorEmail = String(manutentorEmail).trim().toLowerCase();
  if (checklistItemKey) body.checklistItemKey = String(checklistItemKey).trim();
  if (item) body.item = String(item).trim();

  const res = await fetch(`${BASE}/chamados`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders({ role: auth.role || 'operador', email: auth.email }),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha ao criar chamado (${res.status})`);
  return data;
}

export async function listarChamadosPorCriador(email, page = 1, pageSize = 50) {
  const res = await fetch(
    `${BASE}/chamados?criadoPorEmail=${encodeURIComponent(email)}&page=${page}&pageSize=${pageSize}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Erro ao listar chamados (${res.status})`);
  return data;
}

export async function listarChamados(params = {}) {
  // cÃ³pia defensiva + normalizaÃ§Ã£o de datas (from/to)
  const p = { ...params };
  for (const k of ['from', 'to']) {
    const v = p[k];
    if (v instanceof Date) p[k] = v.toISOString();
  }

  const u = new URL(`${BASE}/chamados`);
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  });

  const res = await fetch(u.toString());
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : { error: await res.text() };
  if (!res.ok) throw new Error(data?.error || `Erro ao listar chamados (${res.status})`);

  // --- NormalizaÃ§Ã£o: SEMPRE devolver objeto com items/total/paginaÃ§Ã£o ---
  const items = Array.isArray(data) ? data
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

export async function getMaquinas(q = "") {
  const url = q ? `${BASE}/maquinas?q=${encodeURIComponent(q)}` : `${BASE}/maquinas`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao buscar mÃ¡quinas: ${res.status}`);
  return res.json();
}

export async function criarMaquina({ nome, tag, setor, critico }, auth = {}) {
  return http.post(`/maquinas`, {
    data: {
      nome,
      tag: tag ?? nome,       // se nao mandar tag, usa o nome
      setor: setor ?? null,
      critico: !!critico
    },
    auth,
  }); // { id, nome, tag, setor, critico }
}

export async function listarAgendamentos(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  const res = await fetch(`${BASE}/agendamentos?${qs}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Erro ao listar agendamentos (${res.status})`);
  return data; // array
}

export async function criarAgendamento({ maquinaId, descricao, itensChecklist, start, end }, auth = {}) {
  return http.post(`/agendamentos`, {
    data: { maquinaId, descricao, itensChecklist, start, end },
    auth,
  });
}

export async function atualizarAgendamento(id, { start, end, status }, auth = {}) {
  return apiFetch(`/agendamentos/${id}`, {
    method: "PATCH",
    body: { start, end, status },
    auth,
  });
}

export async function excluirAgendamento(id, auth = {}) {
  return apiFetch(`/agendamentos/${id}`, {
    method: "DELETE",
    auth,
  });
}

export async function iniciarAgendamento(id, { criadoPorEmail, role, email }) {
  const res = await fetch(`${BASE}/agendamentos/${id}/iniciar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-role": role || "manutentor",
      "x-user-email": email || criadoPorEmail
    },
    body: JSON.stringify({ criadoPorEmail })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Erro ao iniciar (${res.status})`);
  return data; // { ok: true, chamadoId }
}

// Detalhe
export async function getChamado(id, auth = {}) {
  return apiFetch(`/chamados/${id}`, { auth }); // { id, maquina, tipo, status, descricao, criado_por, ... }
}


// Listar fotos de um chamado
export async function listarFotosChamado(id, auth = {}) {
  const res = await fetch(`${BASE}/chamados/${encodeURIComponent(id)}/fotos`, {
    headers: buildAuthHeaders(auth),
  });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => [])
    : { error: await res.text().catch(() => "") };

  if (!res.ok) {
    throw new Error(
      data?.error || `Erro ao listar fotos do chamado (${res.status})`
    );
  }

  // backend já retorna array simples
  return Array.isArray(data) ? data : data.items || [];
}

// Enviar foto (file: File/Blob vindo do input type="file")
export async function uploadFotoChamado(id, file, auth = {}) {
  if (!file) {
    throw new Error("Arquivo é obrigatório");
  }

  const formData = new FormData();
  formData.append("file", file);

  const headers = buildAuthHeaders(auth);
  // ⚠️ Não setar Content-Type manualmente (deixa o browser montar o boundary)
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
    throw new Error(
      data?.error || `Erro ao enviar foto do chamado (${res.status})`
    );
  }

  // esperado: { id, url, caminho, mimeType, tamanhoBytes, criadoEm, autorNome }
  return data;
}


// Manutentores (para atribuiÃ§Ã£o)
export async function listarManutentores(auth = {}) {
  const res = await fetch(`${BASE}/usuarios?role=manutentor`, {
    headers: {
      'x-user-role': auth.role || 'gestor',   // papel com permissÃ£o
      'x-user-email': auth.email || ''          // email do usuÃ¡rio logado
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ao listar manutentores (${res.status})`);
  // suporta {items:[...]} ou array direto
  return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

// Causas-raiz
export async function listarCausasRaiz() {
  const res = await fetch(`${BASE}/causas`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Erro ao listar causas (${res.status})`);
  return data; // [{ nome }]
}

// AÃ§Ãµes no chamado (endpoints finos para clareza)
export async function atribuirChamado(id, { manutentorEmail, role, email }) {
  const res = await fetch(`${BASE}/chamados/${id}/atribuir`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-email": email },
    body: JSON.stringify({ manutentorEmail })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ao atribuir (${res.status})`);
  return data;
}

export async function removerAtribuicao(id, { role, email }) {
  const r = await fetch(`${BASE}/chamados/${id}/atribuir`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'x-user-role': role, 'x-user-email': email },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Erro ao remover atribuição (${r.status})`);
  return data;
}
// Assumir (MANUTENTOR ou gestor) — atribui ao usuário logado e põe Em Andamento
export async function assumirChamado(id, { role, email } = {}) {
  return http.post(`/chamados/${id}/assumir`, {
    data: {},
    auth: { role, email },
  });
}

// Trocar status (gestor pode qualquer; manutentor designado pode Em Andamento/Concluido)
export async function atualizarStatusChamado(id, status, { role, email } = {}) {
  return http.post(`/chamados/${id}/status`, {
    data: { status },
    auth: { role, email },
  });
}
export async function atenderChamado(id, auth = {}) {
  const res = await fetch(`${BASE}/chamados/${id}/atender`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": auth.role || "manutentor", "x-user-email": auth.email }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ao atender (${res.status})`);
  return data;
}
export async function adicionarObservacao(id, { texto, role, email }) {
  const res = await fetch(`${BASE}/chamados/${id}/observacoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-email": email },
    body: JSON.stringify({ texto })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ao salvar observaÃ§Ã£o (${res.status})`);
  return data;
}
export async function concluirChamado(id, payload, { role, email }) {
  const res = await fetch(`${BASE}/chamados/${id}/concluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-email": email },
    body: JSON.stringify(payload) // {tipo:'preventiva', checklist:[...] } OU {tipo:'corretiva', causa, solucao}
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ao concluir (${res.status})`);
  return data;
}
export async function deletarChamado(id, { role, email }) {
  const res = await fetch(`${BASE}/chamados/${id}`, {
    method: "DELETE",
    headers: { "x-user-role": role, "x-user-email": email }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ao excluir (${res.status})`);
  return data;
}

export async function getMaquina(id) {
  const res = await fetch(`${BASE}/maquinas/${id}`);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };
  if (!res.ok) throw new Error(data?.error || `Erro ao buscar mÃ¡quina (${res.status})`);
  return data; // { id, nome, tag, setor, critico, chamadosAtivos: [...] }
}

export async function addChecklistItem(maquinaId, item, auth) {
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

export async function removeChecklistItem(maquinaId, item, auth) {
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

//Buscar checklist diÃ¡rio (itens atuais) de uma mÃ¡quina
export async function getChecklistDiario(maquinaId) {
  const r = await fetch(`${BASE}/maquinas/${maquinaId}/checklist-diario`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Erro ao buscar checklist diÃ¡rio (${r.status})`);
  // backend pode devolver { items:[...]} ou array
  const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  return items; // ex.: [{ id, texto, ordem }, ...]
}

//Enviar submissÃ£o do checklist diÃ¡rio (uma mÃ¡quina por vez)
export async function enviarChecklistDiaria({
  operadorEmail,
  operadorNome,
  maquinaId,
  maquinaNome,
  date,       // 'YYYY-MM-DD'
  respostas,  // objeto { pergunta: 'sim'|'nao' }
}) {
  const res = await fetch(`${BASE}/checklists/daily/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': 'operador',
      'x-user-email': operadorEmail || '',
    },
    body: JSON.stringify({
      operadorEmail,
      operadorNome,
      maquinaId,
      maquinaNome,
      date,
      respostas,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha ao enviar checklist diÃ¡rio (${res.status})`);
  return data;
}

export async function listarChamadosPorMaquina(maquinaId, { status } = {}) {
  const u = new URL(`${BASE}/chamados`);
  u.searchParams.set('maquinaId', maquinaId);
  if (status) u.searchParams.set('status', status);
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'Falha ao listar chamados');
  return j.items || j;
}

export async function listarPecas() {
  const r = await fetch(`${BASE}/pecas`);
  const ct = r.headers.get('content-type') || '';
  const j = ct.includes('application/json') ? await r.json() : { error: await r.text() };
  if (!r.ok) throw new Error(j?.error || 'Falha ao listar peÃ§as');
  return j.items || j; // backend pode retornar {items:[...]} ou [...]
}

export async function excluirPeca(id, auth) {
  const r = await fetch(`${BASE}/pecas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'x-user-role': auth?.role || '',
      'x-user-email': auth?.email || '',
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Falha ao excluir peÃ§a');
  return j;
}

export async function criarPeca(payload, auth) {
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
  if (!r.ok) throw new Error(j?.error || 'Falha ao criar peÃ§a');
  return j; // {id,codigo,nome,categoria,estoqueAtual,estoqueMinimo,localizacao}
}

export async function atualizarPeca(id, payload, auth) {
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
  if (!r.ok) throw new Error(j?.error || 'Falha ao atualizar peÃ§a');
  return j;
}

export async function listarCausas() {
  const r = await fetch(`${BASE}/causas`);
  const ct = r.headers.get('content-type') || '';
  const j = ct.includes('application/json') ? await r.json() : { error: await r.text() };
  if (!r.ok) throw new Error(j?.error || `Falha ao listar causas (${r.status})`);
  return j.items ?? j; // array
}

export async function criarCausa(payload, auth) {
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
  return j; // { id, nome }
}

export async function excluirCausa(id, auth) {
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

export async function listarUsuarios(opts = {}, auth = {}) {
  const data = await http.get(`/usuarios`, { params: opts, auth });
  return Array.isArray(data?.items) ? data.items : data; // array
}

export async function criarUsuario(data, { role, email } = {}) {
  // data pode conter: nome, usuario, email, role, funcao, senha?
  const r = await fetch(`${BASE}/usuarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': role || '',
      'x-user-email': email || ''
    },
    body: JSON.stringify(data)
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error || `Falha ao criar usuÃ¡rio (${r.status})`);
  return json; // { id, nome, usuario, email, role, funcao }
}

export async function atualizarUsuario(id, data, { role, email } = {}) {
  // data pode conter: nome, usuario, email, role, funcao, senha? (para reset)
  const r = await fetch(`${BASE}/usuarios/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': role || '',
      'x-user-email': email || ''
    },
    body: JSON.stringify(data)
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error || `Falha ao atualizar usuÃ¡rio (${r.status})`);
  return json;
}

export async function excluirUsuario(id, auth) {
  const r = await fetch(`${BASE}/usuarios/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'x-user-role': (auth?.role || '').toString().toLowerCase(),
      'x-user-email': auth?.email || ''
    }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Falha ao excluir usuÃ¡rio');
  return j;
}

export async function registrarMovimentacao(pecaId, { tipo, quantidade, descricao }, auth = {}) {
  const r = await fetch(`${BASE}/pecas/${encodeURIComponent(pecaId)}/movimentacoes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': auth.role || '',
      'x-user-email': auth.email || ''
    },
    body: JSON.stringify({ tipo, quantidade, descricao })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Falha ao registrar movimentaÃ§Ã£o (${r.status})`);
  return data; // opcional: { ok: true, peca, movimentacao }
}

export async function listarMaquinas(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
  ).toString();

  const res = await fetch(`${BASE}/maquinas${qs ? `?${qs}` : ''}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `Erro ao listar mÃ¡quinas (${res.status})`);
  }
  // suporta API que devolve {items:[...]} ou array direto
  return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function listarSubmissoesDiarias({ operadorEmail, date }) {
  const qs = new URLSearchParams({
    operadorEmail: operadorEmail || '',
    date: date || '',
  }).toString();

  const r = await fetch(`${BASE}/checklists/daily/submissoes?${qs}`);
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data?.error || `Erro ao listar submissÃµes diÃ¡rias (${r.status})`);
  }
  // backend pode devolver { items: [...] } ou array direto
  return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function obterMaquina(id) {
  const r = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Erro ao obter mÃ¡quina (${r.status})`);
  // Esperado: { id, nome, tag, checklist_diario: [...] }
  return data;
}

export async function registrarSubmissaoDiaria({ operadorEmail, maquinaId, date, respostas }) {
  const r = await fetch(`${BASE}/checklists/daily/submissoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operadorEmail, maquinaId, date, respostas })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Erro ao registrar submissÃ£o (${r.status})`);
  return data;
}

export async function login({ userOrEmail, senha }) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: userOrEmail, senha })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Falha no login (${r.status})`);
  return data; // { id, nome, email, role, funcao, usuario }
}

export async function changePassword({ email, senhaAtual, novaSenha }) {
  const r = await fetch(`${BASE}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // cabeÃ§alho Ãºtil se vocÃª jÃ¡ popula req.user pelo middleware
      'x-user-email': email || ''
    },
    body: JSON.stringify({ email, senhaAtual, novaSenha })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Falha ao alterar senha (${r.status})`);
  return data; // { ok: true }
}

export async function listarParetoCausas(params = {}, auth) {
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
  return res.json(); // { total, items, from, to }
}

export async function enviarChecklistPreventiva(chamadoId, { respostas }) {
  const res = await fetch(`${BASE}/chamados/${chamadoId}/checklist/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ respostas })
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };
  if (!res.ok) throw new Error(data?.error || `Erro ao enviar checklist (${res.status})`);
  return data;
}

export async function atualizarChecklistChamado(id, checklist, auth = {}) {
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
  return data; // { ok: true }
}

export async function deletarMaquina(id, auth = {}) {
  const headers = buildAuthHeaders(auth);

  // Sem e-mail nao da pra autenticar via userFromHeader -> evita 401 ruidoso
  if (!headers['x-user-email']) {
    const err = new Error('LOGIN_REQUIRED');
    err.status = 401;
    throw err;
  }

  const res = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
    // Se voce passar a usar JWT por cookie httpOnly, ative:
    // credentials: 'include',
  });

  if (res.status === 204) return true;

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => '');

  if (!res.ok) {
    const err = new Error(
      data?.error || (typeof data === 'string' ? data : `Erro ao excluir máquina (${res.status})`)
    );
    err.status = res.status;
    throw err;
  }
  return data || true;
}

export async function renomearMaquina(id, { nome, syncTag = true }, auth = {}) {
  const res = await fetch(`${BASE}/maquinas/${encodeURIComponent(id)}/nome`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': auth.role || '',
      'x-user-email': auth.email || '',
    },
    body: JSON.stringify({ nome, syncTag }),
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => '');

  if (!res.ok) {
    const err = new Error(
      data?.error || (typeof data === 'string' ? data : `Erro ao renomear máquina (${res.status})`)
    );
    err.status = res.status;
    throw err;
  }
  return data; // { id, nome, tag, setor, critico }
}

export async function listarEventosChamado(id) {
  const r = await fetch(`${BASE}/chamados/${id}/eventos`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Erro ao listar eventos (${r.status})`);
  return data.items || [];
}

//--------------------AI--------------------------------
/** POST /ai/chat/sql — { sql, rows, fields, source } */
export async function aiChatSql({ question, noCache = false } = {}, auth = {}) {
  if (!question || !String(question).trim()) {
    throw new Error('question é obrigatório');
  }

  const res = await fetch(`${BASE}/ai/chat/sql`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(auth),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question, noCache: !!noCache })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ao executar SQL (${res.status})`);
  // data: { sql, rows, fields, source }
  return data;
}

/** POST /ai/chat/text — { sql, rows } (fts) */
export async function aiTextSearch({ q, limit = 20 } = {}, auth = {}) {
  if (!q || !String(q).trim()) {
    throw new Error('q é obrigatório');
  }

  const res = await fetch(`${BASE}/ai/chat/text`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(auth),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q, limit })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro no FTS (${res.status})`);
  // data: { sql, rows }
  return data;
}

export function connectSSE(handlers = {}) {
  const es = new EventSource(`${BASE}/events`);
  es.addEventListener('hello', e => handlers.hello?.(JSON.parse(e.data)));
  es.addEventListener('chamados', e => handlers.chamados?.(JSON.parse(e.data)));
  es.addEventListener('agendamentos', e => handlers.agendamentos?.(JSON.parse(e.data)));
  es.addEventListener('checklist', e => handlers.checklist?.(JSON.parse(e.data)));
  es.addEventListener('pecas', e => handlers.pecas?.(JSON.parse(e.data)));
  es.onerror = (err) => handlers.onError?.(err);
  es.onopen = () => handlers.onOpen?.();
  return () => es.close();
}

export function subscribeSSE(onEvent, opts = {}) {
  // Se quiser passar algo (ex.: email) por querystring, habilite abaixo:
  const qs = new URLSearchParams();
  if (opts.email) qs.set('email', opts.email);

  const url = `${BASE}/events${qs.toString() ? `?${qs}` : ''}`;

  // Se o ambiente nÃ£o suportar EventSource, apenas no-op
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    console.warn('EventSource nÃ£o disponÃ­vel; subscribeSSE serÃ¡ no-op.');
    return () => { };
  }

  const es = new EventSource(url, { withCredentials: false });

  es.onmessage = (ev) => {
    if (!ev?.data) return;
    try {
      const data = JSON.parse(ev.data);
      // esperado algo como: { topic: "chamados", action: "created" | "picked" | "finished", id? ... }
      if (typeof onEvent === 'function') onEvent(data);
    } catch {
      // se nÃ£o for JSON, ainda repassa como raw
      if (typeof onEvent === 'function') onEvent({ raw: ev.data });
    }
  };

  es.onerror = (err) => {
    // O EventSource tenta reconectar sozinho; sÃ³ logamos
    console.warn('SSE error', err);
  };

  return () => {
    try { es.close(); } catch { }
  };
}
