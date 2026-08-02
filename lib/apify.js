import { Logger } from './logger.js';

const logger = new Logger('APIFY');

const APIFY_API = 'https://api.apify.com/v2';

function buildActorInput(targetUrls, settings) {
  return {
    targetUrls: targetUrls,
    maxPosts: settings.max_posts_per_company ?? 5,
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

function itemMatchesSearchTerm(item, term) {
  if (!term) return true;

  const needle = term.toLowerCase();
  const haystacks = [
    item.content,
    item.article?.title,
    item.article?.description,
    item.repost?.content,
  ];

  return haystacks.some(text => typeof text === 'string' && text.toLowerCase().includes(needle));
}

function buildTermsActorInput(terms, settings) {
  return {
    searchQueries: terms,
    maxPosts: settings.max_posts_per_company ?? 5,
    postedLimit: settings.posted_limit || '24h',
    scrapeComments: false,
    scrapeReactions: false,
    maxComments: 5,
    maxReactions: 5,
    postNestedComments: false,
    postNestedReactions: false,
  };
}

export function parseFollowers(info) {
  if (!info) return null;
  const match = info.match(/^([\d,]+)\s+followers/i);
  if (match) return parseInt(match[1].replace(/,/g, ''), 10);
  return null;
}

export function mapProfileEnrichment(item) {
  const author = item.author || {};
  const isCompany = author.type === 'company';
  const followersCount = isCompany ? parseFollowers(author.info) : null;

  if (isCompany && author.info && followersCount === null) {
    logger.warn(`Could not parse followers from author.info for company "${author.name}": "${author.info}"`);
  }

  return {
    linkedinId:        author.id || null,
    universalName:     author.universalName || null,
    publicIdentifier:  author.publicIdentifier || null,
    authorType:        author.type || null,
    name:              author.name || null,
    linkedinUrl:       author.linkedinUrl || null,
    avatarUrl:         author.avatar?.url || null,
    followersCount,
    headline:          isCompany ? null : (author.info || null),
    website:           author.website || null,
    queryTargetUrl:    item.query?.targetUrl || null,
  };
}

export function mapDiscoveredProfiles(item) {
  const discovered = [];
  const sourceUrl = item.query?.targetUrl || null;

  const normalizeUrl = url => url ? url.replace(/\/$/, '').toLowerCase() : null;

  if (item.repostedBy) {
    const r = item.repostedBy;
    const linkedinUrl = normalizeUrl(r.linkedinUrl);
    if (linkedinUrl) {
      discovered.push({
        linkedinUrl,
        linkedinId:        null,
        universalName:     r.universalName || null,
        publicIdentifier:  r.publicIdentifier || null,
        name:              r.name || null,
        type:              'company',
        headline:          null,
        avatarUrl:         null,
        source:            'reposter',
        sourceUrl,
      });
    }
  }

  for (const attr of (item.contentAttributes || [])) {
    if (attr.type === 'COMPANY_NAME' && attr.company?.linkedinUrl) {
      const linkedinUrl = normalizeUrl(attr.company.linkedinUrl);
      if (linkedinUrl) {
        discovered.push({
          linkedinUrl,
          linkedinId:        attr.company.id || null,
          universalName:     null,
          publicIdentifier:  null,
          name:              attr.company.name || null,
          type:              'company',
          headline:          null,
          avatarUrl:         null,
          source:            'mention',
          sourceUrl,
        });
      }
    } else if (attr.type === 'PROFILE_MENTION' && attr.profile?.linkedinUrl) {
      const linkedinUrl = normalizeUrl(attr.profile.linkedinUrl);
      if (linkedinUrl) {
        discovered.push({
          linkedinUrl,
          linkedinId:        attr.profile.id || null,
          universalName:     null,
          publicIdentifier:  attr.profile.publicIdentifier || null,
          name:              `${attr.profile.firstName || ''} ${attr.profile.lastName || ''}`.trim() || null,
          type:              'person',
          headline:          null,
          avatarUrl:         null,
          source:            'mention',
          sourceUrl,
        });
      }
    }
  }

  return discovered;
}

export function detectContentType(src) {
  const types = [];
  if (src?.postImages?.length)                              types.push('image');
  if (src?.postVideo)                                       types.push('video');
  if (src?.document)                                        types.push('document');
  if (src?.article)                                         types.push('article');
  if (src?.content && /https?:\/\/\S+/.test(src.content))  types.push('link');
  if (src?.header?.text && /reposted/i.test(src.header.text)) types.push('repost');
  return types.length ? types : ['text'];
}

export function mapPost(item, sourceType) {
  // Caso 2 (Tipo A): repost silencioso — repostedBy presente, sin objeto repost
  // Caso 3/4 (Tipo B): repost con o sin comentario — objeto repost presente
  const isRepost = !!(item.repost || item.repostedBy);

  // Para Tipo B el contenido real está en item.repost
  const src = item.repost ?? item;

  const url          = src.linkedinUrl || null;
  const articleUrl   = src.article?.link || null;
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

  // Desglose por tipo de reacción para dashboard
  const reactionMap = Object.fromEntries(reactions.map(r => [r.type, r.count]));
  const reactionsLike           = reactionMap['LIKE']           || 0;
  const reactionsEmpathy        = reactionMap['EMPATHY']        || 0;
  const reactionsPraise         = reactionMap['PRAISE']         || 0;
  const reactionsAppreciation   = reactionMap['APPRECIATION']   || 0;
  const reactionsInterest       = reactionMap['INTEREST']       || 0;
  const reactionsEntertainment  = reactionMap['ENTERTAINMENT']  || 0;

  const entityId = item.entityId || item.id || null;
  const postType = item.type || null;
  const queryTargetUrl = item.query?.targetUrl || item.query?.search || null;

  return {
    url,
    articleUrl,
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
    reactionsLike,
    reactionsEmpathy,
    reactionsPraise,
    reactionsAppreciation,
    reactionsInterest,
    reactionsEntertainment,
    queryTargetUrl,
    sourceType,
  };
}

function defaultDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runActor(actorId, token, input, deps = {}) {
  const { delay: wait = defaultDelay } = deps;
  const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const runResponse = await fetch(
    `${APIFY_API}/acts/${actorId}/runs`,
    {
      method: 'POST',
      headers: authHeaders,
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
    `${APIFY_API}/acts/${actorId}/runs/${runId}?waitForFinish=120`,
    { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
  );

  const waitData = await waitResponse.json();
  const finalStatus = waitData.data.status;

  logger.info(`Actor status: ${finalStatus}`);

  if (finalStatus !== 'SUCCEEDED') {
    throw new Error(`Actor terminó con status: ${finalStatus}`);
  }

  logger.info(`Obteniendo datos del dataset ${datasetId}...`);

  // Apify's own docs: cost/event figures right at completion (the response
  // above) can be preliminary — wait briefly and re-fetch for settled ones.
  // Runs concurrently with the dataset fetch so it doesn't add pure latency.
  const [datasetData, finalRunData] = await Promise.all([
    (async () => {
      const datasetResponse = await fetch(
        `${APIFY_API}/datasets/${datasetId}/items`,
        { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!datasetResponse.ok) {
        throw new Error(`Dataset error: ${datasetResponse.statusText}`);
      }
      return datasetResponse.json();
    })(),
    (async () => {
      await wait(10000);
      const finalRunResponse = await fetch(
        `${APIFY_API}/acts/${actorId}/runs/${runId}`,
        { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
      );
      return finalRunResponse.json();
    })(),
  ]);

  const items = Array.isArray(datasetData) ? datasetData : (datasetData.items || []);

  const runStats = {
    actorId,
    computeUnits: finalRunData.data.stats?.computeUnits ?? null,
    usageTotalUsd: finalRunData.data.usageTotalUsd ?? null,
  };

  return { items, runStats };
}

export async function executeActor(targetUrls, settings, deps = {}) {
  const actorId = process.env.APIFY_ACTOR_ID;
  const token = process.env.APIFY_TOKEN;

  if (!actorId || !token) {
    throw new Error('APIFY_ACTOR_ID o APIFY_TOKEN no configurados');
  }

  const input = buildActorInput(targetUrls, settings);

  logger.info(`Ejecutando Actor ${actorId} con ${targetUrls.length} empresa(s)...`);
  logger.info(`INPUT:`, JSON.stringify(input, null, 2));

  try {
    const { items, runStats } = await runActor(actorId, token, input, deps);
    logger.success(`Actor completado. ${items.length} posts extraídos`);
    return { posts: items.map(item => mapPost(item, 'company')), runStats };
  } catch (error) {
    logger.error(`Error ejecutando Actor: ${error.message}`);
    throw error;
  }
}

export async function executeTermsActor(terms, settings, deps = {}) {
  const actorId = process.env.APIFY_TERMS_ACTOR_ID;
  const token = process.env.APIFY_TOKEN;

  if (!actorId || !token) {
    throw new Error('APIFY_TERMS_ACTOR_ID o APIFY_TOKEN no configurados');
  }

  const input = buildTermsActorInput(terms, settings);

  logger.info(`Ejecutando Actor de términos ${actorId} con ${terms.length} término(s)...`);
  logger.info(`INPUT:`, JSON.stringify(input, null, 2));

  try {
    const { items, runStats } = await runActor(actorId, token, input, deps);
    const relevantItems = items.filter(item => itemMatchesSearchTerm(item, item.query?.search));
    const discarded = items.length - relevantItems.length;
    if (discarded > 0) {
      logger.info(`Descartados ${discarded} post(s) sin coincidencia real del término buscado`);
    }
    logger.success(`Actor de términos completado. ${relevantItems.length} posts extraídos`);
    return { posts: relevantItems.map(item => mapPost(item, 'term')), runStats };
  } catch (error) {
    logger.error(`Error ejecutando Actor de términos: ${error.message}`);
    throw error;
  }
}

export async function executePeopleActor(targetUrls, settings, deps = {}) {
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
    const { items, runStats } = await runActor(actorId, token, input, deps);
    logger.success(`Actor de personas completado. ${items.length} posts extraídos`);
    return { posts: items.map(item => mapPost(item, 'person')), runStats };
  } catch (error) {
    logger.error(`Error ejecutando Actor de personas: ${error.message}`);
    throw error;
  }
}
