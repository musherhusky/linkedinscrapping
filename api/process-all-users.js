import { getSupabaseClient } from '../lib/supabase.js';
import { processUser, processPeople } from '../lib/orchestrator.js';

export default async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseClient();
  const { data: users, error } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('auto_execution_enabled', true);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  if (!users || users.length === 0) {
    return res.status(200).json({ success: true, processed: 0 });
  }

  const results = [];
  for (const user of users) {
    const [companiesResult, peopleResult] = await Promise.all([
      processUser(user.user_id),
      processPeople(user.user_id),
    ]);
    results.push({ userId: user.user_id, companies: companiesResult, people: peopleResult });
  }

  return res.status(200).json({ success: true, processed: users.length, results });
};
