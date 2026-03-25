# Granular Permissions System Documentation

This document describes the implementation and usage of the Granular Permissions system in the platform.

## Overview

The platform uses a **Role-Based Access Control (RBAC)** system with granular, per-user overrides.

### Structural Roles (Fixed)
The system has **3 structural roles** that cannot be created or deleted:
- **`admin`**: Full system access (bypass all permissions)
- **`operador`**: Machine operator role (may have specific application logic)
- **`colaborador`**: Generic collaborator (all permissions controlled by granular rules)

### Permissions
- **Per-User, Granular**: Each user's access is defined by explicit permissions per "Page Key"
- **Not Role-Based**: Unlike traditional RBAC, users don't inherit permissions from their role
- **Levels**:
  - `nenhum`: No access
  - `ver`: Read-only access
  - `editar`: Read and Write access

### User Identity
- **`role`**: One of the 3 structural roles (admin, operador, colaborador)
- **`funcao`**: Customizable user-friendly label (e.g., "Analista", "Gerente de Produção")
- **`permissoes`**: JSON object mapping pageKey → permission level

## Database Schema

### roles table
- `id`: Role identifier
- `nome`: Role name (admin, operador, or colaborador)
- `descricao`: Human-readable description
- `is_system`: Boolean (true for structural roles)
- `permissoes`: JSON object (deprecated, not used for access control)

### usuarios table
- `role_id`: FK to roles table (one of the 3 structural roles)
- `funcao`: Customizable label/job title (e.g., "Analista de Qualidade")
- `permissoes`: JSON object with per-user permission overrides

**Permission JSON structure:**
```json
{
  "usuarios": "editar",
  "producao_dashboard": "ver",
  "configuracoes": "nenhum"
}
```

## Backend Implementation (`apps/api`)

The API protects endpoints using the `requirePermission` middleware.

### Middleware Usage

**File**: `src/middlewares/requirePermission.ts`

```typescript
import { requirePermission } from '../middlewares/requirePermission';

// Protect a route
router.get(
  '/', 
  requirePermission('usuarios', 'ver'), 
  getUsers
);

router.post(
  '/', 
  requirePermission('usuarios', 'editar'), 
  createUser
);
```

### Admin Bypass
Users with role `admin` automatically bypass all permission checks.

## Frontend Implementation (`apps/web`)

The Frontend conditionally renders UI elements using the `usePermissions` hook.

### Hook Usage

**File**: `src/hooks/usePermissions.ts`

```typescript
import { usePermissions } from '../hooks/usePermissions';

const MyComponent = () => {
  const { user } = useAuth();
  const { canView, canEdit } = usePermissions(user);

  if (!canView('minha_pagina')) {
    return <AccessDenied />;
  }

  return (
    <div>
      <h1>Minha Página</h1>
      {canEdit('minha_pagina') && (
        <button>Salvar</button>
      )}
    </div>
  );
};
```

---

## PageKeys Catalog

> **Complete list of all permission keys used in the platform.**

### Core (Autenticação e Gestão)

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `usuarios` | Core | Gestão de usuários (CRUD) | `ver`, `editar` |
| `roles` | Core | Gestão de papéis/permissões | `ver`, `editar` |
| `notificacoes_config` | Core | Configuração de destinatários de email | `ver`, `editar` |
| `departamentos` | Core | Gestão de departamentos e hierarquia | `ver`, `editar` |

### Shared (Recursos Compartilhados)

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `inicio` | Shared | Acesso à tela de apresentação / Dashboard principal | `ver`, `editar` |
| `reuniao_diaria` | Shared | Permissão de visualização do dashboard DMS | `ver` |
| `maquinas` | Shared | Cadastro de máquinas/ativos | `ver`, `editar` |
| `maquinas_config` | Shared | Configuração global de máquinas (escopos, setor, hierarquia) | `ver`, `editar` |

