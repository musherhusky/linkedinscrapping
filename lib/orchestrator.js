import { Logger } from './logger.js';
import { getUserSettings, getUserPlan, validateSettings, logSettingsSummary } from './config.js';
import { getActiveCompanies, getActivePeople, getActiveTerms, getAllUsersForHour, deduplicatePosts, getTodayStats, upsertTargetProfile, insertFollowerHistory, upsertDiscoveredProfile, upsertDiscoveredProfileRelation, saveApiUsage, saveApiRun, saveCronExecution } from './database.js';
import { executeActor, executePeopleActor, executeTermsActor, mapProfileEnrichment, mapDiscoveredProfiles } from './apify.js';
import { processAndSendToHallon, processWithoutHallon } from './hallon.js';

const logger = new Logger('ORCHESTRATOR');

// Compartido entre el dedup global del batch y el matching por usuario, para
// que una empresa/persona registrada con distinto formato (barra final,
// mayúsculas) por usuarios distintos se trate siempre como el mismo target.
const normalizeUrl = url => url ? url.replace(/\/$/, '').toLowerCase() : null;

// ─────────────────────────────────────────────
// NUEVO: Batching global por hora
// ─────────────────────────────────────────────

export async function processAllUsersBatched(hourUtc, deps = {}) {
  const {
    getAllUsersForHour: fetchAllUsersForHour = getAllUsersForHour,
    getUserSettings: fetchUserSettings = getUserSettings,
    getUserPlan: fetchUserPlan = getUserPlan,
    getActiveCompanies: fetchActiveCompanies = getActiveCompanies,
    getActivePeople: fetchActivePeople = getActivePeople,
    getActiveTerms: fetchActiveTerms = getActiveTerms,
    executeActor: runCompanyActor = executeActor,
    executePeopleActor: runPeopleActor = executePeopleActor,
    executeTermsActor: runTermsActor = executeTermsActor,
    saveApiRun: saveRun = saveApiRun,
    saveCronExecution: logCronExecution = saveCronExecution,
  } = deps;

  const batchStart = Date.now();
  const startedAt = new Date(batchStart).toISOString();
  logger.section(`BATCH HORA ${hourUtc}h UTC`);

  // 1. Obtener usuarios con esta hora configurada
  const userIds = await fetchAllUsersForHour(hourUtc);

  if (userIds.length === 0) {
    logger.warn(`No hay usuarios configurados para la hora ${hourUtc}h`);
    try {
      await logCronExecution({
        hourUtc, status: 'no_users', usersProcessed: 0,
        durationMs: Date.now() - batchStart, startedAt,
      });
    } catch (error) {
      logger.warn(`No se pudo registrar la ejecución del cron (hora: ${hourUtc}): ${error.message}`);
    }
    return { success: true, hour: hourUtc, processed: 0, warning: `No users scheduled for hour ${hourUtc}` };
  }

  logger.info(`${userIds.length} usuario(s) a procesar`);

  // 2. Recoger todas las URLs/términos activos de todos los usuarios
  const usersData = await Promise.all(
    userIds.map(async (userId) => {
      const [settings, plan, companies, people, terms] = await Promise.all([
        fetchUserSettings(userId),
        fetchUserPlan(userId),
        fetchActiveCompanies(userId),
        fetchActivePeople(userId),
        fetchActiveTerms(userId),
      ]);
      return { userId, settings, plan, companies, people, terms };
    })
  );

  // 3. Deduplicar URLs/términos globalmente (normalizado — ver comentario junto a normalizeUrl)
  const allCompanyUrls = [...new Set(usersData.flatMap(u => u.companies.map(normalizeUrl)))];
  const allPeopleUrls  = [...new Set(usersData.flatMap(u => u.people.map(normalizeUrl)))];
  const allTerms        = [...new Set(usersData.flatMap(u => u.terms.map(t => t.trim())))];

  logger.info(`URLs/términos únicos — Empresas: ${allCompanyUrls.length}, Personas: ${allPeopleUrls.length}, Términos: ${allTerms.length}`);

  // 4. Determinar posted_limit: usar el más permisivo entre los planes activos
  // (Corporate = 1h, resto = 24h → si hay cualquier non-corporate, usar 24h)
  const postedLimit = usersData.some(u => u.plan.plans.posted_limit === '24h') ? '24h' : '1h';

  // 5. Ejecutar Apify — una sola llamada por tipo, en paralelo
  let companyPostsAll = [];
  let peoplePostsAll  = [];
  let termPostsAll    = [];
  let companyRunStats = null;
  let peopleRunStats  = null;
  let termsRunStats   = null;
  let companyRunId    = null;
  let peopleRunId     = null;
  let termsRunId      = null;

  const apifyEnabledUser = usersData.find(u => u.settings.apify_enabled);

  if (apifyEnabledUser) {
    const refSettings = { ...apifyEnabledUser.settings, posted_limit: postedLimit };
    const emptyResult = { posts: [], runStats: null };
    const [companyResult, peopleResult, termsResult] = await Promise.all([
      allCompanyUrls.length > 0 ? runCompanyActor(allCompanyUrls, refSettings) : Promise.resolve(emptyResult),
      allPeopleUrls.length > 0  ? runPeopleActor(allPeopleUrls, refSettings) : Promise.resolve(emptyResult),
      allTerms.length > 0       ? runTermsActor(allTerms, refSettings) : Promise.resolve(emptyResult),
    ]);
    companyPostsAll = companyResult.posts;
    peoplePostsAll  = peopleResult.posts;
    termPostsAll    = termsResult.posts;
    companyRunStats = companyResult.runStats;
    peopleRunStats  = peopleResult.runStats;
    termsRunStats   = termsResult.runStats;

    logger.success(`Empresas: ${companyPostsAll.length} posts | Personas: ${peoplePostsAll.length} posts | Términos: ${termPostsAll.length} posts`);

    // Una fila de auditoría por tipo de fuente y batch (no por usuario) — el
    // coste por usuario en distributeAndProcess referencia este run_id.
    [companyRunId, peopleRunId, termsRunId] = await Promise.all([
      companyRunStats ? saveRun('apify', { modelOrActor: companyRunStats.actorId, sourceType: 'company', computeUnits: companyRunStats.computeUnits, totalItems: companyPostsAll.length, totalCostUsd: companyRunStats.usageTotalUsd, rateSnapshot: { source: 'apify_usageTotalUsd_proportional_split', sourceType: 'company' } }) : Promise.resolve(null),
      peopleRunStats  ? saveRun('apify', { modelOrActor: peopleRunStats.actorId, sourceType: 'person', computeUnits: peopleRunStats.computeUnits, totalItems: peoplePostsAll.length, totalCostUsd: peopleRunStats.usageTotalUsd, rateSnapshot: { source: 'apify_usageTotalUsd_proportional_split', sourceType: 'person' } }) : Promise.resolve(null),
      termsRunStats   ? saveRun('apify', { modelOrActor: termsRunStats.actorId, sourceType: 'term', computeUnits: termsRunStats.computeUnits, totalItems: termPostsAll.length, totalCostUsd: termsRunStats.usageTotalUsd, rateSnapshot: { source: 'apify_usageTotalUsd_proportional_split', sourceType: 'term' } }) : Promise.resolve(null),
    ]);

    const scrapedAt = new Date().toISOString();
    await enrichProfilesFromBatch({ usersData, companyPostsAll, peoplePostsAll, scrapedAt }, deps);
  }

  // 6. Distribuir y procesar por usuario
  const results = await Promise.all(
    usersData.map(({ userId, settings, plan, companies, people, terms }) =>
      distributeAndProcess({
        userId, settings, plan, companies, people, terms,
        companyPostsAll, peoplePostsAll, termPostsAll,
        companyRunStats, peopleRunStats, termsRunStats,
        companyRunId, peopleRunId, termsRunId,
      }, deps)
    )
  );

  const totalSent   = results.reduce((s, r) => s + (r.companies?.sent || 0) + (r.people?.sent || 0) + (r.terms?.sent || 0), 0);
  const totalFailed = results.reduce((s, r) => s + (r.companies?.failed || 0) + (r.people?.failed || 0) + (r.terms?.failed || 0), 0);
  const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
  logger.success(`Batch ${hourUtc}h completado en ${elapsed}s — ${userIds.length} usuario(s), enviados: ${totalSent}, fallidos: ${totalFailed}`);

  try {
    await logCronExecution({
      hourUtc, status: 'success',
      usersProcessed: userIds.length,
      postsSent: totalSent,
      postsFailed: totalFailed,
      durationMs: Date.now() - batchStart,
      startedAt,
    });
  } catch (error) {
    logger.warn(`No se pudo registrar la ejecución del cron (hora: ${hourUtc}): ${error.message}`);
  }

  return { success: true, hour: hourUtc, processed: userIds.length, results };
}

