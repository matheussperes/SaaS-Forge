'use strict';

// Painel do SaaS-Forge — conexão WebSocket com o orquestrador e disparo da esteira.

const consoleEl = document.getElementById('console');
const statusEl = document.getElementById('status');
const forgeBtn = document.getElementById('forgeBtn');
const ideaEl = document.getElementById('idea');

let ws = null;

function appendLine(text, level = 'info') {
  const line = document.createElement('div');
  line.className = `line-${level}`;
  const ts = new Date().toLocaleTimeString('pt-BR');
  line.textContent = `[${ts}] ${text}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function setStep(id, status) {
  const el = document.querySelector(`.step[data-step="${id}"]`);
  if (el) el.dataset.status = status;
}

function resetSteps() {
  document.querySelectorAll('.step').forEach((el) => el.removeAttribute('data-status'));
}

function setRunning(running) {
  forgeBtn.disabled = running;
  statusEl.textContent = running ? 'esteira em execução…' : 'pronto';
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.addEventListener('open', () => {
    statusEl.textContent = 'pronto';
  });

  ws.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    switch (payload.type) {
      case 'log':
        appendLine(payload.text, payload.level);
        break;
      case 'step':
        setStep(payload.id, payload.status);
        break;
      case 'done':
        appendLine(`Projeto disponível em output/${payload.slug}`, 'ok');
        setRunning(false);
        break;
      case 'error':
        setRunning(false);
        break;
      default:
        break;
    }
  });

  ws.addEventListener('close', () => {
    statusEl.textContent = 'reconectando…';
    setTimeout(connect, 1500);
  });

  ws.addEventListener('error', () => ws.close());
}

async function forge() {
  const idea = ideaEl.value.trim();
  if (idea.length < 10) {
    appendLine('Descreva a ideia com pelo menos 10 caracteres.', 'warn');
    return;
  }

  resetSteps();
  setRunning(true);
  appendLine('Disparando a esteira de produção…');

  try {
    const response = await fetch('/api/forge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idea,
        features: {
          googleAuth: document.getElementById('featGoogleAuth').checked,
          adminDashboard: document.getElementById('featAdminDashboard').checked,
        },
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Erro ${response.status}`);
    }
  } catch (err) {
    appendLine(err.message, 'error');
    setRunning(false);
  }
}

forgeBtn.addEventListener('click', forge);
connect();
