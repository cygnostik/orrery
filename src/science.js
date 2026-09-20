// Numerical provenance and precision: ../docs/science.md.
// One long-range fit at every date: Table 2a / original chapter 8.10.3.
// Columns a,e,I,L,perihelion,node; angular values in degrees.
const ELEMENTS = {
  mercury: [[0.38709843,0.20563661,7.00559432,252.25166724,77.45771895,48.33961819],[0.0,2.123e-05,-0.00590158,149472.67486623,0.15940013,-0.12214182]],
  venus: [[0.72332102,0.00676399,3.39777545,181.9797085,131.76755713,76.67261496],[-2.6e-07,-5.107e-05,0.00043494,58517.8156026,0.05679648,-0.27274174]],
  earth: [[1.00000018,0.01673163,-0.00054346,100.46691572,102.93005885,-5.11260389],[-3e-08,-3.661e-05,-0.01337178,35999.37306329,0.3179526,-0.24123856]],
  mars: [[1.52371243,0.09336511,1.85181869,-4.56813164,-23.91744784,49.71320984],[9.7e-07,9.149e-05,-0.00724757,19140.29934243,0.45223625,-0.26852431]],
  jupiter: [[5.20248019,0.0485359,1.29861416,34.33479152,14.27495244,100.29282654],[-2.864e-05,0.00018026,-0.00322699,3034.90371757,0.18199196,0.13024619]],
  saturn: [[9.54149883,0.05550825,2.49424102,50.07571329,92.86136063,113.63998702],[-3.065e-05,-0.00032044,0.00451969,1222.11494724,0.54179478,-0.25015002]],
  uranus: [[19.18797948,0.0468574,0.77298127,314.20276625,172.43404441,73.96250215],[-0.00020455,-1.55e-05,-0.00180155,428.49512595,0.09266985,0.05739699]],
  neptune: [[30.06952752,0.00895439,1.7700552,304.22289287,46.68158724,131.78635853],[6.447e-05,8.18e-06,0.000224,218.46515314,0.01009938,-0.00606302]],
  pluto: [[39.48686035,0.24885238,17.1410426,238.96535011,224.09702598,110.30167986],[0.00449751,6.016e-05,5.01e-06,145.18042903,-0.00968827,-0.00809981]],
};

// Table 2b / original 8.10.4: b,c,s,f. Pluto has only b (blank terms = 0).
const ANOMALY_TERMS = {
  jupiter: [-0.00012452,0.0606406,-0.35635438,38.35125],
  saturn: [0.00025899,-0.13434469,0.87320147,38.35125],
  uranus: [0.00058331,-0.97731848,0.17689245,7.67025],
  neptune: [-0.00041348,0.68346318,-0.10162547,7.67025],
  pluto: [-0.01262724,0,0,0],
};

// Fixed reference/display descriptors from Table 1 / original 8.10.2.
// Keep scaling, framing and inspector values independent of the active orbit fit.
// These three constants per body are NOT a second propagated ephemeris.
const DESCRIPTORS = {
  mercury: [0.38709927,0.20563593,7.00497902],
  venus: [0.72333566,0.00677672,3.39467605],
  earth: [1.00000261,0.01671123,-1.531e-05],
  mars: [1.52371034,0.0933941,1.84969142],
  jupiter: [5.202887,0.04838624,1.30439695],
  saturn: [9.53667594,0.05386179,2.48599187],
  uranus: [19.18916464,0.04725744,0.77263783],
  neptune: [30.06992276,0.00859048,1.77004347],
  pluto: [39.48211675,0.2488273,17.14001206],
};

// Volume-equivalent mean radius (km), sidereal period (Julian years), obliquity (deg).
const PROPERTIES = [
  ['mercury',2439.4,0.2408467,2.11 / 60,'Mercury is the smallest planet in our solar system and the nearest to the Sun.'],
  ['venus',6051.8,0.61519726,177.3,'Venus is the hottest planet in our solar system.'],
  ['earth',6371.0084,1.0000174,23.4,'Earth is the only place we know of inhabited by living things.'],
  ['mars',3389.50,1.8808476,25,'Mars is home to Olympus Mons, the largest volcano in the solar system.'],
  ['jupiter',69911,11.862615,3,'Jupiter is the largest planet in our solar system.'],
  ['saturn',58232,29.447498,26.73,'Saturn is the only planet in our solar system with an average density less than water.'],
  ['uranus',25362,84.016846,97.77,'Uranus appears to spin sideways, with its equator nearly at a right angle to its orbit.'],
  ['neptune',24622,164.79132,28,'Neptune was the first planet located through mathematical predictions rather than regular sky observations.'],
  ['pluto',1188.3,247.92065,123,'Charon hovers over the same spot on Pluto’s surface.'],
];

export const BODIES = Object.freeze(PROPERTIES.map(([id,radiusKm,periodYears,tiltDeg,fact]) => Object.freeze({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  kind: id === 'pluto' ? 'dwarf-planet' : 'planet',
  aAU: DESCRIPTORS[id][0],
  eccentricity: DESCRIPTORS[id][1],
  inclinationDeg: DESCRIPTORS[id][2],
  radiusKm,
  periodDays: periodYears * 365.25,
  tiltDeg,
  fact,
  sourceUrl: `https://science.nasa.gov/${id === 'pluto' ? 'dwarf-planets/pluto' : id}/facts/`,
})));

