import { Logger } from './logger.js';
import { getUserSettings, getUserPlan, validateSettings, logSettingsSummary } from './config.js';
import { getActiveCompanies, getActivePeople, getAllUsersForHour, deduplicatePosts, getTodayStats } from './database.js';
import { executeActor, executePeopleActor } from './apify.js';
import { processAndSendToHallon, processWithoutHallon } from './hallon.js';

const logger = new Logger('ORCHESTRATOR');

// ─────────────────────────────────────────────
// NUEVO: Batching global por hora
// ─────────────────────────────────────────────

export async function processAllUsersBatched(hourUtc) {
  logger.section(`BATCH HORA ${hourUtc}h UTC`);

  // 1. Obtener usuarios con esta hora configurada
  const userIds = await getAllUsersForHour(hourUtc);

  if (userIds.length === 0) {
    logger.info(`No hay usuarios configurados para la hora ${hourUtc}h`);
    return { success: true, hour: hourUtc, processed: 0 };
  }

  logger.info(`${userIds.length} usuario(s) a procesar`);

  // 2. Recoger todas las URLs activas de todos los usuarios
  const usersData = await Promise.all(
    userIds.map(async (userId) => {
      const [settings, plan, companies, people] = await Promise.all([
        getUserSettings(userId),
        getUserPlan(userId),
        getActiveCompanies(userId),
        getActivePeople(userId),
      ]);
      return { userId, settings, plan, companies, people };
    })
  );

  // 3. Deduplicar URLs globalmente
  const allCompanyUrls = [...new Set(usersData.flatMap(u => u.companies))];
  const allPeopleUrls  = [...new Set(usersData.flatMap(u => u.people))];

  logger.info(`URLs únicas — Empresas: ${allCompanyUrls.length}, Personas: ${allPeopleUrls.length}`);

  // 4. Determinar posted_limit: usar el más permisivo entre los planes activos
  // (Corporate = 1h, resto = 24h → si hay cualquier non-corporate, usar 24h)
  const postedLimit = usersData.some(u => u.plan.plans.posted_limit === '24h') ? '24h' : '1h';

  // 5. Ejecutar Apify — una sola llamada por tipo
  let companyPostsAll = [];
  let peoplePostsAll  = [];

  if (allCompanyUrls.length > 0) {
    // Usar settings del primer usuario con apify habilitado (el posted_limit viene del plan)
    const refSettings = { ...usersData.find(u => u.settings.apify_enabled)?.settings, posted_limit: postedLimit };
    companyPostsAll = await executeActor(allCompanyUrls, refSettings);
    logger.success(`Empresas: ${companyPostsAll.length} posts extraídos en total`);
  }

  if (allPeopleUrls.length > 0) {
    const refSettings = { ...usersData.find(u => u.settings.apify_enabled)?.settings, posted_limit: postedLimit };
    peoplePostsAll = await executePeopleActor(allPeopleUrls, refSettings);
    logger.success(`Personas: ${peoplePostsAll.length} posts extraídos en total`);
  }

  // 6. Distribuir y procesar por usuario
  const results = await Promise.all(
    usersData.map(({ userId, settings, plan, companies, people }) =>
      distributeAndProcess({ userId, settings, plan, companies, people, companyPostsAll, peoplePostsAll })
    )
  );

  return { success: true, hour: hourUtc, processed: userIds.length, results };
}

async function distributeAndProcess({ userId, settings, plan, companies, people, companyPostsAll, peoplePostsAll }) {
  try {
    logger.section(`DISTRIBUYENDO USUARIO: ${userId}`);

    const companySet = new Set(companies);
    const peopleSet  = new Set(people);

    // Filtrar solo los posts que corresponden a las URLs de este usuario
    const userCompanyPosts = companyPostsAll.filter(p => companySet.has(p.queryTargetUrl));
    const userPeoplePosts  = peoplePostsAll.filter(p  => peopleSet.has(p.queryTargetUrl));

    const companiesResult = await processUserPosts(userId, settings, userCompanyPosts, companies.length, 'company');
    const peopleResult    = await processUserPosts(userId, settings, userPeoplePosts,  people.length,    'person');

    return { userId, companies: companiesResult, people: peopleResult };
  } catch (error) {
    logger.error(`Error distribuyendo usuario ${userId}: ${error.message}`);
    return { userId, success: false, error: error.message };
  }
}

