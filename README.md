# SpiraView

Welcome to the SpiraView monorepo.

## 📚 Documentation

### Core Docs
- **[Architecture Overview](docs/ARCHITECTURE.md)**: System architecture, tech stack, and module organization.
- **[Database Schema](docs/DATABASE.md)**: Tables, relationships, and conventions.
- **[Permissions System](docs/PERMISSIONS.md)**: Detailed guide on the granular permission implementation.
- **[API Standards](docs/API.md)**: Response format, pagination, Swagger.

### Module Docs
- **[Manutenção](docs/modules/manutencao.md)**: Chamados, checklists, peças.
- **[Produção](docs/modules/producao.md)**: Dashboard, uploads, metas.
- **[Planejamento](docs/modules/planejamento.md)**: Capacidade, reservas.
- **[Qualidade](docs/modules/qualidade.md)**: Refugos, análises, comparativos.
- **[Logística](docs/modules/logistica.md)**: KPIs, faturamento, metas.
- **[PDCA](docs/modules/pdca.md)**: Planos de ação, causas, audit.
- **[Melhoria Contínua](docs/modules/melhoria_continua.md)**: Kaizens, Kamishibai, auditorias visuais.
- **[Usuários](docs/modules/usuarios.md)**: Auth, roles, permissões.

### For AI Agents
- **[Agent Context & Rules](.agent/BEHAVIOR.md)**: **CRITICAL READ** - Architectural rules and system constraints.

## 🏗 Project Structure

This project is a Monorepo managed with **pnpm**.

- **`apps/web`**: Frontend application (React, Vite, Material UI).
- **`apps/api`**: Backend API (Node.js, Express).
- **`packages/shared`**: Shared TypeScript types and utilities.

## 🚀 Quick Start

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```

2.  **Start Development**:
    ```bash
    pnpm dev
    ```
    This will start both the Web and API apps in development mode.

## 🔑 Key Systems

### Permissions
We use a granular permission system. See [docs/PERMISSIONS.md](docs/PERMISSIONS.md) for details.
New features **MUST** implement permission checks on both Frontend (`usePermissions`) and Backend (`requirePermission`).

### Internationalization
All text must be internationalized using `i18next`. See `apps/web/src/locales/`.
