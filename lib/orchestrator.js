import { Logger } from './logger.js';
import { getUserSettings, validateSettings, logSettingsSummary } from './config.js';
import { getActiveCompanies, deduplicatePosts, getTodayStats } from './database.js';
import { executeActor } from './apify.js';
import { processAndSendToHallon, processWithoutHallon } from './hallon.js';

const logger = new Logger('ORCHESTRATOR');

export async function processUser(userId) {
  try {
    logger.section(`PROCESANDO USUARIO: ${userId}`);

    logger.info(`Paso 1: Obteniendo configuración...`);
    const settings = await getUserSettings(userId);
    validateSettings(settings);
    logSettingsSummary(settings);

    logger.info(`\nPaso 2: Obteniendo empresas activas...`);
    const companies = await getActiveCompanies(userId);

    if (companies.length === 0) {
      logger.warn(`Usuario sin empresas activas`);
      return {
        success: true,
        userId,
        companies: 0,
        sent: 0,
        duplicates: 0,
        failed: 0,
        sentToHallon: settings.send_to_hallon,
      };
    }

    logger.info(`\nPaso 3: Ejecutando Actor...`);
    if (!settings.apify_enabled) {
      logger.warn(`Apify está deshabilitado`);
      return {
        success: true,
        userId,
        companies: companies.length,
        sent: 0,
        duplicates: 0,
        failed: 0,
        sentToHallon: settings.send_to_hallon,
      };
    }

    const posts = await executeActor(companies, settings);

    if (posts.length === 0) {
      logger.warn(`No hay posts nuevos`);
      return {
        success: true,
        userId,
        companies: companies.length,
        sent: 0,
        duplicates: 0,
        failed: 0,
        sentToHallon: settings.send_to_hallon,
      };
    }

    logger.info(`\nPaso 4: Deduplicando...`);
    const { newPosts, duplicates } = await deduplicatePosts(posts, userId);

    if (newPosts.length === 0) {
      logger.warn(`Todos los posts son duplicados`);
      return {
        success: true,
        userId,
        companies: companies.length,
        sent: 0,
        duplicates,
        failed: 0,
        sentToHallon: settings.send_to_hallon,
      };
    }

    logger.info(`\nPaso 5: Procesando posts...`);
    let result;

    if (settings.send_to_hallon) {
      logger.info(`Enviando a Hallon...`);
      result = await processAndSendToHallon(newPosts, userId, settings);
    } else {
      logger.info(`Guardando sin enviar a Hallon (función deshabilitada)...`);
      result = await processWithoutHallon(newPosts, userId);
    }

    logger.info(`\nPaso 6: Resumen final...`);
    const stats = await getTodayStats(userId);

    const summary = {
      success: true,
      userId,
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
    return {
      success: false,
      userId,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
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
