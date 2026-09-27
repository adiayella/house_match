/* ---------------------------------------------------------------------------
 * api/telegram.js — the webhook
 *
 * Telegram posts every update here. One function handles the whole product:
 * the private intake conversation, the group commands, the match run and the
 * votes on each option.
 *
 * The shape that matters:
 *
 *   PRIVATE CHAT   Each person answers the form alone. The bot never repeats
 *                  one person's answers into the group, and never shows
 *                  anybody else's. This is the "one form, three people fill it
 *                  in separately" requirement, and it is enforced by which
 *                  chat each message is sent to.
 *
 *   GROUP CHAT     Nothing appears here until all three profiles are in. Then
 *                  the whole shortlist arrives at once, with every person's
 *                  gets and gives-up side by side. No listing is ever put in
 *                  front of the group one objection at a time.
 *
 * The bot ranks and explains. It does not choose, it will return an empty
 * shortlist rather than relax somebody's stated dealbreaker, and where the
 * listing data is silent it says "unconfirmed" instead of guessing.
 * ------------------------------------------------------------------------- */

'use strict';

var tg = require('../lib/telegram-api.js');
var store = require('../lib/store.js');
var gemini = require('../lib/gemini.js');
var fmt = require('../lib/format.js');
var shared = require('../lib/shared.js');

var esc = tg.esc;
var LISTINGS = shared.listings;
var TRAVEL = shared.travel;
var MATCH = shared.match;

var AREAS = Object.keys(LISTINGS.verifySearch);
var PREFS = LISTINGS.preferenceVocabulary;
var DEST_IDS = Object.keys(TRAVEL.destinations);
var GROUP_ENV = process.env.TELEGRAM_GROUP_CHAT_ID || '';

/* ======================================================================== *
 * Entry
 * ======================================================================== */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'HouseMatch Telegram webhook',
      hint: 'Telegram POSTs here. See /api/health for configuration status.'
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  /* If a webhook secret is configured, unsigned calls are refused. Without it
     the endpoint is a public URL that anyone could post updates to. */
  var secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ ok: false, error: 'bad secret token' });
  }

  var update = req.body || {};

  try {
    if (update.callback_query) {
      await onCallback(update.callback_query);
    } else if (update.message) {
      await onMessage(update.message);
    }
  } catch (err) {
    console.error('handler error', err);
    /* Telegram retries anything that is not a 2xx, which would replay the same
       failing update forever. Log it and acknowledge. */
  }

  return res.status(200).json({ ok: true });
};

/* ======================================================================== *
 * Messages
 * ======================================================================== */
async function onMessage(msg) {
  var chatId = msg.chat.id;
  var isPrivate = msg.chat.type === 'private';
  var text = (msg.text || '').trim();
  if (!text) { return; }

  var cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');

  if (!isPrivate) { return onGroupCommand(chatId, cmd, msg); }

  switch (cmd) {
    case '/start':  return startIntake(chatId, msg.from);
    case '/help':   return helpPrivate(chatId);
    case '/status': return statusMessage(chatId);
    case '/cancel': return store.clearSession(chatId)
      .then(function () { return tg.sendMessage(chatId, 'Stopped. Send /start to begin again.'); });
    case '/reset':  return resetEverything(chatId);
    case '/match':  return runMatch(chatId, { force: true });
    case '/why':    return runMatch(chatId, { force: true, why: true });
    case '/demo':   return loadDemo(chatId);
    default: break;
  }

  var state = await store.getSession(chatId);
  if (!state) { return helpPrivate(chatId); }
  return advance(chatId, state, text, msg.from);
}