export const SCIENCE = Object.freeze({
  model: 'JPL long-range approximate Keplerian elements (Tables 2a/2b; original Tables 8.10.3/8.10.4)',
  range: Object.freeze({ start: '1800-01-01', end: '2250-01-01' }),
  sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
  limitations: Object.freeze([
    'Educational approximation, not a precision ephemeris or navigation tool.',
    'Earth position is the Earth–Moon barycenter; Pluto follows the original JPL fit.',
    'J2000 mean ecliptic/equinox heliocentric geometry; no light-time or apparent-position corrections.',
    'UTC calendar instants are used as approximate TDB; leap seconds and UTC–TDB conversion are omitted.',
    'Application range is 1800-01-01 through 2250-01-01T00:00:00Z inclusive, within the published 3000 BC–3000 AD fit.',
    'Orbital paths are instantaneous fitted ellipses, not integrated future trajectories; physical sizes and display scaling are separate.',
    'Radii are volume-equivalent means; periods and tilts are reference descriptors, not time-evolving spin models.',
  ]),
});
const MIN_MS = Date.parse(`${SCIENCE.range.start}T00:00:00Z`);
const MAX_MS = Date.parse(`${SCIENCE.range.end}T00:00:00Z`);
const DEG = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const CENTURY_MS = 36525 * 86400000;
const wrapDegrees = value => ((value % 360) + 360) % 360;

function dateMilliseconds(date) {
  if (!(date instanceof Date) && typeof date !== 'string') {
    throw new TypeError('Expected a Date or UTC ISO date string');
  }
  if (typeof date === 'string' &&
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|\+00:00))?$/.test(date)) {
    throw new RangeError('Expected YYYY-MM-DD or an ISO timestamp with UTC Z/+00:00');
  }
  const milliseconds = date instanceof Date ? date.getTime() : Date.parse(date);
  if (!Number.isFinite(milliseconds) || (typeof date === 'string' &&
      new Date(milliseconds).toISOString().slice(0, 10) !== date.slice(0, 10))) {
    throw new RangeError('Invalid calendar date');
  }
  return milliseconds;
}

function elementsAt(id, date) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(ELEMENTS, id)) {
    throw new RangeError('Unknown body ID');
  }
  const milliseconds = dateMilliseconds(date);
  if (milliseconds < MIN_MS || milliseconds > MAX_MS) {
    throw new RangeError(`Date outside ${SCIENCE.range.start} through ${SCIENCE.range.end} UTC midnight`);
  }
  const t = (milliseconds - J2000_MS) / CENTURY_MS;
  const [base, rate] = ELEMENTS[id];
  return { elements: base.map((value, index) => value + rate[index] * t), t };
}

function eccentricAnomaly(mean, eccentricity) {
  let eccentric = mean + eccentricity * Math.sin(mean);
  for (let step = 0; step < 20; step += 1) {
    const correction = (eccentric - eccentricity * Math.sin(eccentric) - mean) /
      (1 - eccentricity * Math.cos(eccentric));
    eccentric -= correction;
    if (Math.abs(correction) < 1e-13) return eccentric;
  }
  throw new Error('Kepler solver did not converge');
}

function pointOnEllipse([a, e, inclination, , perihelion, node], eccentric) {
  const omega = (perihelion - node) * DEG;
  const i = inclination * DEG;
  const ascending = node * DEG;
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const co = Math.cos(ascending), so = Math.sin(ascending);
  const ci = Math.cos(i), si = Math.sin(i);
  const xp = a * (Math.cos(eccentric) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(eccentric);
  return {
    x: (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    y: (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

/** One instantaneous ellipse, uniformly sampled in eccentric anomaly (not time). */
export function orbitPoints(id, date, count = 180) {
  if (!Number.isInteger(count) || count < 3 || count > 10000) {
    throw new RangeError('Orbit segment count must be an integer from 3 through 10000');
  }
  const { elements } = elementsAt(id, date);
  const points = Array.from({ length: count }, (_, index) =>
    pointOnEllipse(elements, 2 * Math.PI * index / count));
  points.push({ ...points[0] });
  return points;
}

/** Approximate heliocentric J2000-ecliptic position, AU; Earth denotes the EMB. */
export function positionAt(id, date) {
  const { elements, t } = elementsAt(id, date);
  const terms = ANOMALY_TERMS[id];
  // Corrections change mean anomaly only, not the instantaneous ellipse.
  const correction = terms ? terms[0] * t * t +
    terms[1] * Math.cos(terms[3] * t * DEG) + terms[2] * Math.sin(terms[3] * t * DEG) : 0;
  const mean = (wrapDegrees(elements[3] - elements[4] + correction + 180) - 180) * DEG;
  const point = pointOnEllipse(elements, eccentricAnomaly(mean, elements[1]));
  return {
    ...point,
    radiusAU: Math.hypot(point.x, point.y, point.z),
    longitudeDeg: wrapDegrees(Math.atan2(point.y, point.x) / DEG),
  };
}
