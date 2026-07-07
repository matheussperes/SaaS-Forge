'use strict';

/**
 * Templates de prompts do sistema — motor de prompts encadeados.
 *
 * Cada etapa da esteira gera um prompt independente e sequencial:
 *   1. Database Schema  -> schema.sql
 *   2. Backend Core     -> server/routes/crud.js
 *   3. Módulo Stripe    -> server/routes/checkout.js
 *   4. Frontend UI      -> client/src/pages/{Login,Dashboard,Settings}.jsx
 *
 * Todos os prompts exigem o protocolo de saída consumido pelo codeExtractor,
 * para que o orquestrador ignore qualquer texto explicativo da LLM.
 */

const OUTPUT_PROTOCOL = `
REGRAS DE SAÍDA (OBRIGATÓRIAS):
- Responda APENAS com blocos de arquivo no formato exato:
<<<FILE: caminho/relativo/do/arquivo>>>
\`\`\`linguagem
...conteúdo completo do arquivo...
\`\`\`
- Um bloco por arquivo solicitado, com o caminho relativo exato pedido.
- NÃO escreva explicações, saudações ou comentários fora dos blocos.
- O conteúdo de cada bloco deve ser o arquivo completo e funcional.`;

const SYSTEM_PROMPT = `Você é um engenheiro de software sênior dentro do SaaS-Forge, uma fábrica autônoma de Micro-SaaS.
Você gera código de produção enxuto, funcional e sem dependências além das listadas no contexto.
${OUTPUT_PROTOCOL}`;

function featureNotes(features = {}) {
  const notes = [];
  if (features.googleAuth) {
    notes.push('- O usuário ativou "Autenticação via Google": modele/considere um campo google_id em users e um fluxo de login social (pode ser stub claramente marcado com TODO no frontend).');
  }
  if (features.adminDashboard) {
    notes.push('- O usuário ativou "Dashboard Admin": considere um campo role em users e rotas/telas com visão administrativa (listagem geral).');
  }
  return notes.length ? `\nRecursos extras selecionados:\n${notes.join('\n')}` : '';
}

/** Etapa 1 — Database Schema */
function buildSchemaPrompt({ idea, features }) {
  return {
    system: SYSTEM_PROMPT,
    user: `Ideia de negócio do Micro-SaaS: "${idea}"${featureNotes(features)}

Crie EXCLUSIVAMENTE o arquivo schema.sql com as tabelas e relações necessárias para esse negócio, em SQLite.

Requisitos:
- Dialeto SQLite (sem tipos/extensões de outros bancos).
- Toda tabela usa "CREATE TABLE IF NOT EXISTS" (o schema é reaplicado a cada boot).
- Inclua uma tabela "users" (id, email único, password_hash, name, created_at) e uma tabela "subscriptions" (id, user_id, stripe_customer_id, stripe_subscription_id, status, plan, created_at) além das tabelas de domínio da ideia.
- Chaves estrangeiras com "REFERENCES", timestamps com "DATETIME DEFAULT CURRENT_TIMESTAMP".
- Sem comandos INSERT, sem PRAGMA, sem transações.

Arquivo esperado: <<<FILE: schema.sql>>>`,
  };
}

/** Etapa 2 — Backend Core (rotas CRUD Express) */
function buildBackendPrompt({ idea, features, schemaSql }) {
  return {
    system: SYSTEM_PROMPT,
    user: `Ideia de negócio: "${idea}"${featureNotes(features)}

O projeto já possui um servidor Express estático que monta suas rotas assim:
  const crud = require('./routes/crud');
  app.use('/api', crud);
E um módulo de banco (better-sqlite3) importável com:
  const db = require('../db'); // instância Database do better-sqlite3

Schema do banco já gerado (schema.sql):
\`\`\`sql
${schemaSql}
\`\`\`

Crie EXCLUSIVAMENTE o arquivo server/routes/crud.js: um express.Router() com as rotas CRUD básicas para as tabelas de domínio do schema acima.

Requisitos:
- CommonJS (require/module.exports). Exportar o Router com "module.exports = router;".
- Usar apenas: express e o módulo '../db' (better-sqlite3 síncrono: db.prepare(...).all()/get()/run()).
- Para cada tabela de domínio: GET lista, GET por id, POST cria, PUT atualiza, DELETE remove (prefixo /<tabela>).
- Validar corpo mínimo (campos obrigatórios) respondendo 400 com { error }.
- Responder 404 com { error } quando o id não existir.
- Nunca interpolar valores do usuário no SQL: sempre placeholders (?).
- Sem autenticação nesta etapa (será plugada depois).

Arquivo esperado: <<<FILE: server/routes/crud.js>>>`,
  };
}