async function onGroupCommand(chatId, cmd, msg) {
  switch (cmd) {
    case '/groupid':
      return tg.sendMessage(chatId,
        'This chat’s id is <code>' + esc(chatId) + '</code>\n\n' +
        'Put it in the <code>TELEGRAM_GROUP_CHAT_ID</code> environment variable, ' +
        'or send /usegroup here to save it now.');

    case '/usegroup':
      await store.setSession('settings:group', { groupChatId: String(chatId) });
      return tg.sendMessage(chatId,
        'Saved. The shortlist will be posted here once all three of you have filled in the form.\n\n' +
        'Message me privately and send /start to do yours.');

    case '/status':  return statusMessage(chatId);
    case '/match':   return runMatch(chatId, { force: true });
    case '/why':     return runMatch(chatId, { force: true, why: true });
    case '/demo':    return loadDemo(chatId);
    case '/reset':   return resetEverything(chatId);
    case '/help':
      return tg.sendMessage(chatId,
        '<b>HouseMatch</b>\n\n' +
        'Each of you messages me privately and sends /start. Nobody sees anybody ' +
        'else’s answers. When all three are in, the options are posted here.\n\n' +
        '/status — who has answered\n' +
        '/match — run it now\n' +
        '/why — what got ruled out and by whom\n' +
        '/demo — load the three profiles from the case and run it\n' +
        '/reset — clear everything and start again');
    default: return;
  }
}

/* ======================================================================== *
 * The intake conversation
 * ======================================================================== */
var STEPS = ['name', 'budget', 'flexible', 'deposit', 'musthaves', 'bathrooms',
             'travel', 'excluded', 'preferences', 'notes', 'confirm'];

function blankProfile(from) {
  return {
    id: String(from.id),
    name: from.first_name || '',
    role: 'participant',
    maxShare: 0,
    maxDeposit: null,
    excludedAreas: [],
    preferredArea: null,
    mustHaves: { lift: false, parking: false, petFriendly: false, minBathrooms: 0 },
    destinations: [],
    preferences: [],
    flexibleBudget: false,
    intakeNotes: ''
  };
}

async function startIntake(chatId, from) {
  var state = { step: 'name', profile: blankProfile(from) };
  await store.setSession(chatId, state);

  await tg.sendMessage(chatId,
    '<b>HouseMatch</b>\n\n' +
    'I’ll ask you eleven short questions about what you need from a flat. ' +
    'Your answers stay private — the others never see them, and I won’t put ' +
    'anything in the group until all three of you have finished.\n\n' +
    'Then you’ll get two or three flats that satisfy everything all three of you ' +
    'said was non-negotiable, with what each of you gives up written down.\n\n' +
    '<i>I won’t pick one. That part is yours.</i>\n\n' +
    'Send /cancel at any point to stop.');

  return ask(chatId, 'name', state);
}

