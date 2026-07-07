# {{PROJECT_NAME}}

Micro-SaaS gerado automaticamente pelo **SaaS-Forge** a partir da ideia:

> {{IDEA}}

## Como rodar

```bash
npm install
npm run dev
```

- API (Express + SQLite): http://localhost:5050/api/health
- App (React + Vite): http://localhost:5173

## Estrutura

```
├── schema.sql            # Schema do banco (aplicado automaticamente no boot)
├── server/               # API Express + better-sqlite3 + Stripe
│   ├── index.js          # Bootstrap do servidor
│   ├── db.js             # Conexão SQLite + aplicação do schema
│   ├── stripe.config.js  # Configuração de pagamento (estática, validada)
│   └── routes/           # Rotas geradas (CRUD + checkout)
└── client/               # Frontend React (Vite)
    └── src/pages/        # Telas geradas (Login, Dashboard, Configurações)
```

## Pagamentos

Defina `STRIPE_SECRET_KEY` no `.env` (copie de `.env.example`) para ativar o
checkout real de assinatura. Sem a chave, o fluxo roda em modo simulado.
