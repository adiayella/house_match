/* ---------------------------------------------------------------------------
 * lib/gemini.js — the language model layer, and its boundaries
 *
 * Gemini does two jobs here, both of them on the edges:
 *
 *   1. READING WHAT SOMEBODY TYPED. Intake answers arrive as human sentences
 *      ("somewhere near work, I can't be doing an hour each way"). This turns
 *      that into a structured suggestion and, where the sentence is genuinely
 *      ambiguous, a question to put back to the person.
 *
 *   2. WRITING THE TRADEOFF UP. Once the engine has decided what passed and
 *      what failed, this renders those facts as readable English.
 *
 * What it never does is decide. It is not consulted about whether a flat
 * qualifies, it cannot see the filtering, and nothing it returns is fed back
 * into eligibility. That is not a convention this file politely observes — it
 * is a property of the wiring: api/telegram.js calls the engine, and only then
 * passes the engine's finished verdict here to be narrated.
 *
 * The reason is Meera's lift. A generative step asked to judge "does this flat
 * work for someone who can't manage stairs?" will eventually decide that a
 * second-floor flat is probably fine. Deterministic code asked `lift === true`
 * will not. So the question is never put to the model.
 *
 * Interpretation in job (1) is always a SUGGESTION shown back for confirmation,
 * never a silent rewrite of what somebody said.
 *
 * Absent an API key every function returns null and the bot falls back to its
 * deterministic phrasing. The product degrades in fluency, never in accuracy.
 * ------------------------------------------------------------------------- */

'use strict';

var KEY = String(process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
var MODEL = String(process.env.GEMINI_MODEL || '').trim() || 'gemini-2.0-flash';
var ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

/* Why the last failure is kept: narration failing is invisible by design. The
   page still renders, the bot still answers, and the only symptom is prose
   that never appears. Without this, "enabled but silent" cannot be told apart
   from "the model had nothing to add". */
var lastError = null;

function enabled() { return !!KEY; }
function getLastError() { return lastError; }

/* A cheap end-to-end check: is this key valid and is this model reachable?
   Used by /api/health?deep=1 rather than on every health call, since it is a
   real billed request. */
function ping() {
  if (!KEY) { return Promise.resolve({ ok: false, error: 'no key set' }); }
  return generate('Reply with the single word: ok', { maxOutputTokens: 10, timeoutMs: 8000 })
    .then(function (text) {
      return text
        ? { ok: true, model: MODEL, reply: text.slice(0, 40) }
        : { ok: false, model: MODEL, error: lastError || 'no response' };
    });
}

function generate(prompt, opts) {
  if (!KEY) { return Promise.resolve(null); }
  opts = opts || {};

  var body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature === undefined ? 0.2 : opts.temperature,
      maxOutputTokens: opts.maxOutputTokens || 700
    }
  };
  if (opts.json) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, opts.timeoutMs || 9000);

  return fetch(ENDPOINT + MODEL + ':generateContent?key=' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal
  })
    .then(function (r) {
      return r.json().then(function (json) { return { status: r.status, json: json }; });
    })
    .then(function (res) {
      var json = res.json;

      /* The API answers an invalid key, an unknown model or an exhausted quota
         with a 200-shaped JSON error, not an exception. Reading only
         `candidates` turns every one of those into a silent null that is
         indistinguishable from "the model had nothing to say", so the reason is
         recorded before it is discarded. */
      if (json && json.error) {
        lastError = 'Gemini ' + (json.error.code || res.status) + ': ' +
          (json.error.message || 'unknown error');
        return null;
      }
      var cand = json && json.candidates && json.candidates[0];
      if (cand && cand.finishReason && cand.finishReason !== 'STOP' && !cand.content) {
        lastError = 'Generation stopped: ' + cand.finishReason;
        return null;
      }
      var part = cand && cand.content && cand.content.parts && cand.content.parts[0];
      if (!part || !part.text) {
        lastError = 'No text in response (HTTP ' + res.status + ')';
        return null;
      }
      lastError = null;
      return part.text.trim();
    })
    .catch(function (e) {
      /* A model that is slow, rate-limited or down must not take the product
         with it. Callers treat null as "no narration available". */
      lastError = (e && e.name === 'AbortError')
        ? 'Timed out after ' + (opts.timeoutMs || 9000) + 'ms'
        : String((e && e.message) || e);
      return null;
    })
    .finally(function () { clearTimeout(timer); });
}

/* ----------------------------------------------------------------------- *
 * Job 1 — turn a sentence into a structured suggestion
 * ----------------------------------------------------------------------- */