function ask(chatId, step, state) {
  var p = state.profile;

  switch (step) {
    case 'name':
      return tg.sendMessage(chatId,
        '<b>1 of 11.</b> What should I call you in the comparison?' +
        (p.name ? '\n\nSend <code>ok</code> to use <b>' + esc(p.name) + '</b>.' : ''));

    case 'budget':
      return tg.sendMessage(chatId,
        '<b>2 of 11.</b> The most you can pay per month — your share of rent plus ' +
        'maintenance, in rupees.\n\n' +
        '<i>This gets checked against your own number, not a group average. ' +
        'Nobody can commit you to more than you put here.</i>\n\n' +
        'Just the number, e.g. <code>18000</code>');

    case 'flexible':
      return tg.sendMessage(chatId,
        '<b>3 of 11.</b> Is that budget the thing you’d move on if the group got stuck?\n\n' +
        'Reply <code>yes</code> or <code>no</code>.');

    case 'deposit':
      return tg.sendMessage(chatId,
        '<b>4 of 11.</b> The most you could put into the deposit, as your share.\n\n' +
        'A number, or <code>skip</code> if you have no firm ceiling.');

    case 'musthaves':
      return tg.sendMessage(chatId,
        '<b>5 of 11.</b> What does the building absolutely have to have?\n\n' +
        '<code>1</code> — a lift\n' +
        '<code>2</code> — parking\n' +
        '<code>3</code> — pets allowed\n\n' +
        'Reply with the numbers, e.g. <code>1,2</code> — or <code>none</code>.\n\n' +
        '<i>Only list what genuinely has to be true. Anything here can eliminate ' +
        'a flat on its own, and I will not let a listing pass it on missing data.</i>');

    case 'bathrooms':
      return tg.sendMessage(chatId,
        '<b>6 of 11.</b> Fewest bathrooms you’d accept?\n\n' +
        'Reply <code>0</code> (no requirement), <code>2</code> or <code>3</code>.');

    case 'travel':
      return tg.sendMessage(chatId,
        '<b>7 of 11.</b> Anywhere you have to be able to reach, and how long a journey ' +
        'you’d actually accept.\n\n' +
        '<i>This is the one that usually goes unsaid until somebody has already fallen ' +
        'for a flat.</i>\n\n' +
        destinationList() + '\n' +
        'Reply like: <code>My office, 1, 25</code>\n' +
        '(what it is, the number, the most minutes you’d accept)\n\n' +
        (gemini.enabled()
          ? 'Or just describe it normally and I’ll read it back to you.\n\n'
          : '') +
        'Send <code>done</code> when you’ve added them all' +
        (p.destinations.length ? ' — you have ' + p.destinations.length + ' so far.' : ', or now if you have none.'));

    case 'excluded':
      return tg.sendMessage(chatId,
        '<b>8 of 11.</b> Any areas you flatly will not consider?\n\n' +
        areaList() + '\n' +
        'Reply with numbers, e.g. <code>7</code> — or <code>none</code>.');

    case 'preferences':
      return tg.sendMessage(chatId,
        '<b>9 of 11.</b> Things you’d like but could live without.\n\n' +
        prefList() + '\n' +
        'Reply with numbers, e.g. <code>1,4,5</code> — or <code>none</code>.\n\n' +
        '<i>These never eliminate a flat. They show up as what you’re giving up.</i>');

    case 'notes':
      return tg.sendMessage(chatId,
        '<b>10 of 11.</b> Anything else the other two should know?\n\n' +
        'A sentence, or <code>skip</code>.');

    case 'confirm':
      return tg.sendMessage(chatId,
        '<b>11 of 11.</b> Here’s what I have for you.\n\n' +
        fmt.profileSummary(p) + '\n\n' +
        'Reply <code>yes</code> to lock it in, or <code>redo</code> to start over.');
  }
}

function destinationList() {
  return DEST_IDS.map(function (id, i) {
    return '<code>' + (i + 1) + '</code> — ' + esc(TRAVEL.destinations[id].label);
  }).join('\n') + '\n';
}
function areaList() {
  return AREAS.map(function (a, i) {
    return '<code>' + (i + 1) + '</code> — ' + esc(a);
  }).join('\n') + '\n';
}
function prefList() {
  return PREFS.map(function (p, i) {
    return '<code>' + (i + 1) + '</code> — ' + esc(p);
  }).join('\n') + '\n';
}

function pickNumbers(text, list) {
  if (/^(none|no|skip)$/i.test(text.trim())) { return []; }
  var out = [];
  text.split(/[,\s]+/).forEach(function (tok) {
    var n = parseInt(tok, 10);
    if (isFinite(n) && n >= 1 && n <= list.length) {
      var v = list[n - 1];
      if (out.indexOf(v) === -1) { out.push(v); }
    }
  });
  return out;
}

/* ----------------------------------------------------------------------- *
 * Step machine
 * ----------------------------------------------------------------------- */
