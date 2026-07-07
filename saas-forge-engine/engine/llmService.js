'use strict';

/**
 * Conexão com a API da LLM usada para gerar o código.
 *
 * Provedores suportados (FORGE_LLM_PROVIDER):
 *  - anthropic : API da Anthropic via SDK oficial (@anthropic-ai/sdk)
 *  - local     : endpoint compatível com OpenAI (/v1/chat/completions) — Ollama, LM Studio…
 *  - mock      : templates determinísticos (sem rede), para validar a esteira
 *
 * Sem FORGE_LLM_PROVIDER definido: anthropic se houver ANTHROPIC_API_KEY,
 * senão local se houver FORGE_LLM_BASE_URL, senão mock.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { mockResponseFor } = require('./mockTemplates');

const MAX_OUTPUT_TOKENS = 32000;

function resolveProvider() {
  const explicit = (process.env.FORGE_LLM_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.FORGE_LLM_BASE_URL) return 'local';
  return 'mock';
}

let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

async function generateWithAnthropic({ system, user }) {
  const model = process.env.FORGE_LLM_MODEL || 'claude-opus-4-8';
  const client = getAnthropicClient();
  // Streaming: gerações de código podem ser longas; evita timeouts HTTP.
  const stream = client.messages.stream({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('A LLM recusou a solicitação (stop_reason: refusal).');
  }
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  if (!text.trim()) throw new Error('Resposta vazia da LLM.');
  return text;
}

async function generateWithLocal({ system, user }) {
  const baseUrl = (process.env.FORGE_LLM_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.FORGE_LLM_LOCAL_MODEL || 'qwen2.5-coder:14b';
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      stream: false,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LLM local respondeu ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text || !text.trim()) throw new Error('Resposta vazia da LLM local.');
  return text;
}

/**
 * Gera a resposta da LLM para uma etapa da esteira.
 * @param {object} params
 * @param {string} params.step    Identificador da etapa ('schema' | 'backend' | 'stripe' | 'frontend')
 * @param {string} params.system  Prompt de sistema
 * @param {string} params.user    Prompt do usuário (contexto encadeado)
 * @param {object} [params.context] Contexto extra usado pelo provedor mock
 * @returns {Promise<string>} texto bruto da resposta (a extração é feita pelo codeExtractor)
 */
async function generate({ step, system, user, context = {} }) {
  const provider = resolveProvider();
  switch (provider) {
    case 'anthropic':
      return generateWithAnthropic({ system, user });
    case 'local':
      return generateWithLocal({ system, user });
    case 'mock':
      return mockResponseFor(step, context);
    default:
      throw new Error(`Provedor de LLM desconhecido: ${provider}`);
  }
}

module.exports = { generate, resolveProvider };