function interpretTravelAnswer(rawText, destinationOptions) {
  if (!KEY) { return Promise.resolve(null); }

  var prompt = [
    'Someone is filling in a flat-hunting form. They were asked where they need to be able to',
    'get to and how long a journey they would accept. Read their answer and map it onto the',
    'available destinations.',
    '',
    'Their answer: "' + String(rawText).slice(0, 500) + '"',
    '',
    'Available destination ids: ' + destinationOptions.join(', '),
    '',
    'Return JSON only, shaped like:',
    '{"label":"short name for this place, e.g. My office",',
    ' "destId":"one of the ids above, or null if none clearly fits",',
    ' "maxMinutes": integer or null,',
    ' "confident": true or false,',
    ' "question":"a short question to ask them if anything is unclear, else null"}',
    '',
    'Rules you must follow:',
    '- Never invent a time limit they did not give. If they gave no number, maxMinutes is null',
    '  and you must ask for one.',
    '- "near", "close", "not too far" are NOT time limits. Ask.',
    '- If they name a place that is not in the list, set destId to null and ask.',
    '- Set confident to false whenever you had to guess anything at all.'
  ].join('\n');

  return generate(prompt, { json: true, temperature: 0 }).then(function (text) {
    if (!text) { return null; }
    try {
      var parsed = JSON.parse(text);
      /* The model is not trusted to respect its own schema. */
      if (parsed.maxMinutes !== null && parsed.maxMinutes !== undefined) {
        var n = parseInt(parsed.maxMinutes, 10);
        parsed.maxMinutes = (isFinite(n) && n > 0 && n <= 180) ? n : null;
      }
      if (parsed.destId && destinationOptions.indexOf(parsed.destId) === -1) {
        parsed.destId = null;
      }
      return parsed;
    } catch (e) { return null; }
  });
}

/* ----------------------------------------------------------------------- *
 * Job 2 — narrate a verdict the engine has already reached
 * ----------------------------------------------------------------------- */
function narrateOption(evaluation, rank) {
  if (!KEY) { return Promise.resolve(null); }

  var l = evaluation.listing;
  var facts = evaluation.perPerson.map(function (p) {
    return [
      p.name + ':',
      '  monthly share ' + p.share + ' against a ceiling of ' +
        (p.share + p.headroom) + ' (headroom ' + p.headroom + ')',
      '  things she asked for and got: ' + (p.preferencesMet.join(', ') || 'none'),
      '  things she asked for and did NOT get: ' + (p.preferencesMissed.join(', ') || 'none'),
      '  extras she never asked for but gets anyway: ' + ((p.bonuses || []).join(', ') || 'none'),
      '  travel: ' + (p.travel.length
        ? p.travel.map(function (t) { return t.personLabel + ' ' + t.status + ' (' + t.detail + ')'; }).join('; ')
        : 'no travel limits stated'),
      '  still unconfirmed: ' + (p.openQuestions.length
        ? p.openQuestions.map(function (o) { return o.label; }).join(', ')
        : 'nothing')
    ].join('\n');
  }).join('\n');

  var prompt = [
    'You are writing one short paragraph about a flat for three friends who are choosing a',
    'shared place together. The decision about whether this flat qualifies has ALREADY been',
    'made by deterministic code. Your job is only to describe the tradeoff in plain English.',
    '',
    'Flat: ' + l.title + ' in ' + l.area + ' (' + l.microLocation + '), ' +
      l.bhkLabel + ', ' + l.sqft + ' sq ft, ' + l.furnishing + ', rent ' + l.rent +
      ', shortlisted at rank ' + rank + '.',
    '',
    'What the checks found:',
    facts,
    '',
    'Write 2 to 3 sentences, no more than 65 words total. Requirements:',
    '- A person is only compromising if something from her "asked for and did NOT get" line',
    '  is missing. If that line says none, she is NOT compromising, and you must not say or',
    '  imply that she is giving anything up.',
    '- Never treat a feature she never asked for as something she is going without. Absence of',
    '  something nobody wanted is not a sacrifice.',
    '- If she gets extras she never asked for, you may mention them as a bonus, not as a',
    '  requirement being met.',
    '- Only say one person is carrying most of the compromise if she is genuinely missing more',
    '  of her stated wants than the others. If nobody is missing anything, say so plainly.',
    '- Mention anything still unconfirmed as an open question, not as a problem.',
    '- Do not recommend this flat, do not rank it against others, do not tell them what to do.',
    '- Do not invent any fact that is not listed above.',
    '- Plain sentences. No bullet points, no headings, no bold.'
  ].join('\n');

  return generate(prompt, { temperature: 0.35, maxOutputTokens: 200 });
}

module.exports = {
  enabled: enabled,
  generate: generate,
  interpretTravelAnswer: interpretTravelAnswer,
  narrateOption: narrateOption,
  getLastError: getLastError,
  ping: ping,
  model: MODEL
};
