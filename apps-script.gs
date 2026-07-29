const SPREADSHEET_ID = '1brvkVhssALbzsfcQu_nO7YY38eznEVXfGFkJ06iL62o';
const SHEET    = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
const MONTHS   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

const EMAIL_RESUMO    = 'gfdaoliveira@gmail.com';
const NOME_ABA        = 'Confirmações';
const MP_ACCESS_TOKEN = 'APP_USR-838532444449901-052412-9790f4a34dc1dad30bfa1e2276214043-437061895';

// appsscript.json — oauthScopes necessários:
// "https://www.googleapis.com/auth/spreadsheets"
// "https://www.googleapis.com/auth/script.external_request"
// "https://mail.google.com/"

// ── ROTEADOR ────────────────────────────────────────────────────

function doPost(e) {
  try {
    // Webhook do Mercado Pago (server → server, sem body JSON nosso)
    if (e.parameter && e.parameter.action === 'mp_webhook') {
      return handleMpWebhook(e);
    }

    var data = JSON.parse(e.postData.contents);
    if (data.type === 'rsvp') return handleRsvp(data);

    return ContentService.createTextOutput(JSON.stringify({ ok: false, err: 'unknown type' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, err: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  if (e.parameter && e.parameter.action === 'create_preference') return criarPreferencia(e);
  if (e.parameter && e.parameter.action === 'create_payment')    return criarPagamento(e);
  if (e.parameter && e.parameter.action === 'check_payment')     return verificarPagamento(e);

  // Leitura de mensagens (mural)
  var rows = SHEET.getDataRange().getValues();
  var messages = rows.slice(1).map(function(r) {
    // Colunas: Nome(0) Email(1) Presente(2) Valor(3) Data(4) Mensagem(5) PaymentID(6)
    var data = r[4];
    if (data instanceof Date) {
      data = data.getDate() + ' de ' + MONTHS[data.getMonth()];
    }
    return { nome: r[0], presente: r[2], valor: r[3], data: String(data), mensagem: String(r[5]) };
  });
  var callback = e.parameter && e.parameter.callback;
  var json = JSON.stringify(messages);
  var out  = callback ? callback + '(' + json + ')' : json;
  var mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(out).setMimeType(mime);
}

// ── MERCADO PAGO — PREFERÊNCIA ───────────────────────────────────

function criarPreferencia(e) {
  var callback = e.parameter.callback || '_mpCb';
  try {
    var itens    = JSON.parse(e.parameter.itens   || '[]');
    var nome     = e.parameter.nome               || '';
    var mensagem = e.parameter.mensagem            || '';

    var mpItems = itens.map(function(item) {
      return {
        title:      item.nome,
        quantity:   1,
        unit_price: parseFloat(item.valor) || 0,
        currency_id: 'BRL'
      };
    });

    var notificationUrl = ScriptApp.getService().getUrl() + '?action=mp_webhook';
    var siteUrl = 'https://gabrielfao98.github.io/lista-reg/presentes.html';

    var preference = {
      items:            mpItems,
      payer:            { name: nome },
      notification_url: notificationUrl,
      back_urls: {
        success: siteUrl + '?paid=ok',
        failure: siteUrl + '?paid=fail',
        pending: siteUrl + '?paid=pending'
      },
      auto_return: 'approved',
      metadata: {
        nome:     nome,
        mensagem: mensagem,
        itens:    JSON.stringify(itens)
      }
    };

    var resp   = UrlFetchApp.fetch('https://api.mercadopago.com/checkout/preferences', {
      method:      'POST',
      contentType: 'application/json',
      headers:     { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN },
      payload:     JSON.stringify(preference)
    });
    var result = JSON.parse(resp.getContentText());
    var out = callback + '(' + JSON.stringify({ ok: true, init_point: result.init_point }) + ')';
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);

  } catch (err) {
    var out = callback + '(' + JSON.stringify({ ok: false, err: err.toString() }) + ')';
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

// ── MERCADO PAGO — PAGAMENTO DIRETO (Checkout Bricks) ───────────

function criarPagamento(e) {
  var callback = e.parameter.callback || '_paymentCb';
  try {
    var nome     = e.parameter.nome     || '';
    var email    = e.parameter.email    || '';
    var mensagem = e.parameter.mensagem || '';
    var itens    = JSON.parse(e.parameter.itens    || '[]');
    var formData  = JSON.parse(e.parameter.formData || '{}');
    // O Brick envolve os dados de pagamento dentro de formData.formData (f minúsculo)
    var innerData = formData.formData || formData.FormData || formData;

    var total = itens.reduce(function(s, i) { return s + (parseFloat(i.valor) || 0); }, 0);
    var desc  = itens.map(function(i) { return i.nome; }).join(', ');

    var notificationUrl = ScriptApp.getService().getUrl() + '?action=mp_webhook';

    var payload = {
      transaction_amount: total,
      description:        desc,
      payment_method_id:  innerData.payment_method_id,
      payer: {
        email:          email,
        identification: (innerData.payer && innerData.payer.identification) ? innerData.payer.identification : undefined
      },
      notification_url: notificationUrl,
      metadata: {
        nome:     nome,
        email:    email,
        mensagem: mensagem,
        itens:    JSON.stringify(itens)
      }
    };

    if (innerData.token)     payload.token        = innerData.token;
    if (innerData.token)     payload.installments = innerData.installments || 1;
    if (innerData.issuer_id) payload.issuer_id    = innerData.issuer_id;

    var resp   = UrlFetchApp.fetch('https://api.mercadopago.com/v1/payments', {
      method:      'POST',
      contentType: 'application/json',
      headers: {
        'Authorization':     'Bearer ' + MP_ACCESS_TOKEN,
        'X-Idempotency-Key': Utilities.getUuid()
      },
      payload: JSON.stringify(payload)
    });
    var result = JSON.parse(resp.getContentText());
    var out = callback + '(' + JSON.stringify({ ok: true, status: result.status, payment_id: result.id }) + ')';
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);

  } catch (err) {
    var out = callback + '(' + JSON.stringify({ ok: false, error: err.toString() }) + ')';
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

function verificarPagamento(e) {
  var callback  = e.parameter.callback   || '_checkCb';
  var paymentId = e.parameter.payment_id || '';
  try {
    var resp   = UrlFetchApp.fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
      headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN }
    });
    var result = JSON.parse(resp.getContentText());
    var out = callback + '(' + JSON.stringify({ ok: true, status: result.status }) + ')';
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (err) {
    var out = callback + '(' + JSON.stringify({ ok: false, error: err.toString() }) + ')';
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

// ── MERCADO PAGO — WEBHOOK ───────────────────────────────────────

function handleMpWebhook(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Só processa notificações de pagamento
    if (data.type !== 'payment') {
      return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
    }

    var paymentId = data.data && data.data.id;
    if (!paymentId) {
      return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
    }

    // Busca detalhes do pagamento na API do MP
    var resp    = UrlFetchApp.fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
      headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN }
    });
    var payment = JSON.parse(resp.getContentText());

    // Só registra pagamentos aprovados
    if (payment.status !== 'approved') {
      return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
    }

    // Evita registro duplicado
    if (jaRegistrado(String(paymentId))) {
      return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
    }

    // Extrai dados do metadata da preferência
    var meta     = payment.metadata || {};
    var nome     = meta.nome     || '';
    var email    = meta.email    || (payment.payer && payment.payer.email) || '';
    var mensagem = meta.mensagem || '';
    var itensStr = '';
    var valor    = '';

    if (meta.itens) {
      try {
        var itensArr = JSON.parse(meta.itens);
        itensStr = itensArr.map(function(i) { return i.nome; }).join(', ');
        var total = itensArr.reduce(function(s, i) { return s + (parseFloat(i.valor) || 0); }, 0);
        valor = 'R$ ' + total.toFixed(2).replace('.', ',');
      } catch (ex) {}
    }

    // Fallback: usa items do próprio pagamento
    if (!itensStr && payment.additional_info && payment.additional_info.items) {
      itensStr = payment.additional_info.items.map(function(i) { return i.title; }).join(', ');
      valor = 'R$ ' + (payment.transaction_amount || 0).toFixed(2).replace('.', ',');
    }

    var now          = new Date();
    var dataFormatada = now.getDate() + ' de ' + MONTHS[now.getMonth()];

    garantirCabecalhoPlanilha();
    SHEET.appendRow([nome, email, itensStr, valor, dataFormatada, mensagem, String(paymentId)]);

    return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}

function jaRegistrado(paymentId) {
  var data = SHEET.getDataRange().getValues();
  return data.some(function(row) { return String(row[6]) === paymentId; });
}

function garantirCabecalhoPlanilha() {
  if (SHEET.getLastRow() === 0) {
    SHEET.appendRow(['Nome', 'Email', 'Presente', 'Valor', 'Data', 'Mensagem', 'Payment ID']);
  }
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
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
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

// ── RESUMO DIÁRIO ────────────────────────────────────────────────

function enviarResumoDiario() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
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
