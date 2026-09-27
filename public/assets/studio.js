/* ---------------------------------------------------------------------------
 * assets/studio.js — the app
 *
 * Matching runs in the browser, against the same public/assets/match.js the
 * serverless functions load. There is one implementation of the rules and no
 * round trip is needed to apply them, so the shortlist appears instantly and
 * would keep working with the network off.
 *
 * Two things do go to the server, for reasons that are not about convenience:
 *   /api/narrate  the Gemini key must never reach a browser
 *   /api/group    three devices need somewhere to meet, and the rule that
 *                 nobody reads anybody else's answers early has to be enforced
 *                 somewhere a page cannot simply skip
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var M = window.HM_MATCH;
  var TRAVEL = window.HM_TRAVEL;
  var LISTINGS = window.HM_LISTINGS;
  var AREAS = Object.keys(LISTINGS.verifySearch);
  var PREFS = LISTINGS.preferenceVocabulary;
  var DEST_IDS = Object.keys(TRAVEL.destinations);
  var STORE_KEY = 'hm-people-v2';

  var people = [];
  var editingIndex = -1;
  var groupCode = null;

  /* ------------------------------ helpers ------------------------------ */
  function $(id) { return document.getElementById(id); }
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

  /* localStorage is a per-viewer convenience here and nothing depends on it:
     it can throw in a private window and comes back empty after a clear. */
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ people: people, code: groupCode })); }
    catch (e) { /* the app works fine without persistence */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) { return; }
      var data = JSON.parse(raw);
      people = data.people || [];
      groupCode = data.code || null;
    } catch (e) { people = []; }
  }

  function show(step) {
    ['people', 'form', 'results'].forEach(function (s) {
      var node = $('step-' + s);
      if (node) { node.classList.toggle('on', s === step); }
    });
    document.querySelectorAll('.topbar nav a[data-go]').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-go') === step);
    });
    window.scrollTo(0, 0);
  }

  /* ------------------------------- theme ------------------------------- */
  try {
    var saved = localStorage.getItem('hm-theme');
    if (saved) { document.documentElement.setAttribute('data-theme', saved); }
  } catch (e) {}
  var tt = $('theme-toggle');
  if (tt) {
    tt.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var dark = cur === 'dark' ||
        (!cur && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('hm-theme', next); } catch (e) {}
    });
  }

  /* ------------------------------ the form ----------------------------- */
  function buildChecklists() {
    var areaBox = $('area-checks');
    areaBox.innerHTML = AREAS.map(function (a, i) {
      return '<label><input type="checkbox" class="area-ck" value="' + esc(a) + '" id="ar' + i +
        '"><span>' + esc(a) + '</span></label>';
    }).join('');

    var prefBox = $('pref-checks');
    prefBox.innerHTML = PREFS.map(function (p, i) {
      return '<label><input type="checkbox" class="pref-ck" value="' + esc(p) + '" id="pf' + i +
        '"><span>' + esc(p) + '</span></label>';
    }).join('');
  }

  function destRow(d) {
    d = d || { label: '', destId: DEST_IDS[0], maxMinutes: 25 };
    var row = el('div', 'row');
    row.style.marginTop = '10px';
    row.innerHTML =
      '<div><label>What it is</label>' +
      '<input type="text" class="d-label" maxlength="40" value="' + esc(d.label) +
      '" placeholder="e.g. My office"></div>' +
      '<div><label>Where</label><select class="d-dest">' +
      DEST_IDS.map(function (id) {
        return '<option value="' + id + '"' + (id === d.destId ? ' selected' : '') + '>' +
          esc(TRAVEL.destinations[id].label) + '</option>';
      }).join('') +
      '</select></div>' +
      '<div><label>Longest journey (min)</label>' +
      '<input type="number" class="d-min" min="5" max="180" step="5" value="' +
      (d.maxMinutes || 25) + '"></div>' +
      '<div style="flex:0 0 auto"><button type="button" class="btn sm ghost d-del">Remove</button></div>';
    row.querySelector('.d-del').addEventListener('click', function () { row.remove(); });
    return row;
  }

  function openForm(index) {
    editingIndex = index;
    var p = index >= 0 ? people[index] : null;

    $('form-title').textContent = p ? 'Editing ' + p.name : 'Add a person';
    $('form-sub').textContent = p
      ? 'Change whatever has moved.'
      : 'Answer for what they actually need, not what you think they should want.';

    $('f-name').value = p ? p.name : '';
    $('f-role').value = p ? p.role : (people.length ? 'participant' : 'coordinator');
    $('f-share').value = p ? p.maxShare : '';
    $('f-deposit').value = p && p.maxDeposit ? p.maxDeposit : '';
    $('f-flexible').checked = p ? !!p.flexibleBudget : false;
    $('mh-lift').checked = p ? !!p.mustHaves.lift : false;
    $('mh-parking').checked = p ? !!p.mustHaves.parking : false;
    $('mh-pets').checked = p ? !!p.mustHaves.petFriendly : false;
    $('f-baths').value = p ? String(p.mustHaves.minBathrooms || 0) : '2';
    $('f-notes').value = p ? (p.intakeNotes || '') : '';

    document.querySelectorAll('.area-ck').forEach(function (c) {
      c.checked = !!(p && (p.excludedAreas || []).indexOf(c.value) !== -1);
    });
    document.querySelectorAll('.pref-ck').forEach(function (c) {
      c.checked = !!(p && (p.preferences || []).indexOf(c.value) !== -1);
    });

    var box = $('dest-rows');
    box.innerHTML = '';
    var ds = (p && p.destinations && p.destinations.length) ? p.destinations : [];
    ds.forEach(function (d) { box.appendChild(destRow(d)); });
    if (!ds.length) { box.appendChild(destRow()); }

    show('form');
  }

  function readForm() {
    var name = $('f-name').value.trim();
    if (!name) { return null; }

    var dests = [];
    document.querySelectorAll('#dest-rows .row').forEach(function (row) {
      var label = row.querySelector('.d-label').value.trim();
      var destId = row.querySelector('.d-dest').value;
      var mins = parseInt(row.querySelector('.d-min').value, 10);
      /* A destination with no time limit cannot be checked against anything,
         so it is dropped rather than stored as an unenforceable wish. */
      if (label && destId && isFinite(mins) && mins > 0) {
        dests.push({ label: label, destId: destId, maxMinutes: mins });
      }
    });

    var excluded = [];
    document.querySelectorAll('.area-ck').forEach(function (c) {
      if (c.checked) { excluded.push(c.value); }
    });
    var prefs = [];
    document.querySelectorAll('.pref-ck').forEach(function (c) {
      if (c.checked) { prefs.push(c.value); }
    });

    var dep = parseInt($('f-deposit').value, 10);

    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person',
      name: name,
      role: $('f-role').value,
      maxShare: parseInt($('f-share').value, 10) || 0,
      maxDeposit: isFinite(dep) && dep > 0 ? dep : null,
      excludedAreas: excluded,
      mustHaves: {
        lift: $('mh-lift').checked,
        parking: $('mh-parking').checked,
        petFriendly: $('mh-pets').checked,
        minBathrooms: parseInt($('f-baths').value, 10) || 0
      },
      destinations: dests,
      preferences: prefs,
      flexibleBudget: $('f-flexible').checked,
      intakeNotes: $('f-notes').value.trim()
    };
  }

  /* ------------------------------ the roster --------------------------- */
  function renderPeople() {
    var strip = $('people-strip');
    strip.innerHTML = '';

    if (!people.length) {
      strip.innerHTML = '<p class="muted">Nobody yet. Add the first person to begin.</p>';
    }

    people.forEach(function (p, i) {
      var chip = el('div', 'person-chip done');
      chip.innerHTML = '<b>' + esc(p.name) + '</b>' +
        '<span class="muted">' + esc(M.money(p.maxShare)) + '/month max' +
        (p.mustHaves.lift ? ' · needs a lift' : '') +
        ((p.destinations || []).length
          ? ' · ' + p.destinations.length + ' travel limit' +
            (p.destinations.length > 1 ? 's' : '') : '') +
        '</span>';
      var bar = el('div', 'btnrow');
      bar.style.marginTop = '8px';
      var edit = el('button', 'btn sm ghost', 'Edit');
      var del = el('button', 'btn sm ghost', 'Remove');
      edit.addEventListener('click', function () { openForm(i); });
      del.addEventListener('click', function () {
        people.splice(i, 1); save(); renderPeople();
      });
      bar.appendChild(edit); bar.appendChild(del);
      chip.appendChild(bar);
      strip.appendChild(chip);
    });

    $('run-match').disabled = people.length < 1;
    $('people-hint').textContent = people.length === 0
      ? ''
      : people.length < 3
        ? people.length + ' of 3 in. You can run it now with who you have, but the shortlist ' +
          'only means what it says once everyone’s requirements are in.'
        : 'All three in. Run it.';
  }

  /* ------------------------------- results ----------------------------- */
  function pill(status) {
    var label = status === 'pass' ? 'gets'
      : status === 'fail' ? 'gives up'
      : status === 'bonus' ? 'bonus' : 'unconfirmed';
    return '<span class="pill ' + (status === 'bonus' ? 'pass' : status) + '">' + label + '</span>';
  }

  function personBlock(p, carriers) {
    var gets = p.preferencesMet.slice();
    p.travel.forEach(function (t) {
      if (t.status === 'pass') {
        gets.push(t.personLabel + ' — about ' + t.range[0] + '–' + t.range[1] + ' min');
      }
    });
    if (p.headroom > 0) { gets.push(M.money(p.headroom) + ' a month under the ceiling'); }

    /* Only what they asked for and are not getting. An absent feature nobody
       wanted is not a sacrifice and is never listed as one. */
    var gives = p.preferencesMissed.slice();

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
      (p.preferences.length
        ? '<span class="pill neutral">' + p.preferencesMet.length + ' of ' +
          p.preferences.length + ' wants met</span>' : '') +
      (carriers.indexOf(p.name) !== -1
        ? '<span class="pill unverified">carrying most of the compromise</span>' : '') +
      '</div><ul class="lines">' +
      '<li>' + pill('pass') + '<span class="txt">' +
        (gets.length ? esc(gets.join(', ')) : 'nothing beyond the basics') + '</span></li>' +
      /* Always present, even when empty. "Gives up: nothing" is a fact worth
         stating plainly; a second "gets" line saying the same thing just reads
         as though the row were duplicated. */
      '<li>' + pill('fail') + '<span class="txt">' +
        (gives.length ? esc(gives.join(', ')) : 'nothing') + '</span></li>' +
      (p.bonuses && p.bonuses.length
        ? '<li>' + pill('bonus') + '<span class="txt">' + esc(p.bonuses.join(', ')) +
          ' <i>(didn’t ask for)</i></span></li>' : '') +
      (open.length
        ? '<li>' + pill('unverified') + '<span class="txt">' + esc(open.join(', ')) +
          '</span></li>' : '') +
      '</ul>';
    return node;
  }

  function optionCard(ev, rank) {
    var l = ev.listing;
    var carriers = (ev.compromise.anyone && !ev.compromise.even)
      ? ev.compromise.carriers.map(function (x) { return x.name; }) : [];

    var card = el('div', 'opt');
    card.id = 'opt-' + l.id;
    var head = el('div', 'opt-h');
    head.innerHTML =
      '<div class="t"><span class="pill rank">' + rank + '</span><h3>' + esc(l.title) + '</h3>' +
      (ev.openCount ? '<span class="pill unverified">' + ev.openCount + ' open question' +
        (ev.openCount === 1 ? '' : 's') + '</span>' : '') + '</div>' +
      '<p class="muted" style="margin:6px 0 0">' + esc(l.microLocation) + '</p>' +
      '<div class="opt-money">' +
      '<span><b>' + esc(M.money(ev.shares.monthly)) + '</b> each per month</span>' +
      '<span>' + esc(M.money(ev.totalMonthly)) + ' rent</span>' +
      '<span>deposit <b>' + esc(M.money(ev.shares.deposit)) + '</b> each</span>' +
      '<span>' + esc(l.bhkLabel) + ' · ' + esc(l.sqft) + ' sq ft · ' +
        esc(l.furnishing) + '</span>' +
      '<span>' + esc(l.availableFrom) + ' · tenants: ' + esc(l.tenants) + '</span>' +
      '</div>' +
      (l.sourceUrl ? '<p class="muted" style="margin:8px 0 0"><a href="' + esc(l.sourceUrl) +
        '" target="_blank" rel="noopener">Check this listing on NoBroker</a></p>' : '') +
      '<div class="narration" style="margin-top:10px"></div>';
    card.appendChild(head);

    if (ev.groupOpenQuestions && ev.groupOpenQuestions.length) {
      var g = el('div', 'who');
      g.innerHTML = '<div class="who-h"><b>Everyone</b></div><ul class="lines">' +
        ev.groupOpenQuestions.map(function (c) {
          return '<li>' + pill('unverified') + '<span class="txt"><b>' + esc(c.label) +
            '</b> &mdash; ' + esc(c.detail) + '</span></li>';
        }).join('') + '</ul>';
      card.appendChild(g);
    }

    ev.perPerson.forEach(function (p) { card.appendChild(personBlock(p, carriers)); });

    var foot = el('div', 'who');
    var c = ev.compromise;
    foot.innerHTML = '<p class="muted" style="margin:0">' + (
      !c.anyone
        ? 'Nobody is giving up anything they asked for on this one. The open questions above are still open.'
        : c.even
          ? 'Everyone is giving up about the same amount here.'
          : 'Most of the compromise falls on ' + c.carriers.map(function (x) {
              return '<b>' + esc(x.name) + '</b> (giving up ' + esc(x.giving.join(', ')) + ')';
            }).join(' and ') + '.'
    ) + '</p>';
    card.appendChild(foot);

    return card;
  }

  function renderResults(result) {
    var out = $('results-out');
    out.innerHTML = '';

    var head = el('div', 'notice');
    if (result.qualifyingCount === 0) {
      head.className = 'notice warn';
      head.innerHTML = '<strong>Nothing qualifies.</strong> None of the ' + result.considered +
        ' flats satisfies everything everyone said was non-negotiable. That is a real answer: ' +
        'nothing has been relaxed to fill the list. If somebody wants to move a limit, that is ' +
        'hers to decide out loud.';
    } else {
      head.innerHTML = '<strong>' + result.considered + ' flats checked, ' +
        result.qualifyingCount + ' qualify.</strong> Showing the top ' + result.shortlist.length +
        ', ranked by how the worst-off person does rather than by the group average — an ' +
        'option that suits two people and punishes the third is the outcome this is meant to avoid.';
    }
    out.appendChild(head);

    result.shortlist.forEach(function (ev, i) { out.appendChild(optionCard(ev, i + 1)); });

    /* Why things were ruled out. With real data this is most of the value: it
       turns a thin shortlist into a conversation about whose limit is binding. */
    var extra = el('div');
    var impact = result.constraintImpact.slice(0, 8).map(function (c) {
      return '<li><span class="pill neutral">' + c.count + '</span><span class="txt"><b>' +
        esc(c.person) + '</b> &mdash; ' + esc(c.label) + '</span></li>';
    }).join('');
    var rows = result.eliminated.slice(0, 40).map(function (r) {
      var seen = {}, reasons = [];
      r.blockers.forEach(function (b) {
        var k = b.person + ' — ' + b.label;
        if (!seen[k]) { seen[k] = true; reasons.push(k); }
      });
      return '<tr><td><b>' + esc(r.listing.area) + '</b><br><span class="muted">' +
        esc(r.listing.title) + '</span></td><td class="num">' +
        esc(M.money(r.shares.monthly)) + '</td><td>' +
        reasons.slice(0, 3).map(function (x) {
          return '<span class="pill fail" style="margin:1px 3px 1px 0">' + esc(x) + '</span>';
        }).join('') + '</td></tr>';
    }).join('');

    extra.innerHTML =
      (impact ? '<details open><summary>Which limits are doing the most work</summary>' +
        '<p class="muted">Whose requirement is the binding one, so any decision to move a limit ' +
        'is made deliberately and by the person it belongs to.</p><ul class="lines">' + impact +
        '</ul></details>' : '') +
      '<details><summary>Everything that was ruled out, and by whom (' +
      result.eliminated.length + ')</summary><p class="muted">Nothing was dropped quietly.</p>' +
      '<div class="tbl-scroll"><table><thead><tr><th>Flat</th><th class="num">Each</th>' +
      '<th>Why it is out</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>';
    out.appendChild(extra);

    var note = el('p', 'muted');
    note.textContent = result.disclaimer;
    out.appendChild(note);

    show('results');
    narrate(result.shortlist);
  }

  /* Narration arrives after the shortlist is already on screen. The page is
     complete without it, so a slow or absent model delays nothing. */
  function narrate(shortlist) {
    if (!shortlist.length) { return; }
    fetch('/api/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        options: shortlist.map(function (ev) {
          return {
            listing: ev.listing,
            perPerson: ev.perPerson.map(function (p) {
              return {
                name: p.name, share: p.share, headroom: p.headroom,
                preferencesMet: p.preferencesMet, preferencesMissed: p.preferencesMissed,
                bonuses: p.bonuses,
                travel: p.travel.map(function (t) {
                  return { personLabel: t.personLabel, status: t.status, detail: t.detail };
                }),
                openQuestions: p.openQuestions.map(function (o) { return { label: o.label }; })
              };
            })
          };
        })
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok || !j.narrations) { return; }
        j.narrations.forEach(function (text, i) {
          if (!text || !shortlist[i]) { return; }
          var card = document.getElementById('opt-' + shortlist[i].listing.id);
          var slot = card && card.querySelector('.narration');
          if (slot) {
            slot.innerHTML = '<div class="notice" style="margin:0">' + esc(text) + '</div>';
          }
        });
      })
      .catch(function () { /* the page is already complete */ });
  }

  function runMatch() {
    var traffic = ($('traffic') || {}).value || 'peak';
    var result = M.evaluateGroup(people, { traffic: traffic, shortlistSize: 3 });
    renderResults(result);
  }

  /* ------------------------------- sharing ----------------------------- */
  function shareGroup() {
    fetch('/api/group', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create' })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var box = $('share-box');
        box.style.display = '';
        if (!j.ok) {
          $('share-msg').textContent = (j.error || 'Could not create a group.') +
            ' ' + (j.fix || '');
          $('share-link').value = '';
          return;
        }
        groupCode = j.code;
        save();
        var link = location.origin + '/app.html?join=' + j.code;
        $('share-link').value = link;
        $('share-msg').textContent = 'Group ' + j.code + '. Send this to the other two. ' +
          'Each of them fills in her own form, and nobody sees anybody else’s answers ' +
          'until all three are in.';
      })
      .catch(function () {
        $('share-box').style.display = '';
        $('share-msg').textContent = 'Could not reach the server.';
      });
  }

  function refreshGroup() {
    if (!groupCode) { return; }
    fetch('/api/group?code=' + encodeURIComponent(groupCode) + '&full=1')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { $('share-msg').textContent = j.error || 'Could not check.'; return; }
        if (j.ready && j.profiles) {
          people = j.profiles;
          save();
          renderPeople();
          $('share-msg').textContent = 'All ' + j.count + ' are in. Run it.';
        } else {
          $('share-msg').textContent = j.count + ' in so far (' +
            (j.names || []).join(', ') + '). ' + (j.note || '');
        }
      });
  }

  /* ------------------------------- wiring ------------------------------ */
  document.addEventListener('click', function (e) {
    var go = e.target.getAttribute && e.target.getAttribute('data-go');
    if (go) { e.preventDefault(); show(go); if (go === 'people') { renderPeople(); } }
  });

  $('add-person').addEventListener('click', function () { openForm(-1); });
  $('add-dest').addEventListener('click', function () {
    $('dest-rows').appendChild(destRow());
  });
  $('run-match').addEventListener('click', runMatch);
  $('share-group').addEventListener('click', shareGroup);
  $('refresh-group').addEventListener('click', refreshGroup);
  $('copy-link').addEventListener('click', function () {
    var f = $('share-link'); f.select();
    try { document.execCommand('copy'); this.textContent = 'Copied'; } catch (e) {}
  });
  $('clear-all').addEventListener('click', function () {
    people = []; groupCode = null; save(); renderPeople();
    $('share-box').style.display = 'none';
  });

  $('person-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = readForm();
    if (!p) { return; }

    if (editingIndex >= 0) { people[editingIndex] = p; }
    else {
      var existing = people.findIndex(function (x) { return x.id === p.id; });
      if (existing >= 0) { people[existing] = p; } else { people.push(p); }
    }
    save();

    /* When this browser joined somebody else's group, the answers go up so the
       coordinator's device can collect them. */
    var joined = new URLSearchParams(location.search).get('join');
    if (joined) {
      fetch('/api/group', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'join', code: joined, profile: p })
      }).catch(function () {});
    }

    renderPeople();
    show('people');
  });

  /* --------------------------------- boot ------------------------------ */
  buildChecklists();
  load();

  var joinCode = new URLSearchParams(location.search).get('join');
  if (joinCode) {
    groupCode = joinCode.toUpperCase();
    $('share-box').style.display = '';
    $('share-msg').textContent = 'You have been invited to group ' + esc(groupCode) +
      '. Add yourself, and your answers go to whoever is coordinating. ' +
      'You will not see anybody else’s until everyone is in.';
    $('share-link').value = location.href;
  }

  renderPeople();
  show('people');
})();
