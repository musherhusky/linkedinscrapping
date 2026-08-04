import { Logger } from './logger.js';
import { savelog, savePost } from './database.js';

const logger = new Logger('HALLON');

const HALLON_API = 'https://hapi.hallon.es/api/v1/companies/add';

export function formatHallonTitular(title, authorName) {
  if (!title) return '';
  if (!authorName) return title;
  return `[${authorName}] - "${title}"`;
}

export async function sendPostToHallon(post, settings) {
  const token = process.env.HALLON_TOKEN;

  if (!token) {
    throw new Error('HALLON_TOKEN no configurado');
  }

  const payload = {
    type: 'digital',
    sid: settings.hallon_sid || parseInt(process.env.HALLON_SID),
    url: post.url,
    titular: formatHallonTitular(post.title, post.authorName),
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

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.clone().text();
    const looksLikeJson = /^\s*[{[]/.test(bodyText);

    if (!response.ok || !looksLikeJson) {
      logger.warn(`Hallon respuesta inesperada (status ${response.status}, content-type: ${contentType}): ${bodyText.slice(0, 300)}`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Hallon API error (HTTP ${response.status}): ${data.mensaje || response.statusText}`);
    }

    return data;
  } catch (error) {
    logger.error(`Error enviando a Hallon: ${error.message}`);
    throw error;
  }
}

export async function processAndSendToHallon(posts, userId, settings, sourceType = 'company', deps = {}) {
  const {
    dispatch     = sendPostToHallon,
    persistPost  = savePost,
    persistLog   = savelog,
  } = deps;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  logger.info(`Procesando ${posts.length} posts para envío a Hallon...`);

  for (const post of posts) {
    if (!post.title) {
      await persistPost(userId, post, 'extracted', null, sourceType);
      await persistLog(userId, post, 'extracted', null, 'Empty title - not sent to Hallon', 'config');

      logger.info(`Omitido (sin título): ${post.url}`);
      skipped++;
      await delay(500);
      continue;
    }

    try {
      const hallonResponse = await dispatch(post, settings);

      await persistPost(userId, post, 'sent', hallonResponse, sourceType);

      await persistLog(userId, post, 'sent', hallonResponse);

      logger.success(`Enviado: ${post.title?.substring(0, 50)}`);
      sent++;
    } catch (error) {
      await persistLog(
        userId,
        post,
        'failed',
        null,
        error.message,
        categorizeError(error.message)
      );

      logger.error(`Falló (url: ${post.url}, userId: ${userId}): ${error.message}`);
      failed++;
    }

    await delay(500);
  }

  return { sent, failed, skipped };
}

export async function processWithoutHallon(posts, userId, sourceType = 'company', deps = {}) {
  const {
    persistPost = savePost,
    persistLog  = savelog,
  } = deps;

  let saved = 0;
  let failed = 0;

  logger.info(`Guardando ${posts.length} posts (sin enviar a Hallon)...`);

  for (const post of posts) {
    try {
      await persistPost(userId, post, 'extracted', null, sourceType);

      await persistLog(
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
      await persistLog(
        userId,
        post,
        'failed',
        null,
        error.message,
        categorizeError(error.message)
      );

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