async function advance(chatId, state, text, from) {
  var p = state.profile;
  var step = state.step;
  var lower = text.toLowerCase().trim();

  switch (step) {
    case 'name':
      if (lower === 'ok' && p.name) { /* keep the Telegram first name */ }
      else if (text.length > 40 || text.length < 1) {
        return tg.sendMessage(chatId, 'Just a first name is fine.');
      } else { p.name = text; }
      break;

    case 'budget': {
      var n = parseInt(text.replace(/[^\d]/g, ''), 10);
      if (!isFinite(n) || n < 1000) {
        return tg.sendMessage(chatId,
          'I need a monthly figure in rupees — something like <code>18000</code>.');
      }
      p.maxShare = n;
      break;
    }

    case 'flexible':
      if (!/^(yes|y|no|n)$/i.test(lower)) {
        return tg.sendMessage(chatId, 'Reply <code>yes</code> or <code>no</code>.');
      }
      p.flexibleBudget = /^y/i.test(lower);
      break;

    case 'deposit': {
      if (/^(skip|none|no)$/i.test(lower)) { p.maxDeposit = null; break; }
      var d = parseInt(text.replace(/[^\d]/g, ''), 10);
      if (!isFinite(d) || d < 1000) {
        return tg.sendMessage(chatId, 'A number, or <code>skip</code>.');
      }
      p.maxDeposit = d;
      break;
    }

    case 'musthaves': {
      var picked = pickNumbers(text, ['lift', 'parking', 'petFriendly']);
      p.mustHaves.lift = picked.indexOf('lift') !== -1;
      p.mustHaves.parking = picked.indexOf('parking') !== -1;
      p.mustHaves.petFriendly = picked.indexOf('petFriendly') !== -1;
      break;
    }

    case 'bathrooms': {
      var b = parseInt(text.replace(/[^\d]/g, ''), 10);
      if (![0, 2, 3].includes(b)) {
        return tg.sendMessage(chatId, 'Reply <code>0</code>, <code>2</code> or <code>3</code>.');
      }
      p.mustHaves.minBathrooms = b;
      break;
    }

    case 'travel': {
      if (/^done$/i.test(lower)) { break; }
      var added = await parseTravel(chatId, text, p);
      if (!added) { return; }           /* parseTravel already replied */
      await store.setSession(chatId, state);
      return tg.sendMessage(chatId,
        'Added: <b>' + esc(added.label) + '</b> within ' + added.maxMinutes + ' min of ' +
        esc(TRAVEL.destinations[added.destId].label) + '.\n\n' +
        'Another one, or <code>done</code>.');
    }

    case 'excluded':
      p.excludedAreas = pickNumbers(text, AREAS);
      break;

    case 'preferences':
      p.preferences = pickNumbers(text, PREFS);
      break;

    case 'notes':
      p.intakeNotes = /^(skip|none|no)$/i.test(lower) ? '' : text.slice(0, 300);
      break;

    case 'confirm':
      if (/^redo$/i.test(lower)) { return startIntake(chatId, from); }
      if (!/^(yes|y|ok)$/i.test(lower)) {
        return tg.sendMessage(chatId, 'Reply <code>yes</code> to lock it in, or <code>redo</code>.');
      }
      return finishIntake(chatId, p);
  }

  var next = STEPS[STEPS.indexOf(step) + 1];
  state.step = next;
  await store.setSession(chatId, state);
  return ask(chatId, next, state);
}

/* ----------------------------------------------------------------------- *
 * Travel parsing: strict format first, model only as a fallback
 *
 * The structured form is tried before Gemini is consulted at all, so the
 * common case costs nothing and cannot be misread. The model is there to catch
 * people who type a sentence instead, and even then its reading is confirmed
 * rather than applied silently.
 * ----------------------------------------------------------------------- */
async function parseTravel(chatId, text, profile) {
  var m = text.split(',').map(function (s) { return s.trim(); });
  if (m.length === 3) {
    var idx = parseInt(m[1], 10);
    var mins = parseInt(m[2].replace(/[^\d]/g, ''), 10);
    if (isFinite(idx) && idx >= 1 && idx <= DEST_IDS.length && isFinite(mins) && mins > 0) {
      var dest = { label: m[0].slice(0, 40) || 'Somewhere', destId: DEST_IDS[idx - 1], maxMinutes: mins };
      profile.destinations.push(dest);
      return dest;
    }
  }

  if (gemini.enabled()) {
    var read = await gemini.interpretTravelAnswer(text, DEST_IDS);
    if (read && read.destId && read.maxMinutes && read.confident) {
      var d2 = {
        label: (read.label || 'Somewhere').slice(0, 40),
        destId: read.destId,
        maxMinutes: read.maxMinutes,
        interpreted: true
      };
      profile.destinations.push(d2);
      return d2;
    }
    if (read && read.question) {
      await tg.sendMessage(chatId,
        esc(read.question) + '\n\n<i>I’d rather ask than guess at a limit you didn’t give.</i>');
      return null;
    }
  }

  await tg.sendMessage(chatId,
    'I couldn’t read that as a place and a time limit.\n\n' +
    destinationList() +
    'Reply like <code>My office, 1, 25</code>, or <code>done</code> if you have none.');
  return null;
}

