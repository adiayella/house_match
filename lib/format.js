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

var MARK = { pass: '✓', fail: '✗', unverified: '?', bonus: '+' };

/* ----------------------------------------------------------------------- *
 * One shortlisted flat
 * ----------------------------------------------------------------------- */
function optionMessage(ev, rank, narration) {
  var l = ev.listing;
  var out = [];

  out.push('<b>' + rank + '. ' + esc(l.title) + '</b>');
  out.push('<i>' + esc(l.microLocation) + '</i>');
  out.push('');
  out.push(esc(money(l.rent) + ' rent') + '  →  <b>' +
           esc(money(ev.shares.monthly)) + ' each</b>');
  out.push(esc('Deposit ' + money(l.deposit) + '  →  ' + money(ev.shares.deposit) + ' each'));
  out.push(esc(l.bhkLabel + ' · ' + l.sqft + ' sq ft · ' + l.furnishing));
  out.push(esc(l.availableFrom + ' · tenants: ' + l.tenants));
  if (l.sourceUrl) {
    out.push('<a href="' + esc(l.sourceUrl) + '">Check this listing on NoBroker</a>');
  }
  out.push('');

  if (ev.groupOpenQuestions && ev.groupOpenQuestions.length) {
    out.push('<b>— Everyone —</b>');
    ev.groupOpenQuestions.forEach(function (c) {
      out.push('  ' + MARK.unverified + ' <b>' + esc(c.label) + ':</b> ' + esc(c.detail));
    });
    out.push('');
  }

  /* Itemised, one line per thing she actually asked for.
   *
   * A comma-joined summary reads more tidily and is worse: the group cannot
   * see which specific requirement is the one being traded away, which is the
   * only question they are trying to answer. Every stated requirement and
   * every stated preference gets its own line and its own mark, so nothing is
   * silently folded into a phrase like "some compromises". */
  ev.perPerson.forEach(function (p) {
    var metCount = p.preferencesMet.length;
    var prefCount = p.preferences.length;

    out.push('<b>— ' + esc(p.name) + ' —</b>  ' +
             esc(money(p.share) + '/month') +
             (prefCount ? esc('  ·  ' + metCount + ' of ' + prefCount + ' wants met') : ''));

    out.push('  <i>Her requirements</i>');
    p.checks.forEach(function (c) {
      var mark = MARK[c.status] || '·';
      var line = '  ' + mark + ' ' + esc(c.label);
      /* Detail only where something is wrong or unknown. Spelling out why a
         passing check passed is noise. */
      if (c.status !== 'pass') {
        line += '\n       <i>' + esc(c.detail) + '</i>';
      } else if (c.kind === 'budget' && p.headroom > 0) {
        line += ' <i>(' + esc(money(p.headroom)) + ' spare)</i>';
      } else if (c.kind === 'travel' && c.range) {
        line += ' <i>(' + c.range[0] + '–' + c.range[1] + ' min)</i>';
      }
      out.push(line);
    });

    if (prefCount) {
      out.push('  <i>Things she’d like</i>');
      p.preferences.forEach(function (pref) {
        out.push('  ' + (pref.met ? MARK.pass : MARK.fail) + ' ' + esc(pref.name));
      });
    }

    /* Bonuses, never folded in with the compromises. She did not ask for
       these, so their presence is a gain and their absence would have been
       nothing at all. */
    if (p.bonuses && p.bonuses.length) {
      out.push('  <i>Bonus — she didn’t ask for these</i>');
      p.bonuses.forEach(function (b) {
        out.push('  ' + MARK.bonus + ' ' + esc(b));
      });
    }
    out.push('');
  });

  if (narration) {
    out.push('<blockquote>' + esc(narration) + '</blockquote>');
    out.push('');
  }

  /* Who is carrying the compromise — and silence when nobody is.
     Announcing a sacrifice that nobody actually made is worse than saying
     nothing, because the group will go looking for it. */
  var c = ev.compromise;
  if (!c.anyone) {
    out.push('<i>' + esc('Nobody is giving up anything they asked for on this one. ' +
      'The open questions above are still open.') + '</i>');
  } else if (c.even) {
    out.push('<i>' + esc('Everyone is giving up about the same amount here.') + '</i>');
  } else {
    /* Each carrier gets her own list. Naming two people and then printing one
       person's missing items reads as though they are both giving up the same
       things, which is usually false and is exactly the sort of muddle this
       product exists to clear up. */
    var each = c.carriers.map(function (x) {
      return x.name + ' (giving up ' + x.giving.join(', ') + ')';
    });
    var joined = each.length > 1
      ? each.slice(0, -1).join(', ') + ' and ' + each[each.length - 1]
      : each[0];
    out.push('<i>' + esc('Most of the compromise here falls on ' + joined + '.') + '</i>');
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
