const { Pool } = require('pg');

require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
const shouldUseSsl = process.env.PGSSL === 'true';

const baseConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'prospect',
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
    };

const pool = new Pool(baseConfig);

pool.on('error', (error) => {
  console.error('PostgreSQL pool error:', error);
});

const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
};
