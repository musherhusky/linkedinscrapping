import { processUser, processPeople } from '../lib/orchestrator.js';

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Server misconfiguration' });
  if (req.headers['x-vercel-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).json({ error: 'user_id required' });
  }

  const [companiesResult, peopleResult] = await Promise.all([
    processUser(userId),
    processPeople(userId),
  ]);

  const success = companiesResult.success && peopleResult.success;

  return res.status(success ? 200 : 500).json({ companies: companiesResult, people: peopleResult });
};
