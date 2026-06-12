import { processAllUsersBatched } from '../lib/orchestrator.js';

export default async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Server misconfiguration' });
  const bearerToken = req.headers['authorization']?.replace('Bearer ', '');
  const customHeader = req.headers['x-vercel-cron-secret'];
  if (bearerToken !== cronSecret && customHeader !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Detectar hora UTC actual; permite override via ?hour= para debug
  const hourParam = req.query?.hour !== undefined ? parseInt(req.query.hour, 10) : NaN;
  const hourUtc = !isNaN(hourParam) ? hourParam : new Date().getUTCHours();

  try {
    const result = await processAllUsersBatched(hourUtc);
    return res.status(200).json(result);
  } catch (error) {
    console.error(`processAllUsersBatched error for hour ${hourUtc}: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
