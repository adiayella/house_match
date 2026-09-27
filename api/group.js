/* ---------------------------------------------------------------------------
 * api/group.js — shared groups, so three people can answer from three devices
 *
 * The coordinator creates a group and gets a six-character code. She sends the
 * link to the other two by whatever they already use. Each of them fills in her
 * own form on her own phone, and none of them sees anybody else's answers until
 * everyone is in.
 *
 * That last part is enforced here rather than left to the page:
 *
 *   GET  /api/group?code=ABC123          -> names and a count, nothing else
 *   GET  /api/group?code=ABC123&full=1   -> every profile, ONLY once all three
 *                                           are in
 *
 * A browser that asks for the full set early is refused. If the check lived in
 * the page, anyone could read the other two people's budgets out of the network
 * tab before answering, and then tailor their own answers to them — which is
 * precisely the dynamic the product exists to prevent.
 *
 * Needs Supabase. Without it there is nowhere for three devices to meet, and
 * the endpoint says so instead of pretending to work.
 * ------------------------------------------------------------------------- */

'use strict';

var store = require('../lib/store.js');

/* No vowels and no 0/O/1/I: the code gets read aloud and typed by hand. */
var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  var out = '';
  for (var i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function cleanCode(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function personKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 40) || 'person';
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (!store.isDurable()) {
    return res.status(503).json({
      ok: false,
      error: 'Shared groups need a database.',
      fix: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel and run schema.sql. ' +
           'Without them, everyone can still work alone in one browser.'
    });
  }

  try {
    if (req.method === 'POST') { return await onPost(req, res); }
    if (req.method === 'GET')  { return await onGet(req, res); }
    return res.status(405).json({ ok: false, error: 'GET or POST' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};

async function onPost(req, res) {
  var body = req.body || {};

  if (body.action === 'create') {
    return res.status(200).json({ ok: true, code: makeCode() });
  }

  if (body.action === 'join') {
    var code = cleanCode(body.code);
    var profile = body.profile;
    if (!code || code.length !== 6) {
      return res.status(400).json({ ok: false, error: 'bad code' });
    }
    if (!profile || !profile.name) {
      return res.status(400).json({ ok: false, error: 'no profile' });
    }
    profile.id = personKey(profile.name);
    await store.saveProfile('web:' + code, profile.id, profile);

    var after = await store.listProfiles('web:' + code);
    return res.status(200).json({
      ok: true,
      code: code,
      count: after.length,
      names: after.map(function (p) { return p.name; })
    });
  }

  return res.status(400).json({ ok: false, error: 'unknown action' });
}

async function onGet(req, res) {
  var url = new URL(req.url, 'https://' + req.headers.host);
  var code = cleanCode(url.searchParams.get('code'));
  if (!code || code.length !== 6) {
    return res.status(400).json({ ok: false, error: 'bad code' });
  }

  var profiles = await store.listProfiles('web:' + code);
  var needed = parseInt(url.searchParams.get('needed') || '3', 10);
  var ready = profiles.length >= Math.min(needed, 3);

  /* The gate. Names and a count are safe to show — they tell somebody who is
     still outstanding. The answers themselves are withheld until everyone has
     committed to theirs. */
  if (url.searchParams.get('full') === '1' && !ready) {
    return res.status(200).json({
      ok: true,
      code: code,
      ready: false,
      count: profiles.length,
      names: profiles.map(function (p) { return p.name; }),
      note: 'Answers stay sealed until everyone is in. ' +
            'Seeing the others first is how people end up tailoring their own answers ' +
            'to somebody else’s, which is the habit this is meant to break.'
    });
  }

  return res.status(200).json({
    ok: true,
    code: code,
    ready: ready,
    count: profiles.length,
    names: profiles.map(function (p) { return p.name; }),
    profiles: (url.searchParams.get('full') === '1' && ready) ? profiles : undefined
  });
}
