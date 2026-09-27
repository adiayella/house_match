/* ---------------------------------------------------------------------------
 * lib/store.js — persistence
 *
 * Supabase over its PostgREST endpoint, using fetch and no client library.
 *
 * There is a deliberate in-memory fallback. If the Supabase environment
 * variables are absent the bot still runs, holding state in the warm
 * serverless instance. That exists so the thing can be demonstrated before the
 * database is wired up, and it is NOT durable: serverless instances are
 * recycled without warning and there can be several at once, so two people
 * answering a minute apart may land on different instances and never see each
 * other. `isDurable()` reports which mode is live and the bot says so on
 * screen rather than letting anyone discover it the hard way.
 *
 * Three things are stored:
 *   hm_profiles  one row per person per group: their answers
 *   hm_sessions  one row per private chat: where someone is up to in the form
 *   hm_votes     one row per person per listing: interested / discuss / reject
 * ------------------------------------------------------------------------- */

'use strict';

/* Normalised rather than taken literally.
 *
 * Dashboard fields do their own thing with URLs - some prepend a scheme, some
 * leave a trailing slash, pastes pick up quotes and newlines - and every one
 * of those produces a fetch that fails in a way indistinguishable from bad
 * credentials. Accepting the host with or without a scheme costs one line and
 * removes a whole class of setup failure. */
function normalizeBase(v) {
  var s = String(v || '').trim().replace(/^["']|["']$/g, '').trim().replace(/\/+$/, '');
  if (!s) { return ''; }
  if (!/^https?:\/\//i.test(s)) { s = 'https://' + s; }
  return s;
}

var URL_BASE = normalizeBase(process.env.SUPABASE_URL);
var KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ||
                 process.env.SUPABASE_ANON_KEY || '')
  .trim().replace(/^["']|["']$/g, '').trim();
var DURABLE = !!(URL_BASE && KEY);

var mem = { profiles: new Map(), sessions: new Map(), votes: new Map() };

function rest(path, opts) {
  opts = opts || {};
  return fetch(URL_BASE + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: KEY,
      authorization: 'Bearer ' + KEY,
      'content-type': 'application/json'
    }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (r) {
    return r.text().then(function (t) {
      if (!r.ok) {
        throw new Error('Supabase ' + r.status + ' on ' + path + ': ' + t.slice(0, 300));
      }
      return t ? JSON.parse(t) : null;
    });
  });
}

/* ------------------------------- profiles ------------------------------- */

function saveProfile(groupId, personKey, profile) {
  if (!DURABLE) {
    mem.profiles.set(groupId + '::' + personKey, { profile: profile, at: Date.now() });
    return Promise.resolve();
  }
  return rest('hm_profiles', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{
      group_id: String(groupId),
      person_key: String(personKey),
      name: profile.name || '',
      payload: profile,
      updated_at: new Date().toISOString()
    }]
  });
}

function listProfiles(groupId) {
  if (!DURABLE) {
    var out = [];
    mem.profiles.forEach(function (v, k) {
      if (k.indexOf(groupId + '::') === 0) { out.push(v.profile); }
    });
    return Promise.resolve(out);
  }
  return rest('hm_profiles?group_id=eq.' + encodeURIComponent(groupId) +
              '&select=payload&order=updated_at.asc')
    .then(function (rows) { return (rows || []).map(function (r) { return r.payload; }); });
}

function clearProfiles(groupId) {
  if (!DURABLE) {
    Array.from(mem.profiles.keys()).forEach(function (k) {
      if (k.indexOf(groupId + '::') === 0) { mem.profiles.delete(k); }
    });
    mem.votes.clear();
    return Promise.resolve();
  }
  return rest('hm_profiles?group_id=eq.' + encodeURIComponent(groupId), {
    method: 'DELETE', headers: { prefer: 'return=minimal' }
  }).then(function () {
    return rest('hm_votes?group_id=eq.' + encodeURIComponent(groupId), {
      method: 'DELETE', headers: { prefer: 'return=minimal' }
    });
  });
}

/* ------------------------------- sessions ------------------------------- */

function getSession(chatId) {
  if (!DURABLE) {
    return Promise.resolve((mem.sessions.get(String(chatId)) || {}).state || null);
  }
  return rest('hm_sessions?chat_id=eq.' + encodeURIComponent(chatId) + '&select=state')
    .then(function (rows) { return rows && rows[0] ? rows[0].state : null; });
}

function setSession(chatId, state) {
  if (!DURABLE) {
    mem.sessions.set(String(chatId), { state: state, at: Date.now() });
    return Promise.resolve();
  }
  return rest('hm_sessions', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{
      chat_id: String(chatId),
      state: state,
      updated_at: new Date().toISOString()
    }]
  });
}

function clearSession(chatId) {
  if (!DURABLE) { mem.sessions.delete(String(chatId)); return Promise.resolve(); }
  return rest('hm_sessions?chat_id=eq.' + encodeURIComponent(chatId), {
    method: 'DELETE', headers: { prefer: 'return=minimal' }
  });
}

/* --------------------------------- votes -------------------------------- */

function saveVote(groupId, listingId, personKey, name, vote) {
  if (!DURABLE) {
    mem.votes.set(groupId + '::' + listingId + '::' + personKey,
      { listing_id: listingId, person_key: personKey, name: name, vote: vote });
    return Promise.resolve();
  }
  return rest('hm_votes', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{
      group_id: String(groupId),
      listing_id: String(listingId),
      person_key: String(personKey),
      name: name || '',
      vote: vote,
      created_at: new Date().toISOString()
    }]
  });
}

function listVotes(groupId, listingId) {
  if (!DURABLE) {
    var out = [];
    mem.votes.forEach(function (v, k) {
      if (k.indexOf(groupId + '::' + listingId + '::') === 0) { out.push(v); }
    });
    return Promise.resolve(out);
  }
  return rest('hm_votes?group_id=eq.' + encodeURIComponent(groupId) +
              '&listing_id=eq.' + encodeURIComponent(listingId) +
              '&select=person_key,name,vote');
}

module.exports = {
  isDurable: function () { return DURABLE; },
  saveProfile: saveProfile,
  listProfiles: listProfiles,
  clearProfiles: clearProfiles,
  getSession: getSession,
  setSession: setSession,
  clearSession: clearSession,
  saveVote: saveVote,
  listVotes: listVotes
};
