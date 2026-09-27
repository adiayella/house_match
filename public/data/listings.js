/* ---------------------------------------------------------------------------
 * HouseMatch — listing dataset
 *
 * PROVENANCE / HONESTY NOTE
 * This is a CURATED SAMPLE DATASET, not a live portal feed. The rents, deposits
 * and amenity mixes are representative of 3BHK rentals in these Pune areas in
 * 2026, and the areas themselves come from real geography, but each row is a
 * stand-in for a listing rather than a specific advertised flat. No row claims
 * a deep link to a real advert, because inventing one would be dishonest.
 *
 * Why a curated set rather than an API: the public property portals for this
 * market do not expose a usable, authorised rental API. Rather than assume one
 * exists, the tool reads from this file behind a thin loader, so swapping in a
 * real feed later means replacing one module and nothing else.
 *
 * MISSING DATA IS DELIBERATE. `null` means "the source did not state this".
 * List views on the real portals genuinely omit lift and parking a lot of the
 * time. The matching engine must surface those as NEEDS VERIFICATION and must
 * never let a null satisfy a non-negotiable. Meera's lift is why that rule
 * exists.
 *
 * Fields:
 *   rent, maintenance, deposit  - rupees (deposit is one-off, rest per month)
 *   lift, parking, petFriendly  - true | false | null   (null = unstated)
 *   amenities                   - matched against stated preferences
 * ------------------------------------------------------------------------- */