/* ----------------------------------------------------------------------- *
 * Saving, and the trigger to run
 * ----------------------------------------------------------------------- */
async function finishIntake(chatId, profile) {
  var groupId = await resolveGroupId();
  await store.saveProfile(groupId, profile.id, profile);
  await store.clearSession(chatId);

  var profiles = await store.listProfiles(groupId);
  var names = profiles.map(function (x) { return x.name; });

  await tg.sendMessage(chatId,
    '<b>Locked in. Thank you.</b>\n\n' +
    esc(names.length + ' of 3 answered' + (names.length ? ': ' + names.join(', ') : '') + '.') +
    (names.length >= 3
      ? '\n\nThat’s everyone — working out the options now.'
      : '\n\nI’ll run it as soon as the others are done. Nothing goes to the group until then.') +
    (store.isDurable() ? '' :
      '\n\n<i>Note: no database is configured, so answers are held in memory and may not ' +
      'survive. See the README.</i>'));

  if (names.length >= 3) { return runMatch(chatId, {}); }
}

async function resolveGroupId() {
  if (GROUP_ENV) { return GROUP_ENV; }
  var saved = await store.getSession('settings:group');
  return (saved && saved.groupChatId) ? saved.groupChatId : 'default';
}

async function statusMessage(chatId) {
  var groupId = await resolveGroupId();
  var profiles = await store.listProfiles(groupId);
  if (!profiles.length) {
    return tg.sendMessage(chatId,
      'Nobody has filled it in yet.\n\nMessage me privately and send /start.');
  }
  return tg.sendMessage(chatId,
    '<b>' + profiles.length + ' of 3 answered</b>\n\n' +
    profiles.map(function (p) { return '✓ ' + esc(p.name); }).join('\n') +
    (profiles.length < 3 ? '\n\n<i>Waiting on the rest.</i>' : '\n\nSend /match to run it.'));
}

/* ----------------------------------------------------------------------- *
 * /demo — the scenario, without needing three phones
 *
 * Loads Riya, Meera and Kavita as the case describes them and runs the match
 * immediately. Because the writes and the run happen inside a single request,
 * this works even with no database configured, which the ordinary three-person
 * flow does not.
 *
 * It says on screen that these are the case's profiles, not real people, and
 * which two figures are project assumptions rather than facts from the case.
 * ----------------------------------------------------------------------- */
async function loadDemo(chatId) {
  var groupId = await resolveGroupId();
  await store.clearProfiles(groupId);

  for (var i = 0; i < shared.demoProfiles.length; i++) {
    var p = shared.demoProfiles[i];
    await store.saveProfile(groupId, p.id, p);
  }

  await tg.sendMessage(chatId,
    '<b>Loaded the three profiles from the case.</b>\n\n' +
    shared.demoProfiles.map(function (p) { return fmt.profileSummary(p); }).join('\n\n') +
    '\n\n<i>Two figures here are project assumptions, not facts from the case: ' +
    'the family is placed in Aundh (the case never says where it is), and the office ' +
    'commute ceiling is taken as 25 minutes to Hinjewadi Phase 1 (the case rules out ' +
    '45 minutes but never states what would be acceptable).</i>\n\n' +
    'Running the match now.');

  return runMatch(chatId, { force: true });
}

async function resetEverything(chatId) {
  var groupId = await resolveGroupId();
  await store.clearProfiles(groupId);
  await store.clearSession(chatId);
  return tg.sendMessage(chatId,
    'Cleared. Everyone will need to send /start again.\n\n' +
    '<i>Nothing was relaxed or carried over — you get a clean set of answers.</i>');
}

/* ======================================================================== *
 * The run
 * ======================================================================== */