// Called from api/process-all-users.js's catch block — the last point with
// hourUtc/startedAt in scope when processAllUsersBatched throws before it can
// record its own cron_execution_logs row.
export async function recordCronBatchFailure(hourUtc, error, startedAt, deps = {}) {
  const { saveCronExecution: logCronExecution = saveCronExecution } = deps;

  try {
    await logCronExecution({
      hourUtc,
      status: 'error',
      errorMessage: error.message,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      startedAt,
    });
  } catch (logError) {
    logger.warn(`No se pudo registrar el fallo de la ejecución del cron (hora: ${hourUtc}): ${logError.message}`);
  }
}

async function distributeAndProcess({
  userId, settings, plan, companies, people, terms,
  companyPostsAll, peoplePostsAll, termPostsAll,
  companyRunStats, peopleRunStats, termsRunStats,
  companyRunId, peopleRunId, termsRunId,
}, deps = {}) {
  const startedAt = Date.now();
  try {
    logger.section(`DISTRIBUYENDO USUARIO: ${userId}`);

    const normalizeTerm = term => term ? term.trim() : null;
    const companySet = new Set(companies.map(normalizeUrl));
    const peopleSet  = new Set(people.map(normalizeUrl));
    const termSet    = new Set((terms || []).map(normalizeTerm));

    // Filtrar solo los posts que corresponden a las URLs/términos de este usuario
    const userCompanyPosts = companyPostsAll.filter(p => companySet.has(normalizeUrl(p.queryTargetUrl)));
    const userPeoplePosts  = peoplePostsAll.filter(p  => peopleSet.has(normalizeUrl(p.queryTargetUrl)));
    const userTermPosts    = (termPostsAll || []).filter(p => termSet.has(normalizeTerm(p.queryTargetUrl)));

    logger.info(`Usuario ${userId} — empresas: ${userCompanyPosts.length} posts (${companies.length} URLs), personas: ${userPeoplePosts.length} posts (${people.length} URLs), términos: ${userTermPosts.length} posts (${(terms || []).length} términos)`);

    await Promise.all([
      logApifyUsageShare(userId, 'company', companyRunStats, companyRunId, userCompanyPosts.length, companyPostsAll.length, deps),
      logApifyUsageShare(userId, 'person', peopleRunStats, peopleRunId, userPeoplePosts.length, peoplePostsAll.length, deps),
      logApifyUsageShare(userId, 'term', termsRunStats, termsRunId, userTermPosts.length, (termPostsAll || []).length, deps),
    ]);

    const companiesResult = await processUserPosts(userId, settings, userCompanyPosts, companies.length, 'company', deps);
    const peopleResult    = await processUserPosts(userId, settings, userPeoplePosts,  people.length,    'person', deps);
    const termsResult     = await processUserPosts(userId, settings, userTermPosts,    (terms || []).length, 'term', deps);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    logger.success(`Usuario ${userId} completado en ${elapsed}s — enviados: ${(companiesResult.sent || 0) + (peopleResult.sent || 0) + (termsResult.sent || 0)}, fallidos: ${(companiesResult.failed || 0) + (peopleResult.failed || 0) + (termsResult.failed || 0)}, duplicados: ${(companiesResult.duplicates || 0) + (peopleResult.duplicates || 0) + (termsResult.duplicates || 0)}`);

    return { userId, companies: companiesResult, people: peopleResult, terms: termsResult };
  } catch (error) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    logger.error(`Error distribuyendo usuario ${userId} (${elapsed}s): ${error.message}`);
    return { userId, success: false, error: error.message };
  }
}

