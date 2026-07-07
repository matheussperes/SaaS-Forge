# 📖 Manual de Uso — SaaS-Forge

Guia completo para instalar, configurar e operar o **SaaS-Forge**, a fábrica
autônoma de Micro-SaaS, e para rodar os projetos que ela gera.

---

## 1. Requisitos

| Item | Versão mínima | Observação |
|------|---------------|------------|
| Node.js | 18+ (recomendado 22) | inclui o `npm` |
| Git | qualquer recente | usado para inicializar o repositório dos projetos gerados |
| Chave de LLM | opcional | sem chave, o sistema roda em modo `mock` (ver §3) |

O SaaS-Forge é um **aplicativo de execução local**: roda na sua máquina (ou em
qualquer servidor Node persistente), não em plataformas serverless.

---

## 2. Instalação

```bash
git clone https://github.com/matheussperes/SaaS-Forge.git
cd SaaS-Forge/saas-forge-engine
npm install
```

---

## 3. Configuração (provedor de LLM)

Copie o exemplo de ambiente e edite conforme o seu caso:

```bash
cp .env.example .env
```

O SaaS-Forge lê as variáveis do ambiente do processo. Se você usa `.env`,
carregue-o ao iniciar (ex.: `node --env-file=.env server.js`) ou exporte as
variáveis no shell.

### Modos de operação (`FORGE_LLM_PROVIDER`)

| Modo | Quando usar | Variáveis necessárias |
|------|-------------|------------------------|
| `anthropic` | Geração real com a API da Anthropic (recomendado) | `ANTHROPIC_API_KEY`; opcional `FORGE_LLM_MODEL` (padrão `claude-opus-4-8`) |
| `local` | LLM rodando na sua máquina (Ollama, LM Studio…) | `FORGE_LLM_BASE_URL` (ex.: `http://localhost:11434`); opcional `FORGE_LLM_LOCAL_MODEL` |
| `mock` | Testar a esteira sem chave e sem rede | nenhuma |

Se `FORGE_LLM_PROVIDER` não for definido, a escolha é automática:
`anthropic` se houver `ANTHROPIC_API_KEY` → senão `local` se houver
`FORGE_LLM_BASE_URL` → senão `mock`.

### Outras variáveis

| Variável | Padrão | Efeito |
|----------|--------|--------|
| `FORGE_PORT` | `4600` | Porta do painel do orquestrador |
| `FORGE_STEP_RETRIES` | `2` | Tentativas extras por etapa antes de abortar |
| `FORGE_AUTO_INSTALL` | `true` | Roda `npm install` automaticamente no projeto gerado |

### Exemplos rápidos

```bash
# Com Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
npm start

# Com Ollama local
export FORGE_LLM_PROVIDER=local
export FORGE_LLM_BASE_URL=http://localhost:11434
export FORGE_LLM_LOCAL_MODEL=qwen2.5-coder:14b
npm start

# Sem nada (validação da esteira)
npm run forge:mock
```

---

## 4. Usando o painel

1. Inicie o orquestrador: `npm start` (dentro de `saas-forge-engine/`).
2. Abra **http://localhost:4600** no navegador.
3. O painel tem quatro áreas:

| Área | Função |
|------|--------|
| **Caixa de Visão** | Digite a ideia do SaaS em linguagem natural (mín. 10 caracteres). Ex.: *"App para agendar consultas de nutrição, com cadastro de pacientes e lembretes."* |
| **Toggles de Feature** | "Autenticação via Google" e "Dashboard Admin" — adicionam contexto aos prompts de todas as etapas |
| **Esteira de Produção** | 6 indicadores (Estrutura → Schema SQL → Backend CRUD → Stripe → Frontend → Install) que mudam de cor: amarelo = executando, verde = concluído, vermelho = falhou |
| **Console de Log** | Terminal em tempo real (WebSocket) mostrando cada etapa, tentativas de retry e a saída do `npm install` |

4. Clique em **🔥 Forjar SaaS**. A esteira roda sequencialmente:
   - **Etapa 0** — cria a pasta em `output/` e aplica o boilerplate estático
     (Express, SQLite, config Stripe validada, React/Vite);
   - **Etapa 1** — a LLM gera o `schema.sql` (SQLite, `CREATE TABLE IF NOT EXISTS`);
   - **Etapa 2** — recebe o schema e gera as rotas CRUD (`server/routes/crud.js`);
   - **Etapa 3** — recebe a config estática do Stripe e gera a rota de checkout
     de assinatura (`server/routes/checkout.js`);
   - **Etapa 4** — recebe o resumo das rotas geradas e cria as telas React
     (`Login.jsx`, `Dashboard.jsx`, `Settings.jsx`);
   - **Finalização** — `git init` + commit inicial + `npm install` automatizado.

5. Ao final, o console mostra:
   `✅ SaaS pronto! Abra output/<nome-do-projeto> e rode: npm run dev`

**Notas de operação**
- Cada etapa tem retry automático (`FORGE_STEP_RETRIES`); se todas as
  tentativas falharem, a esteira aborta e o erro fica registrado no console.