/** Etapa 3 — Módulo Stripe (rota de checkout) */
function buildStripePrompt({ idea, features, stripeConfigSource }) {
  return {
    system: SYSTEM_PROMPT,
    user: `Ideia de negócio: "${idea}"${featureNotes(features)}

O orquestrador já injetou no projeto um arquivo estático e validado de configuração do Stripe (server/stripe.config.js):
\`\`\`js
${stripeConfigSource}
\`\`\`

O servidor Express estático monta sua rota assim:
  const checkout = require('./routes/checkout');
  app.use('/api/billing', checkout);

Crie EXCLUSIVAMENTE o arquivo server/routes/checkout.js: um express.Router() com a rota de checkout do modelo de negócio (assinatura mensal).

Requisitos:
- CommonJS. Exportar o Router com "module.exports = router;".
- Usar apenas: express e require('../stripe.config') (funções/constantes mostradas acima).
- POST /checkout: cria uma Stripe Checkout Session de assinatura (mode: 'subscription') usando getStripe() e PRICING, respondendo { url } da sessão.
- Se getStripe() retornar null (sem STRIPE_SECRET_KEY), responder 200 com { url: PRICING.successUrl, mock: true } para que o fluxo de validação funcione sem chave.
- GET /plan: responde os dados públicos do plano (nome, preço, moeda, intervalo) a partir de PRICING.
- Erros do Stripe: responder 502 com { error }.

Arquivo esperado: <<<FILE: server/routes/checkout.js>>>`,
  };
}

/** Etapa 4 — Frontend UI (telas React) */
function buildFrontendPrompt({ idea, features, routesSummary }) {
  return {
    system: SYSTEM_PROMPT,
    user: `Ideia de negócio: "${idea}"${featureNotes(features)}

O frontend React (Vite) já possui roteamento e um helper de API prontos:
- import { api } from '../api';  // api(path, { method, body }) -> JSON; path relativo a /api (ex.: api('/items'))
- Navegação: import { Link, useNavigate } from 'react-router-dom';
- As páginas são montadas em /login, /dashboard e /settings pelo shell estático (App.jsx).
- CSS global já existe: use classes simples (card, btn, input, list) sem importar CSS.

Rotas do backend recém-geradas:
${routesSummary}

Crie EXCLUSIVAMENTE os 3 arquivos de páginas React integrados a essas rotas:

1) <<<FILE: client/src/pages/Login.jsx>>> — Tela de login/cadastro simples: formulário de e-mail e senha; ao enviar, salvar { email } em localStorage ('sf_user') e navegar para /dashboard (a autenticação real será plugada depois${features && features.googleAuth ? '; incluir botão "Entrar com Google" como stub marcado com TODO' : ''}).
2) <<<FILE: client/src/pages/Dashboard.jsx>>> — Tela principal do negócio: listar os registros da principal entidade de domínio via api(), formulário para criar novo registro e botão de excluir em cada item. Tratar erros exibindo mensagem.
3) <<<FILE: client/src/pages/Settings.jsx>>> — Configurações: mostrar o e-mail do usuário (localStorage), exibir o plano via api('/billing/plan') e botão "Assinar" que chama api('/billing/checkout', { method: 'POST' }) e redireciona para a url retornada; botão "Sair" limpa o localStorage e volta para /login.

Requisitos:
- Componentes de função com hooks (useState/useEffect), export default.
- Sem bibliotecas além de react e react-router-dom.
- Código completo em cada arquivo (imports incluídos).`,
  };
}

module.exports = {
  SYSTEM_PROMPT,
  buildSchemaPrompt,
  buildBackendPrompt,
  buildStripePrompt,
  buildFrontendPrompt,
};
