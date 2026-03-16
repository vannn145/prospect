require('dotenv').config();

const { pool } = require('../database/db');
const { recalculatePriorityScores } = require('../services/companyRepositoryService');

async function run() {
  const result = await recalculatePriorityScores();
  console.log(`Priorização concluída. ${result.updated} leads atualizados.`);
}

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Erro ao priorizar leads:', error.message);
    await pool.end();
    process.exit(1);
  });
