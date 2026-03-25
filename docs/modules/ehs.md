# EHS Module

Este módulo lida com Saúde, Segurança e Meio Ambiente (Environment, Health, and Safety), com foco inicial no Behavior-Based Safety (BBS).

## Diretórios e Arquivos Chave

- **Frontend**: `apps/web/src/features/ehs/`
- **Backend**: `apps/api/src/routes/ehs/`

## Permissões (PageKeys)

| PageKey | Níveis | O que pode fazer |
|---------|--------|------------------|
| `safety`| `ver` | Permite o acesso à área de EHS, e leitura de dashboards futuros. Pode visualizar o histórico de uploads. |
|         | `editar` | Permite enviar (upload) arquivos de observações comportamentais (BBS). |

## Rotas de API

- **`POST /ehs/upload`** (Requer `safety:editar`): Recebe uma lista de registros provenientes do parse de um CSV/XLSX e executa o *upsert* no banco de dados nas tabelas `safety_observacoes` e `safety_observacoes_ksbs`. Opcionalmente aplica fuzzy matching no campo `observador` para vinculação automática através de `usuario_id`.
- **`POST /ehs/resolver-observadores`** (Requer `safety:editar`): Resolve manualmente mapeamentos de observadores pendentes que o algoritmo Fuzzy não teve confiança suficiente para vincular. Atualiza também o histórico.
- **`GET /ehs/uploads`** (Requer `safety:ver`): Lista o histórico dos envios feitos para este módulo.
- **`GET /ehs/compliance-mensal`** (Requer `safety:ver`): Retorna dados para o painel de compliance BBS (matriz Usuário x 12 Meses).
- **`GET /ehs/stats-avancadas?ano=YYYY`** (Requer `safety:ver`): Retorna estatísticas avançadas de BBS incluindo evolução mensal agregada, ranking de departamentos por compliance, e comparação entre ano atual e anterior.

## Funcionalidades da Página de Compliance BBS

A página `SafetyCompliancePage` (`apps/web/src/features/ehs/pages/SafetyCompliancePage.tsx`) fornece uma visão completa da conformidade BBS com as seguintes seções:

### 1. Cards de Resumo
- **Compliance Geral**: Percentual médio de compliance nos meses já decorridos do ano
- **Melhor/Pior Mês**: Identificação dos meses com maior e menor compliance
- **Utilizadores Ativos**: Total de usuários ativos no sistema
- **Mês Atual**: Número de participantes e percentual de compliance do mês corrente

### 2. Gráfico de Evolução Temporal (`EvolucaoTemporalChart`)
- Visualização de linha mostrando 3 métricas ao longo dos 12 meses:
  - Total de observações por mês
  - Número de participantes por mês
  - Taxa de compliance (%) por mês
- Permite identificar tendências e sazonalidade

### 3. Ranking de Departamentos (`RankingDepartamentosTable`)
- Tabela ordenável com as seguintes colunas:
  - Posição no ranking
  - Nome do departamento
  - Total de observações
  - Número de participantes
  - Compliance (%) com barra de progresso visual
  - Média de observações por participante
- Clicar em um departamento aplica automaticamente o filtro na matriz de usuários abaixo
- Ordenação padrão: compliance decrescente

### 4. Comparação de Períodos (`ComparacaoPeriodosCards`)
- 3 cards mostrando comparação ano atual vs. ano anterior:
  - **Observações**: Total de observações com % de variação
  - **Participantes**: Total de participantes únicos com % de variação
  - **Compliance**: Percentual de compliance com % de variação
- Ícones e cores indicam tendências (verde: crescimento, vermelho: queda, cinza: estável)

### 5. Filtro de Departamentos
- Permite filtrar a matriz de usuários por um ou múltiplos departamentos
- Atualiza dinamicamente os cards de resumo e a tabela de compliance

### 6. Matriz de Compliance Individual
- Tabela usuário × 12 meses mostrando quantas observações cada usuário realizou
- Células com cores indicando status: verde (>=1 obs), vermelho (0 obs)
- Colunas adicionais: nome, função, departamento

## Lógica e Especificidades de Negócio

- Identificação Automática de Colunas (Upload): A API processa um array de strings das chaves do CSV e mapeia com os "aliases" das colunas reconhecidas em banco, a fim de extrair as informações como `num_pessoas`, `registro_id`, `ksbs_resp`, etc. 
- Upsert Inteligente: Ao processar uploads, novos registros incrementam as estatísticas do banco enquanto registros que já tinham o mesmo "registro_id" atualizam os dados existentes.
- Observadores e Fuzzy Matching: Utiliza um algoritmo Jaro-Winkler no backend (`utils/fuzzy.ts`) para tentar parear o nome em texto livre ("observador") com usuários registrados. Match com confiança >= 0.85 é automático. Nomes entre 0.60 e 0.84 são retornados à UI para resolução manual.

