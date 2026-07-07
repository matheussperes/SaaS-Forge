'use strict';

/**
 * Extração estrita de código das respostas da LLM (prevenção de alucinação).
 *
 * Protocolo de saída exigido nos prompts (ver promptBuilder.js):
 *
 *   <<<FILE: caminho/relativo/arquivo.ext>>>
 *   ```linguagem
 *   ...código...
 *   ```
 *
 * Tudo que estiver fora desses blocos (explicações, "Aqui está o código...",
 * comentários soltos) é descartado.
 */

// Bloco nomeado: marcador <<<FILE: ...>>> seguido de cerca de código.
const FILE_BLOCK_RE = /<<<FILE:\s*([^\n>]+?)\s*>>>\s*```[a-zA-Z0-9_+#.-]*\r?\n([\s\S]*?)```/g;

// Qualquer cerca de código (fallback para etapas de arquivo único).
const ANY_CODE_BLOCK_RE = /```[a-zA-Z0-9_+#.-]*\r?\n([\s\S]*?)```/g;

/**
 * Normaliza um caminho vindo da LLM: barras, sem "./", sem "..".
 * Retorna null se o caminho for inseguro.
 */
function sanitizeRelPath(rawPath) {
  const p = String(rawPath).trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const segments = p.split('/');
  if (segments.some((s) => s === '..' || s === '')) return null;
  return segments.join('/');
}

/**
 * Extrai todos os blocos nomeados `<<<FILE: ...>>>` da resposta.
 * @returns {Array<{path: string, content: string}>}
 */
function extractFiles(responseText) {
  const files = [];
  let match;
  FILE_BLOCK_RE.lastIndex = 0;
  while ((match = FILE_BLOCK_RE.exec(String(responseText))) !== null) {
    const relPath = sanitizeRelPath(match[1]);
    if (!relPath) continue;
    files.push({ path: relPath, content: ensureTrailingNewline(match[2]) });
  }
  return files;
}

/**
 * Extrai um único arquivo. Aceita o protocolo nomeado; se ausente, cai para
 * a primeira cerca de código da resposta (ignorando texto explicativo).
 * @returns {string|null} conteúdo do código, ou null se nada foi encontrado
 */
function extractSingleCode(responseText, expectedPath) {
  const named = extractFiles(responseText);
  if (named.length > 0) {
    if (expectedPath) {
      const exact = named.find((f) => f.path === expectedPath);
      if (exact) return exact.content;
    }
    return named[0].content;
  }
  ANY_CODE_BLOCK_RE.lastIndex = 0;
  const match = ANY_CODE_BLOCK_RE.exec(String(responseText));
  return match ? ensureTrailingNewline(match[1]) : null;
}

function ensureTrailingNewline(code) {
  const c = String(code);
  return c.endsWith('\n') ? c : `${c}\n`;
}

module.exports = { extractFiles, extractSingleCode, sanitizeRelPath };
