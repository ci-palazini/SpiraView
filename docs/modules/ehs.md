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

## Lógica e Especificidades de Negócio

- Identificação Automática de Colunas (Upload): A API processa um array de strings das chaves do CSV e mapeia com os "aliases" das colunas reconhecidas em banco, a fim de extrair as informações como `num_pessoas`, `registro_id`, `ksbs_resp`, etc. 
- Upsert Inteligente: Ao processar uploads, novos registros incrementam as estatísticas do banco enquanto registros que já tinham o mesmo "registro_id" atualizam os dados existentes.
- Observadores e Fuzzy Matching: Utiliza um algoritmo Jaro-Winkler no backend (`utils/fuzzy.ts`) para tentar parear o nome em texto livre ("observador") com usuários registrados. Match com confiança >= 0.85 é automático. Nomes entre 0.60 e 0.84 são retornados à UI para resolução manual.
