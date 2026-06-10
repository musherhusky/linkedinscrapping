---
description: Backend development standards for this Node.js ESM serverless project on Vercel with Supabase, Apify, and Anthropic.
globs: ["api/**/*.js", "lib/**/*.js"]
alwaysApply: true
---

# Backend Standards

## 1. Serverless Function Pattern

Every file in `api/` is a Vercel serverless function. Follow this structure:

```js
export default async (req, res) => {
  // 1. Method guard
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Auth guard
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-vercel-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 3. Input validation
  const { userId } = req.body ?? req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  // 4. Business logic (delegated to lib/)
  try {
    const result = await doSomething(userId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
```

**Rules:**
- API handlers must be thin — delegate all logic to `lib/`
- Always return early with `return res.status(...)`
- Always catch errors and return `500` with `error.message`
- Never throw from an API handler

---

## 2. Library Module Pattern

Files in `lib/` contain all business logic. Each module has a single responsibility:

| File | Responsibility |
|---|---|
| `lib/supabase.js` | Supabase client singleton |
| `lib/config.js` | User settings and plan resolution |
| `lib/database.js` | All Supabase queries |
| `lib/apify.js` | Apify actor execution and post mapping |
| `lib/orchestrator.js` | Process coordination (batching, distribution) |
| `lib/hallon.js` | Hallon API integration |
| `lib/claude.js` | Anthropic API calls |
| `lib/analyzer.js` | AI analysis orchestration |
| `lib/logger.js` | Structured logging |

**Rules:**
- One responsibility per file
- Export named functions, not classes
- No side effects at module load time

---

## 3. Supabase Usage

Always use the singleton client:

```js
import { getSupabaseClient } from './supabase.js';

const supabase = getSupabaseClient();
```

**Query patterns:**
```js
// Select with filter
const { data, error } = await supabase
  .from('posts')
  .select('id, titulo, author_id')
  .eq('user_id', userId)
  .order('fecha_post', { ascending: false });

if (error) throw error;

// Insert
const { data, error } = await supabase
  .from('posts')
  .insert({ user_id: userId, ...postData })
  .select()
  .single();

// Update
const { error } = await supabase
  .from('target_companies')
  .update({ active: false })
  .in('id', ids);
```

**Rules:**
- Always destructure `{ data, error }` and check `error`
- Use `throw error` to propagate — let the caller handle it
- Never use raw SQL via `supabase.rpc` unless necessary
- No subqueries inside `.not()` — fetch IDs first, then filter

---

## 4. Apify Integration

Two actors configured via env vars:
- `APIFY_ACTOR_ID` — scrapes company LinkedIn pages
- `APIFY_PEOPLE_ACTOR_ID` — scrapes person LinkedIn profiles

```js
import { executeActor, executePeopleActor } from './apify.js';

// Both accept: (urlsArray, settingsObject)
const posts = await executeActor(companyUrls, settings);
const peoplePosts = await executePeopleActor(peopleUrls, settings);
```

`settings` must include:
- `max_posts_per_company` — integer, 0 = unlimited
- `posted_limit` — derived from user's plan (`'24h'` or `'1h'`)

**Batching rule**: In `processAllUsersBatched()`, all users' URLs are deduplicated globally before calling Apify. One Apify call per type per cron execution.

---

## 5. Anthropic API Usage

```js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const message = await client.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 4096,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: prompt }],
});

// Always strip markdown code blocks before parsing
let content = message.content[0].text.trim();
content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
const parsed = JSON.parse(content);
```

**Rules:**
- Batch size: max 20 posts per Claude call
- Always strip markdown from response before `JSON.parse()`
- If parsing fails, log the error and skip the batch — never crash the whole job
- `posted_limit` is derived from the plan, never from user input

---

## 6. Error Handling

```js
// In lib/ functions: throw, let caller handle
export async function getActiveCompanies(userId) {
  const { data, error } = await supabase.from('target_companies')...;
  if (error) throw error;
  return data;
}

// In orchestrator: catch per-user, continue others
try {
  const result = await processUser(userId);
} catch (error) {
  logger.error(`Error processing user ${userId}: ${error.message}`);
  return { success: false, userId, error: error.message };
}

// In api/ handlers: catch everything, return 500
try {
  const result = await doWork();
  return res.status(200).json({ success: true, ...result });
} catch (error) {
  return res.status(500).json({ success: false, error: error.message });
}
```

---

## 7. Logging

Use the `Logger` class from `lib/logger.js`:

```js
import { Logger } from './logger.js';
const logger = new Logger('MODULE_NAME');

logger.info('Starting process...');
logger.success('Completed: 5 posts saved');
logger.warn('No active companies found');
logger.error(`Failed: ${error.message}`);
logger.section('PROCESSING USER: xyz'); // visual separator
```

- Module name in UPPER_SNAKE_CASE
- Log messages in English
- Never log secrets or full API responses

---

## 8. Security

- All cron/admin endpoints protected with `x-vercel-cron-secret` header
- Supabase service key used server-side only — never exposed to clients
- `userId` always comes from authenticated context — never trust raw query params in production endpoints
- Secrets loaded from `process.env` — never hardcoded

---

## 9. Performance

- Use `Promise.all()` for independent async operations
- Deduplicate URLs globally before Apify calls (see `processAllUsersBatched`)
- Add 1s delay between Claude batches to avoid rate limits
- Supabase queries: select only needed columns, never `select('*')` in hot paths

---

## 10. Testing

No test framework currently configured. When adding tests:
- Use Node.js built-in `node:test` (no Jest — no TypeScript)
- Test files: `lib/*.test.js`
- Mock Supabase and Apify clients
- Focus on pure logic functions in `lib/`
