import { Logger } from './logger.js';

const logger = new Logger('APIFY');

const APIFY_API = 'https://api.apify.com/v2';

function buildActorInput(targetUrls, settings) {
  return {
    targetUrls: targetUrls,
    maxPosts: settings.max_posts_per_company || 5,
    postedLimit: settings.posted_limit || '24h',
    includeQuotePosts: true,
    includeReposts: true,
    scrapeComments: false,
    scrapeReactions: false,
    maxComments: 5,
    maxReactions: 5,
    postNestedComments: false,
    postNestedReactions: false,
  };
}

export function detectContentType(src) {
  if (src?.article)              return 'article';
  if (src?.postVideo)            return 'video';
  if (src?.document)             return 'document';
  if (src?.postImages?.length)   return 'image';
  return 'text';
}

export function mapPost(item, sourceType) {
  // Caso 2 (Tipo A): repost silencioso — repostedBy presente, sin objeto repost
  // Caso 3/4 (Tipo B): repost con o sin comentario — objeto repost presente
  const isRepost = !!(item.repost || item.repostedBy);

  // Para Tipo B el contenido real está en item.repost
  const src = item.repost ?? item;

  const url          = src.article?.link || src.linkedinUrl || null;
  const linkedinUrl  = item.linkedinUrl || null;
  const titulo       = src.article?.title || src.content?.substring(0, 200) || '';
  const descripcion  = src.content || '';
  const articleSource = src.article?.subtitle || null;
  const fechaPost    = src.postedAt?.date || item.postedAt?.date || new Date().toISOString();
  const contentType  = detectContentType(src);

  const authorName   = src.author?.name || null;
  const authorType   = src.author?.type || null;
  // Preferimos publicIdentifier (slug legible) sobre universalName
  const authorId     = src.author?.publicIdentifier || src.author?.universalName || null;

  // Repost con comentario: el comentario está en item.content
  const repostComment = item.repost ? (item.content?.trim() || null) : null;
  // Tipo A: quien reposteó es item.repostedBy
  const repostedBy   = item.repostedBy?.name || null;

  // Engagement — puede ser null en personas, protegerse
  const eng  = src.engagement || item.engagement || {};
  const likes    = eng.likes    || 0;
  const comments = eng.comments || 0;
  const shares   = eng.shares   || 0;
  const reactions = eng.reactions || [];

  const entityId = item.entityId || item.id || null;
  const postType = item.type || null;

  return {
    url,
    linkedinUrl,
    title: titulo,
    description: descripcion,
    articleSource,
    publishedDate: fechaPost,
    contentType,
    postType,
    authorName,
    authorType,
    authorId,
    entityId,
    isRepost,
    repostComment,
    repostedBy,
    likes,
    comments,
    shares,
    reactions,
    sourceType,
  };
}

async function runActor(actorId, token, input) {
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
  return Array.isArray(datasetData) ? datasetData : (datasetData.items || []);
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
    const items = await runActor(actorId, token, input);
    logger.success(`Actor completado. ${items.length} posts extraídos`);
    return items.map(item => mapPost(item, 'company'));
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
    // TODO: verificar que la respuesta del actor de personas
    // tiene la misma estructura que el de empresas (linkedinUrl,
    // postedAt, author, engagement, repost, repostedBy, article, etc.)
    const items = await runActor(actorId, token, input);
    logger.success(`Actor de personas completado. ${items.length} posts extraídos`);
    return items.map(item => mapPost(item, 'person'));
  } catch (error) {
    logger.error(`Error ejecutando Actor de personas: ${error.message}`);
    throw error;
  }
}
