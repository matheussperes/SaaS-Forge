# SaaS-Forge — Fábrica Autônoma de Micro-SaaS

O **SaaS-Forge** é um aplicativo de execução local que atua como um "Empreiteiro Digital":
você descreve uma ideia de negócio em linguagem natural e o sistema desenha o banco de
dados, escreve o backend, estrutura o frontend React e integra um módulo padrão de
pagamentos (Stripe). O resultado é um projeto pronto em `saas-forge-engine/output/`,
com repositório git inicializado, bastando `npm install` e `npm run dev`.

## Arquitetura

```
[Painel UI: Input da Ideia] ➔ [Motor de Prompts Encadeados] ➔ [Node FS: Escrita em Disco]
                                                             ➔ [NPM Install Automatizado] ➔ [SaaS Pronto]
```

```
saas-forge-engine/
├── package.json
├── server.js                 # Servidor do orquestrador (Express + WebSocket + pipeline)
├── public/
│   ├── index.html            # UI do Painel
│   └── script.js             # Conexão via WebSockets com o server
├── engine/
│   ├── promptBuilder.js      # Templates de prompts do sistema (etapas encadeadas)
│   ├── llmService.js         # Conexão com a API da LLM (Anthropic, local ou mock)
│   ├── fileWriter.js         # Escrita segura em disco com o módulo 'fs'
│   └── templates/            # Boilerplate estático injetado nos projetos gerados
└── output/                   # Pasta onde os novos Micro-SaaS são despejados
```

## Pipeline de geração (prompts encadeados)

| Etapa | Entrada | Saída |
|-------|---------|-------|
| 1. Database Schema | Ideia do usuário | `schema.sql` |
| 2. Backend Core | Ideia + schema gerado | Rotas CRUD Express |
| 3. Módulo Stripe | Config estática validada + ideia | Rota de checkout |
| 4. Frontend UI | Rotas do backend | Telas React (Login, Dashboard, Configurações) |

Cada etapa tem retry automático; falhas são registradas no console visual do painel.

## Critérios de aceitação implementados

- **Prevenção de alucinação**: extração estrita dos blocos de código via Regex,
  ignorando qualquer texto explicativo da LLM.
- **Geração funcional**: o projeto em `output/` roda com `npm install` + `npm run dev`.
- **Isolamento**: o orquestrador usa a porta `4600`; os projetos gerados usam
  `5050` (API) e `5173` (Vite), sem conflito.

> 📖 Guia completo de instalação, configuração, operação do painel e
> solução de problemas: **[MANUAL.md](MANUAL.md)**

## Como rodar

```bash
cd saas-forge-engine
npm install
cp .env.example .env   # configure seu provedor de LLM (ou deixe em mock)
npm start              # abre o painel em http://localhost:4600
```

Sem chave de API, o sistema roda em modo `mock` (templates determinísticos),
útil para validar a esteira fim a fim.

## Verificação fim a fim (executada)

A esteira foi validada em modo `mock` com a ideia *"App para agendar consultas
de nutrição"*:

1. `POST /api/forge` disparou a esteira; as 6 etapas concluíram em ~100s
   (incluindo `npm install` automatizado do projeto gerado).
2. O projeto saiu em `output/app-para-agendar-consultas-de-nutricao/` com
   repositório git inicializado (commit "SaaS inicial gerado pelo SaaS-Forge").
3. `npm run dev` no projeto gerado subiu API (5050) e frontend (5173) sem erros:
   - `GET /api/health` → `{"ok":true,...}`
   - `POST /api/items` + `GET /api/items` → CRUD SQLite funcionando
   - `GET /api/billing/plan` e `POST /api/billing/checkout` → módulo Stripe OK
     (modo simulado sem `STRIPE_SECRET_KEY`)
   - Vite serviu o app e compilou `Login.jsx`, `Dashboard.jsx` e `Settings.jsx`;
     proxy `/api` → 5050 funcionando.
