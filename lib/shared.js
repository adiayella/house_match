/* ---------------------------------------------------------------------------
 * lib/shared.js — one engine, two runtimes
 *
 * The matching engine and the datasets live under public/ so the browser can
 * load them with plain <script> tags. They are written as browser files: each
 * one assigns onto `window`.
 *
 * Rather than keep a second Node copy of the same logic — which would drift,
 * and would mean the web page and the bot could eventually disagree about
 * whether a flat qualifies — this module aliases `window` onto `globalThis`
 * and requires those same files. There is exactly one implementation of the
 * rules in this repository.
 *
 * Vercel's file tracing follows these requires, so the public/ files are
 * bundled into the serverless function as well as being served statically.
 * ------------------------------------------------------------------------- */

'use strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

require('../public/data/listings.js');
require('../public/data/travel.js');
require('../public/data/demo-profiles.js');
require('../public/assets/match.js');

module.exports = {
  listings: globalThis.window.HM_LISTINGS,
  travel: globalThis.window.HM_TRAVEL,
  demoProfiles: globalThis.window.HM_DEMO_PROFILES,
  demoMeta: globalThis.window.HM_DEMO_META,
  match: globalThis.window.HM_MATCH
};
