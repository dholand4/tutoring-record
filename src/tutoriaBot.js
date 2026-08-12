const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { chromium } = require('playwright');
const logger = require('./logger');

const SESSION_FILE = path.join(__dirname, '..', 'logs', 'session.json');

// ─── Seletores candidatos ────────────────────────────────────────────────────

// Botão "+ Novo cadastro" na tela de listagem
const SELETORES_NOVO_CADASTRO = [
  'a:has-text("Novo cadastro")',
  'button:has-text("Novo cadastro")',
  '[class*="btn"]:has-text("Novo cadastro")',
  ':text("Novo cadastro")',
  'text=Novo cadastro',
];

// Confirmação de que estamos na tela do formulário
const SELETORES_FORM_TUTORIA = [
  ':text("Cadastrar tutoria")',
  'h1:has-text("tutoria")',
  'h2:has-text("tutoria")',
  'input[type="date"]',   // fallback: se o campo data aparecer, o form carregou
];

// Botão "+" para adicionar atividade — usa ícone Font Awesome, não texto
// Ordem: mais específico → mais genérico
const SELETORES_BTN_ADICIONAR = [
  'button:has(i[class*="fa-plus"])',
  'button:has(i[class*="plus"])',
  'button.btn-warning:has(i)',         // botão laranja com ícone (o "+" no sistema)
  'button.btn-success:has(i)',
  'button:has-text("+")',              // fallback: se usar texto mesmo
];

// Botão "Cadastrar" no final do formulário
const SELETORES_BTN_CADASTRAR = [
  'button:has-text("Cadastrar")',
  'input[value="Cadastrar"]',
  'button[type="submit"]',
];

