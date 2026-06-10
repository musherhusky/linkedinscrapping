---
description: Documentation standards for this project.
alwaysApply: true
---

# Documentation Standards

## 1. Principles

- **English only**: All documentation in English
- **Implementation-ready**: Written for AI agents and developers, not product managers
- **Factual**: Only document what actually exists — no aspirational content
- **Concise**: Prefer tables and code examples over prose paragraphs

---

## 2. Documentation Files

| File | Purpose | Update when |
|---|---|---|
| `docs/base-standards.md` | Core conventions, ESM rules, git workflow | Stack changes, new conventions |
| `docs/backend-standards.md` | Serverless patterns, Supabase, Apify, Claude, error handling | New integration, new pattern |
| `docs/frontend-standards.md` | N/A marker | Never (backend-only project) |
| `docs/data-model.md` | All Supabase tables with fields and relationships | Any schema change |
| `docs/api-spec.yml` | OpenAPI 3.0 for all `api/*.js` endpoints | New endpoint or changed contract |
| `docs/documentation-standards.md` | This file | Documentation process changes |

---

## 3. When to Update Docs

**Required** (do not skip):
- Adding a new table or column → update `data-model.md`
- Adding a new `api/*.js` endpoint → update `api-spec.yml`
- Changing an endpoint's input/output contract → update `api-spec.yml`
- Adding a new integration (new service, new env var) → update `backend-standards.md`

**Not required**:
- Internal refactors that don't change the public API or schema
- Bug fixes that don't change behavior

---

## 4. Code Examples in Docs

- Use real code from the project, not invented examples
- Show the actual pattern used, not the ideal pattern
- Include error handling in examples

---

## 5. Data Model Documentation Format

For each table, document:
1. Table name and purpose (one line)
2. Columns table: name, type, description
3. Constraints (unique, FK, check)
4. Relationships to other tables

---

## 6. API Spec Format

Use OpenAPI 3.0. For each endpoint document:
- HTTP method and path
- Auth requirement
- All query/body parameters
- All response codes with schema

---

## 7. Isolated Modules

Modules marked as "isolated" (`dashboard.js`, `insights.js`, `analyzer.js`, `claude.js`) must include a note in both the API spec and data model doc explaining how to safely remove them.

Isolated = no imports from it in other `lib/` or `api/` files.
