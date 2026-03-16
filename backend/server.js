const express = require('express');
const cors = require('cors');

require('dotenv').config();

const { initDatabase } = require('./database/initDb');
const companyRoutes = require('./routes/companyRoutes');

const app = express();

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : null;

app.use(cors(corsOrigins ? { origin: corsOrigins } : undefined));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', companyRoutes);
app.use('/', companyRoutes);

app.use((error, req, res, next) => {
  console.error(error);

  const statusCode = Number(error.statusCode) || 500;

  res.status(statusCode).json({
    error: error.message || 'Erro interno no servidor.',
  });
});

async function startServer() {
  await initDatabase();

  const port = Number(process.env.PORT || 4000);

  app.listen(port, () => {
    console.log(`Backend rodando em http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Erro ao iniciar servidor:', error);
  process.exit(1);
});
