# EHS/BBS — Estruturação do Ecossistema de Observadores

## Contexto

O módulo EHS já importa os relatórios BBS e armazena a coluna `observador` como texto livre. O problema é que não há ligação entre esse nome e os utilizadores cadastrados na plataforma, impossibilitando saber quem enviou (ou não enviou) o BBS mensal. Este plano liga os observadores a utilizadores reais via fuzzy matching automático + modal de resolução manual, e adiciona uma UI de análise mensal de conformidade.

---

## Decisões confirmadas

- Compliance: **todos os utilizadores ativos**, independente do papel (admin/operador/colaborador)
- Pendentes: acessíveis **apenas na sessão atual do upload** (botão "Resolver" no card de resultado); sem página persistente

---

## 1. Migração de BD (`apps/api/migrations/safety_usuario_link.sql`)

```sql
-- 1. FK na tabela principal
ALTER TABLE public.safety_observacoes
    ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_safety_obs_usuario ON safety_observacoes(usuario_id);

-- 2. Tabela de mapeamentos (cache de nomes já resolvidos)
CREATE TABLE IF NOT EXISTS public.safety_observador_mapeamentos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observador_texto TEXT NOT NULL,
    usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_por_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em        TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_observador_texto UNIQUE (observador_texto)
);

ALTER TABLE public.safety_observador_mapeamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_full_access" ON public.safety_observador_mapeamentos FOR ALL TO postgres USING (true);

-- 3. Backfill histórico (idempotente)
UPDATE public.safety_observacoes o
SET    usuario_id = m.usuario_id
FROM   public.safety_observador_mapeamentos m
WHERE  o.observador = m.observador_texto AND o.usuario_id IS NULL;
```

---

## 2. Utilitário Fuzzy (`apps/api/src/utils/fuzzy.ts`)

Implementar **Jaro-Winkler** em TypeScript puro (sem dependências externas):

1. `norm(s)` — NFD + strip acentos + lowercase + trim (reutilizar lógica já existente em `upload.ts`)
2. `jaro(a, b)` — janela de matching = `floor(max(|a|,|b|)/2) - 1`, conta matches + transposições
3. `jaroWinkler(a, b)` — boost de prefixo (max 4 chars, fator 0.1); aplica `norm()` antes de calcular

**Thresholds (definidos em `upload.ts`):**
- Score ≥ 0.85 → auto-atribuir
- Score 0.60–0.84 → retornar como candidato sugerido (top 3)
- Score < 0.60 → retornar em pendentes sem candidatos

---

## 3. Tipos Partilhados (`packages/shared/src/types/index.ts`)

Adicionar no final do ficheiro:

```typescript
export interface SafetyCandidato { usuarioId: string; nome: string; score: number; }
export interface SafetyPendente { observadorTexto: string; qtdRegistros: number; candidatos: SafetyCandidato[]; }
export interface SafetyUploadResumo { totalLinhasCsv: number; registrosUnicos: number; novos: number; atualizados: number; }
export interface SafetyUploadResponse { ok: boolean; resumo: SafetyUploadResumo; pendentes: SafetyPendente[]; }
export interface SafetyResolverPayload { resolucoes: Array<{ observadorTexto: string; usuarioId: string }>; }
export interface SafetyResolverResponse { ok: boolean; mapeamentosSalvos: number; observacoesAtualizadas: number; }
export interface SafetyComplianceMensal { usuarioId: string; nome: string; funcao: string | null; meses: number[]; }
export interface SafetyUploadHistory { id: string; nome_arquivo: string; total_linhas: number; registros_novos: number; registros_atualizados: number; criado_em: string; enviado_por: string | null; }
```

---

## 4. Backend — `upload.ts` (modificar)

### UPSERT — regra de preservação do `usuario_id`

O INSERT inclui `usuario_id = NULL` para novas linhas. O `ON CONFLICT DO UPDATE SET` **não inclui** `usuario_id` — garante que o valor já resolvido nunca é sobrescrito por um re-upload.

### Pós-transação — fuzzy matching (fora do BEGIN/COMMIT)

```
1. Coletar todos os textos únicos de observador das linhas processadas
2. Buscar safety_observador_mapeamentos WHERE observador_texto = ANY(textos)
   → Auto-aplicar: UPDATE safety_observacoes SET usuario_id WHERE observador = texto AND usuario_id IS NULL
3. Para textos sem mapeamento → carregar usuarios WHERE ativo = true
4. Para cada texto, calcular jaroWinkler contra todos os nomes:
   ≥ 0.85 → inserir em safety_observador_mapeamentos + UPDATE safety_observacoes
   0.60–0.84 → adicionar a pendentes com candidatos (top 3)
   < 0.60 → adicionar a pendentes sem candidatos
5. Responder com { ok, resumo, pendentes }
```

---

## 5. Backend — `resolver.ts` (novo)

**`POST /ehs/resolver-observadores`** — permissão: `safety` / `editar`

```
Body: { resolucoes: [{observadorTexto, usuarioId}] }
Lógica:
  - Para cada resolução:
    INSERT INTO safety_observador_mapeamentos (...) ON CONFLICT (observador_texto) DO UPDATE SET usuario_id = ...
    UPDATE safety_observacoes SET usuario_id WHERE observador = texto AND usuario_id IS NULL
Resposta: { ok, mapeamentosSalvos, observacoesAtualizadas }
```

---

