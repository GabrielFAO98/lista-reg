const SHEET  = SpreadsheetApp.openById('1brvkVhssALbzsfcQu_nO7YY38eznEVXfGFkJ06iL62o').getSheets()[0];
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

const EMAIL_RESUMO = 'gfdaoliveira@gmail.com';
const NOME_ABA     = 'Confirmações';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.type === 'rsvp') return handleRsvp(data);

    if (SHEET.getLastRow() === 0) {
      SHEET.appendRow(['Nome', 'Presente', 'Valor', 'Data', 'Mensagem']);
    }
    var now = new Date();
    var dataFormatada = now.getDate() + ' de ' + MONTHS[now.getMonth()];
    SHEET.appendRow([
      data.nome     || '',
      data.presente || '',
      data.valor    || '',
      dataFormatada,
      data.mensagem || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var rows = SHEET.getDataRange().getValues();
  var messages = rows.slice(1).map(function(r) {
    var data = r[3];
    if (data instanceof Date) {
      data = data.getDate() + ' de ' + MONTHS[data.getMonth()];
    }
    return { nome: r[0], presente: r[1], valor: r[2], data: String(data), mensagem: String(r[4]) };
  });
  var callback = e.parameter && e.parameter.callback;
  var json = JSON.stringify(messages);
  var out  = callback ? callback + '(' + json + ')' : json;
  var mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(out).setMimeType(mime);
}

// ── RSVP ────────────────────────────────────────────────────────

function handleRsvp(data) {
  var sheet = obterOuCriarAba();
  sheet.appendRow([
    new Date(),
    data.responsavel || '',
    data.telefone    || '',
    data.quantidade  || 1,
    (data.convidados || []).join(', '),
    data.observacoes || ''
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function obterOuCriarAba() {
  var ss    = SpreadsheetApp.openById('1brvkVhssALbzsfcQu_nO7YY38eznEVXfGFkJ06iL62o');
  var sheet = ss.getSheetByName(NOME_ABA);
  if (!sheet) {
    sheet = ss.insertSheet(NOME_ABA);
    var cab = sheet.getRange(1, 1, 1, 6);
    cab.setValues([['Data/Hora', 'Responsável', 'WhatsApp', 'Qtd Pessoas', 'Nomes', 'Observações']]);
    cab.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(5, 260);
    sheet.setColumnWidth(6, 240);
  }
  return sheet;
}

function enviarResumoDiario() {
  var ss    = SpreadsheetApp.openById('1brvkVhssALbzsfcQu_nO7YY38eznEVXfGFkJ06iL62o');
  var sheet = ss.getSheetByName(NOME_ABA);
  if (!sheet) return;

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var dados = sheet.getDataRange().getValues();
  var novasLinhas = dados.slice(1).filter(function(row) {
    var d = new Date(row[0]);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === hoje.getTime();
  });

  if (novasLinhas.length === 0) return;

  var totalPessoas = novasLinhas.reduce(function(soma, row) {
    return soma + (parseInt(row[3]) || 0);
  }, 0);

  var dataFmt = hoje.toLocaleDateString('pt-BR');
  var linha   = '─────────────────────────────────────\n';

  var corpo = '🎊 Resumo do dia ' + dataFmt + '\n\n' +
    novasLinhas.length + ' grupo(s) confirmaram presença — ' +
    totalPessoas + ' pessoa(s) no total.\n\n';

  novasLinhas.forEach(function(row) {
    var hora = new Date(row[0]).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    corpo += linha;
    corpo += '  ' + hora + '  |  ' + row[1] + '\n';
    if (row[2]) corpo += '  WhatsApp: ' + row[2] + '\n';
    corpo += '  ' + row[3] + ' pessoa(s): ' + row[4] + '\n';
    if (row[5]) corpo += '  Obs: ' + row[5] + '\n';
  });

  corpo += linha + '\nCom amor, Rafaela & Gabriel ♡';

  MailApp.sendEmail({
    to:      EMAIL_RESUMO,
    subject: '🎊 ' + novasLinhas.length + ' confirmação(ões) hoje (' + dataFmt + ')',
    body:    corpo
  });
}
