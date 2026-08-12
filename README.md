# Automação de Tutorias

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Playwright-1.44-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" />
  <img src="https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/Google%20Sheets-integrado-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" />
  <img src="https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
</p>

> Agente de automação para cadastro semanal de atividades de tutoria no AVA da UniCatólica — preenche datas, horários e atividades automaticamente no sistema, sem precisar acessar o formulário manualmente toda semana. Inclui bot do Telegram para adicionar atividades extras direto pelo celular.

---

## Índice

- [Sobre](#-sobre)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura](#-arquitetura)
- [Tecnologias](#-tecnologias)
- [Como rodar](#-como-rodar)
- [Configuração](#-configuração)
- [Atividades via Google Sheets](#-atividades-via-google-sheets)
- [Variáveis de ambiente](#️-variáveis-de-ambiente)
- [Modo teste](#-modo-teste)
- [Bot do Telegram](#-bot-do-telegram)

---

## Sobre

Como mediador na **UniCatólica**, preciso cadastrar minhas atividades de tutoria semanalmente no sistema AVA — um formulário que exige data, horário inicial, horário final e cada atividade realizada adicionada individualmente. Com disciplinas distribuídas de segunda a sábado, isso representa dezenas de cadastros repetitivos por ciclo.

O **tutoring-record** automatiza esse processo: basta definir o período no `tutorias.json` e manter as atividades de cada dia em uma planilha no Google Sheets. O bot faz login, busca as atividades atualizadas e preenche todos os formulários automaticamente.

---

## Funcionalidades

- 🤖 Automação completa do formulário de cadastro de tutorias
- 🔐 Login manual no Moodle — sem armazenar senha em código
- 💾 Sessão persistente — após o primeiro login, reutiliza os cookies automaticamente
- 📅 Cálculo automático de datas semanais entre `dataInicial` e `dataFinal`
- 📊 Atividades gerenciadas em planilha Google Sheets — sem precisar de commit para atualizar
- ✅ Verificação de duplicidade antes de cadastrar
- 🧪 Modo teste — preenche tudo mas não envia, para conferência prévia
- 📸 Screenshot automático em caso de erro
- 📋 Log detalhado de cada cadastro (sucesso, pulado ou erro)
- 📊 Resumo final com totais

---

## Arquitetura

```
┌─────────────────────────────────────────────┐
│   Google Sheets (opcional)  /  tutorias.json│
│   atividades por dia da semana              │
└─────────────────────┬───────────────────────┘
                      │ carregarConfig()
┌─────────────────────▼───────────────────────┐
│             configLoader.js                 │
│  valida os dados e expande as datas         │
└─────────────────────┬───────────────────────┘
                      │ calcularDatas()
┌─────────────────────▼───────────────────────┐
│              dateUtils.js                   │
│  gera ocorrências semanais entre as datas   │
└─────────────────────┬───────────────────────┘
                      │ lista de tutorias
┌─────────────────────▼───────────────────────┐
│              tutoriaBot.js                  │
│  Playwright — abre o navegador, faz login   │
│  manual e preenche cada formulário          │
└─────────────────────┬───────────────────────┘
                      │ resultado
┌─────────────────────▼───────────────────────┐
│               logger.js                    │
│  logs em arquivo + screenshots de erro     │
└─────────────────────────────────────────────┘
```

**Fluxo de execução:**
1. Configuração é carregada (do JSON ou do Google Sheets)
2. Datas semanais são calculadas para cada dia configurado
3. Navegador abre na página de login do Moodle
4. Usuário faz login manualmente e pressiona ENTER
5. Bot navega automaticamente para o sistema de tutorias
6. Para cada tutoria: verifica duplicidade → preenche formulário → cadastra
7. Log e resumo final são exibidos no terminal

### Estrutura de pastas

```
tutoring-record/
├── config/
│   └── tutorias.json          # período, URLs e configurações gerais
├── src/
│   ├── main.js                # ponto de entrada
│   ├── configLoader.js        # leitura e validação da configuração
│   ├── sheetsLoader.js        # busca atividades do Google Sheets
│   ├── dateUtils.js           # cálculo de datas semanais
│   ├── tutoriaBot.js          # automação com Playwright
│   └── logger.js              # logs e screenshots
├── apps-script/
│   └── Code.gs                # Google Apps Script (Sheets + Telegram Bot)
├── cloudflare-worker/
│   └── worker.js              # relay para webhook do Telegram
├── logs/
│   ├── execucao.log           # histórico gerado automaticamente
│   └── screenshots/           # capturas em caso de erro
├── .env.example
└── package.json
```

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| Node.js | Runtime principal |
| Playwright | Automação do navegador |
| dotenv | Variáveis de ambiente |
| Google Sheets + Apps Script | Gerenciamento das atividades |
| Telegram Bot API | Cadastro de extras pelo celular |
| Cloudflare Workers | Relay para webhook do Telegram |

---

## Como rodar

### Pré-requisitos

- Node.js 18+
- Acesso ao AVA da UniCatólica como mediador

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/dholand4/tutoring-record.git

# Entrar na pasta do projeto
cd tutoring-record

# Instalar as dependências
npm install

# Instalar o navegador do Playwright
npx playwright install chromium
```

### Executar

```bash
npm start
```

### Agendamento automático

O bot roda sozinho por dois caminhos, ambos com o mesmo horário (Seg/Sex 18:50, Ter/Qua/Qui 17:20, Sáb 11:50 — sempre 10 minutos antes do fim do expediente):

| Onde | Arquivo | Quando usar |
|---|---|---|
| GitHub Actions | [`.github/workflows/tutorias.yml`](.github/workflows/tutorias.yml) | Sem infraestrutura própria |
| VPS com Docker | [`crontab`](crontab) + [`docker-compose.yml`](docker-compose.yml) | Quando quiser controle total e sem custo de minutos |

Para subir na VPS:

```bash
docker compose up -d --build
```

```bash
# acompanhar as execuções
docker compose logs -f
tail -f logs/cron.log
```

O container só executa nos horários agendados. Para disparar uma execução na hora de subir (teste do setup), use `RUN_ON_START=true docker compose up -d`.

> **GitHub Actions não iniciou o job?** Se aparecer *"The job was not started because recent account payments have failed or your spending limit needs to be increased"*, o problema é de cobrança da conta, não do código — em repositório **privado** cada execução consome minutos pagos. Como este repositório é **público**, os runners padrão são gratuitos e o bloqueio não se aplica; se voltar a acontecer, é sinal de que a visibilidade mudou. Nesse caso, regularize em **Settings → Billing & plans** ou deixe a VPS como agendador principal.

> **Repositório público — dois cuidados com o Actions:**
> - Os **artefatos de execução são baixáveis por qualquer pessoa**. Por isso o workflow sobe apenas `logs/*.log` em caso de falha — nunca `logs/session.json` (cookies autenticados do AVA), screenshots ou os dumps HTML de diagnóstico.
> - Workflows agendados são **desativados automaticamente após 60 dias sem atividade** no repositório. O GitHub avisa por e-mail e basta reativar em **Actions**; a VPS não sofre disso.

---

## Configuração

Edite `config/tutorias.json` com as configurações gerais do bot. Como as atividades, horários e dias são gerenciados pela planilha Google Sheets, o JSON só precisa dos campos abaixo:

```json
{
  "urlMoodle": "https://ava.unicatolicaquixada.edu.br/portal3/login/index.php",
  "url": "https://ava.unicatolicaquixada.edu.br/webapp/sistutoria/view/tutorias.php",
  "modoTeste": false,
  "modoHoje": true,
  "dataInicial": "2026-05-13",
  "dataFinal": "2026-07-30",
  "pularSeJaExistir": true,
  "tempoEntreCadastrosMs": 1500,
  "tutor": "SEU NOME"
}
```

> O campo `registros` no JSON é ignorado quando `ATIVIDADES_URL` está configurado no `.env` — todo o conteúdo (dias, horários e atividades) vem da planilha.

| Campo | Descrição |
|---|---|
| `modoTeste` | `true` preenche mas não envia — use para conferir antes |
| `modoHoje` | `true` processa apenas o dia atual |
| `dataInicial` | Início do período a preencher (`YYYY-MM-DD`) |
| `dataFinal` | Fim do período a preencher (o bot nunca ultrapassa hoje) |
| `pularSeJaExistir` | Ignora datas que já constam na tabela do AVA |
| `tempoEntreCadastrosMs` | Pausa em ms entre cada cadastro |

---

## Atividades via Google Sheets

As atividades de cada dia da semana podem ser gerenciadas em uma planilha no Google Sheets. Assim, para alterar qualquer atividade, basta editar a planilha — sem precisar mexer no código ou fazer commit.

### 1. Criar a planilha

Crie uma planilha no Google Sheets com **uma aba para cada dia da semana**, nomeadas exatamente assim:

```
Segunda  |  Terça  |  Quarta  |  Quinta  |  Sexta  |  Sabado
```

Em cada aba, preencha seguindo este layout:

| | A | B | C | D |
|---|---|---|---|---|
| **1** | Horário Inicial | 09:00 | Atividade fixa 1 | Atividade extra 1 |
| **2** | Horário Final | 17:30 | Atividade fixa 2 | Atividade extra 2 |
| **3** | Observação | *(opcional)* | Atividade fixa 3 | *(continua)* |
| **4** | | | *(continua)* | |

- **Coluna A**: rótulos (não alterar)
- **Coluna B**: valores de horário e observação
- **Coluna C**: atividades fixas do dia — sempre as mesmas toda semana
- **Coluna D**: atividades extras da semana — você adiciona conforme o dia vai passando

> **Todo domingo às 7h** o Apps Script limpa automaticamente a coluna D de todas as abas, zerando os extras e preparando a planilha para a nova semana. A coluna C nunca é tocada.

### 2. Criar o Apps Script

Na planilha, vá em **Extensões → Apps Script**, apague o conteúdo e cole o código abaixo. Salve.

O código completo do Apps Script (incluindo o bot do Telegram) está em [`apps-script/Code.gs`](apps-script/Code.gs). Copie todo o conteúdo e cole no editor do Apps Script.

### 3. Implantar como web app

1. Clique em **Implantar → Nova implantação**
2. Tipo: **App da Web**
3. Executar como: **Eu**
4. Quem tem acesso: **Qualquer pessoa**
5. Clique em **Implantar** e copie a URL gerada

### 4. Ativar o reset semanal automático

Ainda no Apps Script, selecione a função `criarTrigger` no menu e clique em **Executar**. Faça isso **uma única vez** — ele agenda o reset todo domingo às 7h automaticamente para sempre.

### 5. Configurar no projeto

Adicione a URL no arquivo `.env`:

```env
ATIVIDADES_URL=https://script.google.com/macros/s/SEU_ID/exec
```

Pronto. A partir daí toda execução busca as atividades diretamente da planilha.

> Para atualizar o Apps Script após edições, vá em **Implantar → Gerenciar implantações → editar (lápis) → Nova versão → Implantar**.

---

## ⚙️ Variáveis de ambiente

Crie um arquivo `.env` baseado no `.env.example`:

```env
MOODLE_USUARIO=sua_matricula
MOODLE_SENHA=sua_senha_moodle

# true = sem janela (para VPS/servidor) | false = abre navegador visível (para testar)
HEADLESS=false

# URL do Apps Script do Google Sheets (obrigatório — atividades, horários e dias vêm da planilha)
ATIVIDADES_URL=https://script.google.com/macros/s/SEU_ID/exec

# Período de execução: o bot não roda fora desse intervalo (útil para cron automático)
PERIODO_INICIO=2026-05-13
PERIODO_FIM=2026-07-30
```

| Variável | Descrição |
|---|---|
| `MOODLE_USUARIO` | Matrícula de acesso ao AVA |
| `MOODLE_SENHA` | Senha do AVA |
| `HEADLESS` | `true` para rodar sem abrir janela do navegador |
| `ATIVIDADES_URL` | URL do Apps Script — atividades, horários e dias da semana vêm da planilha |
| `PERIODO_INICIO` | O bot não executa antes dessa data — útil para cron automático |
| `PERIODO_FIM` | O bot não executa após essa data — útil para cron automático |

---

## Modo teste

Antes de cadastrar de verdade, sempre valide com o modo teste:

```bash
# 1. Verificar os dados e listar todas as datas (sem abrir o navegador)
npm run validate

# 2. Abrir o navegador, preencher tudo, mas NÃO clicar em Cadastrar
npm run test-run

# 3. Após confirmar que está tudo certo, cadastrar de verdade
npm start
```

> A sessão do Moodle é salva em `logs/session.json` após o primeiro login. Nas execuções seguintes o bot acessa o sistema direto, sem precisar fazer login novamente.

---

## Bot do Telegram

Adicione atividades extras (coluna D) direto pelo Telegram, sem abrir a planilha.

### Como funciona

1. Envie `/start` — o bot mostra botões com os dias da semana (Segunda a Sábado)
2. Escolha o dia — o bot confirma e mostra os extras já cadastrados
3. Envie mensagens de texto — cada uma é adicionada na coluna D do dia escolhido
4. Envie `/sair` — o bot finaliza e mostra o resumo dos extras do dia
5. Envie `/hoje` a qualquer momento para ver os extras do dia atual

### Arquitetura

```
Telegram  ──POST──▸  Cloudflare Worker  ──POST──▸  Google Apps Script
                     (retorna 200                   (processa e grava
                      imediatamente)                 na planilha)
```

O Google Apps Script retorna 302 (redirect) em webhooks, o que faz o Telegram reenviar a mesma mensagem infinitamente. O **Cloudflare Worker** resolve isso: recebe o POST, retorna 200 pro Telegram na hora e repassa a requisição pro Apps Script em background seguindo os redirects.

### Configuração

#### 1. Criar o bot no Telegram

1. Abra o Telegram e procure `@BotFather`
2. Envie `/newbot`
3. Escolha um nome (ex: "Registro Tutoria") e um username (ex: `tutoria_extras_bot`)
4. Salve o **token** retornado (formato: `123456789:ABCdefGhIjKlMnOpQrStUvWxYz`)

#### 2. Descobrir seu Chat ID

Procure `@userinfobot` no Telegram e envie `/start` — ele retorna seu ID numérico.

#### 3. Configurar Script Properties

No editor do Apps Script, vá em **Configurações do projeto** (engrenagem) e adicione:

| Propriedade | Valor |
|-------------|-------|
| `TELEGRAM_BOT_TOKEN` | Token do BotFather |
| `TELEGRAM_CHAT_ID` | Seu ID numérico do Telegram |

> O `TELEGRAM_CHAT_ID` garante que apenas você pode enviar comandos ao bot.

#### 4. Atualizar o Apps Script

Substitua o código do Apps Script pelo conteúdo completo de [`apps-script/Code.gs`](apps-script/Code.gs), que inclui o `doGet()` original + todas as funções do bot do Telegram. Faça novo deploy: **Implantar → Gerenciar implantações → lápis → Nova versão → Implantar**.

#### 5. Criar o Cloudflare Worker

1. Acesse [workers.cloudflare.com](https://workers.cloudflare.com) e crie uma conta gratuita
2. Clique em **Create a Worker** → **Start with Hello World!**
3. Dê um nome (ex: `telegram-relay`) e clique em **Deploy**
4. Clique em **Edit code**, substitua o conteúdo pelo código de [`cloudflare-worker/worker.js`](cloudflare-worker/worker.js)
5. Clique em **Deploy** novamente
6. Copie a URL gerada (formato: `https://telegram-relay.seu-user.workers.dev`)

> Se a URL da sua implantação do Apps Script mudar, atualize a constante `APPS_SCRIPT_URL` no código do Worker.

#### 6. Registrar o webhook

Abra no navegador (substituindo `URL_DO_WORKER` pela URL do passo anterior):

```
https://api.telegram.org/bot<SEU_TOKEN>/setWebhook?url=URL_DO_WORKER&drop_pending_updates=true
```

Deve retornar `{"ok":true}`. Faça isso **uma única vez**.

#### 7. Testar

Abra o Telegram, encontre seu bot, envie `/start`, escolha um dia e envie uma atividade. O bot confirma e você pode verificar na coluna D da planilha.

### Comandos do bot

| Comando | Ação |
|---------|------|
| `/start` | Mostra botões para escolher o dia da semana |
| `/sair` | Finaliza o dia e mostra resumo dos extras |
| `/hoje` | Lista os extras cadastrados no dia atual |
