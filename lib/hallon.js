import { Logger } from './logger.js';
import { savelog, savePost } from './database.js';

const logger = new Logger('HALLON');

const HALLON_API = 'https://hapi.hallon.es/api/v1/companies/add';

export async function sendPostToHallon(post, settings) {
  const token = process.env.HALLON_TOKEN;

  if (!token) {
    throw new Error('HALLON_TOKEN no configurado');
  }

  const payload = {
    type: 'digital',
    sid: settings.hallon_sid || parseInt(process.env.HALLON_SID),
    url: post.url,
    titular: post.title || '',
    texto: post.description || '',
    fechaHora: post.publishedDate || new Date().toISOString(),
    tema: [settings.hallon_tema_id || parseInt(process.env.HALLON_TEMA_ID)],
  };

  try {
    const response = await fetch(HALLON_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Hallon API error: ${data.mensaje || response.statusText}`);
    }

    return data;
  } catch (error) {
    logger.error(`Error enviando a Hallon: ${error.message}`);
    throw error;
  }
}

export async function processAndSendToHallon(posts, userId, settings) {
  let sent = 0;
  let failed = 0;

  logger.info(`Procesando ${posts.length} posts para envío a Hallon...`);

  for (const post of posts) {
    try {
      const hallonResponse = await sendPostToHallon(post, settings);

      await savePost(userId, post, 'sent', hallonResponse);

      await savelog(userId, post, 'sent', hallonResponse);

      logger.success(`Enviado: ${post.title?.substring(0, 50)}`);
      sent++;
    } catch (error) {
      await savelog(
        userId,
        post,
        'failed',
        null,
        error.message,
        categorizeError(error.message)
      );

      logger.error(`Falló: ${post.title?.substring(0, 50)}`);
      failed++;
    }

    await delay(500);
  }

  return { sent, failed };
}

export async function processWithoutHallon(posts, userId) {
  let saved = 0;
  let failed = 0;

  logger.info(`Guardando ${posts.length} posts (sin enviar a Hallon)...`);

  for (const post of posts) {
    try {
      await savePost(userId, post, 'extracted', null);

      await savelog(
        userId,
        post,
        'extracted',
        null,
        'Hallon sending disabled',
        'config'
      );

      logger.success(`Guardado: ${post.title?.substring(0, 50)}`);
      saved++;
    } catch (error) {
      logger.error(`Error guardando post (url: ${post.url}): ${error.message}`);
      failed++;
    }

    await delay(100);
  }

  return { sent: saved, failed };
}

function categorizeError(message) {
  if (message.includes('Hallon')) return 'hallon';
  if (message.includes('Apify')) return 'apify';
  if (message.includes('Supabase')) return 'supabase';
  if (message.includes('fetch') || message.includes('network')) return 'network';
  return 'unknown';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
