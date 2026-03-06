# Granular Permissions System Documentation

This document describes the implementation and usage of the Granular Permissions system in the platform.

## Overview

The platform uses a **Role-Based Access Control (RBAC)** system with granular overrides.
- **Roles**: Define a set of default permissions (e.g., 'Operador', 'Gerente', 'Admin').
- **Permissions**: Defined per "Page Key" (feature/resource).
- **Levels**:
  - `nenhum`: No access.
  - `ver`: Read-only access.
  - `editar`: Read and Write access.

## Database Schema

Permissions are stored in the `roles` table (or historically `usuarios` overrides).
The structure is a JSON object:

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

### Shared (Recursos Compartilhados)

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `maquinas` | Shared | Cadastro de máquinas/ativos | `ver`, `editar` |
| `maquinas_config` | Shared | Configuração global de máquinas (escopos, setor, hierarquia) | `ver`, `editar` |

### Manutenção

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `meus_chamados` | Manutenção | Chamados do próprio usuário (operador) | `ver`, `editar` |
| `chamados_abertos` | Manutenção | Todos os chamados (visão gerencial) | `ver`, `editar` |
| `pecas` | Manutenção | Gestão de peças de reposição | `ver`, `editar` |
| `checklists` | Manutenção | Checklists diários | `ver`, `editar` |
| `checklists_pendencias` | Manutenção | Justificativa de pendências de checklist | `ver`, `editar` |

### Produção

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `producao_dashboard` | Produção | Dashboard de produção | `ver` |
| `producao_config` | Produção | Configurações (aliases, metas) | `ver`, `editar` |
| `producao_upload` | Produção | Upload de arquivos de produção | `editar` |

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
| `qualidade_config` | Qualidade | Configurações do módulo (origens, motivos, responsáveis) | `ver`, `editar` |

### Produção (Adicional)

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `producao_colaboradores` | Produção | Gestão de colaboradores e metas individuais | `ver`, `editar` |

### Logística

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `logistica_dashboard` | Logística | Dashboard de logística | `ver` |
| `logistica_kpis` | Logística | Gerenciamento de indicadores/metas | `ver`, `editar` |

### PDCA

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `pdca_dashboard` | PDCA | Dashboard consolidado do PDCA | `ver` |
| `pdca_planos` | PDCA | Gestão de planos de ação e causas | `ver`, `editar` |

### Melhoria Contínua

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `melhoria_continua` | Melhoria Contínua | Módulo Kaizen e Kamishibai (CRUD) | `ver`, `editar` |

### Safety (BBS)

| PageKey | Módulo | Descrição | Níveis Usados |
|---------|--------|-----------|---------------|
| `safety` | Safety | Upload de relatórios BBS e visualização no SQDCP | `ver`, `editar` |

---

## Role Templates (Exemplo)

Exemplo de configuração de permissões por role:

### Operador
```json
{
  "meus_chamados": "editar",
  "checklists": "editar",
  "maquinas": "ver",
  "chamados_abertos": "nenhum",
  "usuarios": "nenhum"
}
```

### Gerente de Manutenção
```json
{
  "meus_chamados": "editar",
  "chamados_abertos": "editar",
  "checklists": "ver",
  "maquinas": "editar",
  "pecas": "editar",
  "usuarios": "ver"
}
```

### Admin
```json
// Bypass automático - todas as permissões são 'editar'
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
- [Contexto para Agentes](../.agent/BEHAVIOR.md)
