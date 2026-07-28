// =============================================
// APPS SCRIPT — Tutoria (Sheets + Telegram Bot)
// =============================================

// ---------- ENDPOINT GET (usado pelo bot de cadastro) ----------

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var diasMap = {
    'Segunda': 'segunda-feira',
    'Terça':   'terça-feira',
    'Quarta':  'quarta-feira',
    'Quinta':  'quinta-feira',
    'Sexta':   'sexta-feira',
    'Sabado':  'sábado',
  };

  var registros = [];

  ss.getSheets().forEach(function(sheet) {
    var diaSemana = diasMap[sheet.getName()];
    if (!diaSemana) return;

    var horarioInicial = formatarHorario(sheet.getRange('B1').getValue());
    var horarioFinal   = formatarHorario(sheet.getRange('B2').getValue());
    var observacao     = sheet.getRange('B3').getValue() || '';

    var colC = sheet.getRange('C1:C50').getValues().map(function(r) { return String(r[0]).trim(); }).filter(function(v) { return v && v !== 'undefined'; });
    var colD = sheet.getRange('D1:D50').getValues().map(function(r) { return String(r[0]).trim(); }).filter(function(v) { return v && v !== 'undefined'; });

    registros.push({
      diaSemana: diaSemana,
      horarioInicial: horarioInicial,
      horarioFinal: horarioFinal,
      atividades: colC.concat(colD),
      observacao: observacao,
    });
  });

  return ContentService
    .createTextOutput(JSON.stringify({ registros: registros }))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatarHorario(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    var h = String(valor.getHours()).padStart(2, '0');
    var m = String(valor.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }
  return String(valor);
}

// ---------- LIMPEZA SEMANAL (coluna D) ----------

function limparExtras() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sabado'].forEach(function(nome) {
    var sheet = ss.getSheetByName(nome);
    if (sheet) sheet.getRange('D1:D50').clearContent();
  });
}

function criarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'limparExtras') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('limparExtras')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(7)
    .create();
  SpreadsheetApp.getUi().alert('Trigger criado! Todo domingo às 7h o D será limpo.');
}

// ---------- TELEGRAM BOT (webhook via Cloudflare Worker) ----------

var DIAS_TECLADO = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var props = PropertiesService.getScriptProperties();
    var allowedId = props.getProperty('TELEGRAM_CHAT_ID');

    if (data.callback_query) {
      var cbChatId = data.callback_query.message.chat.id;
      if (!allowedId || String(cbChatId) === String(allowedId)) {
        handleCallback(data.callback_query);
      }
      return ContentService.createTextOutput('ok');
    }

    var message = data.message;
    if (!message) return ContentService.createTextOutput('ok');

    var chatId = message.chat.id;
    if (allowedId && String(chatId) !== String(allowedId)) {
      return ContentService.createTextOutput('ok');
    }

    if (message.text) {
      handleText(chatId, message.text);
    }
  } catch (err) {
    Logger.log('Erro no doPost: ' + err.message);
  }
  return ContentService.createTextOutput('ok');
}

// ---------- HANDLERS ----------

function handleCallback(callback) {
  var chatId = callback.message.chat.id;
  var dia = callback.data;

  if (DIAS_TECLADO.indexOf(dia) === -1) return;

  var props = PropertiesService.getScriptProperties();
  props.setProperty('DIA_SELECIONADO', dia);

  var extras = getExtrasAtuais(dia);
  var msg = 'Dia selecionado: ' + dia + '\n\n';
  if (extras.length > 0) {
    msg += 'Extras ja cadastrados:\n' + extras.map(function(e, i) { return (i + 1) + '. ' + e; }).join('\n') + '\n\n';
  }
  msg += 'Envie as atividades extras como mensagens de texto.\nQuando terminar, envie /sair.';

  sendTelegram(chatId, msg);
  answerCallback(callback.id);
}

