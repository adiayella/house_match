/* ---------------------------------------------------------------------------
 * api/setup.js — point Telegram at this deployment
 *
 * Telegram will not send a bot anything until it has been told where to post.
 * That is normally a curl call; this does the same thing from a browser, which
 * matters on a machine with no shell tooling installed.
 *
 * It is guarded. Visiting it needs ?key= matching SETUP_KEY (or, failing that,
 * TELEGRAM_WEBHOOK_SECRET), because an open endpoint that repoints a bot's
 * webhook is an open endpoint for hijacking the bot. If neither variable is
 * set the endpoint refuses to do anything at all rather than defaulting to
 * unguarded.
 * ------------------------------------------------------------------------- */

'use strict';

var tg = require('../lib/telegram-api.js');

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  var guard = process.env.SETUP_KEY || process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!guard) {
    return res.status(503).json({
      ok: false,
      error: 'Refusing to run unguarded.',
      fix: 'Set SETUP_KEY in the Vercel project settings, redeploy, then call ' +
           '/api/setup?key=THAT_VALUE'
    });
  }

  var url = new URL(req.url, 'https://' + req.headers.host);
  if (url.searchParams.get('key') !== guard) {
    return res.status(401).json({ ok: false, error: 'bad or missing key' });
  }

  if (!tg.hasToken()) {
    return res.status(500).json({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN is not set.',
      fix: 'Add it in the Vercel project settings and redeploy.'
    });
  }

  var webhookUrl = 'https://' + req.headers.host + '/api/telegram';

  try {
    await tg.setWebhook(webhookUrl, process.env.TELEGRAM_WEBHOOK_SECRET || undefined);
    var info = await tg.getWebhookInfo();
    var me = await tg.getMe();

    return res.status(200).json({
      ok: true,
      message: 'Webhook set. The bot is live.',
      bot: '@' + me.username,
      webhook: info.url,
      pendingUpdates: info.pending_update_count,
      next: [
        'Open a private chat with @' + me.username + ' and send /start.',
        'Add the bot to your group, then send /usegroup there so it knows where to post.',
        'Have all three people complete the private form. The shortlist posts itself.'
      ]
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
