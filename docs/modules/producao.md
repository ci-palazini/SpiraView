# Módulo de Produção

> **Responsável**: Dashboard de produção, upload de dados e gestão de metas.

---

## Visão Geral

O módulo de Produção gerencia o acompanhamento de horas produzidas por máquina, metas mensais e análise de variações.

```mermaid
flowchart LR
    A[Upload Excel] --> B[Processamento]
    B --> C[Lançamentos]
    C --> D[Dashboard]
    E[Metas] --> D
```

---

## Rotas API

**Arquivo**: `apps/api/src/routes/producao/`

### Upload (`upload.ts`)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| POST | `/producao/upload` | `producao_upload: editar` | Upload de arquivo Excel |
| GET | `/producao/uploads` | - | Histórico de uploads |
| GET | `/producao/uploads/:id` | - | Detalhe do upload |

### Lançamentos (`lancamentos.ts`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/producao/lancamentos` | Listar lançamentos |
| POST | `/producao/lancamentos` | Criar lançamento manual |
| PUT | `/producao/lancamentos/:id` | Atualizar |
| DELETE | `/producao/lancamentos/:id` | Excluir |

### Metas (`metas.ts`)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/producao/metas-padrao` | `producao_config: ver` | Listar metas mensais padrão |
| POST | `/producao/metas-padrao` | `producao_config: editar` | Salvar meta padrão |
| GET | `/producao/metas-dia` | `producao_config: ver` | Listar metas específicas por dia (override) |
| POST | `/producao/metas-dia` | `producao_config: editar` | Salvar meta específica por dia |
| GET | `/producao/indicadores/funcionarios/resumo` | `producao_colaboradores: ver` | Snapshot único para a tela de colaboradores |

### Setores (`setores.ts`)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/producao/setores` | `producao_config: ver` | Listar setores de produção |
| POST | `/producao/setores` | `producao_config: editar` | Criar setor |
| PUT | `/producao/setores/:id` | `producao_config: editar` | Atualizar setor |
| DELETE | `/producao/setores/:id` | `producao_config: editar` | Excluir setor |

### Resultados (`resultados.ts`)

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/producao/resultados` | `producao_resultados: ver` | Resultados aglutinados mês a mês |

---

## Páginas Frontend

**Pasta**: `apps/web/src/features/producao/pages/`

| Página | Arquivo | Descrição |
|--------|---------|-----------|
| **Dashboard** | `ProducaoDashboardPage.tsx` | Visão geral com gráficos |
| **Upload** | `ProducaoUploadPage.tsx` | Upload de Excel |
| **Detalhe Upload** | `ProducaoUploadDetalhePage.tsx` | Linhas processadas |
| **Configurações Antiga** | `ProducaoConfigPage.tsx` | Aliases das máquinas |
| **Estrutura** | `ProducaoEstruturaPage.tsx` | Cadastro de setores e configuração de máquinas |
| **Metas de Produção** | `ProducaoMetasCalendarioPage.tsx` | Configuração de meta mês e diárias |
| **Resultados** | `ProducaoResultadosPage.tsx` | Análise de horas apontadas vs metas por setor |
| **Colaboradores** | `ProducaoColaboradoresPage.tsx` | Análise por responsável |

---

## Regras de Negócio

1. **Match de máquinas**: Upload Excel faz match por nome ou `aliases_producao` da máquina.
2. **Sobrescrita**: Upload para data existente remove registros antigos antes de inserir novos.
3. **Metas**: Definidas por máquina/mês. Dashboard compara realizado vs meta.

---

## Links Relacionados

- [Schema](../DATABASE.md) - Tabelas `producao_lancamentos`, `producao_metas`
- [Permissões](../PERMISSIONS.md) - `producao_*`
