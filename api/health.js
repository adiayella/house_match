/* ---------------------------------------------------------------------------
 * api/health.js — is this thing actually configured?
 *
 * Reports which pieces are wired up without ever echoing a secret: every
 * environment variable is reduced to a boolean before it leaves the function.
 * The commonest failure when deploying this is a missing or misspelled
 * variable, and the second commonest is a webhook that was never set, so both
 * are visible here in one request.
 * ------------------------------------------------------------------------- */

'use strict';

var tg = require('../lib/telegram-api.js');
var store = require('../lib/store.js');
var gemini = require('../lib/gemini.js');
var shared = require('../lib/shared.js');

module.exports = async function handler(req, res) {
  var report = {
    ok: true,
    service: 'HouseMatch',
    checkedAt: new Date().toISOString(),

    telegram: {
      tokenConfigured: tg.hasToken(),
      /* Three separate facts, because "not configured" covers three completely
         different mistakes and they have different fixes:
           variableExists false -> the variable was never saved, or was saved
                                   under a different name, or to a different
                                   project or environment
           variableExists true but nonEmpty false -> saved with no value
           nonEmpty true but looksLikeBotToken false -> something was pasted,
                                   but it is not a bot token (wrong value,
                                   stray quotes, half a paste)
         No part of the value is ever echoed. */
      tokenVariableExists: process.env.TELEGRAM_BOT_TOKEN !== undefined,
      tokenNonEmpty: !!String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
      tokenLooksLikeBotToken: /^\d{6,}:[A-Za-z0-9_-]{30,}$/
        .test(String(process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^["']|["']$/g, '')),
      setupKeyConfigured: !!process.env.SETUP_KEY,
      groupChatIdConfigured: !!process.env.TELEGRAM_GROUP_CHAT_ID,
      webhookSecretConfigured: !!process.env.TELEGRAM_WEBHOOK_SECRET
    },

    storage: {
      mode: store.isDurable() ? 'supabase' : 'in-memory',
      durable: store.isDurable(),
      note: store.isDurable()
        ? 'Answers persist across deployments and instances.'
        : 'No Supabase configured. Answers live in one warm instance and can vanish; ' +
          'two people may not see each other. Fine for a quick demo, not for real use.'
    },

    model: {
      configured: gemini.enabled(),
      model: gemini.model,
      role: 'Reads free-text intake answers and writes the tradeoff summaries. ' +
            'It is never asked whether a flat qualifies.',
      note: gemini.enabled()
        ? 'Narration on.'
        : 'No key set. The bot falls back to its own deterministic wording; ' +
          'matching is completely unaffected.'
    },

    data: {
      listings: (shared.listings.items || []).length,
      areas: Object.keys(shared.listings.verifySearch).length,
      provenance: shared.listings.meta.provenance,
      travelBasis: shared.travel.meta.basis
    }
  };

  /* Ask Telegram what it actually thinks the webhook is, when we can. */
  if (tg.hasToken()) {
    try {
      var info = await tg.getWebhookInfo();
      var me = await tg.getMe();
      report.telegram.botUsername = me.username;
      report.telegram.webhookUrl = info.url || null;
      report.telegram.pendingUpdates = info.pending_update_count;
      if (info.last_error_message) {
        report.telegram.lastError = info.last_error_message;
        report.telegram.lastErrorAt = info.last_error_date
          ? new Date(info.last_error_date * 1000).toISOString() : null;

        /* A 401 here has one overwhelmingly likely cause: the webhook was
           registered before TELEGRAM_WEBHOOK_SECRET existed, so Telegram is
           calling without the header the handler now insists on. Nothing is
           broken and nothing needs weakening - the registration is just stale.
           Saying so beats leaving someone to infer it from a bare 401. */
        if (/401|unauthor/i.test(info.last_error_message)) {
          report.telegram.diagnosis =
            'Telegram is calling the webhook without the secret this deployment expects, ' +
            'which happens when the webhook was registered before TELEGRAM_WEBHOOK_SECRET ' +
            'was set, or when that value changed afterwards.';
          report.telegram.fix = 'Re-run /api/setup?key=YOUR_SETUP_KEY to re-register the ' +
            'webhook with the current secret.';
        }
      }
      if (!info.url) {
        report.telegram.nextStep = 'Webhook not set. Visit /api/setup?key=YOUR_SETUP_KEY';
      }
    } catch (e) {
      report.telegram.error = String(e.message || e);
    }
  } else {
    report.telegram.nextStep = 'Set TELEGRAM_BOT_TOKEN in the Vercel project settings.';
  }

  res.setHeader('cache-control', 'no-store');
  return res.status(200).json(report);
};
