const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'execucao.log');
const SCREENSHOT_DIR = path.join(LOG_DIR, 'screenshots');

function ensureDirs() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function write(line) {
  ensureDirs();
  const entry = `[${timestamp()}] ${line}\n`;
  process.stdout.write(entry);
  fs.appendFileSync(LOG_FILE, entry, 'utf8');
}

function sucesso(data, horarioInicial, horarioFinal) {
  write(`[SUCESSO] ${data} - ${horarioInicial} às ${horarioFinal} cadastrado`);
}

function pulado(data, motivo) {
  write(`[PULADO] ${data} - ${motivo}`);
}

function erro(data, motivo) {
  write(`[ERRO] ${data} - ${motivo}`);
}

function info(msg) {
  write(`[INFO] ${msg}`);
}

function resumo(stats) {
  const sep = '='.repeat(50);
  write(sep);
  write(`[RESUMO] Total planejado: ${stats.total}`);
  write(`[RESUMO] Cadastrados:     ${stats.cadastrados}`);
  write(`[RESUMO] Pulados:         ${stats.pulados}`);
  write(`[RESUMO] Erros:           ${stats.erros}`);
  write(sep);
}

function screenshotPath(data) {
  ensureDirs();
  const safe = data.replace(/\//g, '-');
  return path.join(SCREENSHOT_DIR, `erro-${safe}-${Date.now()}.png`);
}

module.exports = { sucesso, pulado, erro, info, resumo, screenshotPath };