### Manutenção

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `abrir_chamado` | Manutenção | Permissão específica para registrar um chamado | `ver`, `editar` |
| `meus_chamados` | Manutenção | Chamados do próprio usuário (operador) | `ver`, `editar` |
| `chamados_abertos` | Manutenção | Todos os chamados (visão gerencial) | `ver`, `editar` |
| `chamados_gestao` | Manutenção | Visão de indicadores e relatórios de chamados | `ver`, `editar` |
| `historico_chamados` | Manutenção | Consulta de chamados já encerrados | `ver`, `editar` |
| `estoque` | Manutenção | Acesso à área de suprimentos | `ver`, `editar` |
| `movimentacoes` | Manutenção | Logs de entrada/saída de peças | `ver`, `editar` |
| `calendario` | Manutenção | Módulo de Manutenções Preventivas e calendário | `ver`, `editar` |
| `pecas` | Manutenção | Gestão de peças de reposição | `ver`, `editar` |
| `checklists_diarios` | Manutenção | Checklists diários | `ver`, `editar` |
| `checklists_pendencias` | Manutenção | Justificativa de pendências de checklist | `ver`, `editar` |

### Produção

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `producao_dashboard` | Produção | Dashboard de produção | `ver` |
| `producao_config` | Produção | Configurações (aliases, metas) | `ver`, `editar` |
| `producao_upload` | Produção | Upload de arquivos de produção | `editar` |
| `producao_colaboradores` | Produção | Gestão de colaboradores e metas individuais | `ver`, `editar` |
| `producao_resultados` | Produção | Resultados mensais de produção | `ver` |

### Planejamento

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `planejamento_dashboard` | Planejamento | Dashboard de capacidade | `ver` |
| `planejamento_upload` | Planejamento | Upload de planilhas Excel | `editar` |
| `planejamento_config` | Planejamento | Configurações de máquinas | `ver`, `editar` |


### Qualidade

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `qualidade_dashboard` | Qualidade | Dashboard de indicadores de refugo | `ver` |
| `qualidade_lancamento` | Qualidade | Lançamento de novos refugos | `ver`, `editar` |
| `qualidade_analitico` | Qualidade | Análise detalhada de custos e tendências | `ver` |
| `qualidade_desempenho` | Qualidade | Análise de desempenho individual | `ver` |
| `qualidade_comparativo` | Qualidade | Comparativo temporal e de turnos | `ver` |
| `qualidade_config` | Qualidade | Configurações do módulo (origens, motivos, responsáveis) | `ver`, `editar` |

### Logística

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `logistica_dashboard` | Logística | Dashboard de logística | `ver` |
| `logistica_kpis` | Logística | Gerenciamento de indicadores/metas | `ver`, `editar` |
| `logistica_painel` | Logística | Painel de notas de embarque | `ver`, `editar` |
| `logistica_proposto` | Logística | Painel de faturamento proposto (HTML) | `ver`, `editar` |

### PDCA

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `pdca_dashboard` | PDCA | Dashboard consolidado do PDCA | `ver` |
| `pdca_planos` | PDCA | Gestão de planos de ação e causas | `ver`, `editar` |
| `causas_raiz` | PDCA | Cadastro matriz de causas | `ver`, `editar` |
| `analise_falhas` | PDCA | Relatório de Análises 5 Porquês | `ver`, `editar` |

### Melhoria Contínua

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `melhoria_continua` | Melhoria Contínua | Módulo Kaizen e Kamishibai (CRUD) | `ver`, `editar` |

### Safety (BBS)

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `safety` | Safety | Upload de relatórios BBS e visualização no SQDCP | `ver`, `editar` |

---

## User Permission Examples

Unlike traditional RBAC, permissions are NOT inherited from role. Each user has explicit permissions:

### Example: Analista (role: colaborador)
```json
{
  "qualidade_dashboard": "ver",
  "qualidade_lancamento": "editar",
  "qualidade_analitico": "ver",
  "maquinas": "ver"
}
```

### Example: Gerente de Manutenção (role: colaborador)
```json
{
  "chamados_abertos": "editar",
  "maquinas": "editar",
  "pecas": "editar",
  "usuarios": "ver",
  "relatorios": "ver"
}
```

### Example: Admin (role: admin)
```json
// No explicit permissions needed - role 'admin' bypasses all checks
{}
```

---

## Adding a New Permission

1.  **Define the Key**: Choose a unique string key (e.g., `relatorios_financeiros`).
2.  **Database**: Update the `roles` table to include this key for relevant roles.
3.  **Backend**: Add `requirePermission('new_key', 'level')` to protect routes.
4.  **Frontend**: Use `canView('new_key')` or `canEdit('new_key')` to conditionally render UI.
5.  **Document**: Add the new key to this catalog.

---

## Links Relacionados

- [Arquitetura do Sistema](ARCHITECTURE.md)
- [Schema do Banco](DATABASE.md)
- [Contexto para Agentes](CONTEXT.md)
