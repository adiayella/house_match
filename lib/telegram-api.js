/* ---------------------------------------------------------------------------
 * lib/telegram-api.js — the thin layer over Telegram's Bot API
 *
 * No SDK. Telegram's Bot API is plain HTTPS with JSON bodies, and Node on
 * Vercel has had a global fetch for years, so a dependency here would buy
 * nothing and cost an install step. This repository has no node_modules and
 * no build: what is committed is what runs.
 * ------------------------------------------------------------------------- */

'use strict';

var TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function api(method, payload) {
  if (!TOKEN) {
    return Promise.reject(new Error('TELEGRAM_BOT_TOKEN is not set'));
  }
  return fetch('https://api.telegram.org/bot' + TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      if (!json.ok) {
        /* Surfaced rather than swallowed: a silent Telegram failure looks
           exactly like a bot that has stopped caring. */
        throw new Error('Telegram ' + method + ' failed: ' +
          (json.description || JSON.stringify(json)));
      }
      return json.result;
    });
}

/* Telegram rejects messages over 4096 characters outright. Long shortlists are
   split on paragraph boundaries so a reply never vanishes because it grew. */
function chunk(text, limit) {
  limit = limit || 3900;
  if (text.length <= limit) { return [text]; }
  var parts = [];
  var rest = text;
  while (rest.length > limit) {
    var cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) { cut = rest.lastIndexOf('\n', limit); }
    if (cut < limit * 0.5) { cut = limit; }
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) { parts.push(rest); }
  return parts;
}

function sendMessage(chatId, text, extra) {
  var pieces = chunk(text);
  var out = [];
  return pieces.reduce(function (chain, piece, i) {
    return chain.then(function () {
      var payload = Object.assign({
        chat_id: chatId,
        text: piece,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }
      }, i === pieces.length - 1 ? (extra || {}) : {});
      return api('sendMessage', payload).then(function (r) { out.push(r); });
    });
  }, Promise.resolve()).then(function () { return out[out.length - 1]; });
}

function answerCallback(id, text) {
  return api('answerCallbackQuery', { callback_query_id: id, text: text || '' })
    .catch(function () { /* a stale callback is not worth failing the request */ });
}

function editText(chatId, messageId, text, extra) {
  return api('editMessageText', Object.assign({
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true }
  }, extra || {}));
}

function setWebhook(url, secret) {
  return api('setWebhook', {
    url: url,
    secret_token: secret || undefined,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
}

function getWebhookInfo() { return api('getWebhookInfo', {}); }
function getMe() { return api('getMe', {}); }

/* Telegram's HTML mode accepts a small tag set; everything else must be
   escaped or the message is rejected as malformed. */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  api: api,
  sendMessage: sendMessage,
  answerCallback: answerCallback,
  editText: editText,
  setWebhook: setWebhook,
  getWebhookInfo: getWebhookInfo,
  getMe: getMe,
  esc: esc,
  chunk: chunk,
  hasToken: function () { return !!TOKEN; }
};
