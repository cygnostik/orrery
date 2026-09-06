// Numerical provenance and precision: ../docs/science.md.
// JPL Table 1 / original chapter Table 8.10.2; columns a,e,I,L,perihelion,node.
const ELEMENTS = {
  mercury: [[0.38709927,0.20563593,7.00497902,252.25032350,77.45779628,48.33076593],[0.00000037,0.00001906,-0.00594749,149472.67411175,0.16047689,-0.12534081]],
  venus: [[0.72333566,0.00677672,3.39467605,181.97909950,131.60246718,76.67984255],[0.00000390,-0.00004107,-0.00078890,58517.81538729,0.00268329,-0.27769418]],
  earth: [[1.00000261,0.01671123,-0.00001531,100.46457166,102.93768193,0],[0.00000562,-0.00004392,-0.01294668,35999.37244981,0.32327364,0]],
  mars: [[1.52371034,0.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],[0.00001847,0.00007882,-0.00813131,19140.30268499,0.44441088,-0.29257343]],
  jupiter: [[5.20288700,0.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-0.00011607,-0.00013253,-0.00183714,3034.74612775,0.21252668,0.20469106]],
  saturn: [[9.53667594,0.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-0.00125060,-0.00050991,0.00193609,1222.49362201,-0.41897216,-0.28867794]],
  uranus: [[19.18916464,0.04725744,0.77263783,313.23810451,170.95427630,74.01692503],[-0.00196176,-0.00004397,-0.00242939,428.48202785,0.40805281,0.04240589]],
  neptune: [[30.06992276,0.00859048,1.77004347,-55.12002969,44.96476227,131.78422574],[0.00026291,0.00005105,0.00035372,218.45945325,-0.32241464,-0.00508664]],
  pluto: [[39.48211675,0.24882730,17.14001206,238.92903833,224.06891629,110.30393684],[-0.00031596,0.00005170,0.00004818,145.20780515,-0.04062942,-0.01183482]],
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
  aAU: ELEMENTS[id][0][0],
  eccentricity: ELEMENTS[id][0][1],
  inclinationDeg: ELEMENTS[id][0][2],
  radiusKm,
  periodDays: periodYears * 365.25,
  tiltDeg,
  fact,
  sourceUrl: `https://science.nasa.gov/${id === 'pluto' ? 'dwarf-planets/pluto' : id}/facts/`,
})));

export const SCIENCE = Object.freeze({
  model: 'JPL approximate Keplerian elements and secular rates (Table 1; original Table 8.10.2)',
  range: Object.freeze({ start: '1800-01-01', end: '2050-01-01' }),
  sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
  limitations: Object.freeze([
    'Educational approximation, not a precision ephemeris or navigation tool.',
    'Earth position is the Earth–Moon barycenter; Pluto follows the original JPL fit.',
    'J2000 mean ecliptic/equinox heliocentric geometry; no light-time or apparent-position corrections.',
    'UTC calendar instants are used as approximate TDB; leap seconds and UTC–TDB conversion are omitted.',
    'The published 1800–2050 interval is conservatively limited to 2050-01-01T00:00:00Z, not the end of 2050.',
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
  return base.map((value, index) => value + rate[index] * t);
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
  const elements = elementsAt(id, date);
  const points = Array.from({ length: count }, (_, index) =>
    pointOnEllipse(elements, 2 * Math.PI * index / count));
  points.push({ ...points[0] });
  return points;
}

/** Approximate heliocentric J2000-ecliptic position, AU; Earth denotes the EMB. */
export function positionAt(id, date) {
  const elements = elementsAt(id, date);
  const mean = (wrapDegrees(elements[3] - elements[4] + 180) - 180) * DEG;
  const point = pointOnEllipse(elements, eccentricAnomaly(mean, elements[1]));
  return {
    ...point,
    radiusAU: Math.hypot(point.x, point.y, point.z),
    longitudeDeg: wrapDegrees(Math.atan2(point.y, point.x) / DEG),
  };
}