## 6. Backend — `compliance.ts` (novo)

**`GET /ehs/compliance-mensal?ano=YYYY`** — permissão: `safety` / `ver`

SQL: CROSS JOIN `usuarios` (ativo=true) × `generate_series(1,12)` + LEFT JOIN contagens, retorna `meses: number[12]` pivotado no backend.

Resposta via `listResponse()`: `{ items: SafetyComplianceMensal[] }`

---

## 7. Backend — `ehs/index.ts` (modificar)

Registar `ehsResolverRouter` e `ehsComplianceRouter` adicionalmente ao existente.

---

## 8. Frontend — `apiClient.ts` (modificar)

Adicionar funções tipadas:
- `ehsUpload(nomeArquivo, inputRows)` → `SafetyUploadResponse`
- `ehsResolverObservadores(payload)` → `SafetyResolverResponse`
- `ehsComplianceMensal(ano)` → `{ items: SafetyComplianceMensal[] }`
- `ehsUploads()` → `SafetyUploadHistory[]`

Substituir os `http.post`/`http.get` inline em `SafetyUploadPage.tsx` por estas funções.

---

## 9. Frontend — `ResolverObservadoresModal.tsx` (novo)

`apps/web/src/features/ehs/components/ResolverObservadoresModal.tsx`

- Usa `Modal` existente em `apps/web/src/shared/components/Modal.tsx`
- Para cada `SafetyPendente`: mostra o texto bruto + contagem + `<select>` com candidatos no topo (com % de match) seguido de todos os utilizadores
- Opção vazia = "Não mapear agora"
- Submit → `ehsResolverObservadores()` → toast + `onResolved()` + fechar

---

## 10. Frontend — `SafetyUploadPage.tsx` (modificar)

Mudanças mínimas:
1. Substituir tipos locais por imports de `@spiraview/shared`
2. Substituir `http.post/get` por funções de `apiClient.ts`
3. Adicionar estado `pendentes: SafetyPendente[]` e `showResolver: boolean`
4. No card de sucesso: se `pendentes.length > 0`, exibir botão "Resolver observadores (N)" que abre o modal
5. Adicionar hint `t('safety_upload.multi_month_hint')` abaixo do texto do dropzone

---

## 11. Frontend — `SafetyCompliancePage.tsx` (novo)

`apps/web/src/features/ehs/pages/SafetyCompliancePage.tsx`

- Seletor de ano (ano atual ± 2)
- Barra de resumo: conformidade geral %, melhor mês, pior mês, nº utilizadores ativos
- Tabela: linhas = utilizadores (nome + função), colunas = Jan–Dez + Total
- Células: `cellGood` (verde) se count > 0, `cellBad` (vermelho) se 0 + não é mês futuro, `cellFuture` (cinza) se mês ainda não chegou (para o ano atual)
- Utilizar `formatDate` do `dateUtils` para labels de mês

---

## 12. Routing & Navegação

**`AppRoutes.tsx`**: adicionar `<Route path="/ehs/compliance" element={canAccessPage('safety', <SafetyCompliancePage user={user} />)} />`

**`NavigationContent.tsx`**: dentro do grupo `ehs` existente, após `safety-upload`, adicionar link para `/ehs/compliance` com ícone `FiBarChart2` e label `t('nav.safetyCompliance')`

---

## 13. i18n

Adicionar em `en/common.json` e `pt/common.json`:
- `nav.safetyCompliance`
- `safety_upload.multi_month_hint`
- Secção `ehs.compliance.*` (título, rótulos de colunas, stats)
- Secção `ehs.resolver.*` (título, botões, toasts)

---

## Ordem de implementação

1. Migração SQL (Supabase)
2. `fuzzy.ts` + `shared/types/index.ts` + build do shared
3. `upload.ts` (modificar UPSERT + fuzzy post-step)
4. `resolver.ts` + `compliance.ts` + `ehs/index.ts`
5. `apiClient.ts`
6. `ResolverObservadoresModal.tsx`
7. `SafetyUploadPage.tsx` (modificações)
8. `SafetyCompliancePage.tsx`
9. `AppRoutes.tsx` + `NavigationContent.tsx`
10. i18n (`en` + `pt`)
11. Documentação

---

## 14. Documentação (actualizar ficheiros existentes)

- **`docs/DATABASE.md`** — documentar coluna `usuario_id` em `safety_observacoes` e a nova tabela `safety_observador_mapeamentos` (schema completo + índices)
- **`docs/PERMISSIONS.md`** — confirmar que a pageKey `safety` cobre agora também as rotas `/ehs/resolver-observadores` (editar) e `/ehs/compliance-mensal` (ver); sem nova pageKey necessária
- **`docs/modules/ehs.md`** (criar se não existir) — documentar todos os endpoints do módulo EHS: upload, uploads history, resolver-observadores, compliance-mensal; incluir request/response examples

---

## Verificação

- Upload com nome exato → `pendentes` vazio, `usuario_id` preenchido
- Upload com nome aproximado ("João Silv") → candidato sugerido no modal
- Re-upload do mesmo ficheiro → `usuario_id` preservado (não sobrescrito)
- `POST /ehs/resolver-observadores` → mapeamento salvo, observações históricas atualizadas
- `GET /ehs/compliance-mensal?ano=2026` → todos os utilizadores ativos, 12 meses, zeros corretos
- Página de compliance: meses futuros cinza, zeros vermelho, com dados verde
