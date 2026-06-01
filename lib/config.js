import { getSupabaseClient } from './supabase.js';
import { Logger } from './logger.js';

const logger = new Logger('CONFIG');

const DEFAULT_SETTINGS = {
  send_to_hallon: true,
  apify_enabled: true,
  auto_execution_enabled: true,
  max_posts_per_company: 5,
  posted_limit: '24h',
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

  const required = [
    'send_to_hallon',
    'apify_enabled',
    'max_posts_per_company',
    'posted_limit',
  ];

  for (const field of required) {
    if (!(field in settings)) {
      throw new Error(`Campo requerido faltante: ${field}`);
    }
  }

  if (settings.max_posts_per_company < 1 || settings.max_posts_per_company > 100) {
    throw new Error('max_posts_per_company debe estar entre 1 y 100');
  }

  const validLimits = ['24h', '7d', '30d', 'all'];
  if (!validLimits.includes(settings.posted_limit)) {
    throw new Error(`posted_limit debe ser: ${validLimits.join(', ')}`);
  }

  logger.success(`Configuración válida`);
  return true;
}

export function logSettingsSummary(settings) {
  console.log(`
📊 CONFIGURACIÓN DEL USUARIO:
  ├─ Enviar a Hallon: ${settings.send_to_hallon ? '✅ SÍ' : '❌ NO'}
  ├─ Ejecutar Actor: ${settings.apify_enabled ? '✅ SÍ' : '❌ NO'}
  ├─ Ejecución automática: ${settings.auto_execution_enabled ? '✅ HABILITADA' : '❌ DESHABILITADA'}
  ├─ Máx posts/empresa: ${settings.max_posts_per_company}
  └─ Período búsqueda: ${settings.posted_limit}
  `);
}
