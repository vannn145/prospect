const fs = require('fs');
const path = require('path');

const { pool } = require('./db');

async function initDatabase() {
  const sqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

if (require.main === module) {
  initDatabase()
    .then(async () => {
      console.log('Banco inicializado com sucesso.');
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Erro ao inicializar banco:', error.message);
      await pool.end();
      process.exit(1);
    });
}

module.exports = {
  initDatabase,
};
