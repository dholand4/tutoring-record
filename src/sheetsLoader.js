const https = require('https');

const TIMEOUT_MS = 15000;
const MAX_REDIRECIONAMENTOS = 5;

function get(url, redirecoes = 0) {
  return new Promise((resolve, reject) => {
    if (redirecoes > MAX_REDIRECIONAMENTOS) {
      return reject(new Error('Muitos redirecionamentos ao buscar a planilha.'));
    }

    const req = https.get(url, res => {
      // O Apps Script sempre redireciona para googleusercontent.com
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location, redirecoes + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    // Sem isso uma requisição pendurada trava a execução do cron indefinidamente
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Sem resposta do Google Sheets em ${TIMEOUT_MS / 1000}s.`));
    });
    req.on('error', reject);
  });
}

/** Traduz uma resposta inesperada na causa provável. */
function diagnosticar(body) {
  const b = body.toLowerCase();
  if (b.includes('accounts.google.com') || b.includes('sign in') || b.includes('fazer login')) {
    return 'O Apps Script exigiu login: reimplante o web app com "Quem tem acesso: Qualquer pessoa".';
  }
  if (b.includes('script function not found') || b.includes('doget')) {
    return 'A implantação não expõe a função doGet: publique uma nova versão em Implantar → Gerenciar implantações.';
  }
  if (b.includes('<!doctype') || b.trimStart().startsWith('<html')) {
    return 'Veio HTML em vez de JSON: a URL aponta para uma implantação antiga ou inválida.';
  }
  return 'Confira o valor de ATIVIDADES_URL.';
}

async function buscarRegistros(url) {
  const { status, body } = await get(url);

  let json;
  try {
    json = JSON.parse(body);
  } catch (e) {
    throw new Error(
      `Resposta do Sheets não é JSON (HTTP ${status}). ${diagnosticar(body)} ` +
      `Trecho recebido: "${body.slice(0, 200).replace(/\s+/g, ' ').trim()}"`
    );
  }

  if (!Array.isArray(json.registros)) {
    throw new Error(
      `Resposta inválida (HTTP ${status}): campo "registros" ausente ou não é array. ` +
      `Chaves recebidas: ${Object.keys(json).join(', ') || '(nenhuma)'}`
    );
  }

  return json.registros;
}

module.exports = { buscarRegistros };
