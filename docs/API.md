# API Standards & Documentation

## Endpoint Reference

> Base URL: `/api` (development: `http://localhost:3000/api`)
> All endpoints require `Authorization: Bearer <token>` unless marked as **public**.

### 🔐 Core — Auth & Usuários

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `POST` | `/auth/login` | público | Login com email + senha; retorna JWT |
| `GET` | `/auth/me` | autenticado | Dados do usuário logado (via token) |
| `POST` | `/auth/change-password` | autenticado | Troca a senha do usuário logado |
| `POST` | `/auth/tv-login` | público | Login especial para modo TV/kiosk |
| `POST` | `/auth/operator-login` | público | Login de operador por PIN |
| `GET` | `/operators/active` | autenticado | Lista operadores ativos para login rápido |
| `GET` | `/health` | público | Health check da API |
| `GET` | `/events` | autenticado | Stream SSE de atualizações em tempo real |

### 👥 Usuários

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/usuarios` | `usuarios\|chamados_gestao\|producao_colaboradores : ver` | Lista usuários |
| `POST` | `/usuarios` | `usuarios : editar` | Cria novo usuário |
| `PUT` | `/usuarios/:id` | `usuarios : editar` | Atualiza dados do usuário |
| `DELETE` | `/usuarios/:id` | `usuarios : editar` | Remove usuário |
| `GET` | `/usuarios/:id/estatisticas` | `usuarios : ver` | Estatísticas de atividade do usuário |

### 🎭 Roles & Permissões

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/roles/pages` | público | Lista todas as page keys disponíveis |
| `GET` | `/roles/options` | autenticado | Lista roles para uso em selects (id + nome) |
| `GET` | `/roles` | `roles : ver` | Lista todos os roles |
| `GET` | `/roles/:id` | `roles : ver` | Detalhe de um role |
| `POST` | `/roles` | `roles : editar` | Cria novo role |
| `PUT` | `/roles/:id` | `roles : editar` | Atualiza role |
| `DELETE` | `/roles/:id` | `roles : editar` | Remove role |

### ⚙️ Settings & Notificações

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/settings/tv-config` | autenticado | Configuração do modo TV |
| `PUT` | `/settings/tv-pin` | autenticado | Define PIN de acesso ao modo TV |
| `DELETE` | `/settings/tv-pin` | autenticado | Remove PIN do modo TV |
| `GET` | `/config/:evento` | `notificacoes_config : ver` | Configuração de notificação por evento |
| `POST` | `/config` | `notificacoes_config : editar` | Cria/atualiza configuração de notificação |
| `DELETE` | `/config/:evento/:usuarioId` | `notificacoes_config : editar` | Remove usuário de uma notificação |

---

### 🏭 Máquinas (Shared)

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/maquinas` | autenticado | Lista máquinas (com hierarquia) |
| `GET` | `/maquinas/:id` | autenticado | Detalhe de uma máquina |
| `POST` | `/maquinas` | `maquinas : editar` | Cria máquina |
| `DELETE` | `/maquinas/:id` | `maquinas : editar` | Remove máquina |
| `PATCH` | `/maquinas/:id` | `maquinas : editar` | Atualiza dados gerais da máquina |
| `PATCH` | `/maquinas/:id/parent` | `maquinas : editar` | Redefine máquina pai (hierarquia) |
| `PATCH` | `/maquinas/:id/escopo` | `maquinas : editar` | Atualiza escopo da máquina |
| `PATCH` | `/maquinas/:id/aliases-producao` | `producao_config : editar` | Define aliases para leitura de produção |
| `PATCH` | `/maquinas/:id/nome-producao` | `producao_config : editar` | Define nome de produção da máquina |
| `POST` | `/maquinas/:id/checklist-add` | `maquinas : editar` | Adiciona item ao checklist da máquina |
| `POST` | `/maquinas/:id/checklist-remove` | `maquinas : editar` | Remove item do checklist da máquina |
| `POST` | `/maquinas/:id/checklist-reorder` | `maquinas : editar` | Reordena itens do checklist |

---

### 🔧 Manutenção

