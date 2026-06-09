import { getSupabaseClient } from './supabase.js';
import { Logger } from './logger.js';

const logger = new Logger('CONFIG');

const DEFAULT_SETTINGS = {
  send_to_hallon: true,
  apify_enabled: true,
  auto_execution_enabled: true,
  max_posts_per_company: 0,
  hallon_sid: parseInt(process.env.HALLON_SID),
  hallon_tema_id: parseInt(process.env.HALLON_TEMA_ID),
};

export async function getUserSettings(userId) {
  const supabase = getSupabaseClient();

  logger.debug(`Obteniendo configuración de usuario: ${userId}`);

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      logger.warn(`Configuración no existe. Creando con valores por defecto...`);
      return await createDefaultSettings(userId);
    }

    if (error) throw error;

    logger.success(`Configuración obtenida`, {
      send_to_hallon: data.send_to_hallon,
      apify_enabled: data.apify_enabled,
      auto_execution_enabled: data.auto_execution_enabled,
    });

    return data;
  } catch (error) {
    logger.error(`Error al obtener configuración: ${error.message}`);
    throw error;
  }
}

export async function getUserPlan(userId) {
  const supabase = getSupabaseClient();

  logger.debug(`Obteniendo plan activo de usuario: ${userId}`);

  try {
    const { data, error } = await supabase
      .from('user_plans')
      .select('*, plans(*)')
      .eq('user_id', userId)
      .in('status', ['trialing', 'active', 'past_due'])
      .single();

    if (error && error.code === 'PGRST116') {
      logger.warn(`Sin plan activo. Asignando Basic por defecto...`);
      return await assignDefaultPlan(userId);
    }

    if (error) throw error;

    logger.success(`Plan activo: ${data.plans.name} (${data.status})`);
    return data;
  } catch (error) {
    logger.error(`Error obteniendo plan: ${error.message}`);
    throw error;
  }
}

export async function assignDefaultPlan(userId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('user_plans')
    .insert({
      user_id: userId,
      plan_id: 'basic',
      status: 'active',
      current_period_start: new Date().toISOString(),
    })
    .select('*, plans(*)')
    .single();

  if (error) throw error;

  logger.success(`Plan Basic asignado por defecto`);
  return data;
}

export async function checkUrlLimit(userId) {
  const supabase = getSupabaseClient();

  const userPlan = await getUserPlan(userId);
  const maxUrls = userPlan.plans.max_urls;

  // Corporate: ilimitado
  if (maxUrls === null) return { allowed: true, current: null, max: null };

  const [{ count: companiesCount }, { count: peopleCount }] = await Promise.all([
    supabase.from('target_companies').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true),
    supabase.from('target_people').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true),
  ]);

  const current = (companiesCount || 0) + (peopleCount || 0);
  const allowed = current < maxUrls;

  return { allowed, current, max: maxUrls };
}

export async function createDefaultSettings(userId) {
  const supabase = getSupabaseClient();

  logger.info(`Creando configuración por defecto para: ${userId}`);

  const settings = {
    user_id: userId,
    ...DEFAULT_SETTINGS,
  };

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .insert([settings])
      .select()
      .single();

    if (error) throw error;

    logger.success(`Configuración por defecto creada`);
    return data;
  } catch (error) {
    logger.error(`Error al crear configuración: ${error.message}`);
    throw error;
  }
}

export function validateSettings(settings) {
  logger.debug(`Validando configuración...`);

  const required = ['send_to_hallon', 'apify_enabled'];

  for (const field of required) {
    if (!(field in settings)) {
      throw new Error(`Campo requerido faltante: ${field}`);
    }
  }

  logger.success(`Configuración válida`);
  return true;
}

export function logSettingsSummary(settings, plan = null) {
  console.log(`
📊 CONFIGURACIÓN DEL USUARIO:
  ├─ Enviar a Hallon: ${settings.send_to_hallon ? '✅ SÍ' : '❌ NO'}
  ├─ Ejecutar Actor: ${settings.apify_enabled ? '✅ SÍ' : '❌ NO'}
  ├─ Ejecución automática: ${settings.auto_execution_enabled ? '✅ HABILITADA' : '❌ DESHABILITADA'}
  ├─ Máx posts/fuente: ${settings.max_posts_per_company === 0 ? 'Sin límite' : settings.max_posts_per_company}
  └─ Plan: ${plan ? `${plan.plans.name} (${plan.status})` : 'desconocido'}
  `);
}
