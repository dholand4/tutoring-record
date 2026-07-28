const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function buscarRegistros(url) {
  const { status, body } = await get(url);
  let json;
  try {
    json = JSON.parse(body);
  } catch (e) {
    throw new Error(`Erro ao parsear resposta do Sheets (HTTP ${status}): ${e.message}`);
  }
  if (!Array.isArray(json.registros)) {
    throw new Error('Resposta inválida: campo "registros" ausente ou não é array.');
  }
  return json.registros;
}

module.exports = { buscarRegistros };