#### Chamados

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/chamados/counts` | `meus_chamados\|chamados_abertos : ver` | Contadores de chamados por status |
| `GET` | `/chamados` | autenticado | Lista chamados com filtros |
| `GET` | `/chamados/:id` | autenticado | Detalhe de um chamado |
| `POST` | `/chamados` | autenticado | Cria novo chamado |
| `PATCH` | `/chamados/:id` | autenticado | Atualiza status do chamado (forma legada) |
| `DELETE` | `/chamados/:id` | `maquinas : editar` | Remove chamado e fotos associadas |
| `GET` | `/chamados/:id/fotos` | `maquinas\|chamados_abertos\|meus_chamados : ver` | Lista fotos do chamado |
| `POST` | `/chamados/:id/fotos` | `maquinas\|meus_chamados : editar` | Upload de foto para o chamado |
| `POST` | `/chamados/:id/observacoes` | `maquinas\|chamados_abertos\|meus_chamados : ver` | Adiciona observação |
| `POST` | `/chamados/:id/atender` | `meus_chamados : editar` | Manutentor assume o chamado |
| `POST` | `/chamados/:id/entrar` | `meus_chamados : editar` | Entra como co-manutentor |
| `POST` | `/chamados/:id/sair` | `meus_chamados : editar` | Sai da co-manutenção |
| `POST` | `/chamados/:id/concluir` | `meus_chamados : editar` | Conclui chamado (com checklist/causa/solução) |
| `PATCH` | `/chamados/:id/checklist` | `maquinas\|meus_chamados : editar` | Atualiza checklist do chamado |
| `POST` | `/chamados/:id/atribuir` | `chamados_abertos : editar` | Gestor atribui manutentor a um chamado |
| `DELETE` | `/chamados/:id/atribuir` | `chamados_abertos : editar` | Remove atribuição (volta para Aberto) |

#### Checklists

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `POST` | `/checklists/daily/submit` | autenticado | Submete checklist diário de uma máquina |
| `GET` | `/checklists/daily/submissoes` | autenticado | Lista submissões do checklist diário |
| `GET` | `/checklists/overview` | autenticado | Visão geral dos checklists (dia atual) |
| `GET` | `/checklists/overview/range` | autenticado | Visão geral por período |
| `GET` | `/checklists/pendencias` | `checklists_pendencias : ver` | Lista pendências de checklist |
| `POST` | `/checklists/pendencias/justificar` | `checklists_pendencias : editar` | Justifica uma pendência |
| `GET` | `/checklists/pendencias/historico` | `checklists_pendencias : ver` | Histórico de pendências justificadas |

#### Agendamentos

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/agendamentos` | autenticado | Lista agendamentos de preventivas |
| `POST` | `/agendamentos` | autenticado | Cria agendamento |
| `PATCH` | `/agendamentos/:id` | autenticado | Atualiza agendamento |
| `DELETE` | `/agendamentos/:id` | autenticado | Remove agendamento |
| `POST` | `/agendamentos/:id/iniciar` | autenticado | Inicia preventiva agendada (cria chamado) |

#### Peças / Estoque

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/pecas` | autenticado | Lista peças do estoque |
| `POST` | `/pecas` | autenticado | Cadastra nova peça |
| `PUT` | `/pecas/:id` | autenticado | Atualiza dados da peça |
| `DELETE` | `/pecas/:id` | autenticado | Remove peça |
| `POST` | `/pecas/:id/movimentacoes` | autenticado | Registra entrada/saída de estoque |
| `GET` | `/movimentacoes` | autenticado | Histórico de movimentações |

#### Causas-raiz & Analytics

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/causas` | autenticado | Lista causas-raiz cadastradas |
| `POST` | `/causas` | autenticado | Cria causa-raiz |
| `DELETE` | `/causas/:id` | autenticado | Remove causa-raiz |
| `GET` | `/analytics/pareto-causas` | autenticado | Pareto de causas por período/máquina |

---