// One Apify run in a batch covers all users sharing that hour — its cost is
// split proportionally by each user's share of the batch's returned posts
// (see design.md Decision 5 in openspec/changes/track-api-costs). The raw run
// itself is logged once by the caller (processAllUsersBatched); runId
// correlates every per-user share back to that single api_run_logs row.
async function logApifyUsageShare(userId, sourceType, runStats, runId, userPostsCount, totalPostsCount, deps = {}) {
  if (!runStats || userPostsCount === 0 || totalPostsCount === 0) return;

  const { saveApiUsage: logUsage = saveApiUsage } = deps;
  const share = userPostsCount / totalPostsCount;

  try {
    await logUsage(userId, 'apify', {
      modelOrActor: runStats.actorId,
      computeUnits: runStats.computeUnits != null ? runStats.computeUnits * share : null,
      postsReceived: userPostsCount,
      estimatedCostUsd: runStats.usageTotalUsd != null ? runStats.usageTotalUsd * share : null,
      rateSnapshot: { source: 'apify_usageTotalUsd_proportional_split', sourceType, share, totalPostsInBatch: totalPostsCount },
      runId,
    });
  } catch (error) {
    logger.warn(`No se pudo registrar el uso de Apify (userId: ${userId}, sourceType: ${sourceType}): ${error.message}`);
  }
}

