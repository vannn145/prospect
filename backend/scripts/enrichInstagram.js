require('dotenv').config();

const { pool } = require('../database/db');
const {
  getCompaniesMissingInstagram,
  updateInstagramUrl,
} = require('../services/companyRepositoryService');
const { detectInstagram } = require('../services/instagramService');

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) {
    return fallback;
  }

  return found.slice(prefix.length);
}

async function run() {
  const limit = Number(getArg('limit', 100));

  const companies = await getCompaniesMissingInstagram(limit);
  let updated = 0;

  for (const company of companies) {
    const instagramUrl = await detectInstagram({
      name: company.name,
      city: company.city,
      website: company.website,
    });

    if (!instagramUrl) {
      continue;
    }

    await updateInstagramUrl(company.id, instagramUrl);
    updated += 1;
  }

  console.log(`Instagram encontrado para ${updated} empresas de ${companies.length} analisadas.`);
}

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Erro ao enriquecer Instagram:', error.message);
    await pool.end();
    process.exit(1);
  });