window.HM_LISTINGS = {
  meta: {
    provenance: 'curated sample dataset',
    market: 'Pune, India',
    propertyType: '3 BHK rental',
    currency: 'INR',
    compiled: '2026-09-27',
    notLiveFeed: true
  },

  /* A real portal search page per area, so any row can be checked by hand.
     These are SEARCH pages, not claimed listing URLs. */
  verifySearch: {
    'Baner':             'https://www.nobroker.in/property/rent/pune/Baner',
    'Balewadi':          'https://www.nobroker.in/property/rent/pune/Balewadi',
    'Mahalunge':         'https://www.nobroker.in/property/rent/pune/Mahalunge',
    'Wakad':             'https://www.nobroker.in/property/rent/pune/Wakad',
    'Hinjewadi Phase 1': 'https://www.nobroker.in/property/rent/pune/Hinjewadi',
    'Sus':               'https://www.nobroker.in/property/rent/pune/Sus',
    'Aundh':             'https://www.nobroker.in/property/rent/pune/Aundh',
    'Kothrud':           'https://www.nobroker.in/property/rent/pune/Kothrud'
  },

  items: [
    /* ---------------- Baner - Riya's preferred area ---------------- */
    {
      id: 'L01', area: 'Baner', microLocation: 'Off Baner Road, near Balewadi phata',
      bhk: 3, rent: 55000, maintenance: 4000, deposit: 300000,
      bathrooms: 3, furnishing: 'Fully furnished', floor: 7, totalFloors: 12,
      lift: true, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water', 'Covered parking', 'Quiet street'],
      note: 'Premium end of Baner. Included to show a flat that fails on money, not on taste.'
    },
    {
      id: 'L02', area: 'Baner', microLocation: 'Baner, Mahalunge-facing side',
      bhk: 3, rent: 45000, maintenance: 3000, deposit: 200000,
      bathrooms: 2, furnishing: 'Semi-furnished', floor: 4, totalFloors: 11,
      lift: true, parking: true, petFriendly: null,
      amenities: ['Balcony', 'Gym in society', '24x7 water', 'Near a park'],
      note: 'Stands in for the Baner 3BHK from the scenario: Riya loved it, the office run killed it.'
    },

    /* ---------------- Balewadi ---------------- */
    {
      id: 'L03', area: 'Balewadi', microLocation: 'Near Balewadi High Street',
      bhk: 3, rent: 45000, maintenance: 3000, deposit: 225000,
      bathrooms: 3, furnishing: 'Semi-furnished', floor: 6, totalFloors: 14,
      lift: true, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water', 'Covered parking'],
      note: 'Good on paper for Riya and Meera; the Hinjewadi peak-hour run is the problem.'
    },
    {
      id: 'L04', area: 'Balewadi', microLocation: 'Balewadi, stadium side',
      bhk: 3, rent: 40000, maintenance: 2500, deposit: 180000,
      bathrooms: 2, furnishing: 'Unfurnished', floor: 3, totalFloors: 8,
      lift: true, parking: null, petFriendly: null,
      amenities: ['Balcony', '24x7 water'],
      note: 'Parking unstated in the source, so it must be verified rather than assumed.'
    },

    /* ---------------- Mahalunge - the compromise corridor ---------------- */
    {
      id: 'L05', area: 'Mahalunge', microLocation: 'Mahalunge, near the Baner-Hinjewadi link',
      bhk: 3, rent: 38000, maintenance: 2500, deposit: 160000,
      bathrooms: 3, furnishing: 'Semi-furnished', floor: 5, totalFloors: 13,
      lift: true, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water', 'Covered parking'],
      note: 'The balanced candidate: sits between Baner and Hinjewadi and is under every ceiling.'
    },
    {
      id: 'L06', area: 'Mahalunge', microLocation: 'Mahalunge, older low-rise pocket',
      bhk: 3, rent: 34000, maintenance: 2000, deposit: 140000,
      bathrooms: 2, furnishing: 'Unfurnished', floor: 3, totalFloors: 3,
      lift: false, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Quiet street', 'Near a park'],
      note: 'Cheapest in the corridor and a hard no: third floor, confirmed no lift.'
    },
    {
      id: 'L07', area: 'Mahalunge', microLocation: 'Mahalunge, newer tower cluster',
      bhk: 3, rent: 42000, maintenance: 3000, deposit: 200000,
      bathrooms: 2, furnishing: 'Semi-furnished', floor: 9, totalFloors: 18,
      lift: null, parking: true, petFriendly: null,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water'],
      note: 'Ninth floor with lift UNSTATED. An eighteen-storey tower almost certainly has one, but the tool will not guess on a non-negotiable.'
    },
    {
      id: 'L08', area: 'Mahalunge', microLocation: 'Mahalunge, premium tower',
      bhk: 3, rent: 47000, maintenance: 3000, deposit: 250000,
      bathrooms: 3, furnishing: 'Fully furnished', floor: 11, totalFloors: 20,
      lift: true, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water', 'Covered parking', 'Quiet street'],
      note: 'Right location, ticks every requirement, and still fails: the per-person share lands above the tightest ceiling.'
    },

    /* ---------------- Wakad - closest to Hinjewadi ---------------- */
    {
      id: 'L09', area: 'Wakad', microLocation: 'Wakad, Hinjewadi-facing side',
      bhk: 3, rent: 33000, maintenance: 2000, deposit: 150000,
      bathrooms: 2, furnishing: 'Semi-furnished', floor: 6, totalFloors: 12,
      lift: true, parking: true, petFriendly: false,
      amenities: ['Balcony', '24x7 water', 'Power backup'],
      note: 'Cheap, lift confirmed, short office run. Explicitly not pet-friendly.'
    },
    {
      id: 'L10', area: 'Wakad', microLocation: 'Wakad, near Datta Mandir road',
      bhk: 3, rent: 30000, maintenance: 1500, deposit: 120000,
      bathrooms: 2, furnishing: 'Unfurnished', floor: 4, totalFloors: 9,
      lift: true, parking: null, petFriendly: null,
      amenities: ['24x7 water'],
      note: 'The budget option. Thin on amenities, so it shows up as a real compromise rather than a bargain.'
    },
    {
      id: 'L11', area: 'Wakad', microLocation: 'Wakad, gated township',
      bhk: 3, rent: 44000, maintenance: 3000, deposit: 220000,
      bathrooms: 3, furnishing: 'Semi-furnished', floor: 8, totalFloors: 16,
      lift: true, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water', 'Covered parking', 'Near a park'],
      note: 'The comfortable Wakad option: everything confirmed, share still inside every ceiling.'
    },
    {
      id: 'L12', area: 'Wakad', microLocation: 'Wakad, new high-rise',
      bhk: 3, rent: 52000, maintenance: 3500, deposit: 280000,
      bathrooms: 3, furnishing: 'Fully furnished', floor: 14, totalFloors: 22,
      lift: true, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water', 'Covered parking', 'Quiet street'],
      note: 'Over budget for this group.'
    },

    /* ---------------- Hinjewadi Phase 1 - Kavita's ideal ---------------- */
    {
      id: 'L13', area: 'Hinjewadi Phase 1', microLocation: 'Phase 1, Baner-facing edge',
      bhk: 3, rent: 36000, maintenance: 2500, deposit: 160000,
      bathrooms: 2, furnishing: 'Semi-furnished', floor: 5, totalFloors: 11,
      lift: true, parking: true, petFriendly: null,
      amenities: ['Balcony', 'Gym in society', '24x7 water', 'Power backup'],
      note: 'One person walks to work and another loses her family radius. The cleanest one-sided tradeoff in the set.'
    },
    {
      id: 'L14', area: 'Hinjewadi Phase 1', microLocation: 'Phase 1, interior lane',
      bhk: 3, rent: 30000, maintenance: 2000, deposit: 120000,
      bathrooms: 2, furnishing: 'Unfurnished', floor: 4, totalFloors: 4,
      lift: false, parking: true, petFriendly: null,
      amenities: ['24x7 water'],
      note: 'Fails twice over: no lift, and too far from the other side of the city.'
    },

    /* ---------------- Kothrud - where Meera looked ---------------- */
    {
      id: 'L15', area: 'Kothrud', microLocation: 'Kothrud, main road side',
      bhk: 3, rent: 36000, maintenance: 2000, deposit: 150000,
      bathrooms: 2, furnishing: 'Semi-furnished', floor: 6, totalFloors: 10,
      lift: true, parking: true, petFriendly: null,
      amenities: ['Balcony', '24x7 water', 'Near a park'],
      note: 'Stands in for the Kothrud flat from the scenario: fit the budget, wrecked both travel limits.'
    },
    {
      id: 'L16', area: 'Kothrud', microLocation: 'Kothrud, older building',
      bhk: 3, rent: 33000, maintenance: 1800, deposit: 130000,
      bathrooms: 2, furnishing: 'Unfurnished', floor: 5, totalFloors: 5,
      lift: false, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Quiet street'],
      note: 'The fifth-floor-no-lift flat from the scenario, kept in the dataset on purpose so the tool has to reject it out loud.'
    },

    /* ---------------- Secondary areas ---------------- */
    {
      id: 'L17', area: 'Sus', microLocation: 'Sus, towards Bhugaon',
      bhk: 3, rent: 34000, maintenance: 2000, deposit: 140000,
      bathrooms: 2, furnishing: 'Semi-furnished', floor: 3, totalFloors: 7,
      lift: null, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Quiet street', 'Near a park'],
      note: 'Secondary search area: commute evidence is weak and lift is unstated.'
    },
    {
      id: 'L18', area: 'Aundh', microLocation: 'Aundh, near Parihar Chowk',
      bhk: 3, rent: 52000, maintenance: 3500, deposit: 275000,
      bathrooms: 3, furnishing: 'Fully furnished', floor: 8, totalFloors: 14,
      lift: true, parking: true, petFriendly: true,
      amenities: ['Balcony', 'Gym in society', 'Power backup', '24x7 water', 'Covered parking'],
      note: 'Closest to the assumed family location and the worst possible office run.'
    }
  ],

  /* The preference vocabulary. Kept closed on purpose: a preference the engine
     cannot check against a field is a preference the engine must not score. */
  preferenceVocabulary: [
    'Balcony',
    'Gym in society',
    'Covered parking',
    'Power backup',
    '24x7 water',
    'Near a park',
    'Quiet street',
    'Semi or fully furnished',
    'Three bathrooms'
  ]
};