// Legacy single-user paths (processUser/processPeople/processTerms): one Apify
// call is already scoped to one user, so no proportional split is needed —
// log the raw run and the full-cost per-user share together.
async function logSingleUserApifyUsage(userId, sourceType, runStats, postsCount, deps = {}) {
  if (!runStats) return;

  const { saveApiUsage: logUsage = saveApiUsage, saveApiRun: saveRun = saveApiRun } = deps;

  try {
    const runId = await saveRun('apify', {
      modelOrActor: runStats.actorId,
      sourceType,
      computeUnits: runStats.computeUnits,
      totalItems: postsCount,
      totalCostUsd: runStats.usageTotalUsd,
      rateSnapshot: { source: 'apify_usageTotalUsd', sourceType },
    });

    await logUsage(userId, 'apify', {
      modelOrActor: runStats.actorId,
      computeUnits: runStats.computeUnits,
      postsReceived: postsCount,
      estimatedCostUsd: runStats.usageTotalUsd,
      rateSnapshot: { source: 'apify_usageTotalUsd', sourceType },
      runId,
    });
  } catch (error) {
    logger.warn(`No se pudo registrar el uso de Apify (userId: ${userId}, sourceType: ${sourceType}): ${error.message}`);
  }
}

async function processUserPosts(userId, settings, posts, urlCount, sourceType, deps = {}) {
  const {
    deduplicatePosts: dedupe = deduplicatePosts,
    getTodayStats: fetchTodayStats = getTodayStats,
    processAndSendToHallon: sendToHallon = processAndSendToHallon,
    processWithoutHallon: saveWithoutHallon = processWithoutHallon,
  } = deps;

  if (urlCount === 0) {
    return { success: true, urlCount: 0, sent: 0, duplicates: 0, failed: 0, skipped: 0 };
  }

  if (!settings.apify_enabled) {
    logger.warn(`Apify deshabilitado para ${userId}`);
    return { success: true, urlCount, sent: 0, duplicates: 0, failed: 0, skipped: 0 };
  }

  if (posts.length === 0) {
    return { success: true, urlCount, sent: 0, duplicates: 0, failed: 0, skipped: 0 };
  }

  const { newPosts, duplicates } = await dedupe(posts, userId);

  if (newPosts.length === 0) {
    return { success: true, urlCount, sent: 0, duplicates, failed: 0, skipped: 0 };
  }

  let result;
  if (settings.send_to_hallon) {
    result = await sendToHallon(newPosts, userId, settings, sourceType);
  } else {
    result = await saveWithoutHallon(newPosts, userId, sourceType);
  }

  const stats = await fetchTodayStats(userId);

  return {
    success: true,
    urlCount,
    totalPosts: posts.length,
    newPosts: newPosts.length,
    sent: result.sent,
    duplicates,
    failed: result.failed,
    skipped: result.skipped || 0,
    sentToday: stats.sentToday,
    failedToday: stats.failedToday,
  };
}

