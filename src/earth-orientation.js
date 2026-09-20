import {Matrix4, Quaternion, Vector3} from 'three';

const R = Math.PI / 180;
const wrap = n => ((n % 360) + 360) % 360;
const MIN = Date.parse('1800-01-01T00:00:00Z'), MAX = Date.parse('2250-01-01T00:00:00Z');

// NOAA's Meeus-based web equations, not its date-limited spreadsheet JD.
// UTC substitutes for UT1/TT. This is approximate solar geography; see docs/sunlight.md.
export function solarOrientation(date) {
  const ms = new Date(date).getTime();
  if (!Number.isFinite(ms) || ms < MIN || ms > MAX) throw new RangeError('Earth orientation requires 1800–2250 UTC');
  const t = (ms - Date.UTC(2000, 0, 1, 12)) / 86400000 / 36525;
  const meanLongitude = wrap(280.46646 + t * (36000.76983 + t * 0.0003032));
  const anomaly = wrap(357.52911 + t * (35999.05029 - 0.0001537 * t)) * R;
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center = Math.sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * anomaly) * (0.019993 - 0.000101 * t) + Math.sin(3 * anomaly) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * R;
  const longitude = wrap(meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega));
  const obliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega);
  const e = obliquity * R, L = longitude * R, l0 = meanLongitude * R;
  const y = Math.tan(e / 2) ** 2;
  const equationOfTime = 4 / R * (y * Math.sin(2 * l0) - 2 * eccentricity * Math.sin(anomaly)
    + 4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * l0)
    - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * eccentricity ** 2 * Math.sin(2 * anomaly));
  const utcMinutes = ((ms % 86400000) + 86400000) % 86400000 / 60000;
  return {longitude, obliquity, equationOfTime,
    ra: wrap(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / R),
    declination: Math.asin(Math.sin(e) * Math.sin(L)) / R,
    subsolarLongitude: wrap(360 - utcMinutes / 4 - equationOfTime / 4) - 180};
}

// Existing image: Greenwich u=.5/+X, east u=.75/-Z, north +Y.
// Free visual tilt only: machinery and the Earth's world position never rotate.
export function earthQuaternion(date, toSun) {
  const s = solarOrientation(date), e = s.obliquity * R;
  const theta = (s.ra - s.subsolarLongitude) * R;
  const equinox = new Vector3(1, 0, 0), north = new Vector3(0, Math.cos(e), -Math.sin(e));
  const east90 = new Vector3(0, -Math.sin(e), -Math.cos(e));
  const greenwich = equinox.clone().multiplyScalar(Math.cos(theta)).addScaledVector(east90, Math.sin(theta));
  const east = equinox.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(east90, Math.cos(theta));
  const basis = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(greenwich, north, east.negate()));
  const bearing = Math.atan2(-toSun.z, toSun.x);
  const adaptation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), bearing - s.longitude * R);
  // Observatory Earth can sit above/below the display ecliptic. Align the full
  // Sun direction, not just its azimuth; this remains a solar-relative display.
  const elevation = new Quaternion().setFromUnitVectors(new Vector3(Math.cos(bearing), 0, -Math.sin(bearing)), toSun.clone().normalize());
  return elevation.multiply(adaptation).multiply(basis);
}