async function runMatch(originChatId, opts) {
  opts = opts || {};
  var groupId = await resolveGroupId();
  var profiles = await store.listProfiles(groupId);

  if (profiles.length < 3 && !opts.force) { return; }
  if (!profiles.length) {
    return tg.sendMessage(originChatId, 'No answers yet. Send /start in a private message.');
  }

  var target = (groupId && groupId !== 'default') ? groupId : originChatId;
  var result = MATCH.evaluateGroup(profiles, { traffic: 'peak', shortlistSize: 3 });

  if (opts.why) {
    return tg.sendMessage(target, fmt.eliminationMessage(result));
  }

  /* Assumptions that are ours rather than theirs get said out loud, every run. */
  var assumptions = [
    'Rent and maintenance split equally three ways.',
    'Journeys by car at weekday office hours.',
    'Listings are a curated sample dataset, not a live portal feed.'
  ];

  await tg.sendMessage(target, fmt.summaryMessage(result, { assumptions: assumptions }));

  for (var i = 0; i < result.shortlist.length; i++) {
    var ev = result.shortlist[i];
    var narration = await gemini.narrateOption(ev, i + 1);
    await tg.sendMessage(target, fmt.optionMessage(ev, i + 1, narration), {
      reply_markup: {
        inline_keyboard: [[
          { text: '\u{1F44D} Interested', callback_data: 'v:' + ev.listing.id + ':interested' },
          { text: '\u{1F914} Discuss', callback_data: 'v:' + ev.listing.id + ':discuss' },
          { text: '\u{1F44E} Reject', callback_data: 'v:' + ev.listing.id + ':reject' }
        ]]
      }
    });
  }

  if (result.shortlist.length) {
    await tg.sendMessage(target,
      '<i>' + esc(result.disclaimer) + '</i>\n\n' +
      'Send /why to see everything that was ruled out and which limit ruled it out.');
  }
}

/* ======================================================================== *
 * Votes
 * ======================================================================== */
async function onCallback(cq) {
  var parts = (cq.data || '').split(':');
  if (parts[0] !== 'v') { return tg.answerCallback(cq.id); }

  var listingId = parts[1];
  var vote = parts[2];
  var groupId = await resolveGroupId();
  var name = cq.from.first_name || 'Someone';

  await store.saveVote(groupId, listingId, String(cq.from.id), name, vote);

  var votes = await store.listVotes(groupId, listingId);
  var tally = { interested: [], discuss: [], reject: [] };
  (votes || []).forEach(function (v) {
    if (tally[v.vote]) { tally[v.vote].push(v.name); }
  });

  var line = [];
  if (tally.interested.length) { line.push('\u{1F44D} ' + tally.interested.join(', ')); }
  if (tally.discuss.length) { line.push('\u{1F914} ' + tally.discuss.join(', ')); }
  if (tally.reject.length) { line.push('\u{1F44E} ' + tally.reject.join(', ')); }

  /* A callback query must be answered exactly once, so the tally goes in that
     one acknowledgement rather than a second call. */
  await tg.answerCallback(cq.id, line.join('   ') || 'Recorded: ' + vote);

  /* Where it matters, the standing tally is echoed into the chat so the group
     can see how each option is landing without tapping every button. */
  if (tally.interested.length + tally.discuss.length + tally.reject.length >= 3) {
    await tg.sendMessage(cq.message.chat.id,
      '<b>' + esc(listingId) + '</b> — where everyone stands: ' + esc(line.join('   ')));
  }
}

/* ======================================================================== *
 * Help
 * ======================================================================== */
function helpPrivate(chatId) {
  return tg.sendMessage(chatId,
    '<b>HouseMatch</b>\n\n' +
    'Send /start and I’ll take you through the form. It takes about two minutes.\n\n' +
    '/start — fill in your answers\n' +
    '/status — who has answered so far\n' +
    '/match — run it now\n' +
    '/why — what got ruled out and by whom\n' +
    '/demo — load the three profiles from the case and run it\n' +
    '/cancel — stop part-way\n' +
    '/reset — clear everything and start again');
}