async function processUserPosts(userId, settings, posts, urlCount, sourceType) {
  if (urlCount === 0) {
    return { success: true, urlCount: 0, sent: 0, duplicates: 0, failed: 0 };
  }

  if (!settings.apify_enabled) {
    logger.warn(`Apify deshabilitado para ${userId}`);
    return { success: true, urlCount, sent: 0, duplicates: 0, failed: 0 };
  }

  if (posts.length === 0) {
    return { success: true, urlCount, sent: 0, duplicates: 0, failed: 0 };
  }

  const { newPosts, duplicates } = await deduplicatePosts(posts, userId);

  if (newPosts.length === 0) {
    return { success: true, urlCount, sent: 0, duplicates, failed: 0 };
  }

  let result;
  if (settings.send_to_hallon) {
    result = await processAndSendToHallon(newPosts, userId, settings, sourceType);
  } else {
    result = await processWithoutHallon(newPosts, userId, sourceType);
  }

  const stats = await getTodayStats(userId);

  return {
    success: true,
    urlCount,
    totalPosts: posts.length,
    newPosts: newPosts.length,
    sent: result.sent,
    duplicates,
    failed: result.failed,
    sentToday: stats.sentToday,
    failedToday: stats.failedToday,
  };
}

// ─────────────────────────────────────────────
// LEGACY: Proceso individual por usuario (se mantiene para uso manual/debug)
// ─────────────────────────────────────────────

export async function processUser(userId) {
  try {
    logger.section(`PROCESANDO USUARIO: ${userId}`);

    const settings = await getUserSettings(userId);
    const plan     = await getUserPlan(userId);
    validateSettings(settings);
    logSettingsSummary(settings, plan);

    const companies = await getActiveCompanies(userId);

    if (companies.length === 0 || !settings.apify_enabled) {
      return { success: true, userId, companies: companies.length, sent: 0, duplicates: 0, failed: 0, sentToHallon: settings.send_to_hallon };
    }

    const posts = await executeActor(companies, { ...settings, posted_limit: plan.plans.posted_limit });

    if (posts.length === 0) {
      return { success: true, userId, companies: companies.length, sent: 0, duplicates: 0, failed: 0, sentToHallon: settings.send_to_hallon };
    }

    const { newPosts, duplicates } = await deduplicatePosts(posts, userId);

    if (newPosts.length === 0) {
      return { success: true, userId, companies: companies.length, sent: 0, duplicates, failed: 0, sentToHallon: settings.send_to_hallon };
    }

    const result = settings.send_to_hallon
      ? await processAndSendToHallon(newPosts, userId, settings, 'company')
      : await processWithoutHallon(newPosts, userId, 'company');

    const stats = await getTodayStats(userId);
    const summary = {
      success: true, userId,
      companies: companies.length,
      totalPosts: posts.length,
      newPosts: newPosts.length,
      sent: result.sent,
      duplicates,
      failed: result.failed,
      sentToday: stats.sentToday,
      failedToday: stats.failedToday,
      sentToHallon: settings.send_to_hallon,
      timestamp: new Date().toISOString(),
    };

    logSummary(summary);
    return summary;
  } catch (error) {
    logger.error(`Error en proceso: ${error.message}`);
    return { success: false, userId, error: error.message, timestamp: new Date().toISOString() };
  }
}

export async function processPeople(userId) {
  try {
    logger.section(`PROCESANDO PERSONAS USUARIO: ${userId}`);

    const settings = await getUserSettings(userId);
    const plan     = await getUserPlan(userId);
    validateSettings(settings);

    const people = await getActivePeople(userId);

    if (people.length === 0 || !settings.apify_enabled) {
      return { success: true, userId, people: people.length, sent: 0, duplicates: 0, failed: 0 };
    }

    const posts = await executePeopleActor(people, { ...settings, posted_limit: plan.plans.posted_limit });

    if (posts.length === 0) {
      return { success: true, userId, people: people.length, sent: 0, duplicates: 0, failed: 0 };
    }

    const { newPosts, duplicates } = await deduplicatePosts(posts, userId);

    if (newPosts.length === 0) {
      return { success: true, userId, people: people.length, sent: 0, duplicates, failed: 0 };
    }

    const result = settings.send_to_hallon
      ? await processAndSendToHallon(newPosts, userId, settings, 'person')
      : await processWithoutHallon(newPosts, userId, 'person');

    return {
      success: true, userId,
      people: people.length,
      totalPosts: posts.length,
      newPosts: newPosts.length,
      sent: result.sent,
      duplicates,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error en proceso de personas: ${error.message}`);
    return { success: false, userId, error: error.message, timestamp: new Date().toISOString() };
  }
}

function logSummary(summary) {
  console.log(`
╔════════════════════════════════════════╗
║           ✨ RESUMEN FINAL ✨          ║
╚════════════════════════════════════════╝

📊 RESULTADOS:
  • Empresas: ${summary.companies}
  • Posts extraídos: ${summary.totalPosts}
  • Posts nuevos: ${summary.newPosts}
  • Posts enviados: ${summary.sent} ✅
  • Posts fallidos: ${summary.failed} ❌
  • Duplicados: ${summary.duplicates} 🔄

📈 HOY (acumulado):
  • Enviados: ${summary.sentToday}
  • Errores: ${summary.failedToday}

🔌 CONFIGURACIÓN:
  • Hallon: ${summary.sentToHallon ? '✅ ACTIVO' : '⏸️ DESHABILITADO'}

⏱️ Timestamp: ${summary.timestamp}
`);
}
