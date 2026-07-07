'use strict';

/**
 * SaaS-Forge — Servidor do orquestrador.
 *
 * Sobe o painel local (public/), mantém um canal WebSocket com a UI e executa
 * a esteira de produção (pipeline sequencial de prompts encadeados):
 *
 *   [Ideia] -> Etapa 1 schema.sql -> Etapa 2 backend CRUD ->
 *   Etapa 3 checkout Stripe -> Etapa 4 frontend React ->
 *   git init + npm install -> [SaaS pronto em output/]
 *
 * Cada etapa tem retry automático; falhas são transmitidas ao console visual.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const promptBuilder = require('./engine/promptBuilder');
const llmService = require('./engine/llmService');
const fileWriter = require('./engine/fileWriter');
const { extractFiles, extractSingleCode } = require('./engine/codeExtractor');

const PORT = Number(process.env.FORGE_PORT) || 4600; // isolado das portas 5050/5173 dos projetos gerados
const STEP_RETRIES = Math.max(0, Number(process.env.FORGE_STEP_RETRIES ?? 2));
const AUTO_INSTALL = (process.env.FORGE_AUTO_INSTALL ?? 'true') !== 'false';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ─── Log broadcast (console visual do painel) ────────────────────────────────

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

const log = {
  info: (text) => broadcast({ type: 'log', level: 'info', text, ts: Date.now() }),
  ok: (text) => broadcast({ type: 'log', level: 'ok', text, ts: Date.now() }),
  warn: (text) => broadcast({ type: 'log', level: 'warn', text, ts: Date.now() }),
  error: (text) => broadcast({ type: 'log', level: 'error', text, ts: Date.now() }),
  step: (id, status) => broadcast({ type: 'step', id, status, ts: Date.now() }),
};

// ─── Pipeline ────────────────────────────────────────────────────────────────

let pipelineRunning = false;

/** Executa uma etapa da LLM com retry e extração estrita. */
async function runLlmStep({ id, label, prompt, context, extract }) {
  log.step(id, 'running');
  let lastError = null;
  for (let attempt = 1; attempt <= STEP_RETRIES + 1; attempt += 1) {
    try {
      if (attempt > 1) log.warn(`${label}: tentativa ${attempt}/${STEP_RETRIES + 1}…`);
      const raw = await llmService.generate({ step: id, ...prompt, context });
      const result = extract(raw);
      log.step(id, 'done');
      return result;
    } catch (err) {
      lastError = err;
      log.error(`${label}: falha na tentativa ${attempt} — ${err.message}`);
    }
  }
  log.step(id, 'failed');
  throw new Error(`${label}: esgotadas as tentativas (${lastError.message})`);
}

