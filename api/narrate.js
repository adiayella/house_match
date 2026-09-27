/* ---------------------------------------------------------------------------
 * api/narrate.js — the language model, kept on the server
 *
 * The browser sends a verdict the engine has ALREADY reached and gets back
 * prose. It does not send the listings, it does not send the rules, and there
 * is nothing here for the model to decide. Eligibility was settled before this
 * endpoint was called.
 *
 * Why this is a serverless function rather than a fetch from the page: the
 * Gemini key. A key shipped to the browser is a key anyone can read out of the
 * network tab and spend. It stays in the Vercel environment and never crosses
 * to the client.
 *
 * With no key configured this returns empty narration and the page falls back
 * to its own deterministic wording. Nothing about the matching changes.
 * ------------------------------------------------------------------------- */

'use strict';

var gemini = require('../lib/gemini.js');

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  if (!gemini.enabled()) {
    return res.status(200).json({
      ok: true, enabled: false, narrations: [],
      note: 'No GEMINI_API_KEY set. The page will use its own wording; matching is unaffected.'
    });
  }

  var body = req.body || {};
  var options = Array.isArray(body.options) ? body.options.slice(0, 3) : [];
  if (!options.length) {
    return res.status(400).json({ ok: false, error: 'no options supplied' });
  }

  try {
    var narrations = [];
    for (var i = 0; i < options.length; i++) {
      /* Shaped to what lib/gemini.js expects. Anything the model does not need
         in order to describe a tradeoff is left behind. */
      var text = await gemini.narrateOption(options[i], i + 1);
      narrations.push(text || null);
    }

    var out = { ok: true, enabled: true, narrations: narrations };

    /* When every narration came back empty, say why. Narration failing is
       invisible by design - the page renders fine without it - so silence here
       would leave a misconfigured key indistinguishable from a model that had
       nothing to add. */
    if (narrations.every(function (n) { return !n; })) {
      out.modelError = gemini.getLastError() || 'the model returned nothing';
      out.model = gemini.model;
    }
    return res.status(200).json(out);
  } catch (e) {
    /* A slow or rate-limited model must not take the page down with it. */
    return res.status(200).json({
      ok: true, enabled: true, narrations: [], error: String(e.message || e)
    });
  }
};
