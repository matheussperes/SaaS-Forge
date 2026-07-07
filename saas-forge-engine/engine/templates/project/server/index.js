'use strict';

// Bootstrap estático do servidor — gerado pelo SaaS-Forge.
// As rotas de negócio ficam em ./routes (geradas pela esteira).

const express = require('express');
const cors = require('cors');

require('./db'); // abre o SQLite e aplica o schema.sql

const crud = require('./routes/crud');
const checkout = require('./routes/checkout');

const app = express();
const PORT = Number(process.env.PORT) || 5050;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: '{{PROJECT_SLUG}}', time: new Date().toISOString() });
});

app.use('/api', crud);
app.use('/api/billing', checkout);

app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`[api] {{PROJECT_NAME}} rodando em http://localhost:${PORT}`);
});
