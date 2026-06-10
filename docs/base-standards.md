---
description: Core development rules and conventions for this project, applicable to all AI agents.
alwaysApply: true
---

# Base Standards

## 1. Project Overview

LinkedIn content monitoring SaaS backend. Users define target LinkedIn profiles and companies. The system scrapes posts via Apify, runs AI analysis via Anthropic Claude, stores results in Supabase, and exposes data via REST endpoints.

- **Runtime**: Node.js 24.x, ESM modules (`"type": "module"`)
- **Deployment**: Vercel serverless functions (`api/*.js`)
- **No framework**: No Express, no Fastify — plain `(req, res)` handlers
- **No frontend**: This is a backend-only project
- **Two branches**: `main` (v1, stable, production), `v2` (active development)

---

## 2. Core Principles

- **Small tasks, one at a time**: Always work in baby steps. Never go forward more than one step.
- **Incremental changes**: Prefer focused, minimal changes over large rewrites.
- **Question assumptions**: Always verify before inferring.
- **Pattern detection**: Detect and highlight repeated code patterns before adding new ones.
- **English only**: All code, comments, logs, commits, and documentation must be in English.

---

## 3. Language & Naming

- **Variables and functions**: camelCase (`getUserSettings`, `activeCompanies`)
- **Files**: camelCase (`apify.js`, `orchestrator.js`)
- **Constants**: UPPER_SNAKE_CASE (`BATCH_SIZE`, `APIFY_API`)
- **No Spanish**: No Spanish identifiers, comments, or log messages in code

---

## 4. ESM Module Conventions

- Always use `import`/`export` — never `require()`
- File extensions required in imports: `import { x } from './module.js'`
- No default exports for lib modules; use named exports
- API handlers use `export default async (req, res) => {}`

---

## 5. Serverless Constraints

- Each `api/*.js` file is an independent serverless function
- Max execution time: 300s (configured in `vercel.json`)
- No shared in-memory state between invocations
- Environment variables accessed via `process.env.*`
- Cold starts are expected — avoid expensive module-level initialization

---

## 6. Git Conventions

- **Branches**: `main` (stable), `v2` (active dev)
- **Commit format**: Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`
- **Scope**: Optional but encouraged — `feat(analyzer): ...`
- **Language**: English only in commit messages
- **Deploy**: `npx vercel --prod` from `v2` branch (webhook unreliable on hobby plan)

---

## 7. Environment Variables

Required variables:
```
SUPABASE_URL
SUPABASE_SERVICE_KEY
APIFY_TOKEN
APIFY_ACTOR_ID          # company posts actor
APIFY_PEOPLE_ACTOR_ID   # people posts actor
ANTHROPIC_API_KEY
HALLON_TOKEN
HALLON_SID
HALLON_TEMA_ID
CRON_SECRET             # protects cron endpoints
```

Never commit `.env` files. Never log secret values.

---

## 8. Specific Standards

- [Backend Standards](./backend-standards.md) — serverless patterns, Supabase, Apify, Anthropic, error handling
- [Frontend Standards](./frontend-standards.md) — N/A (backend-only project)
- [Documentation Standards](./documentation-standards.md) — documentation rules
- [Data Model](./data-model.md) — all Supabase tables and relationships
- [API Spec](./api-spec.yml) — OpenAPI 3.0 endpoint documentation

---

## 9. Project Skills

Skills live in `ai-specs/skills`. When a request matches a skill, load and follow the corresponding `SKILL.md` before continuing.

## 10. Symlink Integrity

- Canonical source for reusable artifacts: `ai-specs/`
- Agent-specific paths (`.claude`, `.cursor`) reference via symlinks
- A change is incomplete if it leaves broken symlinks
