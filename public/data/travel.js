/* ---------------------------------------------------------------------------
 * HouseMatch — travel-time reference data
 *
 * PROVENANCE / HONESTY NOTE
 * These are AREA-TO-AREA PLANNING ESTIMATES for travel by car, expressed as
 * ranges, synthesised from published Pune locality and commute guides. They
 * are NOT live, address-specific route measurements.
 *
 * Consequences, enforced by assets/match.js:
 *   - A range whose UPPER bound is within a person's limit  -> PASS
 *   - A range whose LOWER bound already exceeds the limit   -> FAIL
 *   - A range that STRADDLES the limit                      -> NEEDS VERIFICATION
 *
 * The tool never upgrades "needs verification" to "pass". To turn a shortlisted
 * flat into a decision, check that specific building's route at the real
 * commuting time.
 * ------------------------------------------------------------------------- */

window.HM_TRAVEL = {
  meta: {
    mode: 'car',
    unit: 'minutes',
    basis: 'area-to-area planning estimates, not live route checks',
    peakMeaning: 'weekday office hours',
    lastReviewed: '2026-09-27'
  },

  /* destinations people can pin, keyed by id */
  destinations: {
    'hinjewadi-p1': { label: 'Hinjewadi Phase 1', note: 'IT park; Kavita’s office reference' },
    'hinjewadi-p2': { label: 'Hinjewadi Phase 2', note: 'further in than Phase 1' },
    'hinjewadi-p3': { label: 'Hinjewadi Phase 3', note: 'furthest in; longest approach' },
    'baner':        { label: 'Baner', note: 'Riya’s gym reference' },
    'aundh':        { label: 'Aundh', note: 'Riya’s family reference (project assumption)' },
    'kothrud':      { label: 'Kothrud', note: 'area Meera had found a flat in' },
    'shivajinagar': { label: 'Shivajinagar', note: 'central Pune' }
  },

  /* matrix[area][destination] = { offPeak: [lo, hi], peak: [lo, hi] } */
  matrix: {
    'Baner': {
      'hinjewadi-p1': { offPeak: [12, 20], peak: [30, 50] },
      'hinjewadi-p2': { offPeak: [18, 28], peak: [35, 60] },
      'hinjewadi-p3': { offPeak: [22, 35], peak: [45, 70] },
      'baner':        { offPeak: [5, 10],  peak: [5, 15]   },
      'aundh':        { offPeak: [8, 15],  peak: [12, 25]  },
      'kothrud':      { offPeak: [20, 30], peak: [30, 45]  },
      'shivajinagar': { offPeak: [20, 30], peak: [30, 50]  }
    },
    'Balewadi': {
      'hinjewadi-p1': { offPeak: [15, 20], peak: [30, 45] },
      'hinjewadi-p2': { offPeak: [20, 30], peak: [35, 55] },
      'hinjewadi-p3': { offPeak: [25, 35], peak: [45, 65] },
      'baner':        { offPeak: [5, 15],  peak: [10, 20]  },
      'aundh':        { offPeak: [10, 18], peak: [15, 28]  },
      'kothrud':      { offPeak: [22, 32], peak: [32, 48]  },
      'shivajinagar': { offPeak: [22, 32], peak: [32, 50]  }
    },
    'Mahalunge': {
      'hinjewadi-p1': { offPeak: [10, 15], peak: [15, 30] },
      'hinjewadi-p2': { offPeak: [15, 25], peak: [25, 45] },
      'hinjewadi-p3': { offPeak: [20, 30], peak: [35, 55] },
      'baner':        { offPeak: [10, 20], peak: [12, 25]  },
      'aundh':        { offPeak: [15, 22], peak: [18, 32]  },
      'kothrud':      { offPeak: [25, 35], peak: [35, 52]  },
      'shivajinagar': { offPeak: [25, 35], peak: [35, 55]  }
    },
    'Wakad': {
      'hinjewadi-p1': { offPeak: [10, 15], peak: [25, 40] },
      'hinjewadi-p2': { offPeak: [15, 22], peak: [30, 50] },
      'hinjewadi-p3': { offPeak: [20, 30], peak: [40, 65] },
      'baner':        { offPeak: [15, 25], peak: [20, 35]  },
      'aundh':        { offPeak: [18, 28], peak: [25, 40]  },
      'kothrud':      { offPeak: [28, 38], peak: [40, 58]  },
      'shivajinagar': { offPeak: [28, 38], peak: [40, 60]  }
    },
    'Hinjewadi Phase 1': {
      'hinjewadi-p1': { offPeak: [5, 10],  peak: [5, 15]   },
      'hinjewadi-p2': { offPeak: [8, 15],  peak: [12, 25]  },
      'hinjewadi-p3': { offPeak: [12, 20], peak: [20, 40]  },
      'baner':        { offPeak: [15, 25], peak: [25, 40]  },
      'aundh':        { offPeak: [20, 30], peak: [30, 45]  },
      'kothrud':      { offPeak: [32, 42], peak: [45, 65]  },
      'shivajinagar': { offPeak: [32, 42], peak: [45, 68]  }
    },
    'Sus': {
      'hinjewadi-p1': { offPeak: [15, 25], peak: [30, 45] },
      'hinjewadi-p2': { offPeak: [20, 30], peak: [35, 55] },
      'hinjewadi-p3': { offPeak: [25, 38], peak: [45, 65] },
      'baner':        { offPeak: [10, 20], peak: [15, 30]  },
      'aundh':        { offPeak: [15, 25], peak: [20, 35]  },
      'kothrud':      { offPeak: [22, 32], peak: [32, 48]  },
      'shivajinagar': { offPeak: [25, 35], peak: [35, 55]  }
    },
    'Aundh': {
      'hinjewadi-p1': { offPeak: [20, 30], peak: [40, 60] },
      'hinjewadi-p2': { offPeak: [25, 38], peak: [45, 68] },
      'hinjewadi-p3': { offPeak: [30, 42], peak: [55, 80] },
      'baner':        { offPeak: [8, 15],  peak: [12, 25]  },
      'aundh':        { offPeak: [5, 10],  peak: [5, 15]   },
      'kothrud':      { offPeak: [18, 28], peak: [28, 42]  },
      'shivajinagar': { offPeak: [15, 25], peak: [25, 40]  }
    },
    'Kothrud': {
      'hinjewadi-p1': { offPeak: [30, 40], peak: [50, 75] },
      'hinjewadi-p2': { offPeak: [35, 48], peak: [55, 80] },
      'hinjewadi-p3': { offPeak: [40, 55], peak: [65, 90] },
      'baner':        { offPeak: [25, 35], peak: [35, 50]  },
      'aundh':        { offPeak: [20, 30], peak: [30, 45]  },
      'kothrud':      { offPeak: [5, 10],  peak: [5, 15]   },
      'shivajinagar': { offPeak: [15, 25], peak: [25, 40]  }
    }
  },

  /* Areas we deliberately treat as SECONDARY: geography looks promising but we
     did not find dependable commute evidence, so they are searchable but always
     surface as "needs verification" on travel. */
  secondaryAreas: ['Sus', 'Maan', 'Marunji'],

  sources: [
    { label: 'Published Pune commute/proximity guide (Wakad, Balewadi → Hinjewadi peak ranges)',
      url: 'https://punerealtyhub.com/blog/pune-property-google-maps-proximity-guide' },
    { label: 'Mahalunge location guide (Baner and Phase 1 proximity)',
      url: 'https://www.mahindralifespacemahalunge.com/mahalunge-real-estate/mahalunge-pune-location-guide' },
    { label: 'Reporting on Hinjewadi approach-road congestion',
      url: 'https://timesofindia.indiatimes.com/city/pune/pothole-riddled-roads-worsen-traffic-congestion-in-hinjewadi-techies-face-prolonged-commutes/amp_articleshow/133058453.cms' }
  ]
};
