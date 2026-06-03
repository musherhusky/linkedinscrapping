import { Logger } from './logger.js';

const logger = new Logger('APIFY');

const APIFY_API = 'https://api.apify.com/v2';

function buildActorInput(targetUrls, settings) {
  return {
    targetUrls: targetUrls,
    maxPosts: settings.max_posts_per_company || 5,
    postedLimit: settings.posted_limit || '24h',  // ← CORRECTO
    includeQuotePosts: true,
    includeReposts: true,
    scrapeComments: false,
    scrapeReactions: false,
    maxComments: 5,
    maxReactions: 5,
    postNestedComments: false,      // ← NUEVO
    postNestedReactions: false,     // ← NUEVO
  };
}

export async function executeActor(targetUrls, settings) {
  const actorId = process.env.APIFY_ACTOR_ID;
  const token = process.env.APIFY_TOKEN;

  if (!actorId || !token) {
    throw new Error('APIFY_ACTOR_ID o APIFY_TOKEN no configurados');
  }

  const input = buildActorInput(targetUrls, settings);

  logger.info(`Ejecutando Actor ${actorId} con ${targetUrls.length} empresa(s)...`);
  logger.info(`INPUT:`, JSON.stringify(input, null, 2));

  try {
    // Paso 1: Ejecutar Actor (asincrónico)
    const runResponse = await fetch(
      `${APIFY_API}/acts/${actorId}/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),  // ← SIN { input }
      }
    );

    if (!runResponse.ok) {
      const error = await runResponse.json();
      throw new Error(`Apify run error: ${error.message || JSON.stringify(error)}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;
    const datasetId = runData.data.defaultDatasetId;

    logger.success(`Actor iniciado. Run ID: ${runId}, Dataset ID: ${datasetId}`);

    // Paso 2: Esperar a que termine (con waitForFinish)
    logger.info(`Esperando a que Actor termine...`);
    
    const waitResponse = await fetch(
      `${APIFY_API}/acts/${actorId}/runs/${runId}?token=${token}&waitForFinish=120`,
      {
        method: 'GET',
      }
    );

    const waitData = await waitResponse.json();
    const finalStatus = waitData.data.status;

    logger.info(`Actor status: ${finalStatus}`);

    if (finalStatus !== 'SUCCEEDED') {
      throw new Error(`Actor terminó con status: ${finalStatus}`);
    }

    // Paso 3: Obtener datos del dataset
    logger.info(`Obteniendo datos del dataset ${datasetId}...`);

    const datasetResponse = await fetch(
      `${APIFY_API}/datasets/${datasetId}/items?token=${token}`,
      {
        method: 'GET',
      }
    );

    if (!datasetResponse.ok) {
      throw new Error(`Dataset error: ${datasetResponse.statusText}`);
    }

    const datasetData = await datasetResponse.json();
    const items = Array.isArray(datasetData) ? datasetData : (datasetData.items || []);

    logger.success(`Actor completado. ${items.length} posts extraídos`);

    // Normalizar formato
    return items.map(item => ({
      url: item.linkedinUrl,
      title: item.content?.substring(0, 200) || '',
      description: item.content || '',
      publishedDate: item.postedAt?.date || new Date().toISOString(),
      postType: item.type || null,
      authorName: item.author?.name || null,
      authorType: item.author?.type || null,
      authorId: item.author?.id || null,
      entityId: item.entityId || null,
      likes: item.engagement?.likes || 0,
      comments: item.engagement?.comments || 0,
      shares: item.engagement?.shares || 0,
      reactions: item.engagement?.reactions || [],
    }));
  } catch (error) {
    logger.error(`Error ejecutando Actor: ${error.message}`);
    throw error;
  }
}

export async function executePeopleActor(targetUrls, settings) {
  const actorId = process.env.APIFY_PEOPLE_ACTOR_ID;
  const token = process.env.APIFY_TOKEN;

  if (!actorId || !token) {
    throw new Error('APIFY_PEOPLE_ACTOR_ID o APIFY_TOKEN no configurados');
  }

  const input = buildActorInput(targetUrls, settings);

  logger.info(`Ejecutando Actor de personas ${actorId} con ${targetUrls.length} perfil(es)...`);
  logger.info(`INPUT:`, JSON.stringify(input, null, 2));

  try {
    const runResponse = await fetch(
      `${APIFY_API}/acts/${actorId}/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }
    );

    if (!runResponse.ok) {
      const error = await runResponse.json();
      throw new Error(`Apify run error: ${error.message || JSON.stringify(error)}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;
    const datasetId = runData.data.defaultDatasetId;

    logger.success(`Actor iniciado. Run ID: ${runId}, Dataset ID: ${datasetId}`);

    logger.info(`Esperando a que Actor termine...`);
    const waitResponse = await fetch(
      `${APIFY_API}/acts/${actorId}/runs/${runId}?token=${token}&waitForFinish=120`,
      { method: 'GET' }
    );

    const waitData = await waitResponse.json();
    const finalStatus = waitData.data.status;

    logger.info(`Actor status: ${finalStatus}`);

    if (finalStatus !== 'SUCCEEDED') {
      throw new Error(`Actor terminó con status: ${finalStatus}`);
    }

    logger.info(`Obteniendo datos del dataset ${datasetId}...`);
    const datasetResponse = await fetch(
      `${APIFY_API}/datasets/${datasetId}/items?token=${token}`,
      { method: 'GET' }
    );

    if (!datasetResponse.ok) {
      throw new Error(`Dataset error: ${datasetResponse.statusText}`);
    }

    const datasetData = await datasetResponse.json();
    const items = Array.isArray(datasetData) ? datasetData : (datasetData.items || []);

    logger.success(`Actor de personas completado. ${items.length} posts extraídos`);

    // TODO: ajustar cuando se conozca la respuesta real del actor de personas
    return items.map(item => ({
      url: item.linkedinUrl || item.url || null,          // TODO: verificar campo URL
      title: item.content?.substring(0, 200) || '',
      description: item.content || '',
      publishedDate: item.postedAt?.date || new Date().toISOString(), // TODO: verificar campo fecha
      postType: item.type || null,
      authorName: item.author?.name || item.authorName || null,       // TODO: verificar campo autor
      authorType: item.author?.type || 'person',
      authorId: item.author?.id || item.authorId || null,
      entityId: item.entityId || item.id || null,
      likes: item.engagement?.likes || item.likes || 0,
      comments: item.engagement?.comments || item.comments || 0,
      shares: item.engagement?.shares || item.shares || 0,
      reactions: item.engagement?.reactions || item.reactions || [],
    }));
  } catch (error) {
    logger.error(`Error ejecutando Actor de personas: ${error.message}`);
    throw error;
  }
}