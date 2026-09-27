/* ---------------------------------------------------------------------------
 * lib/format.js — turning a verdict into messages people can read
 *
 * Everything here is presentation. No decision is taken in this file, and the
 * numbers it prints come straight from the engine.
 *
 * The shape of an option message is deliberate. Each person gets her own block
 * with three headings — what she gets, what she gives up, what is still
 * unconfirmed — because the failure this product exists to fix is a group
 * discovering a dealbreaker one objection at a time in a chat thread. Putting
 * all three columns side by side in a single message is the entire point.
 * ------------------------------------------------------------------------- */

'use strict';

var tg = require('./telegram-api.js');
var esc = tg.esc;

function money(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

var MARK = { pass: '✓', fail: '✗', unverified: '?' };

/* ----------------------------------------------------------------------- *
 * One shortlisted flat
 * ----------------------------------------------------------------------- */
function optionMessage(ev, rank, narration) {
  var l = ev.listing;
  var out = [];

  out.push('<b>' + rank + '. ' + esc(l.bhk + ' BHK in ' + l.area) + '</b>');
  out.push('<i>' + esc(l.microLocation) + '</i>');
  out.push('');
  out.push(esc(money(l.rent) + ' rent + ' + money(l.maintenance) + ' maintenance') +
           '  →  <b>' + esc(money(ev.shares.monthly)) + ' each</b>');
  out.push(esc('Deposit ' + money(l.deposit) + '  →  ' + money(ev.shares.deposit) + ' each'));
  out.push(esc(l.bathrooms + ' bathrooms · ' + l.furnishing + ' · floor ' +
               l.floor + ' of ' + l.totalFloors));
  out.push('');

  ev.perPerson.forEach(function (p) {
    out.push('<b>— ' + esc(p.name) + ' —</b>');

    var gets = [];
    p.preferencesMet.forEach(function (x) { gets.push(x); });
    p.travel.forEach(function (t) {
      if (t.status === 'pass') {
        gets.push(t.personLabel + ' about ' + t.range[0] + '–' + t.range[1] + ' min');
      }
    });
    if (p.headroom > 0) { gets.push(money(p.headroom) + ' a month under her ceiling'); }

    var gives = [];
    p.preferencesMissed.forEach(function (x) { gives.push('no ' + x.toLowerCase()); });
    if (p.headroom === 0) { gives.push('paying right up to her ceiling'); }

    /* Travel checks are already in openQuestions. They are filtered out and
       re-added in a form that names the actual doubt, because the bare label
       only repeats the limit back and tells nobody anything. */
    var open = p.openQuestions
      .filter(function (o) { return o.kind !== 'travel'; })
      .map(function (o) { return o.label; });
    p.travel.forEach(function (t) {
      if (t.status === 'unverified') {
        open.push(t.personLabel + ' may run to ' + t.range[1] + ' min in bad traffic');
      }
    });

    out.push('  ' + MARK.pass + ' <b>Gets:</b> ' + esc(gets.length ? gets.join(', ') : 'nothing beyond the basics'));
    out.push('  ' + MARK.fail + ' <b>Gives up:</b> ' + esc(gives.length ? gives.join(', ') : 'nothing she listed'));
    if (open.length) {
      out.push('  ' + MARK.unverified + ' <b>Unconfirmed:</b> ' + esc(open.join(', ')));
    }
    out.push('');
  });

  if (narration) {
    out.push('<blockquote>' + esc(narration) + '</blockquote>');
    out.push('');
  }

  /* Who is carrying the compromise. This is the number the group actually
     needs and the one a simple average would hide. */
  var worst = ev.perPerson.slice().sort(function (a, b) { return a.score - b.score; })[0];
  if (ev.spread > 0.2) {
    out.push('<i>' + esc('Most of the compromise here falls on ' + worst.name + '.') + '</i>');
  } else {
    out.push('<i>' + esc('The compromise is spread fairly evenly.') + '</i>');
  }

  return out.join('\n');
}

/* ----------------------------------------------------------------------- *
 * The covering message
 * ----------------------------------------------------------------------- */
function summaryMessage(result, opts) {
  opts = opts || {};
  var out = [];
  var n = result.shortlist.length;

  out.push('<b>Options that qualify</b>');
  out.push('');

  if (n === 0) {
    out.push(esc('None of the ' + result.considered + ' flats checked satisfies everything ' +
      'all three of you said was non-negotiable.'));
    out.push('');
    out.push(esc('That is a real answer, not a failure. Nothing has been relaxed to fill the ' +
      'list. What is doing the eliminating:'));
    out.push('');
    result.constraintImpact.slice(0, 6).forEach(function (c) {
      out.push('  • ' + esc(c.person + ' — ' + c.label + ': rules out ' +
        c.count + ' flat' + (c.count === 1 ? '' : 's')));
    });
    out.push('');
    out.push(esc('If someone wants to move a limit, that is her call to make out loud. ' +
      'Send /reset and fill the form in again.'));
    return out.join('\n');
  }

  out.push(esc(result.considered + ' flats checked. ' + result.qualifyingCount +
    ' satisfy every non-negotiable. Here ' + (n === 1 ? 'is the one' : 'are the top ' + n) + '.'));
  out.push('');
  out.push(esc('Ranked by how the worst-off person does, not by the average — an option ' +
    'that suits two of you and punishes the third is exactly what you have been ' +
    'trying to avoid.'));
  out.push('');
  out.push('<i>' + esc('Checked at ' + (result.traffic === 'peak'
    ? 'weekday office-hour traffic' : 'lighter traffic') + '.') + '</i>');

  if (opts.assumptions && opts.assumptions.length) {
    out.push('');
    out.push('<b>Assumptions in play</b>');
    opts.assumptions.forEach(function (a) { out.push('  • ' + esc(a)); });
  }

  return out.join('\n');
}

/* ----------------------------------------------------------------------- *
 * What got ruled out and why
 * ----------------------------------------------------------------------- */
function eliminationMessage(result) {
  var out = [];
  out.push('<b>What was ruled out, and by whom</b>');
  out.push('');
  out.push(esc('Every flat below failed at least one stated non-negotiable. None of them ' +
    'were dropped quietly.'));
  out.push('');

  result.eliminated.slice(0, 14).forEach(function (r) {
    var reasons = {};
    r.blockers.forEach(function (b) {
      var k = b.person + ' — ' + b.label;
      reasons[k] = true;
    });
    out.push('<b>' + esc(r.listing.area) + '</b> ' +
      esc('(' + r.listing.id + ', ' + money(r.shares.monthly) + ' each)'));
    Object.keys(reasons).slice(0, 3).forEach(function (k) {
      out.push('   ✗ ' + esc(k));
    });
    out.push('');
  });

  if (result.eliminated.length > 14) {
    out.push('<i>' + esc('…and ' + (result.eliminated.length - 14) + ' more.') + '</i>');
    out.push('');
  }

  out.push('<b>Which limits are doing the most work</b>');
  result.constraintImpact.slice(0, 6).forEach(function (c) {
    out.push('  • ' + esc(c.person + ' — ' + c.label + ': ' + c.count + ' flat' +
      (c.count === 1 ? '' : 's')));
  });

  return out.join('\n');
}

/* ----------------------------------------------------------------------- *
 * Playing somebody's answers back to them
 * ----------------------------------------------------------------------- */
function profileSummary(p) {
  var out = [];
  var mh = p.mustHaves || {};
  var hard = [];
  if (mh.lift) { hard.push('a lift'); }
  if (mh.parking) { hard.push('parking'); }
  if (mh.petFriendly) { hard.push('pets allowed'); }
  if (mh.minBathrooms) { hard.push('at least ' + mh.minBathrooms + ' bathrooms'); }

  out.push('<b>' + esc(p.name) + '</b>' + (p.role === 'coordinator' ? ' <i>(coordinating)</i>' : ''));
  out.push(esc('Up to ' + money(p.maxShare) + ' a month' +
    (p.flexibleBudget ? ' — flagged as the figure she would move' : '')));
  if (p.maxDeposit) { out.push(esc('Deposit share up to ' + money(p.maxDeposit))); }
  out.push(esc('Must have: ' + (hard.length ? hard.join(', ') : 'nothing stated')));

  (p.destinations || []).forEach(function (d) {
    out.push(esc('Must reach ' + d.label + ' within ' + d.maxMinutes + ' min'));
  });

  if ((p.excludedAreas || []).length) {
    out.push(esc('Will not consider: ' + p.excludedAreas.join(', ')));
  }
  out.push(esc('Would like: ' + ((p.preferences || []).join(', ') || 'nothing in particular')));
  if (p.intakeNotes) { out.push('<i>' + esc(p.intakeNotes) + '</i>'); }

  return out.join('\n');
}

module.exports = {
  optionMessage: optionMessage,
  summaryMessage: summaryMessage,
  eliminationMessage: eliminationMessage,
  profileSummary: profileSummary,
  money: money
};
