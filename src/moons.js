// Sourced descriptors only; numerical provenance is in ../docs/moons.md.
import { SCIENCE } from './science.js';

const JUPITER_FACTS = 'https://science.nasa.gov/jupiter/jupiter-moons/';
const RECORDS = [
  ['moon', 'earth', 'Moon', 1737.4, 384400, 27.322,
    'https://science.nasa.gov/moon/facts/',
    'The Moon rotates at the same rate that it revolves around Earth, keeping the same hemisphere facing Earth.'],
  ['io', 'jupiter', 'Io', 1821.49, 421800, 1.77, JUPITER_FACTS,
    'Io is the most volcanically active world in our solar system.'],
  ['europa', 'jupiter', 'Europa', 1560.80, 671100, 3.55, JUPITER_FACTS,
    'Europa is about 90% the size of Earth’s Moon.'],
  ['ganymede', 'jupiter', 'Ganymede', 2631.20, 1070400, 7.155588, JUPITER_FACTS,
    'Ganymede is the largest moon in our solar system, even bigger than Mercury.'],
  ['callisto', 'jupiter', 'Callisto', 2410.30, 1882700, 16.690440, JUPITER_FACTS,
    'Callisto is Jupiter’s second largest moon and the third largest moon in our solar system.'],
  ['enceladus', 'saturn', 'Enceladus', 252.10, 238400, 1.370218,
    'https://science.nasa.gov/saturn/moons/enceladus/',
    'Enceladus sprays water vapor and ice particles into space from its icy surface.'],
  ['titan', 'saturn', 'Titan', 2574.76, 1221900, 15.9454,
    'https://science.nasa.gov/saturn/moons/titan/facts/',
    'Titan’s surface is completely obscured by a golden hazy atmosphere.'],
  ['miranda', 'uranus', 'Miranda', 235.8, 129846, 1.413,
    'https://science.nasa.gov/uranus/moons/miranda/',
    'Miranda has lightly cratered ridges and valleys beside more heavily cratered terrain.'],
  ['triton', 'neptune', 'Triton', 1352.60, 354800, 5.876994,
    'https://science.nasa.gov/neptune/moons/triton/',
    'Triton orbits Neptune in the opposite direction to the planet’s rotation—a retrograde orbit.', true],
  ['charon', 'pluto', 'Charon', 606.0, 19600, 6.387222,
    'https://science.nasa.gov/dwarf-planets/pluto/moons/charon/',
    'Charon and Pluto always show the same surfaces to each other: mutual tidal locking.'],
];

export const MOONS = Object.freeze(RECORDS.map(([
  id, parentId, name, radiusKm, orbitRadiusKm, periodDays, sourceUrl, fact, retrograde = false,
]) => Object.freeze({ id, parentId, name, radiusKm, orbitRadiusKm, periodDays, sourceUrl, fact, retrograde })));

export const MOON_MODEL = Object.freeze({
  model: 'Schematic mean circular motion; a rotating orbital demonstration',
  range: SCIENCE.range,
  epoch: '2000-01-01T12:00:00Z',
  coordinates: 'Parent-centric km in an arbitrary XY plane; z = 0',
  initialPhaseDeg: Object.freeze({ moon: 0, io: 0, europa: 90, ganymede: 180, callisto: 270,
    enceladus: 45, titan: 225, miranda: 135, triton: 45, charon: 315 }),
  sourceUrl: 'https://ssd.jpl.nasa.gov/sats/elem/',
  limitations: Object.freeze([
    'Not a calibrated satellite ephemeris: no actual sky positions or positional accuracy claim.',
    'J2000 initial phases are illustrative, deliberately spaced for display; they are not observed orbital longitudes.',
    'The arbitrary schematic plane is not an ecliptic, equatorial or Laplace-plane inclination model.',
    'Fixed radii and uniform rates omit eccentricity, precession, perturbations and resonant dynamics.',
    'Io and Europa use rounded Horizons header periods of about 1.77 and 3.55 days; conflicting mean-element P values are retained in the evidence, not silently treated as equally precise rates.',
    'Titan and Miranda use rounded cross-checked periods; published digits describe demonstration rates, not positional accuracy.',
    'Triton’s sourced retrograde orbit is shown by reversed schematic motion, not its real inclined orbital plane; other model directions do not encode planetary spin axes.',
    'Charon is a schematic companion around the rendered Pluto, not a model of actual Pluto–Charon barycentric dynamics or mutual tidal locking.',
    'No lunar phases, eclipses, transits, surface orientation or tidal-libration predictions.',
    'The supported date interval matches SCIENCE.range for application consistency, not ephemeris validity.',
    'UTC instants and 86400000-millisecond days drive the demonstration; no time-scale or light-time corrections.',
    'Offsets are parent-centric; SCIENCE places Earth at the Earth–Moon barycenter, not the Earth center.',
    'Physical km are separate from exaggerated local display spacing; the renderer must disclose its scale.',
  ]),
});

const EPOCH_MS = Date.parse(MOON_MODEL.epoch);
const DAY_MS = 86400000;
const MIN_MS = Date.parse(`${MOON_MODEL.range.start}T00:00:00Z`);
const MAX_MS = Date.parse(`${MOON_MODEL.range.end}T00:00:00Z`);

/** Illustrative parent-centric km, not a calibrated or apparent sky position. */
export function moonPositionAt(id, date) {
  const moon = MOONS.find(body => body.id === id);
  if (!moon) throw new RangeError('Unknown moon ID');
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
  if (milliseconds < MIN_MS || milliseconds > MAX_MS) {
    throw new RangeError(`Date outside ${MOON_MODEL.range.start} through ${MOON_MODEL.range.end} UTC midnight`);
  }
  const periodMs = moon.periodDays * DAY_MS;
  const turns = ((milliseconds - EPOCH_MS) % periodMs) / periodMs;
  const angle = MOON_MODEL.initialPhaseDeg[id] * Math.PI / 180 + turns * 2 * Math.PI * (moon.retrograde ? -1 : 1);
  return { x: moon.orbitRadiusKm * Math.cos(angle), y: moon.orbitRadiusKm * Math.sin(angle), z: 0 };
}
