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

- **`POST /ehs/upload`** (Requer `safety:editar`): Recebe uma lista de registros provenientes do parse de um CSV/XLSX e executa o *upsert* (inserção ou atualização) no banco de dados na tabela `safety_observacoes` e `safety_observacoes_ksbs`.
- **`GET /ehs/uploads`** (Requer `safety:ver`): Lista o histórico dos envios feitos para este módulo.

## Lógica e Especificidades de Negócio

- Identificação Automática de Colunas (Upload): A API processa um array de strings das chaves do CSV e mapeia com os "aliases" das colunas reconhecidas em banco, a fim de extrair as informações como `num_pessoas`, `registro_id`, `ksbs_resp`, etc. 
- Upsert Inteligente: Ao processar uploads, novos registros incrementam as estatísticas do banco enquanto registros que já tinham o mesmo "registro_id" atualizam os dados existentes.
