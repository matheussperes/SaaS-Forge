'use strict';

/**
 * Provedor "mock" do llmService: respostas determinísticas que seguem o mesmo
 * protocolo de saída da LLM real (<<<FILE: ...>>> + cerca de código).
 *
 * Permite validar a esteira fim a fim — extração por regex, escrita em disco,
 * npm install e boot do projeto gerado — sem chave de API nem rede.
 */

function schemaResponse({ idea }) {
  return `Segue o schema solicitado para "${idea}".

<<<FILE: schema.sql>>>
\`\`\`sql
-- Schema gerado pelo SaaS-Forge (modo mock)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan TEXT NOT NULL DEFAULT 'monthly',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
\`\`\`
`;
}

function backendResponse() {
  return `<<<FILE: server/routes/crud.js>>>
\`\`\`js
'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// ---- items -----------------------------------------------------------------

router.get('/items', (req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
  res.json(rows);
});

router.get('/items/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Item não encontrado' });
  res.json(row);
});

router.post('/items', (req, res) => {
  const { title, description = '', status = 'open', user_id = null } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Campo obrigatório: title' });
  const info = db
    .prepare('INSERT INTO items (user_id, title, description, status) VALUES (?, ?, ?, ?)')
    .run(user_id, title, description, status);
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/items/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item não encontrado' });
  const { title = existing.title, description = existing.description, status = existing.status } = req.body || {};
  db.prepare('UPDATE items SET title = ?, description = ?, status = ? WHERE id = ?')
    .run(title, description, status, req.params.id);
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id));
});

router.delete('/items/:id', (req, res) => {
  const info = db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

// ---- users (leitura) ---------------------------------------------------------

router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, email, name, created_at FROM users ORDER BY id').all();
  res.json(rows);
});

module.exports = router;
\`\`\`
`;
}

function stripeResponse() {
  return `<<<FILE: server/routes/checkout.js>>>
\`\`\`js
'use strict';

const express = require('express');
const { getStripe, PRICING } = require('../stripe.config');

const router = express.Router();

router.get('/plan', (req, res) => {
  res.json({
    name: PRICING.productName,
    amount: PRICING.unitAmount,
    currency: PRICING.currency,
    interval: PRICING.interval,
  });
});

router.post('/checkout', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    // Sem STRIPE_SECRET_KEY: fluxo simulado para validação local.
    return res.json({ url: PRICING.successUrl, mock: true });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PRICING.currency,
            recurring: { interval: PRICING.interval },
            unit_amount: PRICING.unitAmount,
            product_data: { name: PRICING.productName },
          },
        },
      ],
      success_url: PRICING.successUrl,
      cancel_url: PRICING.cancelUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
\`\`\`
`;
}

function frontendResponse() {
  return `<<<FILE: client/src/pages/Login.jsx>>>
\`\`\`jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;
    localStorage.setItem('sf_user', JSON.stringify({ email }));
    navigate('/dashboard');
  }

  return (
    <div className="card">
      <h2>Entrar</h2>
      <form onSubmit={handleSubmit}>
        <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn" type="submit">Entrar</button>
      </form>
    </div>
  );
}
\`\`\`

<<<FILE: client/src/pages/Dashboard.jsx>>>
\`\`\`jsx
import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setItems(await api('/items'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!title) return;
    try {
      await api('/items', { method: 'POST', body: { title } });
      setTitle('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api('/items/' + id, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <h2>Dashboard</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleCreate}>
        <input className="input" placeholder="Novo registro" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn" type="submit">Adicionar</button>
      </form>
      <ul className="list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.title}</span>
            <button className="btn" onClick={() => handleDelete(item.id)}>Excluir</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
\`\`\`

<<<FILE: client/src/pages/Settings.jsx>>>
\`\`\`jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Settings() {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('sf_user') || 'null');

  useEffect(() => {
    api('/billing/plan').then(setPlan).catch((err) => setError(err.message));
  }, []);

  async function handleSubscribe() {
    try {
      const { url } = await api('/billing/checkout', { method: 'POST' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogout() {
    localStorage.removeItem('sf_user');
    navigate('/login');
  }

  return (
    <div className="card">
      <h2>Configurações</h2>
      {error && <p className="error">{error}</p>}
      <p>Usuário: {user ? user.email : 'não autenticado'}</p>
      {plan && (
        <p>
          Plano: {plan.name} — {(plan.amount / 100).toFixed(2)} {plan.currency.toUpperCase()} / {plan.interval}
        </p>
      )}
      <button className="btn" onClick={handleSubscribe}>Assinar</button>
      <button className="btn" onClick={handleLogout}>Sair</button>
    </div>
  );
}
\`\`\`
`;
}

/** Resolve a resposta mock para uma etapa da esteira. */
function mockResponseFor(step, context) {
  switch (step) {
    case 'schema':
      return schemaResponse(context);
    case 'backend':
      return backendResponse(context);
    case 'stripe':
      return stripeResponse(context);
    case 'frontend':
      return frontendResponse(context);
    default:
      throw new Error(`Etapa desconhecida no provedor mock: ${step}`);
  }
}

module.exports = { mockResponseFor };
