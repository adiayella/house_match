/* ---------------------------------------------------------------------------
 * assets/app.js — the worked example on the landing page
 *
 * This runs the real engine in the browser against the three profiles from the
 * case. It is not a mock or a screenshot: assets/match.js is the same file the
 * Telegram bot requires through lib/shared.js, so whatever this page shows is
 * what the bot would post.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var M = window.HM_MATCH;
  var TRAVEL = window.HM_TRAVEL;
  var PROFILES = window.HM_DEMO_PROFILES;
  var META = window.HM_DEMO_META;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (html !== undefined) { n.innerHTML = html; }
    return n;
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ------------------------------ theme ------------------------------ */
  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var isDark = cur === 'dark' ||
        (!cur && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('hm-theme', next); } catch (e) { /* private mode */ }
    });
    try {
      var saved = localStorage.getItem('hm-theme');
      if (saved) { document.documentElement.setAttribute('data-theme', saved); }
    } catch (e) { /* storage can be blocked; the page renders fine without it */ }
  }

  /* --------------------------- assumptions --------------------------- */
  var assumptionsBox = document.getElementById('assumptions');
  if (assumptionsBox && META) {
    var flagged = [];
    PROFILES.forEach(function (p) {
      (p.destinations || []).forEach(function (d) {
        if (d.assumption) {
          flagged.push(p.name + ' &mdash; ' + esc(d.label) + ': ' + esc(d.assumptionNote));
        }
      });
    });
    assumptionsBox.innerHTML =
      '<h3>What is assumed here, and what came from the case</h3>' +
      '<p class="tight">The case does not give every number the matching needs. Rather than ' +
      'quietly invent them, the gaps are filled with stated assumptions and labelled:</p>' +
      '<ul class="lines" style="margin-top:8px">' +
      META.assumptionsUsed.map(function (a) {
        return '<li><span class="pill neutral">assumed</span><span class="txt">' + esc(a) + '</span></li>';
      }).join('') +
      '</ul>' +
      (flagged.length
        ? '<p class="muted" style="margin-top:10px">' + flagged.join('<br>') + '</p>'
        : '');
  }

  /* ----------------------------- rendering ---------------------------- */
  function pill(status) {
    var label = status === 'pass' ? 'gets' : status === 'fail' ? 'gives up' : 'unconfirmed';
    return '<span class="pill ' + status + '">' + label + '</span>';
  }

  function personBlock(p, spread, worstName) {
    var gets = p.preferencesMet.slice();
    p.travel.forEach(function (t) {
      if (t.status === 'pass') {
        gets.push(t.personLabel + ' &mdash; about ' + t.range[0] + '–' + t.range[1] + ' min');
      }
    });
    if (p.headroom > 0) { gets.push(M.money(p.headroom) + ' a month under her ceiling'); }

    var gives = p.preferencesMissed.map(function (x) { return 'no ' + x.toLowerCase(); });
    if (p.headroom === 0) { gives.push('paying right up to her ceiling'); }

    /* Travel checks are already in openQuestions, so they are filtered out and
       re-added in a form that says what the actual doubt is: the bare label
       only repeats the limit back, which tells nobody anything. */
    var open = p.openQuestions
      .filter(function (o) { return o.kind !== 'travel'; })
      .map(function (o) { return o.label; });
    p.travel.forEach(function (t) {
      if (t.status === 'unverified') {
        open.push(t.personLabel + ' could run to ' + t.range[1] + ' min in bad traffic');
      }
    });

    var node = el('div', 'who');
    node.innerHTML =
      '<div class="who-h"><b>' + esc(p.name) + '</b>' +
      '<span class="pill neutral">' + esc(M.money(p.share)) + '/month</span>' +
      (p.name === worstName && spread > 0.2
        ? '<span class="pill unverified">carrying most of the compromise</span>' : '') +
      '</div>' +
      '<ul class="lines">' +
      '<li>' + pill('pass') + '<span class="txt">' +
        (gets.length ? gets.join(', ') : 'nothing beyond the basics') + '</span></li>' +
      '<li>' + pill('fail') + '<span class="txt">' +
        (gives.length ? gives.join(', ') : 'nothing she listed') + '</span></li>' +
      (open.length
        ? '<li>' + pill('unverified') + '<span class="txt">' + esc(open.join(', ')) + '</span></li>'
        : '') +
      '</ul>';
    return node;
  }

  function optionCard(ev, rank) {
    var l = ev.listing;
    var worst = ev.perPerson.slice().sort(function (a, b) { return a.score - b.score; })[0];

    var card = el('div', 'opt');
    var head = el('div', 'opt-h');
    head.innerHTML =
      '<div class="t"><span class="pill rank">' + rank + '</span>' +
      '<h3>' + esc(l.bhk + ' BHK in ' + l.area) + '</h3>' +
      (ev.openCount ? '<span class="pill unverified">' + ev.openCount +
        ' open question' + (ev.openCount === 1 ? '' : 's') + '</span>' : '') +
      '</div>' +
      '<p class="muted" style="margin:6px 0 0">' + esc(l.microLocation) + '</p>' +
      '<div class="opt-money">' +
      '<span><b>' + esc(M.money(ev.shares.monthly)) + '</b> each per month</span>' +
      '<span>' + esc(M.money(ev.totalMonthly)) + ' total</span>' +
      '<span>deposit <b>' + esc(M.money(ev.shares.deposit)) + '</b> each</span>' +
      '<span>' + l.bathrooms + ' bath · ' + esc(l.furnishing) +
        ' · floor ' + l.floor + '/' + l.totalFloors + '</span>' +
      '</div>';
    card.appendChild(head);

    ev.perPerson.forEach(function (p) {
      card.appendChild(personBlock(p, ev.spread, worst.name));
    });
    return card;
  }

  function eliminationTable(result) {
    var rows = result.eliminated.map(function (r) {
      var seen = {};
      var reasons = [];
      r.blockers.forEach(function (b) {
        var k = b.person + ' — ' + b.label;
        if (!seen[k]) { seen[k] = true; reasons.push(k); }
      });
      return '<tr>' +
        '<td><b>' + esc(r.listing.area) + '</b><br><span class="muted">' +
          esc(r.listing.id + ' · ' + r.listing.microLocation) + '</span></td>' +
        '<td class="num">' + esc(M.money(r.shares.monthly)) + '</td>' +
        '<td>' + reasons.slice(0, 3).map(function (x) {
          return '<span class="pill fail" style="margin:1px 3px 1px 0">' + esc(x) + '</span>';
        }).join('') + '</td>' +
        '</tr>';
    }).join('');

    return '<details><summary>Everything that was ruled out, and by whom (' +
      result.eliminated.length + ')</summary>' +
      '<p class="muted">Nothing was dropped quietly. Each flat below failed at least one ' +
      'stated non-negotiable, recorded against the person whose requirement it was.</p>' +
      '<div class="tbl-scroll"><table><thead><tr>' +
      '<th>Flat</th><th class="num">Each</th><th>Why it is out</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></details>';
  }

  function impactList(result) {
    if (!result.constraintImpact.length) { return ''; }
    return '<details><summary>Which limits are doing the most work</summary>' +
      '<p class="muted">Useful when the shortlist comes back thin: it shows whose requirement ' +
      'is the binding one, so any decision to move a limit is made deliberately and by the ' +
      'person it belongs to.</p><ul class="lines">' +
      result.constraintImpact.slice(0, 8).map(function (c) {
        return '<li><span class="pill neutral">' + c.count + '</span><span class="txt"><b>' +
          esc(c.person) + '</b> &mdash; ' + esc(c.label) + '</span></li>';
      }).join('') + '</ul></details>';
  }

  /* ------------------------------- run ------------------------------- */
  function render() {
    var out = document.getElementById('results-out');
    if (!out || !M || !PROFILES) { return; }

    var traffic = (document.getElementById('traffic') || {}).value || 'peak';
    var result = M.evaluateGroup(PROFILES, { traffic: traffic, shortlistSize: 3 });

    out.innerHTML = '';

    var head = el('div', 'notice');
    if (result.qualifyingCount === 0) {
      head.className = 'notice warn';
      head.innerHTML = '<strong>Nothing qualifies.</strong> None of the ' + result.considered +
        ' flats satisfies everything all three said was non-negotiable. That is a real answer. ' +
        'Nothing has been relaxed to fill the list — if somebody wants to move a limit, ' +
        'that is hers to decide out loud.';
    } else {
      head.innerHTML = '<strong>' + result.considered + ' flats checked, ' +
        result.qualifyingCount + ' qualify.</strong> Showing the top ' +
        result.shortlist.length + ', ranked by how the worst-off person does rather than by the ' +
        'group average. Checked at ' +
        (traffic === 'peak' ? 'weekday office-hour traffic' : 'lighter traffic') + '.';
    }
    out.appendChild(head);

    result.shortlist.forEach(function (ev, i) {
      out.appendChild(optionCard(ev, i + 1));
    });

    var extra = el('div');
    extra.innerHTML = impactList(result) + eliminationTable(result);
    out.appendChild(extra);

    var foot = el('p', 'muted');
    foot.textContent = result.disclaimer;
    out.appendChild(foot);
  }

  var trafficSel = document.getElementById('traffic');
  if (trafficSel) { trafficSel.addEventListener('change', render); }

  render();
})();
