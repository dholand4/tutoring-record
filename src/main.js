require('dotenv').config();

const { carregarConfig } = require('./configLoader');
const TutoriaBot = require('./tutoriaBot');
const logger = require('./logger');
const { parsearData, dataDeHoje } = require('./dateUtils');

function verificarPeriodo() {
  const inicio = process.env.PERIODO_INICIO;
  const fim = process.env.PERIODO_FIM;
  if (!inicio && !fim) return true;

  const hoje = parsearData(dataDeHoje());
  if (inicio && hoje < parsearData(inicio)) {
    logger.info(`Fora do período: início em ${inicio}. Nenhum cadastro realizado.`);
    return false;
  }
  if (fim && hoje > parsearData(fim)) {
    logger.info(`Fora do período: encerrado em ${fim}. Nenhum cadastro realizado.`);
    return false;
  }
  return true;
}

async function main() {
  if (!verificarPeriodo()) return;

  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate-only');
  const dryRun = args.includes('--dry-run');

  let config, tutorias, foraDoPeriodo;
  try {
    ({ config, tutorias, foraDoPeriodo } = await carregarConfig());
  } catch (err) {
    console.error(`\n[ERRO DE CONFIGURAÇÃO] ${err.message}\n`);
    process.exit(1);
  }

  if (foraDoPeriodo) {
    logger.info(`Fora do período configurado (${config.dataInicial} → ${config.dataFinal}). Nenhum cadastro realizado.`);
    return;
  }

  const modoTeste = dryRun || config.modoTeste;
  const pularSeJaExistir = config.pularSeJaExistir !== false;
  const tempoEntreMs = config.tempoEntreCadastrosMs ?? 1500;

  logger.info('Automação iniciada.');
  if (config.modoHoje) {
    logger.info(`Modo: hoje (${tutorias[0]?.data})`);
  } else {
    logger.info(`Período: ${config.dataInicial} → ${config.dataFinal}`);
  }
  logger.info(`Total de tutorias planejadas: ${tutorias.length}`);
  logger.info(`Modo teste: ${modoTeste}`);

  console.log('\n--- Tutorias que serão processadas ---');
  tutorias.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.data}  ${t.horarioInicial}-${t.horarioFinal}  (${t.atividades.length} atividade(s))`);
  });
  console.log('--------------------------------------\n');

  if (validateOnly) {
    logger.info('Validação concluída com sucesso. Nenhum cadastro realizado (--validate-only).');
    return;
  }

  const stats = { total: tutorias.length, cadastrados: 0, pulados: 0, erros: 0 };

  const bot = new TutoriaBot(config);
  try {
    await bot.iniciar();
    await bot.garantirAcesso();

    for (let i = 0; i < tutorias.length; i++) {
      const tutoria = tutorias[i];
      logger.info(`Processando ${i + 1}/${tutorias.length}: ${tutoria.data}`);

      const resultado = await bot.cadastrar(tutoria, modoTeste, pularSeJaExistir);

      if (resultado === 'cadastrado' || resultado === 'teste') stats.cadastrados++;
      else if (resultado === 'pulado') stats.pulados++;
      else stats.erros++;

      if (i < tutorias.length - 1) {
        await new Promise(r => setTimeout(r, tempoEntreMs));
      }
    }
  } finally {
    await bot.fechar();
    logger.resumo(stats);
  }
}

main().catch(err => {
  console.error('\n[ERRO FATAL]', err.message);
  process.exit(1);
});
