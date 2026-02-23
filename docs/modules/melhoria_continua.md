# Módulo: Melhoria Contínua

O módulo de Melhoria Contínua foi projetado para gerenciar ciclos de **Kaizen** (ferramenta visual de resolução de problemas, antes/depois) de forma estruturada, com a sustentação da mudança garantida pela auditoria semanal de **Kamishibai**.

## 1. Responsabilidades

- **Gerenciamento de Kaizen**: Catálogo visual contendo o problema inicial, a contramedida, ganhos conquistados, área/máquina afetada e comprovante visual (Thumbnail).
- **Cartões Kamishibai**: Gestão visual e criação de checklist de perguntas para sustentação do Kaizen.
- **Auditoria Recorrente**: Frontend focado em usabilidade móvel rápida para que Auditores e Operadores respondam o checklist do Kaizen (Conforme / Não Conforme).
- **Workflows Visuais (T-Cards)**: Controle do tempo expirado. Painéis apontam status de aderência "OK" (verde), "NOK" (vermelho) ou "Pendente" (amarelo) caso audição atrase por mais de 7 dias.

## 2. API Routes (`/api/melhoria-continua/`)

### Kaizens (`kaizen.ts`)
- `GET /kaizens`: Retorna listagem com paginação e o campo de agregação `kamishibaiStatus` calculando a aderência visual dos T-Cards em voo (sub-query no Postgres).
- `GET /kaizens/:id`: Detalhes do Kaizen + Perguntas Configuradas + Última Auditoria.
- `POST /kaizens`: Criação.
- `PUT /kaizens/:id`: Modificação.
- `POST /kaizens/:id/thumbnail`: Envia (mulipart) arquivo para storage. Retorna a public URL de volta e salva o caminho base.
- `DELETE /kaizens/:id`: Delete com deleção em cascata dos checklists.

### Kamishibai (`kamishibai.ts`)
- `GET /kamishibai/:kaizenId/perguntas`: Lista o checklist customizado.
- `POST /kamishibai/:kaizenId/perguntas`: Persiste arrays atualizados de perguntas (overwrite das antigas ativas por false).
- `POST /kamishibai/auditoria`: Salva num bloco transacional o ID do auditor, o status final `conforme|nao_conforme` e as respostas granulares do formulário.
- `GET /kamishibai/dashboard`: Aggregation para top indicators (Total Conforme vs Pendentes) servindo os summaries da UI.

## 3. Frontend Features

Diretório base: `apps/web/src/features/melhoria-continua/`

| Componente | Objetivo |
|------------|----------|
| `KaizenDashboardPage` | View principal do painel, agrupamento em cartões com status (T-Card) e indicadores globais do topo. |
| `KaizenFormModal` | Workflow de input antes/depois, cadastro de máquina correlacionada |
| `KamishibaiConfigModal` | Tabela dinâmica para CRUD rápido do checklist de cada módulo de sustentação |
| `KamishibaiAuditModal` | Interface responsiva para chão de fábrica (Mobile first), thumbs-up/down para respostas do checklist. |

## 4. Regras de Negócio Importantes

1. **Storage de Thumbnail**: Kaizens usam a provedora abstrata do SupabaseStorage para criar links `.getPublicUrl`. Para não depender de links assinados que expiram, usamos explicitamente caminhos e buckets públicos (e.g. `kaizen-fotos`).
2. **Kamishibai Regra dos 7 Dias**: O painel e o backend determinam automaticamente o status `Pendente` caso uma auditoria expire (nenhuma registro feito num espaço de `NOW() - INTERVAL '7 days'`).
3. **Deleção em Cascata**: Um DELETE de um Kaizen aciona cascades de todo o seu checklist e do histórico de submissões das auditorias.

## 5. Permissões
- Ver (Read-Only): `requirePermission('melhoria_continua', 'ver')`
- Criar/Editar (Mutation): `requirePermission('melhoria_continua', 'editar')`