/** Roda um comando externo transmitindo stdout/stderr para o painel. */
function runCommand(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
    const forward = (chunk) => {
      const lines = chunk.toString().split('\n').filter((l) => l.trim());
      for (const line of lines.slice(-5)) log.info(`  ${line.trim().slice(0, 200)}`);
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} terminou com código ${code}`));
    });
  });
}

async function forgePipeline({ idea, features }) {
  const provider = llmService.resolveProvider();
  log.info(`Provedor de LLM: ${provider}`);
  log.info(`Ideia recebida: "${idea}"`);

  // 0. Pasta do projeto + boilerplate estático
  log.step('scaffold', 'running');
  const projectDir = fileWriter.createProjectDir(idea);
  const slug = path.basename(projectDir);
  const projectName = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  fileWriter.scaffoldProject(projectDir, {
    PROJECT_SLUG: slug,
    PROJECT_NAME: projectName,
    IDEA: idea.replace(/\s+/g, ' ').trim(),
  });
  log.ok(`Projeto criado em output/${slug} (boilerplate aplicado)`);
  log.step('scaffold', 'done');

  // 1. Database Schema
  const schemaSql = await runLlmStep({
    id: 'schema',
    label: 'Etapa 1 (Database Schema)',
    prompt: promptBuilder.buildSchemaPrompt({ idea, features }),
    context: { idea, features },
    extract: (raw) => {
      const code = extractSingleCode(raw, 'schema.sql');
      if (!code || !/create\s+table/i.test(code)) {
        throw new Error('resposta sem bloco de código SQL válido');
      }
      return code;
    },
  });
  fileWriter.writeProjectFile(projectDir, 'schema.sql', schemaSql);
  log.ok('schema.sql gravado');

  // 2. Backend Core (rotas CRUD)
  const crudSource = await runLlmStep({
    id: 'backend',
    label: 'Etapa 2 (Backend Core)',
    prompt: promptBuilder.buildBackendPrompt({ idea, features, schemaSql }),
    context: { idea, features, schemaSql },
    extract: (raw) => {
      const code = extractSingleCode(raw, 'server/routes/crud.js');
      if (!code || !code.includes('module.exports')) {
        throw new Error('resposta sem Router CRUD válido');
      }
      return code;
    },
  });
  fileWriter.writeProjectFile(projectDir, 'server/routes/crud.js', crudSource);
  log.ok('server/routes/crud.js gravado');

  // 3. Módulo Stripe (config estática já injetada pelo scaffold)
  const stripeConfigSource = fileWriter.readProjectFile(projectDir, 'server/stripe.config.js');
  const checkoutSource = await runLlmStep({
    id: 'stripe',
    label: 'Etapa 3 (Módulo Stripe)',
    prompt: promptBuilder.buildStripePrompt({ idea, features, stripeConfigSource }),
    context: { idea, features },
    extract: (raw) => {
      const code = extractSingleCode(raw, 'server/routes/checkout.js');
      if (!code || !code.includes('module.exports')) {
        throw new Error('resposta sem rota de checkout válida');
      }
      return code;
    },
  });
  fileWriter.writeProjectFile(projectDir, 'server/routes/checkout.js', checkoutSource);
  log.ok('server/routes/checkout.js gravado');

  // 4. Frontend UI (telas React integradas às rotas)
  const routesSummary = summarizeRoutes(crudSource, checkoutSource);
  const pages = await runLlmStep({
    id: 'frontend',
    label: 'Etapa 4 (Frontend UI)',
    prompt: promptBuilder.buildFrontendPrompt({ idea, features, routesSummary }),
    context: { idea, features, routesSummary },
    extract: (raw) => {
      const files = extractFiles(raw).filter((f) => f.path.startsWith('client/src/pages/'));
      const names = files.map((f) => path.basename(f.path));
      for (const required of ['Login.jsx', 'Dashboard.jsx', 'Settings.jsx']) {
        if (!names.includes(required)) throw new Error(`faltou a página ${required}`);
      }
      return files;
    },
  });
  for (const file of pages) {
    fileWriter.writeProjectFile(projectDir, file.path, file.content);
    log.ok(`${file.path} gravado`);
  }

  // 5. git init + npm install automatizado
  log.step('install', 'running');
  try {
    await runCommand('git', ['init', '-q'], projectDir, 'git init');
    await runCommand('git', ['add', '-A'], projectDir, 'git add');
    await runCommand(
      'git',
      ['-c', 'user.name=SaaS-Forge', '-c', 'user.email=forge@local', 'commit', '-q', '-m', 'SaaS inicial gerado pelo SaaS-Forge'],
      projectDir,
      'git commit'
    );
    log.ok('Repositório git inicializado');
  } catch (err) {
    log.warn(`git indisponível (${err.message}) — seguindo sem repositório`);
  }

  if (AUTO_INSTALL) {
    log.info('Rodando npm install no projeto gerado (pode levar alguns minutos)…');
    await runCommand('npm', ['install', '--no-fund', '--no-audit'], projectDir, 'npm install');
    log.ok('Dependências instaladas');
  } else {
    log.warn('FORGE_AUTO_INSTALL=false — rode "npm install" manualmente no projeto');
  }
  log.step('install', 'done');

  return { projectDir, slug };
}

/** Resume as rotas geradas para alimentar o prompt do frontend. */
function summarizeRoutes(crudSource, checkoutSource) {
  const routeRe = /router\.(get|post|put|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  const lines = [];
  for (const [source, prefix] of [[crudSource, '/api'], [checkoutSource, '/api/billing']]) {
    let match;
    while ((match = routeRe.exec(source)) !== null) {
      lines.push(`- ${match[1].toUpperCase()} ${prefix}${match[2]}`);
    }
    routeRe.lastIndex = 0;
  }
  return lines.join('\n') || '- (nenhuma rota detectada)';
}

// ─── API do painel ───────────────────────────────────────────────────────────

app.post('/api/forge', (req, res) => {
  const idea = String((req.body && req.body.idea) || '').trim();
  const features = (req.body && req.body.features) || {};
  if (idea.length < 10) {
    return res.status(400).json({ error: 'Descreva a ideia com pelo menos 10 caracteres.' });
  }
  if (pipelineRunning) {
    return res.status(409).json({ error: 'A esteira já está em execução. Aguarde terminar.' });
  }

  pipelineRunning = true;
  res.status(202).json({ started: true });

  forgePipeline({ idea, features })
    .then(({ slug }) => {
      log.ok(`✅ SaaS pronto! Abra output/${slug} e rode: npm run dev`);
      broadcast({ type: 'done', slug, ts: Date.now() });
    })
    .catch((err) => {
      log.error(`Esteira abortada: ${err.message}`);
      broadcast({ type: 'error', message: err.message, ts: Date.now() });
    })
    .finally(() => {
      pipelineRunning = false;
    });
});

app.get('/api/status', (req, res) => {
  res.json({ running: pipelineRunning, provider: llmService.resolveProvider() });
});

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      type: 'log',
      level: 'info',
      text: `Conectado ao SaaS-Forge (provedor: ${llmService.resolveProvider()})`,
      ts: Date.now(),
    })
  );
});

server.listen(PORT, () => {
  console.log(`SaaS-Forge no ar: http://localhost:${PORT} (provedor: ${llmService.resolveProvider()})`);
});
