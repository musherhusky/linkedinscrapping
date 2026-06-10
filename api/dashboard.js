import { getSupabaseClient } from '../lib/supabase.js';

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-vercel-cron-secret'] || req.query.secret;
  if (cronSecret && providedSecret !== cronSecret) {
    return res.status(401).send('Unauthorized');
  }

  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).send('userId requerido. Ejemplo: /api/dashboard?userId=xxx&secret=yyy');
  }

  // Período: últimos 30 días por defecto, o ?days=7|30|90
  const days = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseClient();

  // Queries en paralelo
  const [postsRes, topicsThisWeekRes, topicsLastWeekRes] = await Promise.all([
    supabase
      .from('posts')
      .select('id, fecha_post, likes, comments, shares, reactions_like, reactions_empathy, reactions_praise, reactions_appreciation, reactions_interest, reactions_entertainment')
      .eq('user_id', userId)
      .gte('fecha_post', since)
      .order('fecha_post', { ascending: true }),
    supabase
      .from('post_topics')
      .select('topic')
      .eq('user_id', userId)
      .gte('created_at', weekAgo),
    supabase
      .from('post_topics')
      .select('topic')
      .eq('user_id', userId)
      .gte('created_at', twoWeeksAgo)
      .lt('created_at', weekAgo),
  ]);

  const posts = postsRes.data || [];
  const topicsThisWeek = topicsThisWeekRes.data || [];
  const topicsLastWeek = topicsLastWeekRes.data || [];

  // ── KPIs ──
  const totalPosts = posts.length;
  const totalReactions = posts.reduce((sum, p) =>
    sum + (p.likes || 0) + (p.reactions_empathy || 0) + (p.reactions_praise || 0) +
    (p.reactions_appreciation || 0) + (p.reactions_interest || 0) + (p.reactions_entertainment || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments || 0), 0);
  const totalShares = posts.reduce((sum, p) => sum + (p.shares || 0), 0);
  const engagementMedio = totalPosts > 0
    ? ((totalReactions + totalComments + totalShares) / totalPosts).toFixed(1)
    : 0;

  // ── Actividad por día ──
  const actividadPorDia = {};
  for (const p of posts) {
    const dia = p.fecha_post?.split('T')[0];
    if (!dia) continue;
    if (!actividadPorDia[dia]) actividadPorDia[dia] = { posts: 0, reacciones: 0 };
    actividadPorDia[dia].posts++;
    actividadPorDia[dia].reacciones += (p.likes || 0) + (p.reactions_empathy || 0) +
      (p.reactions_praise || 0) + (p.reactions_appreciation || 0) +
      (p.reactions_interest || 0) + (p.reactions_entertainment || 0);
  }

  // Rellenar días sin actividad en el período
  const diasOrdenados = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    diasOrdenados.push({ dia: key, ...( actividadPorDia[key] || { posts: 0, reacciones: 0 }) });
  }

  // ── Temas en tendencia ──
  const countTopics = (arr) => {
    const map = {};
    for (const t of arr) map[t.topic] = (map[t.topic] || 0) + 1;
    return map;
  };
  const thisWeekMap = countTopics(topicsThisWeek);
  const lastWeekMap = countTopics(topicsLastWeek);

  const tendencias = Object.entries(thisWeekMap)
    .map(([topic, count]) => ({
      topic,
      count,
      delta: count - (lastWeekMap[topic] || 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const maxTendencia = tendencias[0]?.count || 1;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderHTML({
    userId, days,
    totalPosts, totalReactions, totalComments, engagementMedio,
    diasOrdenados, tendencias, maxTendencia,
  }));
};

function renderHTML({ userId, days, totalPosts, totalReactions, totalComments, engagementMedio, diasOrdenados, tendencias, maxTendencia }) {
  const maxPosts = Math.max(...diasOrdenados.map(d => d.posts), 1);
  const maxReacciones = Math.max(...diasOrdenados.map(d => d.reacciones), 1);
  const chartHeight = 120;

  // Agrupar por semana para el eje X si days > 14
  const mostrarEtiqueta = (dia, i) => {
    if (days <= 14) return true;
    if (days <= 30) return i % 3 === 0;
    return i % 7 === 0;
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Dashboard</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f8fafc; color:#1e293b; padding:32px 16px; }
    h1 { font-size:22px; font-weight:700; margin-bottom:4px; }
    .subtitle { color:#64748b; font-size:13px; margin-bottom:24px; }
    .period-selector { display:flex; gap:8px; margin-bottom:28px; }
    .period-btn { padding:6px 14px; border-radius:20px; border:1px solid #e2e8f0; background:white; font-size:13px; cursor:pointer; text-decoration:none; color:#475569; }
    .period-btn.active { background:#6366f1; color:white; border-color:#6366f1; }
    .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; margin-bottom:28px; }
    .kpi { background:white; border-radius:12px; padding:20px 24px; box-shadow:0 1px 3px rgba(0,0,0,0.07); }
    .kpi-label { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; }
    .kpi-value { font-size:32px; font-weight:700; color:#1e293b; }
    .kpi-sub { font-size:12px; color:#94a3b8; margin-top:4px; }
    .section { background:white; border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.07); margin-bottom:20px; }
    .section h2 { font-size:14px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:20px; }
    .chart { display:flex; align-items:flex-end; gap:3px; height:${chartHeight}px; overflow:hidden; }
    .bar-group { display:flex; flex-direction:column; align-items:center; gap:2px; flex:1; }
    .bar-wrap { display:flex; align-items:flex-end; gap:1px; height:${chartHeight - 20}px; width:100%; }
    .bar { border-radius:3px 3px 0 0; min-height:2px; flex:1; }
    .bar.posts { background:#6366f1; }
    .bar.reacciones { background:#c7d2fe; }
    .bar-label { font-size:9px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; text-align:center; }
    .chart-legend { display:flex; gap:16px; margin-top:12px; }
    .legend-item { display:flex; align-items:center; gap:6px; font-size:12px; color:#64748b; }
    .legend-dot { width:10px; height:10px; border-radius:2px; }
    .tendencia-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .tendencia-topic { font-size:13px; font-weight:500; min-width:160px; }
    .tendencia-bar-wrap { flex:1; background:#f1f5f9; border-radius:4px; height:8px; }
    .tendencia-bar { height:8px; border-radius:4px; background:#6366f1; }
    .tendencia-count { font-size:13px; color:#64748b; min-width:28px; text-align:right; }
    .delta { font-size:12px; min-width:40px; text-align:right; font-weight:600; }
    .delta.up { color:#10b981; }
    .delta.down { color:#ef4444; }
    .delta.flat { color:#94a3b8; }
    .empty { color:#94a3b8; font-size:13px; text-align:center; padding:24px; }
  </style>
</head>
<body>
  <h1>📈 Dashboard</h1>
  <p class="subtitle">Usuario: ${userId}</p>

  <div class="period-selector">
    <a href="?userId=${userId}&secret=${''}&days=7" class="period-btn ${days === 7 ? 'active' : ''}">7 días</a>
    <a href="?userId=${userId}&secret=${''}&days=30" class="period-btn ${days === 30 ? 'active' : ''}">30 días</a>
    <a href="?userId=${userId}&secret=${''}&days=90" class="period-btn ${days === 90 ? 'active' : ''}">90 días</a>
  </div>

  <!-- KPIs -->
  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Posts publicados</div>
      <div class="kpi-value">${totalPosts}</div>
      <div class="kpi-sub">últimos ${days} días</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Reacciones totales</div>
      <div class="kpi-value">${totalReactions.toLocaleString('es-ES')}</div>
      <div class="kpi-sub">likes + emociones</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Comentarios</div>
      <div class="kpi-value">${totalComments.toLocaleString('es-ES')}</div>
      <div class="kpi-sub">conversación real</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Engagement medio</div>
      <div class="kpi-value">${engagementMedio}</div>
      <div class="kpi-sub">reacciones+comentarios / post</div>
    </div>
  </div>

  <!-- Gráficos en 2 columnas -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">

  <!-- Gráfico actividad -->
  <div class="section" style="margin-bottom:0">
    <h2>Actividad ${days <= 7 ? 'diaria' : 'por día'}</h2>
    ${diasOrdenados.length === 0 ? '<p class="empty">Sin datos en este período</p>' : `
    <div class="chart">
      ${diasOrdenados.map((d, i) => `
        <div class="bar-group">
          <div class="bar-wrap">
            <div class="bar posts" style="height:${Math.round((d.posts / maxPosts) * (chartHeight - 20))}px" title="${d.dia}: ${d.posts} posts"></div>
            <div class="bar reacciones" style="height:${Math.round((d.reacciones / maxReacciones) * (chartHeight - 20))}px" title="${d.dia}: ${d.reacciones} reacciones"></div>
          </div>
          <div class="bar-label">${mostrarEtiqueta(d.dia, i) ? d.dia.slice(5) : ''}</div>
        </div>
      `).join('')}
    </div>
    <div class="chart-legend">
      <div class="legend-item"><div class="legend-dot" style="background:#6366f1"></div> Posts</div>
      <div class="legend-item"><div class="legend-dot" style="background:#c7d2fe"></div> Reacciones</div>
    </div>
    `}
  </div>

  <!-- Temas en tendencia -->
  <div class="section" style="margin-bottom:0">
    <h2>Temas en tendencia — esta semana</h2>
    ${tendencias.length === 0
      ? '<p class="empty">Sin datos de temas. Ejecuta primero el análisis de IA.</p>'
      : tendencias.map(t => `
        <div class="tendencia-row">
          <div class="tendencia-topic">${t.topic}</div>
          <div class="tendencia-bar-wrap">
            <div class="tendencia-bar" style="width:${Math.round((t.count / maxTendencia) * 100)}%"></div>
          </div>
          <div class="tendencia-count">${t.count}</div>
          <div class="delta ${t.delta > 0 ? 'up' : t.delta < 0 ? 'down' : 'flat'}">
            ${t.delta > 0 ? '▲' : t.delta < 0 ? '▼' : '—'} ${Math.abs(t.delta)}
          </div>
        </div>
      `).join('')}
  </div>

  </div><!-- fin grid 2 columnas -->

</body>
</html>`;
}
