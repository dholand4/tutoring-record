const DIAS_SEMANA = {
  'domingo': 0,
  'segunda-feira': 1,
  'terca-feira': 2,
  'terça-feira': 2,
  'quarta-feira': 3,
  'quinta-feira': 4,
  'sexta-feira': 5,
  'sabado': 6,
  'sábado': 6,
};

/**
 * Normaliza o nome do dia da semana removendo acentos e colocando em minúsculas.
 */
function normalizarDia(dia) {
  return dia
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace('terca', 'terça')
    .replace('sabado', 'sábado');
}

/**
 * Retorna o número do dia da semana (0=dom, 1=seg, ..., 6=sáb) para uma string.
 */
function diaSemanaParaNumero(diaSemana) {
  const normalizado = normalizarDia(diaSemana);
  // Tentar com e sem normalização
  const num = DIAS_SEMANA[diaSemana.toLowerCase()] ?? DIAS_SEMANA[normalizado];
  if (num === undefined) throw new Error(`Dia da semana inválido: "${diaSemana}"`);
  return num;
}

/**
 * Converte string "DD/MM/YYYY" ou "YYYY-MM-DD" para objeto Date (meia-noite UTC).
 */
function parsearData(str) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  throw new Error(`Formato de data inválido: "${str}". Use YYYY-MM-DD ou DD/MM/YYYY.`);
}

/**
 * Formata Date para "DD/MM/YYYY".
 */
function formatarData(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Retorna a primeira ocorrência do diaSemana >= dataInicial.
 */
function proximaOcorrencia(dataInicial, numeroDiaSemana) {
  const date = new Date(dataInicial);
  const diaDaSemanaAtual = date.getUTCDay();
  let diff = numeroDiaSemana - diaDaSemanaAtual;
  if (diff < 0) diff += 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

/**
 * Gera todas as datas entre dataInicial e dataFinal para o diaSemana dado.
 * @param {string} dataInicialStr  - "YYYY-MM-DD" ou "DD/MM/YYYY"
 * @param {string} dataFinalStr    - "YYYY-MM-DD" ou "DD/MM/YYYY"
 * @param {string} diaSemana       - ex: "quarta-feira"
 * @returns {string[]} - array de datas no formato "DD/MM/YYYY"
 */
function calcularDatas(dataInicialStr, dataFinalStr, diaSemana) {
  const inicio = parsearData(dataInicialStr);
  const fim = parsearData(dataFinalStr);
  const numeroDia = diaSemanaParaNumero(diaSemana);

  const datas = [];
  let atual = proximaOcorrencia(inicio, numeroDia);

  while (atual <= fim) {
    datas.push(formatarData(atual));
    atual = new Date(atual);
    atual.setUTCDate(atual.getUTCDate() + 7);
  }

  return datas;
}

/**
 * Retorna a data de hoje no formato "DD/MM/YYYY" usando horário local.
 */
function dataDeHoje() {
  const hoje = new Date();
  const d = String(hoje.getDate()).padStart(2, '0');
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const y = hoje.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Retorna o número do dia da semana local de hoje (0=dom … 6=sáb).
 */
function diaSemanaDeHoje() {
  return new Date().getDay();
}

module.exports = { calcularDatas, parsearData, formatarData, diaSemanaParaNumero, dataDeHoje, diaSemanaDeHoje };
