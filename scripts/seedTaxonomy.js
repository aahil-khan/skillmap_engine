import { skill_taxonomy } from '../taxonomy/skill_taxonomy.js';
import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';
import { ensureCollection } from '../utils/vectorStore.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** ========= Config ========= */
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'skill_embeddings';
const OPENAI_EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';
const BATCH_SIZE = Number(process.env.EMBED_BATCH_SIZE || 64);
const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const SKIP_EXISTING = (process.env.SKIP_EXISTING || 'false').toLowerCase() === 'true';
const MAX_CONCURRENT_UPSERTS = Number(process.env.MAX_CONCURRENT_UPSERTS || 3);
const MAX_TOKENS_PER_TEXT = Number(process.env.MAX_TOKENS_PER_TEXT || 8000);
const CHECKPOINT_FILE = path.join(__dirname, '.seed-checkpoints.json');

/** ========= Colorized Console Logging ========= */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: (msg) => console.warn(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.error(`${colors.red}❌ ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.magenta}📦 ${msg}${colors.reset}`),
  metric: (label, value) => console.log(`${colors.blue}   → ${label}: ${colors.bright}${value}${colors.reset}`),
};

/** ========= Timer Utility ========= */
class Timer {
  constructor() {
    this.start = Date.now();
  }
  
  elapsed() {
    return ((Date.now() - this.start) / 1000).toFixed(2);
  }
  
  reset() {
    this.start = Date.now();
  }
}

/** ========= Helpers ========= */

/**
 * Converts a string to a URL-friendly slug
 * @param {string} s - Input string
 * @returns {string} Slugified string
 */
const slugify = (s) =>
  s.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Generates a deterministic numeric ID from category and skill name
 * @param {string} category - Category name
 * @param {string} skill - Skill name
 * @returns {number} 64-bit deterministic ID
 */
const makeDeterministicId = (category, skill) => {
  const h = crypto.createHash('sha1').update(`${category}::${skill}`).digest();
  return Number(BigInt.asUintN(64, BigInt('0x' + h.subarray(0, 8).toString('hex'))));
};

/**
 * Safely returns an array or empty array
 * @param {any} x - Input value
 * @returns {Array} Array or empty array
 */
const arrayOrEmpty = (x) => (Array.isArray(x) ? x : []);

/**
 * Safely returns a string or empty string
 * @param {any} x - Input value
 * @returns {string} String or empty string
 */
const safeStr = (x) => (typeof x === 'string' ? x.trim() : '');

/**
 * Sanitizes text by removing extra whitespace and normalizing
 * @param {string} text - Input text
 * @returns {string} Sanitized text
 */
const sanitizeText = (text) => {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
};

/**
 * Rough token count estimation (1 token ≈ 4 chars)
 * @param {string} text - Input text
 * @returns {number} Estimated token count
 */
const estimateTokens = (text) => Math.ceil(text.length / 4);

/**
 * Builds embedding text from category and skill metadata
 * @param {Object} categoryObj - Category object
 * @param {Object} skill - Skill object
 * @returns {string} Combined text for embedding
 */
