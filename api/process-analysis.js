import { analyzeNewPostsForUser } from '../lib/analyzer.js';

export default async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Server misconfiguration' });
  if (req.headers['x-vercel-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = req.body?.userId || req.query?.userId;

  if (!userId) {
    return res.status(400).json({ error: 'userId requerido' });
  }

  try {
    const result = await analyzeNewPostsForUser(userId);
    return res.status(200).json({ success: true, userId, ...result });
  } catch (error) {
    console.error(`analyzeNewPostsForUser error for userId ${userId}: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
