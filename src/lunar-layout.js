// Exhibition dimensions only. Observatory retains its existing scale and data.
export const MECHANICAL_RADII = Object.freeze({mercury: 2.2, venus: 3.25, earth: 4.98, mars: 6.65, jupiter: 9.5, saturn: 14.65, uranus: 18.25, neptune: 20.65, pluto: 23.1});
export const MECHANICAL_HEIGHT = 9.3;
export const MAIN_ARM_LIFT = 0.04;
export const FAMILY_ENVELOPES = Object.freeze({mercury: 0.17, venus: 0.29, earth: 1.36, mars: 0.235, jupiter: 2.44, saturn: 2.41, uranus: 1.03, neptune: 1.07, pluto: 1.09});
export function lunarClearanceCertificate(actualFamilies = []) {
  const ids = Object.keys(MECHANICAL_RADII), familyPairs = [];
  const measured = new Map(actualFamilies.map(f => [f.id, f.radius]));
  for (const [i, a] of ids.entries()) for (const b of ids.slice(i + 1)) {
    familyPairs.push({a, b, clearance: Math.abs(MECHANICAL_RADII[a] - MECHANICAL_RADII[b]) - (measured.get(a) ?? FAMILY_ENVELOPES[a]) - (measured.get(b) ?? FAMILY_ENVELOPES[b])});
  }
  return {method: 'Continuous annular swept-envelope separation, all relative phases; geometry-derived globes, lunar arms/pins, sleeves, hubs and journals. This is not a collision certificate for shaft-transfer housings or central machinery; internal lunar reductions and transfer teeth are schematic, not rendered.', familyPairs, actualFamilies};
}
