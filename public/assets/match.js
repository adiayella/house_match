/* ---------------------------------------------------------------------------
 * HouseMatch — matching engine
 *
 * This file decides what qualifies. It is plain, deterministic code: given the
 * same profiles and the same dataset it returns the same answer every time,
 * and it contains no language model call of any kind.
 *
 * That separation is the whole point of the design. A non-negotiable such as
 * "the building must have a lift" cannot be paraphrased, softened or
 * approximated away by a generative step, because the generative step never
 * sees the decision. A model is used elsewhere in the product (to tidy up a
 * vague intake answer, and to narrate a tradeoff in readable English) but it
 * is never in this path.
 *
 * Three rules this module enforces that are easy to get wrong:
 *
 *   1. AFFORDABILITY IS PER PERSON, NOT POOLED. A flat is affordable when each
 *      individual's share fits that individual's own ceiling. Adding three
 *      budgets together and comparing to the rent would let the person with the
 *      smallest budget be quietly overcommitted by the other two.
 *
 *   2. UNKNOWN IS NOT YES. Where the dataset says null, the check returns
 *      "needs verification". It never returns a pass. A flat can reach the
 *      shortlist with open questions attached, but nobody is ever told a
 *      dealbreaker is satisfied on the strength of missing data.
 *
 *   3. THE WINNER IS THE MOST BALANCED OPTION, NOT THE HIGHEST AVERAGE. Ranking
 *      keys on the WORST-OFF person first. A flat that delights two people and
 *      punishes the third scores well on a mean and is exactly the outcome this
 *      group has been failing to avoid for four months.
 *
 * The engine ranks and explains. It does not choose, and it will return an
 * empty shortlist rather than relax somebody's dealbreaker to fill the list.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var PASS = 'pass';
  var FAIL = 'fail';
  var UNVERIFIED = 'unverified';

  /* ----------------------------------------------------------------------- *
   * Preference predicates
   *
   * Closed vocabulary by design. If a preference cannot be checked against a
   * real field, the engine must not pretend to score it.
   * ----------------------------------------------------------------------- */
  var PREFERENCE_TESTS = {
    'Fully furnished': function (l) { return l.furnishing === 'Fully Furnished'; },
    'Semi or fully furnished': function (l) { return l.furnishing !== 'Unfurnished'; },
    'Ready to move in': function (l) { return l.availableFrom === 'Ready to Move'; },
    'Over 1000 sq ft': function (l) { return (l.sqft || 0) >= 1000; },
    'Deposit under 2.5x the rent': function (l) {
      return l.rent > 0 && l.deposit <= l.rent * 2.5;
    },
    'Open to all tenant types': function (l) { return l.tenants === 'All'; }
  };

  function preferenceMet(listing, pref) {
    var test = PREFERENCE_TESTS[pref];
    if (test) { return test(listing); }
    /* No test means the source has no field to check it against. An unscoreable
       preference counts as unmet rather than silently as met, so it surfaces as
       a compromise instead of flattering the option. */
    return false;
  }

  /* ----------------------------------------------------------------------- *
   * Travel
   *
   * A range is compared against a limit, never a single averaged number:
   *   upper bound within limit            -> pass
   *   lower bound already past the limit  -> fail
   *   the limit falls inside the range    -> needs verification
   *
   * The middle case is the honest one and the one most tools get wrong by
   * rounding to a midpoint and calling it a match.
   * ----------------------------------------------------------------------- */
  function travelCheck(area, destId, maxMinutes, traffic, areaDoubt) {
    var byArea = window.HM_TRAVEL.matrix[area];
    if (!byArea || !byArea[destId]) {
      return {
        status: UNVERIFIED,
        range: null,
        detail: 'No travel estimate on file for this area and destination.'
      };
    }

    var range = byArea[destId][traffic] || byArea[destId].peak;
    var lo = range[0];
    var hi = range[1];

    /* The estimate is keyed on the area label. Where the record's own address
       contradicts that label the journey cannot be trusted in either
       direction, so a pass is downgraded rather than reported confidently. */
    if (areaDoubt && hi <= maxMinutes) {
      return {
        status: UNVERIFIED,
        range: range,
        detail: 'About ' + lo + '–' + hi + ' min if the area label is right, but it ' +
                'looks wrong: ' + areaDoubt + ' Check the real address.'
      };
    }

    if (hi <= maxMinutes) {
      return {
        status: PASS,
        range: range,
        detail: 'About ' + lo + '–' + hi + ' min, inside the ' + maxMinutes + ' min limit.'
      };
    }
    if (lo > maxMinutes) {
      return {
        status: FAIL,
        range: range,
        detail: 'About ' + lo + '–' + hi + ' min, past the ' + maxMinutes + ' min limit even at best.'
      };
    }
    return {
      status: UNVERIFIED,
      range: range,
      detail: 'About ' + lo + '–' + hi + ' min, so the ' + maxMinutes +
              ' min limit holds on a good run and breaks on a bad one. Needs a real route check.'
    };
  }

  /* ----------------------------------------------------------------------- *
   * Amenity non-negotiables
   * ----------------------------------------------------------------------- */
  function amenityCheck(value, label) {
    if (value === true) {
      return { status: PASS, detail: label + ' confirmed in the listing.' };
    }
    if (value === false) {
      return { status: FAIL, detail: label + ' confirmed absent.' };
    }
    return {
      status: UNVERIFIED,
      detail: label + ' not stated by the source. Treated as unconfirmed, not as a pass.'
    };
  }

  /* ----------------------------------------------------------------------- *
   * One person against one listing
   * ----------------------------------------------------------------------- */
  function evaluatePerson(person, listing, shares, traffic) {
    var checks = [];
    var mh = person.mustHaves || {};

    /* --- money: this person's share against this person's ceiling --- */
    var overBy = shares.monthly - person.maxShare;
    checks.push({
      kind: 'budget',
      label: 'Monthly share within ' + money(person.maxShare),
      status: overBy <= 0 ? PASS : FAIL,
      hard: true,
      detail: overBy <= 0
        ? 'Share is ' + money(shares.monthly) + ', leaving ' + money(-overBy) + ' of headroom.'
        : 'Share is ' + money(shares.monthly) + ', which is ' + money(overBy) + ' over the stated ceiling.'
    });

    if (typeof person.maxDeposit === 'number' && person.maxDeposit > 0) {
      var depOver = shares.deposit - person.maxDeposit;
      checks.push({
        kind: 'deposit',
        label: 'Deposit share within ' + money(person.maxDeposit),
        status: depOver <= 0 ? PASS : FAIL,
        hard: true,
        detail: depOver <= 0
          ? 'Deposit share is ' + money(shares.deposit) + '.'
          : 'Deposit share is ' + money(shares.deposit) + ', which is ' + money(depOver) + ' over.'
      });
    }

    /* --- areas ruled out --- */
    var excluded = (person.excludedAreas || []).indexOf(listing.area) !== -1;
    if (excluded) {
      checks.push({
        kind: 'area',
        label: listing.area + ' is not ruled out',
        status: FAIL,
        hard: true,
        detail: listing.area + ' is on this person’s list of areas they will not consider.'
      });
    }

    /* --- building requirements --- */
    if (mh.lift) {
      var lift = amenityCheck(listing.lift, 'Lift');
      checks.push({
        kind: 'lift', label: 'Building has a lift', status: lift.status, hard: true,
        detail: lift.detail + (listing.floor ? ' Flat is on floor ' + listing.floor +
                ' of ' + listing.totalFloors + '.' : '')
      });
    }
    if (mh.parking) {
      var pk = amenityCheck(listing.parking, 'Parking');
      checks.push({ kind: 'parking', label: 'Parking available', status: pk.status, hard: true, detail: pk.detail });
    }
    if (mh.petFriendly) {
      var pet = amenityCheck(listing.petFriendly, 'Pet policy');
      checks.push({ kind: 'pets', label: 'Pets allowed', status: pet.status, hard: true, detail: pet.detail });
    }
    if (mh.minBathrooms) {
      /* Tri-state, not a comparison. `null >= 2` is false in JavaScript, so a
         naive numeric test would silently reject every listing whose source
         never mentioned bathrooms — which, for this dataset, is all of them. */
      var bathStatus, bathDetail;
      if (listing.bathrooms === null || listing.bathrooms === undefined) {
        bathStatus = UNVERIFIED;
        bathDetail = 'Bathroom count not stated by the source. Unconfirmed, not assumed.';
      } else if (listing.bathrooms >= mh.minBathrooms) {
        bathStatus = PASS;
        bathDetail = 'Listing has ' + listing.bathrooms + '.';
      } else {
        bathStatus = FAIL;
        bathDetail = 'Listing has only ' + listing.bathrooms + '.';
      }
      checks.push({
        kind: 'bathrooms',
        label: 'At least ' + mh.minBathrooms + ' bathroom' + (mh.minBathrooms > 1 ? 's' : ''),
        status: bathStatus, hard: true, detail: bathDetail
      });
    }

    /* --- who the landlord will actually rent to --- */
    if (person.sharingAsGroup !== false) {
      var t2 = listing.tenants || '';
      var tenantStatus, tenantDetail;
      if (t2 === 'All') {
        tenantStatus = PASS;
        tenantDetail = 'Listed as open to all tenant types.';
      } else if (/Bachelor Male/i.test(t2)) {
        tenantStatus = FAIL;
        tenantDetail = 'Listed for male tenants only.';
      } else if (/Company/i.test(t2) && !/Family/i.test(t2)) {
        tenantStatus = FAIL;
        tenantDetail = 'Listed for corporate lets only.';
      } else {
        tenantStatus = UNVERIFIED;
        tenantDetail = 'Listed as "' + t2 + '". Landlords vary on whether three friends ' +
                       'sharing counts. Worth asking before viewing.';
      }
      checks.push({
        kind: 'tenants', label: 'Landlord accepts three friends sharing',
        status: tenantStatus, hard: true, detail: tenantDetail
      });
    }

    /* --- travel, one row per pinned destination --- */
    var travelRows = [];
    (person.destinations || []).forEach(function (d) {
      if (!d.destId || !d.maxMinutes) { return; }
      var t = travelCheck(listing.area, d.destId, d.maxMinutes, traffic, listing.areaDoubt);
      var destLabel = (window.HM_TRAVEL.destinations[d.destId] || {}).label || d.destId;
      var row = {
        kind: 'travel',
        label: d.label + ' (' + destLabel + ') within ' + d.maxMinutes + ' min',
        status: t.status, hard: true, detail: t.detail, range: t.range,
        destLabel: destLabel, personLabel: d.label, limit: d.maxMinutes
      };
      checks.push(row);
      travelRows.push(row);
    });

    /* --- preferences: soft, never disqualifying --- */
    var prefs = (person.preferences || []).map(function (p) {
      return { name: p, met: preferenceMet(listing, p) };
    });

    var fails = checks.filter(function (c) { return c.status === FAIL; });
    var open = checks.filter(function (c) { return c.status === UNVERIFIED; });
    var met = prefs.filter(function (p) { return p.met; });

    /* --- scoring, only meaningful once the hard checks are clear --- */
    var prefScore = prefs.length ? met.length / prefs.length : 1;
    var travelScore = 1;
    if (travelRows.length) {
      travelScore = travelRows.reduce(function (sum, r) {
        return sum + (r.status === PASS ? 1 : r.status === UNVERIFIED ? 0.5 : 0);
      }, 0) / travelRows.length;
    }
    var headroom = person.maxShare > 0
      ? Math.max(0, Math.min(1, (person.maxShare - shares.monthly) / person.maxShare))
      : 0;

    var score = 0.55 * prefScore + 0.35 * travelScore + 0.10 * headroom;

    return {
      personId: person.id,
      name: person.name,
      checks: checks,
      travel: travelRows,
      preferences: prefs,
      preferencesMet: met.map(function (p) { return p.name; }),
      preferencesMissed: prefs.filter(function (p) { return !p.met; }).map(function (p) { return p.name; }),
      failures: fails,
      openQuestions: open,
      share: shares.monthly,
      depositShare: shares.deposit,
      headroom: person.maxShare - shares.monthly,
      prefScore: prefScore,
      travelScore: travelScore,
      score: score,
      qualifies: fails.length === 0
    };
  }

  /* ----------------------------------------------------------------------- *
   * Whole group against one listing
   * ----------------------------------------------------------------------- */
  function evaluateListing(listing, people, options) {
    var n = people.length || 1;
    var shares = {
      monthly: Math.round((listing.rent + (listing.maintenance || 0)) / n),
      deposit: Math.round((listing.deposit || 0) / n)
    };

    var perPerson = people.map(function (p) {
      return evaluatePerson(p, listing, shares, options.traffic);
    });

    /* Group-level checks belong to nobody in particular, so they are kept
       separate from the per-person columns and attributed to "Everyone". */
    var groupChecks = [];
    var needed = options.minBedrooms || n;
    if (listing.bedrooms === null || listing.bedrooms === undefined) {
      groupChecks.push({
        kind: 'bedrooms', label: needed + ' bedrooms for ' + n + ' people',
        status: UNVERIFIED, detail: 'Bedroom count could not be read from the listing title.'
      });
    } else if (listing.bedrooms < needed) {
      groupChecks.push({
        kind: 'bedrooms', label: needed + ' bedrooms for ' + n + ' people',
        status: FAIL,
        detail: 'This is a ' + listing.bhkLabel + '. Three people sharing need ' +
                needed + ' bedrooms, and nobody said they would share a room.'
      });
    } else {
      groupChecks.push({
        kind: 'bedrooms', label: needed + ' bedrooms for ' + n + ' people',
        status: PASS, detail: listing.bhkLabel + '.'
      });
    }

    /* Maintenance is missing from this source, so the per-person share is the
       rent alone and is therefore a floor, not a final figure. */
    if (listing.maintenanceStated === false) {
      groupChecks.push({
        kind: 'maintenance', label: 'Maintenance charge known',
        status: UNVERIFIED,
        detail: 'Not stated by the source, so it is not in the share above. ' +
                'The real monthly cost is this or higher, never lower.'
      });
    }

    var blockers = [];
    groupChecks.forEach(function (c) {
      if (c.status === FAIL) {
        blockers.push({ person: 'Everyone', label: c.label, detail: c.detail, kind: c.kind });
      }
    });
    perPerson.forEach(function (r) {
      r.failures.forEach(function (f) {
        blockers.push({ person: r.name, label: f.label, detail: f.detail, kind: f.kind });
      });
    });

    var groupOpen = groupChecks.filter(function (c) { return c.status === UNVERIFIED; });
    var openCount = perPerson.reduce(function (s, r) { return s + r.openQuestions.length; }, 0) +
                    groupOpen.length;
    var scores = perPerson.map(function (r) { return r.score; });
    var minScore = Math.min.apply(null, scores);
    var meanScore = scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;

    return {
      listing: listing,
      shares: shares,
      totalMonthly: listing.rent + (listing.maintenance || 0),
      perPerson: perPerson,
      groupChecks: groupChecks,
      groupOpenQuestions: groupOpen,
      qualifies: blockers.length === 0,
      blockers: blockers,
      openCount: openCount,
      minScore: minScore,
      meanScore: meanScore,
      /* how unevenly the compromise is spread; smaller is fairer */
      spread: Math.max.apply(null, scores) - minScore
    };
  }

  /* ----------------------------------------------------------------------- *
   * Entry point
   * ----------------------------------------------------------------------- */
  function evaluateGroup(people, options) {
    options = options || {};
    var traffic = options.traffic === 'offPeak' ? 'offPeak' : 'peak';
    var shortlistSize = options.shortlistSize || 3;
    var listings = (window.HM_LISTINGS.items || []);

    var results = listings.map(function (l) {
      return evaluateListing(l, people, { traffic: traffic });
    });

    var qualifying = results.filter(function (r) { return r.qualifies; });
    var eliminated = results.filter(function (r) { return !r.qualifies; });

    /* Balance first, then overall fit, then price. Documented in the README. */
    qualifying.sort(function (a, b) {
      if (b.minScore !== a.minScore) { return b.minScore - a.minScore; }
      if (b.meanScore !== a.meanScore) { return b.meanScore - a.meanScore; }
      return a.shares.monthly - b.shares.monthly;
    });

    /* Which constraints are actually doing the eliminating. This is what turns
       an empty shortlist into a useful conversation instead of a dead end. */
    var impact = {};
    eliminated.forEach(function (r) {
      var seen = {};
      r.blockers.forEach(function (b) {
        var key = b.kind + '::' + b.person;
        if (seen[key]) { return; }
        seen[key] = true;
        if (!impact[key]) {
          impact[key] = { kind: b.kind, person: b.person, label: b.label, count: 0 };
        }
        impact[key].count++;
      });
    });
    var constraintImpact = Object.keys(impact).map(function (k) { return impact[k]; })
      .sort(function (a, b) { return b.count - a.count; });

    return {
      traffic: traffic,
      people: people,
      considered: results.length,
      shortlist: qualifying.slice(0, shortlistSize),
      alsoQualified: qualifying.slice(shortlistSize),
      qualifyingCount: qualifying.length,
      eliminated: eliminated.sort(function (a, b) { return a.blockers.length - b.blockers.length; }),
      constraintImpact: constraintImpact,
      /* Stated plainly so no caller can mistake the contract. */
      disclaimer: 'Ranked, not chosen. Travel figures are area-level planning ' +
                  'estimates and anything marked "needs verification" is still an open question.'
    };
  }

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return '₹' + v.toLocaleString('en-IN');
  }

  window.HM_MATCH = {
    evaluateGroup: evaluateGroup,
    evaluateListing: evaluateListing,
    travelCheck: travelCheck,
    preferenceMet: preferenceMet,
    money: money,
    PASS: PASS, FAIL: FAIL, UNVERIFIED: UNVERIFIED
  };
})();
