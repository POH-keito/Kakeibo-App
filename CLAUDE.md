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
│       └── lib/       # NCB client, business-logic
│
├── frontend/          # React + Vite
│   └── src/
│       ├── routes/    # TanStack Router (file-based)
│       ├── components/
│       ├── lib/       # API hooks (TanStack Query)
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
| Database | NoCodeBackend (NCB) |
| Auth | Cloud Run IAP |

### Data Flow

```
Frontend (React + TanStack Query)
    ↓ fetch API hooks
Backend (Hono)
    ↓ REST API
NoCodeBackend (NCB)
```

## Development Commands

```bash
npm install           # Install dependencies
npm run dev           # Start both backend and frontend
npm run build         # Build for production
npm run test:e2e      # Run E2E tests
npm run test:e2e:ui   # Run E2E tests with UI
npm run test:codegen  # Generate test code with Playwright Codegen
```

## Authentication

Uses Cloud Run IAP headers:
- `X-Goog-Authenticated-User-Email`: User's email

Roles:
- **admin**: Full access (keito@fukushi.ma)
- **viewer**: Dashboard views only (waka@fukushi.ma)

In development: `DEV_USER_EMAIL` environment variable.

## Environment Variables

```bash
# NCB (NoCodeBackend)
NCB_BASE_URL=https://ncb.fukushi.ma
NCB_INSTANCE=<instance_id>
NCB_API_KEY=<api_key>

# Development
DEV_USER_EMAIL=keito@fukushi.ma
```

## Key Concepts

- **按分 (Burden Ratio)**: Expense splitting between household members
- **Processing Status**: `按分_家計` (household), `按分_{user}` (individual), `集計除外_*` (excluded)
- **立替 (Tatekae)**: Reimbursement tracking - payer gets positive amount
- **NCB**: NoCodeBackend REST API (Hasura-like query syntax)

## Business Logic

All core business logic is in `backend/src/lib/business-logic.ts`:
- `determineProcessingStatus()`: Transaction status determination
- `calculateShares()`: Expense share calculation
- `calculateMonthlySummary()`: Monthly aggregation with 3-level hierarchy

## Language Notes

- UI text: Japanese (日本語)
- Code: English
- Category names: `大項目` (major), `中項目` (minor)
