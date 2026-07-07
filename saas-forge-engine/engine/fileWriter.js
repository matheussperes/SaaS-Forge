'use strict';

/**
 * Escrita em disco com o módulo 'fs' — sem placeholders.
 *
 * Responsabilidades:
 *  - Criar a pasta do projeto gerado dentro de output/ (isolada do orquestrador)
 *  - Copiar o boilerplate estático (engine/templates/project) com interpolação {{VAR}}
 *  - Gravar com segurança os arquivos extraídos das respostas da LLM
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const PROJECT_TEMPLATE_DIR = path.join(__dirname, 'templates', 'project');

/** Converte a ideia em um slug de diretório válido e único. */
function slugify(text) {
  const base = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'micro-saas';
  return base;
}

/** Resolve um caminho relativo dentro de uma base, bloqueando escapes (../). */
function safeJoin(baseDir, relPath) {
  const target = path.resolve(baseDir, relPath);
  const normalizedBase = path.resolve(baseDir) + path.sep;
  if (!target.startsWith(normalizedBase)) {
    throw new Error(`Caminho fora do diretório do projeto: ${relPath}`);
  }
  return target;
}

/** Cria (e retorna) o diretório do novo projeto em output/, sem colisões. */
function createProjectDir(idea) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const slug = slugify(idea);
  let dir = path.join(OUTPUT_DIR, slug);
  let attempt = 1;
  while (fs.existsSync(dir)) {
    attempt += 1;
    dir = path.join(OUTPUT_DIR, `${slug}-${attempt}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Interpola {{VAR}} em conteúdo textual. */
function interpolate(content, vars = {}) {
  return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md', '.sql',
  '.txt', '.env', '.yml', '.yaml', '.gitignore', '.example',
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath) || path.basename(filePath);
  return TEXT_EXTENSIONS.has(ext) || path.basename(filePath).startsWith('.');
}

/** Copia recursivamente um diretório de templates aplicando interpolação. */
function copyTemplateDir(srcDir, destDir, vars = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTemplateDir(srcPath, destPath, vars);
    } else if (isTextFile(srcPath)) {
      const content = fs.readFileSync(srcPath, 'utf8');
      fs.writeFileSync(destPath, interpolate(content, vars), 'utf8');
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Aplica o boilerplate estático do projeto gerado. */
function scaffoldProject(projectDir, vars = {}) {
  copyTemplateDir(PROJECT_TEMPLATE_DIR, projectDir, vars);
}

/** Grava um arquivo (relativo à raiz do projeto), criando pastas intermediárias. */
function writeProjectFile(projectDir, relPath, content) {
  const target = safeJoin(projectDir, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

/** Lê um arquivo do projeto gerado (para reencadear contexto entre etapas). */
function readProjectFile(projectDir, relPath) {
  return fs.readFileSync(safeJoin(projectDir, relPath), 'utf8');
}

/** Lê um arquivo de template do engine (ex.: stripe.config.js para o prompt). */
function readTemplateFile(relPath) {
  return fs.readFileSync(safeJoin(PROJECT_TEMPLATE_DIR, relPath), 'utf8');
}

module.exports = {
  OUTPUT_DIR,
  slugify,
  safeJoin,
  createProjectDir,
  scaffoldProject,
  writeProjectFile,
  readProjectFile,
  readTemplateFile,
};
