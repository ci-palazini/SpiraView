# Módulo Qualidade

> Documentação do módulo de Qualidade da plataforma TPM.

## Visão Geral

O módulo de Qualidade gerencia o controle de refugos e quarentena da fábrica, incluindo lançamentos de custos, análise de tendências e comparativos.

## API Routes

### Refugos

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/qualidade/refugos` | `qualidade_lancamento` (ver) | Listar refugos com paginação e filtros |
| POST | `/qualidade/refugos` | `qualidade_lancamento` (editar) | Criar novo lançamento |
| PUT | `/qualidade/refugos/:id` | `qualidade_lancamento` (editar) | Atualizar lançamento |
| DELETE | `/qualidade/refugos/:id` | `qualidade_lancamento` (editar) | Excluir lançamento |
| GET | `/qualidade/dashboard` | `qualidade_dashboard` (ver) | KPIs do dashboard |

### Upload

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| POST | `/qualidade/refugos/upload` | `qualidade_lancamento` (editar) | Upload em lote via Excel |

### Analytics

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/qualidade/analytics/responsaveis` | `qualidade_analitico` (ver) | Lista responsáveis únicos |
| GET | `/qualidade/analytics/summary` | `qualidade_analitico` (ver) | Resumo: custo total e top responsáveis |
| GET | `/qualidade/analytics/trends` | `qualidade_analitico` (ver) | Evolução mensal de custos |
| GET | `/qualidade/analytics/details` | `qualidade_analitico` (ver) | Detalhamento por responsável |
| GET | `/qualidade/individual/metrics` | `qualidade_desempenho` (ver) | Métricas individuais por responsável (máx 200 registros) |

**Filtros aceitos** (todos opcionais, validados via Zod):
- `dataInicio`, `dataFim` — formato `YYYY-MM-DD`
- `origem` — string ou array de strings
- `responsavel` — string ou array de strings
- `tipo` — `"INTERNO"` ou `"EXTERNO"`
- `tipoLancamento` — `"REFUGO"` ou `"QUARENTENA"`

### Compare

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/qualidade/analytics/compare` | `qualidade_analitico` (ver) | Comparativo entre dois períodos |

**Parâmetros obrigatórios**: `dataInicioA`, `dataFimA`, `dataInicioB`, `dataFimB` (formato `YYYY-MM-DD`).

### Settings (Configurações)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/qualidade/origens` | — | Listar origens |
| POST | `/qualidade/origens` | `qualidade_config` (editar) | Criar origem |
| PUT | `/qualidade/origens/:id` | `qualidade_config` (editar) | Editar/desativar origem |
| DELETE | `/qualidade/origens/:id` | `qualidade_config` (editar) | Excluir origem |
| GET | `/qualidade/motivos` | — | Listar motivos de defeito |
| POST | `/qualidade/motivos` | `qualidade_config` (editar) | Criar motivo |
| PUT | `/qualidade/motivos/:id` | `qualidade_config` (editar) | Editar/desativar motivo |
| DELETE | `/qualidade/motivos/:id` | `qualidade_config` (editar) | Excluir motivo |
| GET | `/qualidade/responsaveis` | — | Listar responsáveis |
| POST | `/qualidade/responsaveis` | `qualidade_config` (editar) | Criar responsável |
| PUT | `/qualidade/responsaveis/:id` | `qualidade_config` (editar) | Editar responsável |
| DELETE | `/qualidade/responsaveis/:id` | `qualidade_config` (editar) | Excluir responsável |

## Frontend Pages

| Página | Path | Permissão | Descrição |
|--------|------|-----------|-----------|
| Dashboard | `/qualidade/dashboard` | `qualidade_dashboard` | KPIs e gráficos gerais |
| Lançamentos | `/qualidade/lancamentos` | `qualidade_lancamento` | CRUD de refugos, upload Excel |
| Análise Detalhada | `/qualidade/analitico` | `qualidade_analitico` | Análise por responsável/origem |
| Comparativos | `/qualidade/comparativo` | `qualidade_analitico` | Comparar períodos |
| Configurações | `/qualidade/config` | `qualidade_config` | Gerenciar origens, motivos, responsáveis |

## Permissões

| PageKey | Descrição | Níveis |
|---------|-----------|--------|
| `qualidade_dashboard` | Dashboard de indicadores | `ver` |
| `qualidade_lancamento` | Lançamento de refugos | `ver`, `editar` |
| `qualidade_analitico` | Análise detalhada | `ver` |
| `qualidade_config` | Configurações do módulo | `ver`, `editar` |

## Entidades de Dados

### qualidade_refugos
Tabela principal de lançamentos de refugo/quarentena.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Identificador único |
| `data_ocorrencia` | DATE | Data do evento |
| `origem_referencia` | TEXT | Referência/OP |
| `codigo_item` | TEXT | Código do item |
| `descricao_item` | TEXT | Descrição do item |
| `motivo_defeito` | TEXT | Motivo do defeito |
| `quantidade` | NUMERIC | Quantidade |
| `custo` | NUMERIC | Custo em R$ |
| `origem` | TEXT | Origem (FK nome) |
| `responsavel_nome` | TEXT | Responsável |
| `numero_ncr` | TEXT | Número NCR (opcional) |
| `tipo_lancamento` | TEXT | `"REFUGO"` ou `"QUARENTENA"` |

**Indexes de performance** (B-tree, criados em março/2026):
- `responsavel_nome` — filtro/agrupamento por responsável
- `tipo_lancamento` — filtro REFUGO/QUARENTENA
- `(data_ocorrencia DESC, responsavel_nome)` — analytics por responsável no período
- `(data_ocorrencia DESC, origem)` — analytics por origem no período

### qualidade_origens
Cadastro de origens (setores/áreas).

### qualidade_motivos
Cadastro de motivos de defeito.

### qualidade_responsaveis
Cadastro de responsáveis por origem.

## Utilitário Compartilhado

**`whereBuilders.ts`** centraliza os filtros SQL de `qualidade_refugos`. Todas as rotas de analytics, compare, individual e refugos usam este utilitário:

```typescript
import { buildQualidadeWhere, qualidadeFiltrosSchema } from './whereBuilders';

const parsed = qualidadeFiltrosSchema.safeParse(req.query);
if (!parsed.success) return res.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten().fieldErrors });

const params: unknown[] = [];
const where = buildQualidadeWhere(params, parsed.data);
// Para alias de tabela: buildQualidadeWhere(params, parsed.data, { tableAlias: 'qr' })
```

## Fluxos Principais

### Upload de Planilha
1. Usuário seleciona arquivo Excel
2. Frontend parseia e valida colunas
3. Modal de reconciliação para valores não cadastrados
4. POST em lote para `/qualidade/refugos/upload`

### Análise de Custos
1. Dashboard exibe KPIs do período selecionado
2. Página Analítica mostra top responsáveis e evolução
3. Comparativo permite comparar períodos, origens ou responsáveis