// ─────────────────────────────────────────────
// LEGACY: Proceso individual por usuario (se mantiene para uso manual/debug)
// ─────────────────────────────────────────────

export async function processUser(userId, deps = {}) {
  const {
    executeActor: runCompanyActor = executeActor,
  } = deps;

  try {
    logger.section(`PROCESANDO USUARIO: ${userId}`);

    const settings = await getUserSettings(userId);
    const plan     = await getUserPlan(userId);
    validateSettings(settings);
    logSettingsSummary(settings, plan);

    const companies = await getActiveCompanies(userId);

    if (companies.length === 0 || !settings.apify_enabled) {
      return { success: true, userId, companies: companies.length, sent: 0, duplicates: 0, failed: 0, skipped: 0, sentToHallon: settings.send_to_hallon };
    }

    const { posts, runStats } = await runCompanyActor(companies, { ...settings, posted_limit: plan.plans.posted_limit });

    await logSingleUserApifyUsage(userId, 'company', runStats, posts.length, deps);

    if (posts.length === 0) {
      return { success: true, userId, companies: companies.length, sent: 0, duplicates: 0, failed: 0, skipped: 0, sentToHallon: settings.send_to_hallon };
    }

    const { newPosts, duplicates } = await deduplicatePosts(posts, userId);

    if (newPosts.length === 0) {
      return { success: true, userId, companies: companies.length, sent: 0, duplicates, failed: 0, skipped: 0, sentToHallon: settings.send_to_hallon };
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
      skipped: result.skipped || 0,
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

export async function processPeople(userId, deps = {}) {
  const {
    executePeopleActor: runPeopleActor = executePeopleActor,
  } = deps;

  try {
    logger.section(`PROCESANDO PERSONAS USUARIO: ${userId}`);

    const settings = await getUserSettings(userId);
    const plan     = await getUserPlan(userId);
    validateSettings(settings);

    const people = await getActivePeople(userId);

    if (people.length === 0 || !settings.apify_enabled) {
      return { success: true, userId, people: people.length, sent: 0, duplicates: 0, failed: 0, skipped: 0 };
    }

    const { posts, runStats } = await runPeopleActor(people, { ...settings, posted_limit: plan.plans.posted_limit });

    await logSingleUserApifyUsage(userId, 'person', runStats, posts.length, deps);

    if (posts.length === 0) {
      return { success: true, userId, people: people.length, sent: 0, duplicates: 0, failed: 0, skipped: 0 };
    }

    const { newPosts, duplicates } = await deduplicatePosts(posts, userId);

    if (newPosts.length === 0) {
      return { success: true, userId, people: people.length, sent: 0, duplicates, failed: 0, skipped: 0 };
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
      skipped: result.skipped || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error en proceso de personas: ${error.message}`);
    return { success: false, userId, error: error.message, timestamp: new Date().toISOString() };
  }
}

export async function processTerms(userId, deps = {}) {
  const {
    getUserSettings: fetchUserSettings = getUserSettings,
    getUserPlan: fetchUserPlan = getUserPlan,
    getActiveTerms: fetchActiveTerms = getActiveTerms,
    executeTermsActor: runTermsActor = executeTermsActor,
    deduplicatePosts: dedupe = deduplicatePosts,
    processAndSendToHallon: sendToHallon = processAndSendToHallon,
    processWithoutHallon: saveWithoutHallon = processWithoutHallon,
  } = deps;

  try {
    logger.section(`PROCESANDO TÉRMINOS USUARIO: ${userId}`);

    const settings = await fetchUserSettings(userId);
    const plan     = await fetchUserPlan(userId);
    validateSettings(settings);

    const terms = await fetchActiveTerms(userId);

    if (terms.length === 0 || !settings.apify_enabled) {
      return { success: true, userId, terms: terms.length, sent: 0, duplicates: 0, failed: 0, skipped: 0 };
    }

    const { posts, runStats } = await runTermsActor(terms, { ...settings, posted_limit: plan.plans.posted_limit });

    await logSingleUserApifyUsage(userId, 'term', runStats, posts.length, deps);

    if (posts.length === 0) {
      return { success: true, userId, terms: terms.length, sent: 0, duplicates: 0, failed: 0, skipped: 0 };
    }

    const { newPosts, duplicates } = await dedupe(posts, userId);

    if (newPosts.length === 0) {
      return { success: true, userId, terms: terms.length, sent: 0, duplicates, failed: 0, skipped: 0 };
    }

    const result = settings.send_to_hallon
      ? await sendToHallon(newPosts, userId, settings, 'term')
      : await saveWithoutHallon(newPosts, userId, 'term');

    return {
      success: true, userId,
      terms: terms.length,
      totalPosts: posts.length,
      newPosts: newPosts.length,
      sent: result.sent,
      duplicates,
      failed: result.failed,
      skipped: result.skipped || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error en proceso de términos: ${error.message}`);
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

async function enrichProfilesFromBatch({ usersData, companyPostsAll, peoplePostsAll, scrapedAt }, deps = {}) {
  const {
    upsertTargetProfile: doUpsertTargetProfile = upsertTargetProfile,
    insertFollowerHistory: doInsertFollowerHistory = insertFollowerHistory,
    upsertDiscoveredProfile: doUpsertDiscoveredProfile = upsertDiscoveredProfile,
    upsertDiscoveredProfileRelation: doUpsertDiscoveredProfileRelation = upsertDiscoveredProfileRelation,
  } = deps;

  // Term-sourced posts are intentionally excluded: a search term has no single
  // tracked profile to enrich (see design.md Decision 3).
  const allItems = [...companyPostsAll, ...peoplePostsAll];

  // Build a map from queryTargetUrl → [userId, ...] so we enrich per user
  const urlToUsers = {};
  for (const { userId, companies, people } of usersData) {
    for (const url of [...companies, ...people]) {
      if (!urlToUsers[url]) urlToUsers[url] = [];
      urlToUsers[url].push(userId);
    }
  }

  // Deduplicate enrichments by author.id — one upsert per unique author
  const seenAuthorIds = new Set();
  const enrichments = [];
  for (const item of allItems) {
    const authorId = item.author?.id;
    if (!authorId || seenAuthorIds.has(authorId)) continue;
    seenAuthorIds.add(authorId);
    enrichments.push(mapProfileEnrichment(item));
  }

  // Upsert profile metadata + insert follower history per user that tracks this URL
  await Promise.all(
    enrichments.map(async (enrichment) => {
      const userIds = urlToUsers[enrichment.queryTargetUrl] || [];
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            await doUpsertTargetProfile(userId, enrichment);
            await doInsertFollowerHistory(userId, enrichment.queryTargetUrl, enrichment.followersCount, scrapedAt);
          } catch (err) {
            logger.error(`Profile upsert failed (userId: ${userId}, url: ${enrichment.queryTargetUrl}): ${err.message}`);
          }
        })
      );
    })
  );

  // Collect and upsert discovered profiles (reposters + mentions)
  const allDiscovered = allItems.flatMap(item => mapDiscoveredProfiles(item));

  // Batch in groups of 20 to avoid overwhelming the DB
  const BATCH = 20;
  for (let i = 0; i < allDiscovered.length; i += BATCH) {
    const batch = allDiscovered.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (profile) => {
        if (!profile.sourceUrl) return;
        const id = await doUpsertDiscoveredProfile(profile);
        if (id) await doUpsertDiscoveredProfileRelation(id, profile.sourceUrl, profile.source);
      })
    );
  }

  logger.success(`Profile enrichment complete — ${enrichments.length} profiles enriched, ${allDiscovered.length} discovered profiles processed`);
}
