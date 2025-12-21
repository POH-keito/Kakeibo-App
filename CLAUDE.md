# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kakeibo-App is a unified household finance management application that combines:
- **Dashboarding**: Visualization and analysis of household expenses
- **Utilities**: CSV import, burden ratio editing, tagging

## Architecture

### Monorepo Structure
```
kakeibo-app/
├── backend/           # Hono server (Node.js)
│   └── src/
│       ├── index.ts   # Entry point + AppType export
│       ├── routes/    # API endpoints
│       ├── middleware/ # Auth, etc.
│       └── lib/       # NCB client, utilities
│
├── frontend/          # React + Vite
│   └── src/
│       ├── routes/    # TanStack Router (file-based)
│       ├── components/
│       ├── lib/       # Hono RPC client
│       └── main.tsx
│
└── tests/             # Playwright E2E tests
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Hono |
| Frontend | React 19 + Vite 7 |
| Routing | TanStack Router |
| State | TanStack Query |
| Styling | Tailwind CSS 4 |
| Type Safety | Hono RPC |
| Database | NoCodeBackend |
| Auth | Cloud Run IAP |

## Development Commands

```bash
# Install dependencies
npm install

# Start both backend and frontend
npm run dev

# Build for production
npm run build

# Run E2E tests
npm run test:e2e

# Generate test code with Playwright Codegen
npm run test:codegen
```

## Authentication

Uses Cloud Run IAP headers for authentication:
- `X-Goog-Authenticated-User-Email`: User's email

Roles (hardcoded):
- **admin**: Full access (keito@fukushi.ma)
- **viewer**: Dashboard views only (waka@fukushi.ma)

In development, use `DEV_USER_EMAIL` environment variable.

## Key Concepts

- **按分 (Burden Ratio)**: Expense splitting between household members
- **Processing Status**: `按分_家計` (household), `按分_{user}` (individual), `集計除外_*` (excluded)
- **NCB (NoCodeBackend)**: REST API for database operations

## API Pattern

Hono RPC provides end-to-end type safety:

```typescript
// Backend
const app = new Hono()
  .get('/api/transactions', async (c) => {
    return c.json(transactions);
  });

export type AppType = typeof app;

// Frontend
import { hc } from 'hono/client';
import type { AppType } from '../../../backend/src/index.js';

const client = hc<AppType>('/');
const res = await client.api.transactions.$get();
```

## Language Notes

- UI text is in Japanese (日本語)
- Code comments and variable names use English
- Category names: `大項目` (major), `中項目` (minor)