// Botão "Voltar"
const SELETORES_BTN_VOLTAR = [
  'a:has-text("Voltar")',
  'button:has-text("Voltar")',
  ':text("Voltar")',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Há alguém no terminal para responder a um prompt?
 * Falso no GitHub Actions, no cron do container e em qualquer stdin redirecionado.
 */
function ambienteInterativo() {
  if (process.env.CI) return false;
  return Boolean(process.stdin.isTTY);
}

/** Aguarda o usuário pressionar ENTER no terminal. */
function aguardarEnter(mensagem) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(mensagem, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Tenta encontrar e retornar o primeiro locator visível dentre uma lista de seletores.
 * Retorna null se nenhum for encontrado.
 */
async function encontrarVisivel(page, seletores, timeout = 3000) {
  for (const sel of seletores) {
    try {
      const loc = page.locator(sel).first();
      const visivel = await loc.isVisible({ timeout });
      if (visivel) return loc;
    } catch (_) {}
  }
  return null;
}

/** Verifica se a tela de listagem está aberta (botão Novo cadastro visível). */
async function estaNaTelaListagem(page, timeout = 4000) {
  const loc = await encontrarVisivel(page, SELETORES_NOVO_CADASTRO, timeout);
  return loc !== null;
}

/**
 * Clica no botão "Novo cadastro" usando os seletores candidatos.
 * Lança erro se nenhum funcionar.
 */
async function clicarNovoCadastro(page) {
  const loc = await encontrarVisivel(page, SELETORES_NOVO_CADASTRO, 8000);
  if (!loc) throw new Error('Botão "Novo cadastro" não encontrado. Verifique se está na tela de listagem.');
  await loc.click();
}

/**
 * Aguarda a tela do formulário de cadastro aparecer.
 */
async function aguardarFormulario(page) {
  const loc = await encontrarVisivel(page, SELETORES_FORM_TUTORIA, 10000);
  if (!loc) {
    // Fallback: aguarda qualquer input de data aparecer — sinal de que o form carregou
    await page.waitForSelector('input[type="date"]', { timeout: 10000 });
  }
}

/**
 * Tenta preencher um campo de data/hora com três estratégias progressivas.
 */
async function preencherCampoDataHora(page, locator, valor) {
  // Estratégia 1: fill direto
  try {
    await locator.click({ timeout: 3000 });
    await locator.fill(valor);
    const val = await locator.inputValue();
    if (val && val.replace(/\D/g, '') === valor.replace(/\D/g, '')) return true;
  } catch (_) {}

  // Estratégia 2: triple-click + type
  try {
    await locator.click({ clickCount: 3 });
    await page.keyboard.type(valor, { delay: 80 });
    const val = await locator.inputValue();
    if (val && val.replace(/\D/g, '') === valor.replace(/\D/g, '')) return true;
  } catch (_) {}

  // Estratégia 3: definir via JavaScript
  try {
    const elHandle = await locator.elementHandle();
    await page.evaluate(({ el, val }) => {
      const nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nv.set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { el: elHandle, val: valor });
    return true;
  } catch (_) {}

  return false;
}

/** Verifica na tabela de listagem se já existe o registro com data e horário. */
async function jaExiste(page, data, horarioInicial, horarioFinal) {
  try {
    const horario = `${horarioInicial} - ${horarioFinal}`;
    const linhas = await page.locator('table tbody tr').all();
    for (const linha of linhas) {
      const texto = await linha.textContent();
      if (texto.includes(data) && texto.includes(horario)) return true;
    }
  } catch (_) {}
  return false;
}

/** Converte "DD/MM/YYYY" → "YYYY-MM-DD" para input[type=date]. */
function dataParaInputDate(data) {
  const [d, m, y] = data.split('/');
  return `${y}-${m}-${d}`;
}

// ─── Classe principal ─────────────────────────────────────────────────────────

class TutoriaBot {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async iniciar() {
    const storageState = fs.existsSync(SESSION_FILE) ? SESSION_FILE : undefined;
    const headless = process.env.HEADLESS === 'true';

    this.browser = await chromium.launch({ headless, slowMo: headless ? 0 : 50 });
    this.context = await this.browser.newContext({
      storageState,
      locale: 'pt-BR',
    });
    this.page = await this.context.newPage();

    if (storageState) {
      logger.info('Sessão anterior carregada.');
    } else {
      logger.info('Nenhuma sessão salva. Será feito login completo.');
    }
  }

  async salvarSessao() {
    try {
      const dir = path.dirname(SESSION_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await this.context.storageState({ path: SESSION_FILE });
      logger.info('Sessão salva para próximas execuções.');
    } catch (_) {}
  }

  async fechar() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Navegador fechado.');
    }
  }

  /**
   * Ponto de entrada do login.
   * 1. Tenta reutilizar sessão salva acessando tutorias.php diretamente.
   * 2. Se expirou: executa login completo (Moodle → verificação → tutorias).
   * 3. Se não há credenciais no .env: cai no fluxo manual (ENTER).
   */
  async garantirAcesso() {
    const urlSistema = this.config.url || process.env.SISTEMA_URL;
    if (!urlSistema) throw new Error('Configure "url" em tutorias.json.');

    // ── Tentativa 1: sessão ainda válida ──────────────────────────────────
    logger.info('Verificando sessão salva...');
    await this.page.goto(urlSistema, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    if (await estaNaTelaListagem(this.page, 5000)) {
      logger.info('Sessão válida — acesso direto ao sistema de tutorias.');
      return;
    }

    // ── Tentativa 2: login automático com credenciais do .env ─────────────
    const usuario = process.env.MOODLE_USUARIO;
    const senhaMoodle = process.env.MOODLE_SENHA;
    const senhaAva = process.env.AVA_SENHA || senhaMoodle;

    if (usuario && senhaMoodle) {
      await this._loginAutomatico(usuario, senhaMoodle, senhaAva);
      return;
    }

    // ── Tentativa 3: login manual (sem credenciais no .env) ───────────────
    // Só faz sentido com alguém na frente do terminal. Em CI/cron o prompt de
    // ENTER nunca é respondido e a execução ficaria pendurada até o timeout.
    if (!ambienteInterativo()) {
      const faltando = [
        !usuario && 'MOODLE_USUARIO',
        !senhaMoodle && 'MOODLE_SENHA',
      ].filter(Boolean).join(', ');
      throw new Error(
        `Credenciais ausentes (${faltando}) e ambiente não interativo — o login manual exige ENTER no terminal. ` +
        'No GitHub Actions configure os secrets em Settings → Secrets and variables → Actions; ' +
        'na VPS preencha o arquivo .env.'
      );
    }

    logger.info('Credenciais não encontradas no .env. Usando login manual...');
    await this._loginManual();
  }

  /**
   * Login 100% automático:
   *  1. Moodle (matrícula + senha do .env)
   *  2. Navega direto para user-verification.php
   *  3. Confirma senha do AVA
   *  4. Navega para tutorias.php e salva sessão
   */
  async _loginAutomatico(usuario, senhaMoodle, senhaAva) {
    const urlLogin   = this.config.urlMoodle || process.env.MOODLE_URL || 'https://ava.unicatolicaquixada.edu.br/portal3/login/index.php';
    const urlSistema = this.config.url;

    const userId = process.env.AVA_USER_ID;
    if (!userId) throw new Error('Configure AVA_USER_ID no arquivo .env.');
    const urlVerificacao = `https://ava.unicatolicaquixada.edu.br/webapp/sistutoria/user-verification.php?user=${userId}&course=382`;

    // ── Passo 1: login no Moodle ──────────────────────────────────────────
    logger.info('Passo 1/3 — Login no Moodle...');
    await this.page.goto(urlLogin, { waitUntil: 'networkidle', timeout: 15000 });

    // Moodle pode mostrar "já autenticado" se a sessão ainda estiver ativa
    const jaAutenticado = await this.page.$('#notice, [id="notice"]')
      .then(el => el ? el.innerText().catch(() => '') : '')
      .then(txt => txt.toLowerCase().includes('autenticado'));

    if (jaAutenticado) {
      logger.info('Sessão Moodle ainda ativa. Pulando login e indo direto para verificação AVA...');
    } else {
      // Formulário é renderizado por JS após networkidle — aguarda o campo aparecer no DOM
      await this.page.waitForSelector(
        '#username, input[name="username"], input[type="text"]',
        { timeout: 20000 }
      ).catch(() => {});

      const campoUsuario = await encontrarVisivel(this.page, [
        '#username', 'input[name="username"]', 'input[name="login"]',
        'input[id*="user"]', 'input[name*="user"]', 'input[type="text"]',
      ], 10000);
      if (!campoUsuario) {
        await this._salvarDiagnostico('login-campos');
        throw new Error('Campo de usuário não encontrado. Diagnóstico salvo em logs/diagnostico-login-campos.html');
      }
      await campoUsuario.fill(usuario);

      const campoSenha = await encontrarVisivel(this.page, [
        '#password', 'input[name="password"]', 'input[type="password"]',
      ], 5000);
      if (!campoSenha) throw new Error('Campo de senha do Moodle não encontrado.');
      await campoSenha.fill(senhaMoodle);

      const btnLogin = await encontrarVisivel(this.page, [
        '#loginbtn', 'button[type="submit"]', 'input[type="submit"]',
        'button:has-text("Entrar")', 'button:has-text("Acessar")',
      ], 5000);
      if (!btnLogin) throw new Error('Botão de login não encontrado.');
      await btnLogin.click();

      await this.page.waitForLoadState('networkidle', { timeout: 20000 });

      if (this.page.url().includes('login/index.php')) {
        throw new Error('Login no Moodle falhou — verifique MOODLE_USUARIO e MOODLE_SENHA no .env');
      }
      logger.info(`Login no Moodle OK. Página: ${this.page.url()}`);
    }

    // ── Passo 2: verificação de senha do AVA ─────────────────────────────
    logger.info('Passo 2/3 — Verificação de senha do AVA...');
    await this.page.goto(urlVerificacao, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const campoSenhaAva = await encontrarVisivel(this.page, [
      'input[type="password"]',
      'input:not([type="hidden"]):not([type="text"]):not([type="submit"])',
    ], 8000);
    if (!campoSenhaAva) {
      await this._salvarDiagnostico('verificacao-ava');
      throw new Error('Campo de senha AVA não encontrado. Diagnóstico salvo em logs/diagnostico-verificacao-ava.html');
    }
    await campoSenhaAva.fill(senhaAva);

    const btnEntrar = await encontrarVisivel(this.page, [
      'button:has-text("Entrar")',
      'input[type="submit"]',
      'button[type="submit"]',
    ], 5000);
    if (!btnEntrar) throw new Error('Botão "Entrar" não encontrado na tela de verificação.');
    await btnEntrar.click();

    await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    logger.info(`Verificação AVA OK. Página: ${this.page.url()}`);

    // ── Passo 3: acessar tutorias.php ────────────────────────────────────
    logger.info('Passo 3/3 — Acessando tutorias...');
    await this.page.goto(urlSistema, { waitUntil: 'networkidle', timeout: 15000 });

    if (!await estaNaTelaListagem(this.page, 6000)) {
      await this._salvarDiagnostico('pos-login-tutorias');
      throw new Error('Tela de tutorias não carregou após login. Diagnóstico salvo.');
    }

    await this.salvarSessao();
    logger.info('Login completo. Sessão salva.');
  }

  /** Login manual: abre o Moodle e aguarda o usuário pressionar ENTER. */
  async _loginManual() {
    const urlLogin  = this.config.urlMoodle || process.env.MOODLE_URL;
    const urlSistema = this.config.url || process.env.SISTEMA_URL;

    logger.info('Abrindo Moodle para login manual...');
    await this.page.goto(urlLogin, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});

    console.log('\n' + '═'.repeat(60));
    console.log('  AÇÃO NECESSÁRIA');
    console.log('═'.repeat(60));
    console.log('  1. Faça login no Moodle.');
    console.log('  2. Clique em "Registrar Atividades" e confirme a senha.');
    console.log('  3. Pressione ENTER aqui quando estiver no sistema.');
    console.log('═'.repeat(60) + '\n');

    await aguardarEnter('  Pressione ENTER após fazer login > ');

    await this.page.goto(urlSistema, { waitUntil: 'networkidle', timeout: 15000 });
    await this.page.waitForTimeout(1500);
    await this.salvarSessao();
  }

  /** Salva o HTML atual com um sufixo de contexto para diagnóstico. */
  async _salvarDiagnostico(sufixo = 'geral') {
    try {
      const dir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const html = await this.page.content();
      const urlAtual = this.page.url();
      const cabecalho = `<!-- URL: ${urlAtual} -->\n<!-- Contexto: ${sufixo} -->\n<!-- Gerado em: ${new Date().toISOString()} -->\n\n`;
      const arquivo = path.join(dir, `diagnostico-${sufixo}.html`);
      fs.writeFileSync(arquivo, cabecalho + html, 'utf8');
      logger.info(`Diagnóstico salvo: logs/diagnostico-${sufixo}.html`);
    } catch (_) {}
  }

  /**
   * Encontra o campo de atividade usando JavaScript diretamente no DOM.
   * Procura inputs que não são date/time/hidden e não são readonly/disabled.
   */
  async _encontrarCampoAtividade() {
    // Tentar via seletor CSS primeiro
    for (const sel of [
      'input[type="text"]:not([readonly]):not([disabled])',
      'input:not([type="date"]):not([type="time"]):not([type="hidden"]):not([readonly]):not([disabled])',
      'input:not([readonly]):not([disabled])',
    ]) {
      try {
        const loc = this.page.locator(sel).first();
        if (await loc.isVisible({ timeout: 2000 })) return loc;
      } catch (_) {}
    }

    // Fallback: JavaScript para inspecionar o DOM e retornar o handle
    try {
      const handle = await this.page.evaluateHandle(() => {
        const inputs = [...document.querySelectorAll('input')];
        return inputs.find(el => {
          const tipo = (el.type || '').toLowerCase();
          return !['date', 'time', 'hidden', 'checkbox', 'radio', 'submit', 'button'].includes(tipo)
            && !el.readOnly
            && !el.disabled
            && el.offsetParent !== null; // visível
        }) || null;
      });
      if (handle && (await handle.jsonValue()) !== null) {
        return this.page.locator(':root').locator(
          await handle.evaluate(el => {
            // Gerar um seletor único para esse elemento
            if (el.id) return `#${el.id}`;
            if (el.name) return `input[name="${el.name}"]`;
            return null;
          })
        ).first();
      }
    } catch (_) {}

    return null;
  }

  /**
   * Clica no botão "+" de adicionar atividade usando JavaScript diretamente.
   * Mais confiável quando o botão usa ícone Font Awesome sem texto visível.
   */
  async _clicarBotaoAdicionar() {
    // Tentar via seletores CSS primeiro
    const loc = await encontrarVisivel(this.page, SELETORES_BTN_ADICIONAR, 3000);
    if (loc) {
      await loc.click();
      return true;
    }

    // Fallback JavaScript: encontrar o primeiro botão que contenha ícone "plus" ou "add"
    const clicou = await this.page.evaluate(() => {
      const botoes = [...document.querySelectorAll('button')];
      for (const btn of botoes) {
        if (!btn.offsetParent) continue; // ignorar invisíveis
        const icons = [...btn.querySelectorAll('i, span')];
        const temPlus = icons.some(el =>
          el.className.toLowerCase().includes('plus') ||
          el.className.toLowerCase().includes('add') ||
          el.className.toLowerCase().includes('fa-plus')
        );
        const textoBruto = btn.textContent.trim();
        if (temPlus || textoBruto === '+') {
          btn.click();
          return true;
        }
      }
      // Último recurso: clicar no primeiro botão colorido (btn-warning, btn-success, etc.)
      // que esteja DENTRO da seção de atividades
      const secao = [...document.querySelectorAll('*')].find(el =>
        el.textContent.includes('Atividades realizadas') && el.children.length > 1
      );
      if (secao) {
        const btnSecao = secao.querySelector('button');
        if (btnSecao) { btnSecao.click(); return true; }
      }
      return false;
    });

    return clicou;
  }

  /** Navega para a tela de listagem de tutorias. */
  async navegarParaListagem() {
    const url = this.config.url || process.env.SISTEMA_URL;
    if (!url) return;
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    // Aguardar a tela carregar (sem lançar erro se não detectar — pode ser estrutura diferente)
    await estaNaTelaListagem(this.page, 10000);
  }

  async cadastrar(tutoria, modoTeste, pularSeJaExistir) {
    const { data, horarioInicial, horarioFinal, atividades, observacao } = tutoria;

    try {
      if (pularSeJaExistir) {
        const existe = await jaExiste(this.page, data, horarioInicial, horarioFinal);
        if (existe) {
          logger.pulado(data, 'registro já existe na tabela');
          return 'pulado';
        }
      }

      // Clicar em "Novo cadastro"
      await clicarNovoCadastro(this.page);
      await aguardarFormulario(this.page);

      // Preencher Data
      const campoData = this.page.locator('input[type="date"]').first();
      await preencherCampoDataHora(this.page, campoData, dataParaInputDate(data));

      // Preencher Horário Inicial
      const camposTime = this.page.locator('input[type="time"]');
      await preencherCampoDataHora(this.page, camposTime.nth(0), horarioInicial);

      // Preencher Horário Final
      if (horarioFinal) {
        await preencherCampoDataHora(this.page, camposTime.nth(1), horarioFinal);
      }

      // Preencher Atividades
      // Antes de começar, clicar em qualquer lugar neutro para tirar o foco do campo de horário
      await this.page.keyboard.press('Tab');
      await this.page.waitForTimeout(300);

      for (let i = 0; i < atividades.length; i++) {
        const totalAntes = await this._totalAtividades();

        // Localizar o campo Atividade via JS — mais confiável que seletores CSS
        const campoAtividade = await this._encontrarCampoAtividade();
        if (!campoAtividade) {
          await this._salvarDiagnostico('form-atividade');
          throw new Error(`Campo "Atividade" não encontrado (atividade ${i + 1}). Diagnóstico salvo.`);
        }

        // Focar, limpar e preencher
        await campoAtividade.click();
        await this.page.waitForTimeout(150);
        await this.page.keyboard.press('Control+a');
        await this.page.keyboard.press('Delete');
        await campoAtividade.fill(atividades[i]);

        // Confirmar valor; fallback pressSequentially
        const valorAtual = await campoAtividade.inputValue().catch(() => '');
        if (valorAtual.trim() !== atividades[i].trim()) {
          await campoAtividade.click({ clickCount: 3 });
          await this.page.keyboard.press('Delete');
          await campoAtividade.pressSequentially(atividades[i], { delay: 20 });
        }

        // Clicar no botão "+" via JS (mais confiável que seletores CSS quando há ícone Font Awesome)
        const clicouAdicionar = await this._clicarBotaoAdicionar();
        if (!clicouAdicionar) {
          await this._salvarDiagnostico('form-botao-adicionar');
          throw new Error(`Botão "+" de atividade não encontrado (atividade ${i + 1}). Diagnóstico salvo.`);
        }

        // Aguardar contador incrementar
        await this._aguardarTotalAtividades(totalAntes + 1);
        logger.info(`  Atividade ${i + 1}/${atividades.length} adicionada.`);
      }

      // Preencher Observação
      if (observacao && observacao.trim() !== '') {
        const campoObs = this.page.locator('textarea').first();
        await campoObs.click();
        await campoObs.fill(observacao);
      }

      // Rolar até o botão de ação
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(300);

      if (modoTeste) {
        logger.info(`[MODO TESTE] ${data} — ${atividades.length} atividade(s) adicionadas. Cadastro NÃO enviado.`);
        const btnVoltar = await encontrarVisivel(this.page, SELETORES_BTN_VOLTAR);
        if (btnVoltar) await btnVoltar.click();
        await this.page.waitForTimeout(1000);
        return 'teste';
      }

      // Cadastrar
      const btnCadastrar = await encontrarVisivel(this.page, SELETORES_BTN_CADASTRAR, 5000);
      if (!btnCadastrar) throw new Error('Botão "Cadastrar" não encontrado.');
      await btnCadastrar.click();

      // Aguardar a submissão processar (o sistema pode ficar na mesma página)
      await this.page.waitForTimeout(2000);

      // Voltar para a listagem explicitamente
      await this.navegarParaListagem();

      await this.salvarSessao();
      logger.sucesso(data, horarioInicial, horarioFinal);
      return 'cadastrado';

    } catch (err) {
      const screenshotPath = logger.screenshotPath(data.replace(/\//g, '-'));
      try {
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        logger.erro(data, `${err.message} | Screenshot: ${screenshotPath}`);
      } catch (_) {
        logger.erro(data, err.message);
      }

      // Tentar voltar para a listagem e continuar
      try {
        const btnVoltar = await encontrarVisivel(this.page, SELETORES_BTN_VOLTAR, 2000);
        if (btnVoltar) {
          await btnVoltar.click();
          await this.page.waitForTimeout(1500);
        } else {
          await this.navegarParaListagem();
        }
      } catch (_) {
        await this.navegarParaListagem().catch(() => {});
      }

      return 'erro';
    }
  }

  /** Lê o número atual de atividades adicionadas ("Total de atividades: N"). */
  async _totalAtividades() {
    try {
      const texto = await this.page.locator(':text("Total de atividades")').textContent({ timeout: 3000 });
      const match = texto.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch (_) {
      return 0;
    }
  }

  /** Aguarda até o total de atividades atingir o valor esperado (máx 5s). */
  async _aguardarTotalAtividades(esperado) {
    const inicio = Date.now();
    while (Date.now() - inicio < 5000) {
      const atual = await this._totalAtividades();
      if (atual >= esperado) return;
      await this.page.waitForTimeout(300);
    }
  }
}

module.exports = TutoriaBot;
