const fs = require('fs');
const path = require('path');
const { calcularDatas, parsearData, dataDeHoje, diaSemanaDeHoje, diaSemanaParaNumero } = require('./dateUtils');
const { buscarRegistros } = require('./sheetsLoader');

const DIAS_VALIDOS = [
  'domingo', 'segunda-feira', 'terça-feira', 'terca-feira',
  'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'sabado',
];

function validarHorario(valor, campo) {
  if (!/^\d{2}:\d{2}$/.test(valor)) {
    throw new Error(`${campo} inválido: "${valor}". Use o formato HH:mm.`);
  }
}

function validarRegistro(reg, index) {
  const prefix = `registros[${index}]`;

  const diaNorm = reg.diaSemana?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const diaValido = DIAS_VALIDOS.some(d =>
    d.normalize('NFD').replace(/[̀-ͯ]/g, '') === diaNorm
  );
  if (!diaValido) {
    throw new Error(`${prefix}.diaSemana inválido: "${reg.diaSemana}"`);
  }

  validarHorario(reg.horarioInicial, `${prefix}.horarioInicial`);
  validarHorario(reg.horarioFinal, `${prefix}.horarioFinal`);

  if (!Array.isArray(reg.atividades) || reg.atividades.length === 0) {
    throw new Error(`${prefix}.atividades deve ter pelo menos uma atividade.`);
  }

  reg.atividades.forEach((a, i) => {
    if (typeof a !== 'string' || a.trim() === '') {
      throw new Error(`${prefix}.atividades[${i}] está vazia.`);
    }
  });
}

/**
 * Lê e valida o arquivo JSON de configuração, expandindo as datas.
 * Se ATIVIDADES_URL estiver no .env, busca os registros do Google Sheets.
 * @param {string} [filePath]
 * @returns {Promise<{ config: object, tutorias: Array }>}
 */
async function carregarConfig(filePath) {
  const configPath = filePath || path.join(__dirname, '..', 'config', 'tutorias.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Arquivo de configuração não encontrado: ${configPath}`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new Error(`Erro ao parsear JSON: ${e.message}`);
  }

  // Período vem das variáveis de ambiente PERIODO_INICIO/PERIODO_FIM
  if (process.env.PERIODO_INICIO) config.dataInicial = process.env.PERIODO_INICIO;
  if (process.env.PERIODO_FIM) config.dataFinal = process.env.PERIODO_FIM;

  if (!config.modoHoje) {
    if (!config.dataInicial) throw new Error('Defina PERIODO_INICIO (ou "dataInicial" no JSON).');
    if (!config.dataFinal) throw new Error('Defina PERIODO_FIM (ou "dataFinal" no JSON, ou ative "modoHoje": true).');
  }

  if (process.env.ATIVIDADES_URL) {
    config.registros = await buscarRegistros(process.env.ATIVIDADES_URL);
  }

  if (!Array.isArray(config.registros) || config.registros.length === 0) {
    throw new Error('Campo "registros" deve ser um array com pelo menos um item.');
  }

  config.registros.forEach((reg, i) => validarRegistro(reg, i));

  // Verificar duplicatas no mesmo diaSemana com mesmo horário
  const chaves = new Set();
  config.registros.forEach((reg, i) => {
    const chave = `${reg.diaSemana}|${reg.horarioInicial}|${reg.horarioFinal}`;
    if (chaves.has(chave)) {
      throw new Error(`registros[${i}]: duplicata de dia/horário: ${chave}`);
    }
    chaves.add(chave);
  });

  // modoHoje: só o dia atual, respeitando dataInicial/dataFinal
  if (config.modoHoje) {
    const numeroDiaHoje = diaSemanaDeHoje();
    const hoje = dataDeHoje();
    const hojeDate = parsearData(hoje);

    if (config.dataInicial && hojeDate < parsearData(config.dataInicial)) {
      return { config, tutorias: [], foraDoPeriodo: true };
    }
    if (config.dataFinal && hojeDate > parsearData(config.dataFinal)) {
      return { config, tutorias: [], foraDoPeriodo: true };
    }

    const tutorias = config.registros
      .filter(reg => {
        try { return diaSemanaParaNumero(reg.diaSemana) === numeroDiaHoje; }
        catch (_) { return false; }
      })
      .map(reg => ({
        data: hoje,
        horarioInicial: reg.horarioInicial,
        horarioFinal: reg.horarioFinal,
        atividades: reg.atividades,
        observacao: reg.observacao || '',
      }));

    if (tutorias.length === 0) {
      throw new Error(`modoHoje ativo mas não há registro configurado para hoje (${hoje}).`);
    }
    return { config, tutorias };
  }

  // Modo período: de dataInicial até dataFinal, limitado a hoje
  const dataFinalConfig = parsearData(config.dataFinal);
  const dataHoje = parsearData(dataDeHoje());
  const dataFinalEfetiva = dataFinalConfig <= dataHoje ? config.dataFinal : dataDeHoje();

  const tutorias = [];
  for (const reg of config.registros) {
    const datas = calcularDatas(config.dataInicial, dataFinalEfetiva, reg.diaSemana);
    for (const data of datas) {
      tutorias.push({
        data,
        horarioInicial: reg.horarioInicial,
        horarioFinal: reg.horarioFinal,
        atividades: reg.atividades,
        observacao: reg.observacao || '',
      });
    }
  }

  tutorias.sort((a, b) => {
    const [da, ma, ya] = a.data.split('/').map(Number);
    const [db, mb, yb] = b.data.split('/').map(Number);
    return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
  });

  return { config, tutorias };
}

module.exports = { carregarConfig };