### 🏗️ Produção

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/producao/lancamentos` | autenticado | Lista lançamentos de produção |
| `GET` | `/producao/lancamentos/:id` | autenticado | Detalhe de um lançamento |
| `POST` | `/producao/lancamentos` | autenticado | Cria lançamento manual |
| `PUT` | `/producao/lancamentos/:id` | autenticado | Atualiza lançamento |
| `DELETE` | `/producao/lancamentos/:id` | autenticado | Remove lançamento |
| `GET` | `/producao/rendimento` | autenticado | Indicadores de rendimento por período |
| `GET` | `/producao/resumo-diario` | autenticado | Resumo diário de produção |
| `GET` | `/producao/metas` | autenticado | Lista metas de produção |
| `POST` | `/producao/metas` | `producao_config : editar` | Cria meta |
| `PUT` | `/producao/metas/:id` | autenticado | Atualiza meta |
| `DELETE` | `/producao/metas/:id` | autenticado | Remove meta |
| `GET` | `/producao/metas/funcionarios` | autenticado | Metas individuais por funcionário |
| `POST` | `/producao/metas/funcionarios` | autenticado | Define meta individual |
| `GET` | `/producao/indicadores/funcionarios/dia` | autenticado | Indicadores diários por funcionário |
| `GET` | `/producao/indicadores/funcionarios/mes` | autenticado | Indicadores mensais por funcionário |
| `POST` | `/producao/lancamentos/upload` | autenticado | Upload de planilha de lançamentos (JSON, 10mb) |
| `GET` | `/producao/uploads` | `producao_upload : ver` | Lista uploads realizados |
| `GET` | `/producao/uploads/ultimo` | autenticado | Último upload ativo |
| `GET` | `/producao/uploads/historico` | `producao_upload : ver` | Histórico de uploads |
| `GET` | `/producao/uploads/:id` | `producao_upload : ver` | Detalhe de um upload |
| `POST` | `/producao/uploads/:id/ativar` | `producao_upload : editar` | Ativa um upload como base de lançamentos |

---

### 📐 Planejamento

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `POST` | `/capacidade/upload` | autenticado | Upload de planilha de capacidade (JSON, 10mb) |
| `GET` | `/capacidade/uploads/tv/ultimo` | autenticado | Último upload de capacidade (para TV) |
| `GET` | `/capacidade/resumo/tv` | autenticado | Resumo de capacidade para painel TV |
| `GET` | `/capacidade/resumo` | `planejamento_dashboard : ver` | Resumo de capacidade por período |
| `GET` | `/capacidade/uploads` | `planejamento_dashboard : ver` | Lista uploads de capacidade |
| `GET` | `/capacidade/maquinas` | `planejamento_config : ver` | Lista máquinas com configuração de capacidade |
| `PATCH` | `/capacidade/maquinas/:id` | `planejamento_config : editar` | Atualiza configuração de capacidade da máquina |

---

### 🔍 Qualidade

#### Refugos

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/qualidade/refugos` | `qualidade_lancamento : ver` | Lista lançamentos de refugo |
| `POST` | `/qualidade/refugos` | `qualidade_lancamento : editar` | Cria lançamento de refugo |
| `PUT` | `/qualidade/refugos/:id` | `qualidade_lancamento : editar` | Atualiza lançamento de refugo |
| `DELETE` | `/qualidade/refugos/:id` | `qualidade_lancamento : editar` | Remove lançamento de refugo |
| `GET` | `/qualidade/dashboard` | `qualidade_dashboard : ver` | Dashboard de qualidade (refugos por período) |
| `POST` | `/qualidade/refugos/upload` | `qualidade : editar` | Upload em lote de refugos (CSV/JSON) |

#### Retrabalho

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/qualidade/retrabalho` | `qualidade_retrabalho : ver` | Lista lançamentos de retrabalho |
| `POST` | `/qualidade/retrabalho` | `qualidade_retrabalho : editar` | Cria lançamento de retrabalho |
| `PUT` | `/qualidade/retrabalho/:id` | `qualidade_retrabalho : editar` | Atualiza lançamento |
| `DELETE` | `/qualidade/retrabalho/:id` | `qualidade_retrabalho : editar` | Remove lançamento |
| `POST` | `/qualidade/retrabalho/upload` | `qualidade_retrabalho : editar` | Upload em lote de retrabalho |
| `GET` | `/qualidade/retrabalho/analise` | `qualidade_retrabalho : ver` | Análise e tendências de retrabalho |

#### Analytics & Dashboard

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/qualidade/analytics/responsaveis` | autenticado | Ranking de responsáveis por falhas |
| `GET` | `/qualidade/analytics/summary` | autenticado | Resumo analítico de qualidade |
| `GET` | `/qualidade/analytics/trends` | autenticado | Tendências de qualidade por período |
| `GET` | `/qualidade/analytics/details` | autenticado | Detalhamento analítico (drill-down) |
| `GET` | `/qualidade/analytics/compare` | autenticado | Comparativo entre dois períodos |
| `GET` | `/qualidade/dashboard-geral` | autenticado | Dashboard geral consolidado (refugo + retrabalho) |
| `GET` | `/qualidade/individual/metrics` | autenticado | Métricas individuais por máquina/operador |

