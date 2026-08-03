import { getRecentCronExecutions } from '../lib/database.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Server misconfiguration' });
  const bearerToken = req.headers['authorization']?.replace('Bearer ', '');
  const customHeader = req.headers['x-vercel-cron-secret'];
  if (bearerToken !== cronSecret && customHeader !== cronSecret) {
    return res.status(401).send('Unauthorized');
  }

  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const executions = await getRecentCronExecutions(limit);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderHTML(executions));
};

function renderHTML(executions) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Cron Status</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f8fafc; color:#1e293b; padding:32px 16px; }
    h1 { font-size:22px; font-weight:700; margin-bottom:16px; }
    table { width:100%; border-collapse:collapse; background:white; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.07); }
    th, td { text-align:left; padding:10px 14px; font-size:13px; border-bottom:1px solid #f1f5f9; }
    th { color:#64748b; text-transform:uppercase; font-size:11px; letter-spacing:0.05em; }
    .status { display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600; }
    .status.success { background:#dcfce7; color:#166534; }
    .status.no_users { background:#f1f5f9; color:#475569; }
    .status.error { background:#fee2e2; color:#991b1b; }
    .empty { color:#94a3b8; font-size:13px; text-align:center; padding:24px; background:white; border-radius:12px; }
  </style>
</head>
<body>
  <h1>Cron Executions</h1>
  ${executions.length === 0 ? '<p class="empty">No cron executions recorded yet.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Started At</th>
        <th>Hour (UTC)</th>
        <th>Status</th>
        <th>Users</th>
        <th>Sent</th>
        <th>Failed</th>
        <th>Duration</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${executions.map(e => `
        <tr>
          <td>${escapeHtml(e.started_at)}</td>
          <td>${escapeHtml(e.hour_utc)}</td>
          <td><span class="status ${escapeHtml(e.status)}">${escapeHtml(e.status)}</span></td>
          <td>${escapeHtml(e.users_processed)}</td>
          <td>${escapeHtml(e.posts_sent)}</td>
          <td>${escapeHtml(e.posts_failed)}</td>
          <td>${e.duration_ms != null ? `${e.duration_ms}ms` : '—'}</td>
          <td>${escapeHtml(e.error_message) || '—'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  `}
</body>
</html>`;
}