- Só uma esteira roda por vez (novo disparo durante execução retorna aviso).
- Cada disparo cria uma pasta nova — ideias repetidas ganham sufixo (`-2`, `-3`…).
- A extração do código das respostas da LLM é feita por regex estrita: textos
  explicativos do modelo são descartados, só os blocos de arquivo são gravados.

---

## 5. Rodando o Micro-SaaS gerado

```bash
cd saas-forge-engine/output/<nome-do-projeto>
npm install       # já foi feito pela esteira se FORGE_AUTO_INSTALL=true
npm run dev
```

Isso sobe os dois processos juntos (via `concurrently`):

| Serviço | URL | Stack |
|---------|-----|-------|
| API | http://localhost:5050/api/health | Express + SQLite (better-sqlite3) |
| App | http://localhost:5173 | React + Vite (proxy `/api` → 5050) |

Estrutura do projeto gerado:

```
├── schema.sql            # Schema (reaplicado a cada boot — IF NOT EXISTS)
├── data.sqlite           # Banco (criado no primeiro boot)
├── server/
│   ├── index.js          # Bootstrap estático (porta 5050)
│   ├── db.js             # Conexão SQLite + aplicação do schema
│   ├── stripe.config.js  # Config de pagamento (estática, validada)
│   └── routes/           # crud.js e checkout.js (gerados pela LLM)
└── client/
    └── src/pages/        # Login, Dashboard, Settings (gerados pela LLM)
```

O projeto nasce com repositório git próprio (commit
*"SaaS inicial gerado pelo SaaS-Forge"*) — pronto para você criar um remoto e
evoluir de forma independente do gerador.

### Ativando pagamentos reais (Stripe)

Sem chave, o checkout roda em **modo simulado** (retorna a URL de sucesso com
`mock: true`) para o fluxo poder ser validado. Para ativar de verdade:

1. Crie uma conta em https://dashboard.stripe.com e copie a **Secret key**
   (test mode: `sk_test_...`).
2. No projeto gerado: `cp .env.example .env` e preencha
   `STRIPE_SECRET_KEY=sk_test_...`.
3. Reinicie com `npm run dev` carregando o `.env`
   (ex.: `node --env-file=.env server/index.js` ou exporte a variável).
4. O botão **Assinar** na tela de Configurações passa a abrir o Stripe Checkout
   real (assinatura mensal — valor/moeda em `server/stripe.config.js`, campo
   `PRICING`).

---

## 6. Portas e isolamento

| Porta | Quem usa |
|-------|----------|
| **4600** | Painel do orquestrador (SaaS-Forge) |
| **5050** | API do projeto gerado |
| **5173** | Frontend (Vite) do projeto gerado |

O gerador e os projetos gerados nunca disputam porta — você pode manter o
painel aberto enquanto testa um SaaS recém-forjado. Os projetos em `output/`
não são versionados no repositório do gerador (estão no `.gitignore`).

---

## 7. Solução de problemas

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Console mostra `Provedor de LLM: mock` mas você queria a API real | `ANTHROPIC_API_KEY` não chegou ao processo | Exporte a variável no mesmo shell do `npm start` (ou use `node --env-file=.env server.js`) |
| `Etapa X: falha na tentativa…` repetidas vezes | Resposta da LLM sem bloco de código válido, ou API fora do ar | A esteira tenta de novo sozinha; se abortar, dispare novamente. Modelos locais pequenos erram mais o protocolo — prefira um modelo de código 14B+ ou o modo `anthropic` |
| `npm install` do projeto gerado falha em `better-sqlite3` | Plataforma sem binário pré-compilado | Instale build tools (`python3`, `make`, `g++` / Build Tools no Windows) e rode `npm install` de novo na pasta do projeto |
| Painel diz "reconectando…" | Orquestrador caiu ou reiniciou | Verifique o terminal do `npm start`; o painel reconecta sozinho quando o servidor voltar |
| `A esteira já está em execução` | Duplo clique / execução anterior ainda rodando | Aguarde o `done`/`error` no console |
| Porta 4600/5050/5173 ocupada | Outro processo usando a porta | Ajuste `FORGE_PORT` (painel) ou `PORT` no `.env` do projeto gerado |
| Checkout retorna `mock: true` | `STRIPE_SECRET_KEY` ausente | Configure a chave (ver §5) |

---

## 8. Limites conhecidos (v1.0)

- **Autenticação dos projetos gerados é stub**: o login salva o e-mail em
  `localStorage`; a tabela `users` existe no schema, mas o backend ainda não
  valida credenciais. O toggle "Autenticação via Google" gera os campos e o
  botão como TODO.
- **Uma esteira por vez** — sem fila de geração paralela.
- **Sem webhook do Stripe** — o checkout cria a sessão de assinatura, mas a
  confirmação de pagamento (atualizar `subscriptions`) precisa ser implementada
  no projeto gerado.
- **Execução local/servidor persistente** — não compatível com deploy
  serverless (Vercel/Netlify) sem re-arquitetura (WebSocket, escrita em disco e
  processos longos).