#### Configurações de Qualidade

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/qualidade/origens` | autenticado | Lista origens de defeito |
| `POST` | `/qualidade/origens` | autenticado | Cria origem de defeito |
| `PUT` | `/qualidade/origens/:id` | autenticado | Atualiza origem |
| `GET` | `/qualidade/origens/:id/usage` | autenticado | Verifica uso da origem antes de excluir |
| `DELETE` | `/qualidade/origens/:id` | autenticado | Remove origem |
| `GET` | `/qualidade/motivos` | autenticado | Lista motivos de refugo |
| `POST` | `/qualidade/motivos` | autenticado | Cria motivo |
| `PUT` | `/qualidade/motivos/:id` | autenticado | Atualiza motivo |
| `GET` | `/qualidade/motivos/:id/usage` | autenticado | Verifica uso do motivo |
| `DELETE` | `/qualidade/motivos/:id` | autenticado | Remove motivo |
| `GET` | `/qualidade/responsaveis` | autenticado | Lista responsáveis |
| `POST` | `/qualidade/responsaveis` | autenticado | Cria responsável |
| `PUT` | `/qualidade/responsaveis/:id` | autenticado | Atualiza responsável |
| `GET` | `/qualidade/responsaveis/:id/usage` | autenticado | Verifica uso do responsável |
| `DELETE` | `/qualidade/responsaveis/:id` | autenticado | Remove responsável |
| `GET` | `/qualidade/nao-conformidades` | autenticado | Lista não-conformidades (config retrabalho) |
| `POST` | `/qualidade/nao-conformidades` | autenticado | Cria não-conformidade |
| `PUT` | `/qualidade/nao-conformidades/:id` | autenticado | Atualiza não-conformidade |
| `GET` | `/qualidade/nao-conformidades/:id/usage` | autenticado | Verifica uso |
| `DELETE` | `/qualidade/nao-conformidades/:id` | autenticado | Remove não-conformidade |
| `GET` | `/qualidade/solicitantes` | autenticado | Lista solicitantes (config retrabalho) |
| `POST` | `/qualidade/solicitantes` | autenticado | Cria solicitante |
| `PUT` | `/qualidade/solicitantes/:id` | autenticado | Atualiza solicitante |
| `GET` | `/qualidade/solicitantes/:id/usage` | autenticado | Verifica uso |
| `DELETE` | `/qualidade/solicitantes/:id` | autenticado | Remove solicitante |

---

### 📋 PDCA

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/pdca/planos` | autenticado | Lista planos de ação |
| `GET` | `/pdca/planos/:id` | autenticado | Detalhe de um plano |
| `POST` | `/pdca/planos` | autenticado | Cria plano de ação |
| `PUT` | `/pdca/planos/:id` | autenticado | Atualiza plano |
| `DELETE` | `/pdca/planos/:id` | autenticado | Remove plano |
| `POST` | `/pdca/planos/:planoId/causas` | autenticado | Adiciona causa a um plano |
| `PUT` | `/pdca/causas/:id` | autenticado | Atualiza causa |
| `DELETE` | `/pdca/causas/:id` | autenticado | Remove causa |
| `GET` | `/pdca/dashboard` | autenticado | Dashboard de status dos planos PDCA |
| `GET` | `/pdca/audit/:entidade/:id` | autenticado | Histórico de auditoria de uma entidade PDCA |

---

### 🚚 Logística

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/logistica/kpis` | autenticado | KPIs de logística por período |
| `PUT` | `/logistica/kpis/:data` | autenticado | Atualiza KPI de um dia específico |
| `PUT` | `/logistica/metas/:mes/:ano` | autenticado | Define metas mensais de logística |

---

### 💡 Melhoria Contínua

#### Kaizen

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/melhoria-continua/kaizen` | `melhoria_continua : ver` | Lista eventos kaizen |
| `GET` | `/melhoria-continua/kaizen/:id` | `melhoria_continua : ver` | Detalhe de um kaizen |
| `POST` | `/melhoria-continua/kaizen` | `melhoria_continua : editar` | Cria evento kaizen |
| `PUT` | `/melhoria-continua/kaizen/:id` | `melhoria_continua : editar` | Atualiza kaizen |
| `DELETE` | `/melhoria-continua/kaizen/:id` | `melhoria_continua : editar` | Remove kaizen |
| `POST` | `/melhoria-continua/kaizen/:id/thumbnail` | `melhoria_continua : editar` | Upload de thumbnail do kaizen |

