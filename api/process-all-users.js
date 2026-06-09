import { processAllUsersBatched } from '../lib/orchestrator.js';

export default async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-vercel-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Detectar hora UTC actual (el cron se ejecuta cada hora)
  const hourUtc = new Date().getUTCHours();

  try {
    const result = await processAllUsersBatched(hourUtc);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
