import { processUser } from '../lib/orchestrator.js';

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).json({ error: 'user_id required' });
  }

  const result = await processUser(userId);

  if (result.success) {
    return res.status(200).json(result);
  } else {
    return res.status(500).json(result);
  }
};
