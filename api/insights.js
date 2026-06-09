import { getSupabaseClient } from '../lib/supabase.js';

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-vercel-cron-secret'] || req.query.secret;
  if (cronSecret && providedSecret !== cronSecret) {
    return res.status(401).send('Unauthorized');
  }

  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).send('userId requerido. Ejemplo: /api/insights?userId=xxx');
  }

  const supabase = getSupabaseClient();

  // Ejecutar todas las queries en paralelo
  const [
    { data: resumen },
    { data: categorias },
    { data: temas },
    { data: temasForzados },
    { data: porFuente },
    { data: evolucion },
    { data: postsRicos },
  ] = await Promise.all([
    supabase.rpc('insights_resumen', { p_user_id: userId }).maybeSingle().catch(() => ({ data: null })),
    supabase.from('post_categories').select('category').eq('user_id', userId),
    supabase.from('post_topics').select('topic, forced, confidence').eq('user_id', userId),
    supabase.from('post_topics').select('topic, confidence').eq('user_id', userId).eq('forced', true),
    supabase.from('post_topics').select('topic, posts(source_type)').eq('user_id', userId),
    supabase.from('post_topics').select('topic, created_at').eq('user_id', userId).gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('post_categories').select('post_id, category, posts(titulo, author_name, fecha_post)').eq('user_id', userId).limit(200),
  ]);

  // Procesar datos en JS
  const categoriasCount = countBy(categorias || [], 'category');
  const temasCount = countBy(temas?.filter(t => !t.forced) || [], 'topic');
  const forzadosCount = countBy(temasForzados || [], 'topic');
  const empresasTopics = countBy((porFuente || []).filter(t => t.posts?.source_type === 'company'), 'topic');
  const personasTopics = countBy((porFuente || []).filter(t => t.posts?.source_type === 'person'), 'topic');

  // Evolución semanal
  const semanas = {};
  for (const t of evolucion || []) {
    const semana = new Date(t.created_at);
    semana.setDate(semana.getDate() - semana.getDay());
    const key = semana.toISOString().split('T')[0];
    if (!semanas[key]) semanas[key] = {};
    semanas[key][t.topic] = (semanas[key][t.topic] || 0) + 1;
  }

  // Posts más ricos
  const postsMap = {};
  for (const r of postsRicos || []) {
    if (!postsMap[r.post_id]) {
      postsMap[r.post_id] = { ...r.posts, id: r.post_id, categorias: [] };
    }
    postsMap[r.post_id].categorias.push(r.category);
  }
  const topPosts = Object.values(postsMap).sort((a, b) => b.categorias.length - a.categorias.length).slice(0, 10);

  const totalPosts = (categorias || []).length > 0 ? new Set((categorias || []).map(c => c.post_id)).size : 0;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderHTML({
    userId,
    categoriasCount,
    temasCount,
    forzadosCount,
    empresasTopics,
    personasTopics,
    semanas,
    topPosts,
    totalAnalizados: totalPosts,
  }));
};

function countBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const val = item[key];
    if (val) map[val] = (map[val] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function bar(value, max, color = '#6366f1') {
  const pct = Math.round((value / max) * 100);
  return `<div style="display:flex;align-items:center;gap:8px">
    <div style="flex:1;background:#f1f5f9;border-radius:4px;height:8px">
      <div style="width:${pct}%;background:${color};height:8px;border-radius:4px"></div>
    </div>
    <span style="font-size:13px;color:#64748b;min-width:28px;text-align:right">${value}</span>
  </div>`;
}

function renderHTML({ userId, categoriasCount, temasCount, forzadosCount, empresasTopics, personasTopics, semanas, topPosts, totalAnalizados }) {
  const maxCat = categoriasCount[0]?.[1] || 1;
  const maxTema = temasCount[0]?.[1] || 1;
  const maxForzado = forzadosCount[0]?.[1] || 1;
  const maxEmpresa = empresasTopics[0]?.[1] || 1;
  const maxPersona = personasTopics[0]?.[1] || 1;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Insights de Posts</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; padding: 32px 16px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
    .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
    .row { margin-bottom: 10px; }
    .label { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
    .stat { font-size: 36px; font-weight: 700; color: #6366f1; }
    .stat-label { font-size: 13px; color: #94a3b8; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .tag { display:inline-block; background:#ede9fe; color:#6d28d9; border-radius:6px; padding:2px 8px; font-size:12px; margin:2px; }
    .tag.green { background:#dcfce7; color:#166534; }
    .tag.blue { background:#dbeafe; color:#1e40af; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { text-align:left; padding:8px; border-bottom:2px solid #f1f5f9; color:#64748b; font-weight:600; }
    td { padding:8px; border-bottom:1px solid #f8fafc; }
    tr:last-child td { border-bottom:none; }
    .semana-row { display:flex; gap:6px; margin-bottom:8px; align-items:flex-start; }
    .semana-label { font-size:12px; color:#94a3b8; min-width:80px; padding-top:2px; }
    .semana-tags { flex:1; }
  </style>
</head>
<body>
  <h1>📊 Insights de Posts</h1>
  <p class="subtitle">Usuario: ${userId} · ${totalAnalizados} posts analizados</p>

  <div class="grid">

    <!-- Resumen -->
    <div class="card">
      <h2>Resumen</h2>
      <div class="stats-grid">
        <div>
          <div class="stat">${totalAnalizados}</div>
          <div class="stat-label">Posts analizados</div>
        </div>
        <div>
          <div class="stat">${categoriasCount.length}</div>
          <div class="stat-label">Categorías únicas</div>
        </div>
        <div>
          <div class="stat">${temasCount.length}</div>
          <div class="stat-label">Temas únicos</div>
        </div>
      </div>
    </div>

    <!-- Categorías -->
    <div class="card">
      <h2>Categorías más frecuentes</h2>
      ${categoriasCount.slice(0, 10).map(([cat, count]) => `
        <div class="row">
          <div class="label">${cat}</div>
          ${bar(count, maxCat, '#6366f1')}
        </div>
      `).join('')}
    </div>

    <!-- Temas libres -->
    <div class="card">
      <h2>Temas más frecuentes</h2>
      ${temasCount.slice(0, 10).map(([tema, count]) => `
        <div class="row">
          <div class="label">${tema}</div>
          ${bar(count, maxTema, '#8b5cf6')}
        </div>
      `).join('')}
    </div>

    <!-- Temas forzados -->
    <div class="card">
      <h2>Temas forzados detectados</h2>
      ${forzadosCount.length === 0
        ? '<p style="color:#94a3b8;font-size:13px">No hay temas forzados configurados</p>'
        : forzadosCount.slice(0, 10).map(([tema, count]) => `
          <div class="row">
            <div class="label">${tema}</div>
            ${bar(count, maxForzado, '#f59e0b')}
          </div>
        `).join('')}
    </div>

    <!-- Por fuente: Empresas -->
    <div class="card">
      <h2>Temas — Empresas</h2>
      ${empresasTopics.slice(0, 10).map(([tema, count]) => `
        <div class="row">
          <div class="label">${tema}</div>
          ${bar(count, maxEmpresa, '#0ea5e9')}
        </div>
      `).join('')}
    </div>

    <!-- Por fuente: Personas -->
    <div class="card">
      <h2>Temas — Personas</h2>
      ${personasTopics.slice(0, 10).map(([tema, count]) => `
        <div class="row">
          <div class="label">${tema}</div>
          ${bar(count, maxPersona, '#10b981')}
        </div>
      `).join('')}
    </div>

    <!-- Evolución semanal -->
    <div class="card" style="grid-column: span 2">
      <h2>Evolución semanal (últimas 13 semanas)</h2>
      ${Object.entries(semanas).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 13).map(([semana, topics]) => `
        <div class="semana-row">
          <div class="semana-label">${semana}</div>
          <div class="semana-tags">
            ${Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, c]) =>
              `<span class="tag">${t} <strong>${c}</strong></span>`
            ).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Posts más ricos -->
    <div class="card" style="grid-column: span 2">
      <h2>Posts con más categorías</h2>
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Autor</th>
            <th>Fecha</th>
            <th>Categorías</th>
          </tr>
        </thead>
        <tbody>
          ${topPosts.map(p => `
            <tr>
              <td>${(p.titulo || '').substring(0, 60)}${p.titulo?.length > 60 ? '…' : ''}</td>
              <td style="color:#64748b">${p.author_name || '-'}</td>
              <td style="color:#64748b;white-space:nowrap">${p.fecha_post ? new Date(p.fecha_post).toLocaleDateString('es-ES') : '-'}</td>
              <td>${p.categorias.map(c => `<span class="tag">${c}</span>`).join('')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

  </div>
</body>
</html>`;
}
