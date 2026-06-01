import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabaseClient;
}

export async function query(table, operation = 'select', filters = {}, data = null) {
  const client = getSupabaseClient();
  
  try {
    let query = client.from(table);

    if (operation === 'select') {
      query = query.select('*');
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      return await query;
    }

    if (operation === 'insert') {
      return await query.insert(data);
    }

    if (operation === 'update') {
      query = query.update(data);
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      return await query;
    }

    if (operation === 'delete') {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      return await query;
    }
  } catch (error) {
    throw new Error(`Supabase ${operation} error: ${error.message}`);
  }
}