function handleText(chatId, text) {
  text = text.trim();
  var props = PropertiesService.getScriptProperties();

  if (text === '/start') {
    props.deleteProperty('DIA_SELECIONADO');
    sendDayPicker(chatId);
    return;
  }

  if (text === '/sair') {
    var diaAnterior = props.getProperty('DIA_SELECIONADO');
    props.deleteProperty('DIA_SELECIONADO');
    if (diaAnterior) {
      var extras = getExtrasAtuais(diaAnterior);
      var msg = 'Finalizado! ' + diaAnterior + ' ficou com ' + extras.length + ' extra(s).\n';
      if (extras.length > 0) {
        msg += extras.map(function(e, i) { return (i + 1) + '. ' + e; }).join('\n');
      }
      msg += '\n\nEnvie /start para selecionar outro dia.';
      sendTelegram(chatId, msg);
    } else {
      sendTelegram(chatId, 'Nenhum dia estava selecionado. Envie /start para comecar.');
    }
    return;
  }

  if (text === '/hoje') {
    var tab = getTabHoje();
    if (!tab) {
      sendTelegram(chatId, 'Hoje e domingo, nao tem aba na planilha.');
      return;
    }
    var extras = getExtrasAtuais(tab);
    var msg = 'Extras de hoje (' + tab + '):\n' +
      (extras.length > 0
        ? extras.map(function(e, i) { return (i + 1) + '. ' + e; }).join('\n')
        : '(nenhuma)');
    sendTelegram(chatId, msg);
    return;
  }

  if (text.startsWith('/')) return;

  var diaSelecionado = props.getProperty('DIA_SELECIONADO');
  if (!diaSelecionado) {
    sendTelegram(chatId, 'Nenhum dia selecionado. Envie /start para escolher o dia.');
    return;
  }

  var row = appendExtra(diaSelecionado, text);
  sendTelegram(chatId, 'Adicionado em ' + diaSelecionado + ' (D' + row + '):\n' + text);
}

function sendDayPicker(chatId) {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  var keyboard = {
    inline_keyboard: [
      [
        { text: 'Segunda', callback_data: 'Segunda' },
        { text: 'Terca', callback_data: 'Terça' },
        { text: 'Quarta', callback_data: 'Quarta' }
      ],
      [
        { text: 'Quinta', callback_data: 'Quinta' },
        { text: 'Sexta', callback_data: 'Sexta' },
        { text: 'Sabado', callback_data: 'Sabado' }
      ]
    ]
  };

  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: 'Qual dia voce quer registrar atividades extras?',
      reply_markup: keyboard
    })
  });
}

function answerCallback(callbackId) {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackId })
  });
}

// ---------- HELPERS ----------

function getTabHoje() {
  var diasMap = {
    'Monday':    'Segunda',
    'Tuesday':   'Terça',
    'Wednesday': 'Quarta',
    'Thursday':  'Quinta',
    'Friday':    'Sexta',
    'Saturday':  'Sabado'
  };
  var dia = Utilities.formatDate(new Date(), 'America/Fortaleza', 'EEEE');
  return diasMap[dia] || null;
}

function appendExtra(tabName, text) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('Aba nao encontrada: ' + tabName);

  var colD = sheet.getRange('D1:D50').getValues();
  var row = -1;
  for (var i = 0; i < colD.length; i++) {
    if (!colD[i][0] || String(colD[i][0]).trim() === '') {
      row = i + 1;
      break;
    }
  }
  if (row === -1) row = 51;

  sheet.getRange('D' + row).setValue(text);
  return row;
}

function getExtrasAtuais(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return [];
  return sheet.getRange('D1:D50').getValues()
    .map(function(r) { return String(r[0]).trim(); })
    .filter(function(v) { return v && v !== 'undefined'; });
}

function sendTelegram(chatId, text) {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
}

// ---------- SETUP ----------

function removerTriggerPolling() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'pollTelegram') ScriptApp.deleteTrigger(t);
  });
  SpreadsheetApp.getUi().alert('Trigger de polling removido!');
}