#### Kamishibai

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/melhoria-continua/kamishibai/:kaizenId/perguntas` | `melhoria_continua : ver` | Lista perguntas do kamishibai |
| `POST` | `/melhoria-continua/kamishibai/:kaizenId/perguntas` | `melhoria_continua : editar` | Adiciona pergunta ao kamishibai |
| `POST` | `/melhoria-continua/kamishibai/auditoria` | `melhoria_continua : editar` | Registra auditoria kamishibai |
| `GET` | `/melhoria-continua/kamishibai/dashboard` | `melhoria_continua : ver` | Dashboard de auditorias |
| `GET` | `/melhoria-continua/kamishibai/historico` | `melhoria_continua : ver` | Histórico global de auditorias |
| `GET` | `/melhoria-continua/kamishibai/historico/:kaizenId` | `melhoria_continua : ver` | Histórico de auditorias de um kaizen |

---

### 🦺 Safety

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `POST` | `/safety/upload` | `safety : editar` | Upload de observação de segurança |
| `GET` | `/safety/uploads` | `safety : ver` | Lista observações de segurança |

---

### 📅 Reunião Diária

| Método | Endpoint | Permissão | Descrição |
|--------|----------|-----------|-----------|
| `GET` | `/reuniao-diaria/:departamento` | `reuniao_diaria : ver` | Dados consolidados para reunião diária do departamento |

---

## Authentication
All API endpoints (except Health Check and Login) require a **Bearer Token**.
- **Header**: `Authorization: Bearer <token>`
- **Token Generation**: Tokens are generated by the internal JWT mechanism.

## Response Format
### Success
Success responses generally return the data directly or wrapped in an object.
```json
{
  "id": "123",
  "name": "Gabriel"
}
```

### Errors
All errors MUST follow this strict format:
```json
{
  "error": "ERROR_CODE",
  "message": "Human readable description"
}
```
**Common Codes:**
- `USUARIO_NAO_AUTENTICADO`: Missing or invalid token.
- `PERMISSAO_NEGADA`: Insufficient permission level.
- `RECURSO_NAO_ENCONTRADO`: Entity not found.

### Validation Errors (400)
When Zod schema validation fails (body or query params):
```json
{
  "error": "Dados inválidos.",
  "details": {
    "campo": "mensagem de erro específica"
  }
}
```

## Pagination
List endpoints that support pagination use:
- **Request**: `?page=1&limit=20`
- **Response**:
```json
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

## Input Validation

### Body Validation (`validateBody`)
Use the `validateBody` middleware factory with a Zod schema for all POST/PUT/PATCH bodies:

```typescript
import { z } from 'zod';
import { validateBody } from '../../middlewares/validateBody';

const criarItemSchema = z.object({
    nome: z.string().min(1),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
    quantidade: z.number().int().positive(),
});

router.post('/', requirePermission('modulo', 'editar'), validateBody(criarItemSchema), handler);
```
- Substitui `req.body` pelo valor parseado/coerced pelo schema
- Retorna 400 com `{ error, details }` se inválido

### Query Param Validation
Para query params (GET routes), valide manualmente com `safeParse` no início do handler:

```typescript
import { qualidadeFiltrosSchema } from './whereBuilders'; // ou defina schema inline

router.get('/', requirePermission('modulo', 'ver'), async (req, res) => {
    const parsed = meuQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten().fieldErrors });
    }
    // use parsed.data
});
```

**Schema base de filtros para `qualidade_refugos`** (`whereBuilders.ts`):
```typescript
import { qualidadeFiltrosSchema, compareQuerySchema } from './whereBuilders';
// qualidadeFiltrosSchema — filtros comuns (dataInicio, dataFim, origem, responsavel, tipo, tipoLancamento)
// compareQuerySchema    — estende com dataInicioA/B, dataFimA/B obrigatórios
```

## Interactive Documentation
We use **Swagger/OpenAPI** for interactive documentation.
- **URL**: `http://localhost:3000/api/docs` (in development)
- **Source**: Annotations in `src/routes/**/*.ts` files.

### How to Document a New Route
Use JSDoc comments with `@swagger` tag above your route definitions.

```typescript
/**
 * @swagger
 * /users:
 *   get:
 *     summary: List users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', ...);
```
