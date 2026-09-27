/* ---------------------------------------------------------------------------
 * HouseMatch — the scenario, encoded
 *
 * These are the three profiles from the case, written out as the intake form
 * would have captured them. They exist so the tool can be demonstrated in one
 * click without three people typing, and so the reasoning behind each field is
 * recorded somewhere auditable.
 *
 * WHERE THE CASE IS SILENT, IT SAYS SO. Two numbers below are project
 * assumptions rather than facts from the scenario, and both are marked
 * `assumption: true` so the interface can label them on screen:
 *
 *   - The family location. The case says the gym and family are "on the other
 *     side of the city" from Kothrud and never names the area. Aundh is a
 *     stand-in so the travel maths has something to run against.
 *   - The office commute ceiling. The case says forty-five minutes each way was
 *     unacceptable; it never states what would be acceptable. 25 minutes is the
 *     working figure, taken from the one number the case does give.
 *
 * The distinction matters: a tool that cannot tell its inputs from its guesses
 * will eventually present a guess as a finding.
 * ------------------------------------------------------------------------- */

window.HM_DEMO_PROFILES = [
  {
    id: 'riya',
    name: 'Riya',
    role: 'coordinator',
    /* Running the process does not grant a veto over anybody else's
       dealbreakers. The engine gives the coordinator no extra weight. */
    maxShare: 18000,
    maxDeposit: 110000,
    excludedAreas: [],
    preferredArea: 'Baner',
    mustHaves: { lift: false, parking: true, petFriendly: false, minBathrooms: 2 },
    destinations: [
      {
        label: 'My family',
        destId: 'aundh',
        maxMinutes: 25,
        assumption: true,
        assumptionNote: 'The case never says where her family lives, only that it is across the city from Kothrud. Aundh is a stand-in.'
      },
      {
        label: 'My gym',
        destId: 'baner',
        maxMinutes: 25,
        assumption: false,
        assumptionNote: 'The 20-minute promise in the case, kept at 25 to match the number she gave the group.'
      }
    ],
    preferences: ['Over 1000 sq ft', 'Ready to move in', 'Open to all tenant types'],
    flexibleBudget: false,
    intakeNotes: 'Wants Baner, but what she actually needs is the 25-minute radius. Those are different inputs, and separating them is what gives her room to move.'
  },
  {
    id: 'kavita',
    name: 'Kavita',
    role: 'participant',
    maxShare: 16000,
    maxDeposit: 90000,
    excludedAreas: ['Kothrud'],
    preferredArea: 'Wakad',
    mustHaves: { lift: false, parking: true, petFriendly: false, minBathrooms: 2 },
    destinations: [
      {
        label: 'My office',
        destId: 'hinjewadi-p1',
        maxMinutes: 25,
        assumption: true,
        assumptionNote: 'The case rules out 45 minutes each way but never states her actual ceiling. 25 minutes is the working figure; the phase is taken as Phase 1.'
      }
    ],
    preferences: ['Deposit under 2.5x the rent', 'Ready to move in'],
    flexibleBudget: false,
    intakeNotes: 'Tightest ceiling in the group at 16,000, which quietly sets the rent limit for all three under an equal split.'
  },
  {
    id: 'meera',
    name: 'Meera',
    role: 'participant',
    /* Negotiable is not unlimited. A budget with no number cannot be checked,
       so she still states a ceiling and flags it as the one she would move. */
    maxShare: 22000,
    maxDeposit: 150000,
    excludedAreas: [],
    preferredArea: 'Kothrud',
    mustHaves: { lift: true, parking: false, petFriendly: false, minBathrooms: 2 },
    destinations: [],
    preferences: ['Semi or fully furnished', 'Fully furnished', 'Over 1000 sq ft'],
    flexibleBudget: true,
    intakeNotes: 'Knee condition, so the lift is absolute and the budget is the flexible one. Kothrud was a flat she found, not a place she needs to live.'
  }
];

window.HM_DEMO_META = {
  split: 'equal',
  traffic: 'peak',
  assumptionsUsed: [
    'Riya’s family is taken to be in Aundh. The case does not say.',
    'Kavita’s office is taken to be Hinjewadi Phase 1 with a 25-minute ceiling. The case gives neither.',
    'Rent and maintenance are split three ways equally.',
    'Travel is by car at weekday office hours.'
  ]
};
