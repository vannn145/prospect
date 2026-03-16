require('dotenv').config();

const { pool } = require('../database/db');
const { initDatabase } = require('../database/initDb');
const { collectMultipleSearches } = require('../services/leadCollectorService');
const { recalculatePriorityScores } = require('../services/companyRepositoryService');

const DEFAULT_CATEGORIES = [
  'dentist',
  'lawyer',
  'restaurant',
  'gym',
  'beauty_salon',
  'pet_store',
  'real_estate_agency',
  'accounting',
];

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function getListArg(name, fallback = []) {
  const value = getArg(name);
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

async function run() {
  const cities = getListArg('cities', process.env.AUTO_SEARCH_CITIES ? process.env.AUTO_SEARCH_CITIES.split(',') : ['Campinas']);
  const categories = getListArg(
    'categories',
    process.env.AUTO_SEARCH_CATEGORIES
      ? process.env.AUTO_SEARCH_CATEGORIES.split(',')
      : DEFAULT_CATEGORIES
  );
  const radius = Number(getArg('radius') || process.env.AUTO_SEARCH_RADIUS || 5000);
  const maxPages = Number(getArg('maxPages') || process.env.AUTO_SEARCH_MAX_PAGES || 3);
  const includeInstagram = parseBoolean(
    getArg('instagram') || process.env.AUTO_SEARCH_INSTAGRAM || 'false'
  );

  if (!cities.length || !categories.length) {
    throw new Error('Forneça pelo menos uma cidade e uma categoria.');
  }

  await initDatabase();

  const summary = await collectMultipleSearches({
    cities,
    categories,
    radius,
    maxPages,
    includeInstagram,
  });

  const priorityResult = await recalculatePriorityScores();

  console.log('Busca automática finalizada.');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Prioridades recalculadas para ${priorityResult.updated} empresas.`);
}

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Erro na busca automática:', error.message);
    await pool.end();
    process.exit(1);
  });