const buildEmbeddingText = (categoryObj, skill) => {
  const parts = [
    `Category: ${safeStr(categoryObj.category)}`,
    safeStr(categoryObj.description || ''),
    `Skill: ${safeStr(skill.name)}`,
    safeStr(skill.description || ''),
  ];

  const tags = arrayOrEmpty(skill.tags).join(', ');
  if (tags) parts.push(`Tags: ${tags}`);

  const subskills = arrayOrEmpty(skill.subskills).join(', ');
  if (subskills) parts.push(`Subskills: ${subskills}`);

  const related = arrayOrEmpty(skill.relatedSkills).join(', ');
  if (related) parts.push(`Related: ${related}`);

  // Add resource domains (signals topic breadth without noisy query params)
  if (skill.learningResources) {
    const hosts = Object.values(skill.learningResources)
      .filter(Boolean)
      .map((u) => {
        try {
          return new URL(u).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (hosts.length) parts.push(`Resources: ${hosts.join(', ')}`);
  }

  const text = parts.filter(Boolean).join('\n');
  return sanitizeText(text);
};

/**
 * Validates that a skill has required fields
 * @param {Object} categoryObj - Category object
 * @param {Object} skill - Skill object
 * @returns {boolean} Whether skill is valid
 */
const validateSkill = (categoryObj, skill) => {
  if (!categoryObj.category || typeof categoryObj.category !== 'string') {
    log.warn(`Invalid category: missing or invalid 'category' field`);
    return false;
  }
  if (!skill.name || typeof skill.name !== 'string') {
    log.warn(`Invalid skill in ${categoryObj.category}: missing or invalid 'name' field`);
    return false;
  }
  if (!skill.description || typeof skill.description !== 'string') {
    log.warn(`Invalid skill '${skill.name}': missing or invalid 'description' field`);
    return false;
  }
  return true;
};

/**
 * Converts category and skill into a Qdrant point
 * @param {Object} categoryObj - Category object
 * @param {Object} skill - Skill object
 * @param {number[]} vector - Embedding vector
 * @param {number} id - Deterministic ID
 * @returns {Object} Qdrant point object
 */
const toPoint = (categoryObj, skill, vector, id) => {
  const category = safeStr(categoryObj.category);
  const skillName = safeStr(skill.name);

  return {
    id,
    vector,
    payload: {
      category,
      categorySlug: slugify(category),
      categoryDescription: safeStr(categoryObj.description || ''),
      skill: skillName,
      skillSlug: slugify(skillName),
      description: safeStr(skill.description || ''),
      level: safeStr(skill.level || ''),
      tags: arrayOrEmpty(skill.tags),
      subskills: arrayOrEmpty(skill.subskills),
      relatedSkills: arrayOrEmpty(skill.relatedSkills),
      learningResources: skill.learningResources || {},
      content: buildEmbeddingText(categoryObj, skill),
    },
  };
};

/** ========= Checkpoint Management ========= */

/**
 * Loads checkpoint data from file
 * @returns {Promise<Set<number>>} Set of processed IDs
 */
async function loadCheckpoint() {
  try {
    const data = await fs.readFile(CHECKPOINT_FILE, 'utf8');
    const checkpoint = JSON.parse(data);
    return new Set(checkpoint.processedIds || []);
  } catch {
    return new Set();
  }
}

/**
 * Saves checkpoint data to file
 * @param {Set<number>} processedIds - Set of processed IDs
 */
async function saveCheckpoint(processedIds) {
  const checkpoint = {
    processedIds: Array.from(processedIds),
    lastUpdated: new Date().toISOString(),
  };
  await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

/**
 * Deletes checkpoint file
 */
async function clearCheckpoint() {
  try {
    await fs.unlink(CHECKPOINT_FILE);
  } catch {
    // File doesn't exist, ignore
  }
}

/** ========= Qdrant Operations ========= */

/**
 * Creates payload indexes for fast filtering
 */
async function createPayloadIndexes() {
  const keywordFields = ['category', 'skill', 'level', 'tags', 'subskills'];
  const timer = new Timer();
  
  for (const field of keywordFields) {
    try {
      await qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: field,
        field_schema: 'keyword',
      });
      log.success(`Indexed payload field: ${field}`);
    } catch (e) {
      log.info(`Index '${field}' already exists or skipped`);
    }
  }
  
  log.metric('Index creation time', `${timer.elapsed()}s`);
}

/**
 * Checks if a point exists in Qdrant
 * @param {number} id - Point ID
 * @returns {Promise<boolean>} Whether point exists
 */
async function pointExists(id) {
  try {
    const result = await qdrant.retrieve(COLLECTION_NAME, { ids: [id] });
    return result.length > 0;
  } catch {
    return false;
  }
}

/** ========= Retry Logic ========= */

/**
 * Executes a function with exponential backoff retry
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Function result
 */
async function withRetry(fn, { retries = 5, baseMs = 500, context = '' } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) {
        log.error(`${context} failed after ${retries} retries: ${err.message}`);
        throw err;
      }
      const delay = baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      log.warn(`${context} retry ${attempt}/${retries} after ${delay}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** ========= Embedding Operations ========= */

/**
 * Batch embed texts using OpenAI API
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedBatch(texts) {
  const res = await withRetry(
    () =>
      openai.embeddings.create({
        model: OPENAI_EMBED_MODEL,
        input: texts,
      }),
    { context: 'Embedding batch' }
  );
  return res.data.map((d) => d.embedding);
}

/**
 * Processes items in parallel batches with controlled concurrency
 * @param {Array} items - Items to process
 * @param {Function} processFn - Async function to process each item
 * @param {number} concurrency - Max concurrent operations
 */
async function processConcurrently(items, processFn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processFn));
    results.push(...batchResults);
  }
  return results;
}

/** ========= Main Seeding Logic ========= */

/**
 * Main seeding function
 */
async function seedSkillTaxonomy() {
  const globalTimer = new Timer();
  const metrics = {
    totalSkills: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    embeddingTime: 0,
    upsertTime: 0,
  };

  try {
    log.section('Starting Skill Taxonomy Seeding');
    log.metric('Collection', COLLECTION_NAME);
    log.metric('Model', OPENAI_EMBED_MODEL);
    log.metric('Batch size', BATCH_SIZE);
    log.metric('Max concurrent upserts', MAX_CONCURRENT_UPSERTS);
    log.metric('Dry run', DRY_RUN ? 'YES' : 'NO');
    log.metric('Skip existing', SKIP_EXISTING ? 'YES' : 'NO');

    // Ensure collection exists
    await ensureCollection(COLLECTION_NAME);
    log.success('Collection ready');

    // Load checkpoint if resuming
    const processedIds = SKIP_EXISTING ? await loadCheckpoint() : new Set();
    if (processedIds.size > 0) {
      log.info(`Resuming from checkpoint: ${processedIds.size} skills already processed`);
    }

    // Prepare all items with validation
    const items = [];
    for (const category of skill_taxonomy) {
      log.section(`Category: ${category.category}`);
      for (const skill of category.skills) {
        if (!validateSkill(category, skill)) {
          metrics.failed++;
          continue;
        }

        const id = makeDeterministicId(category.category, skill.name);
        
        // Skip if already processed
        if (SKIP_EXISTING && processedIds.has(id)) {
          metrics.skipped++;
          log.info(`Skipping already processed: ${skill.name}`);
          continue;
        }

        const content = buildEmbeddingText(category, skill);
        const tokens = estimateTokens(content);
        
        if (tokens > MAX_TOKENS_PER_TEXT) {
          log.warn(`Skill '${skill.name}' exceeds token limit (${tokens} tokens), truncating`);
        }

        items.push({ category, skill, id, content, tokens });
        metrics.totalSkills++;
      }
    }

    log.section('Building Payload Indexes');
    await createPayloadIndexes();

    if (items.length === 0) {
      log.info('No items to process');
      return;
    }

    // Process in batches
    log.section(`Processing ${items.length} Skills`);
    
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(items.length / BATCH_SIZE);
      
      log.info(`Batch ${batchNum}/${totalBatches} (${batch.length} items)`);

      // Embedding phase
      const embedTimer = new Timer();
      const texts = batch.map((x) => x.content);
      
      log.info('Generating embeddings...');
      const vectors = await embedBatch(texts);
      const embedTime = parseFloat(embedTimer.elapsed());
      metrics.embeddingTime += embedTime;
      log.metric('Embedding time', `${embedTime}s`);
      log.metric('Avg tokens/item', Math.round(batch.reduce((sum, x) => sum + x.tokens, 0) / batch.length));

      // Build points
      const points = batch.map((x, idx) =>
        toPoint(x.category, x.skill, vectors[idx], x.id)
      );

      if (DRY_RUN) {
        log.warn(`[DRY RUN] Would upsert ${points.length} points`);
        log.info('Sample point:');
        console.log(JSON.stringify(points[0], null, 2));
        metrics.processed += points.length;
        continue;
      }

      // Upsert phase with concurrency control
      const upsertTimer = new Timer();
      log.info('Upserting to Qdrant...');
      
      await withRetry(
        () => qdrant.upsert(COLLECTION_NAME, { wait: true, points }),
        { context: `Batch ${batchNum} upsert` }
      );
      
      const upsertTime = parseFloat(upsertTimer.elapsed());
      metrics.upsertTime += upsertTime;
      log.success(`Upserted ${points.length} points in ${upsertTime}s`);
      
      metrics.processed += points.length;

      // Update checkpoint
      batch.forEach(x => processedIds.add(x.id));
      await saveCheckpoint(processedIds);
    }

    // Clean up checkpoint on success
    if (!SKIP_EXISTING) {
      await clearCheckpoint();
    }

    // Final summary
    log.section('Seeding Complete');
    log.metric('Total runtime', `${globalTimer.elapsed()}s`);
    log.metric('Skills processed', metrics.processed);
    log.metric('Skills skipped', metrics.skipped);
    log.metric('Skills failed', metrics.failed);
    log.metric('Total embedding time', `${metrics.embeddingTime.toFixed(2)}s`);
    log.metric('Total upsert time', `${metrics.upsertTime.toFixed(2)}s`);
    log.metric('Avg time/skill', `${(parseFloat(globalTimer.elapsed()) / metrics.processed).toFixed(3)}s`);

    // Write summary report
    const report = {
      timestamp: new Date().toISOString(),
      collection: COLLECTION_NAME,
      model: OPENAI_EMBED_MODEL,
      metrics,
      runtimeSeconds: parseFloat(globalTimer.elapsed()),
    };
    
    const reportPath = path.join(__dirname, 'seed-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    log.success(`Report saved to ${reportPath}`);

  } catch (error) {
    log.error(`Seeding failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run
seedSkillTaxonomy();