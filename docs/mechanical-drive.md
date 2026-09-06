# Connected mechanical drive

## Scope and scientific boundary

Mechanical is a **rational, gear-driven mean-motion demonstration**, not a positional ephemeris. A single clockwise crank turn advances the shared host date by 30 days. Planet arms receive motion through visible tooth meshes, compound shafts and hollow output sleeves. They are not independently positioned from JPL.

Observatory uses `positionAt` and `orbitPoints`, including eccentricity, inclination and secular element rates. At construction only, each mechanical arm is keyed to its J2000 projected JPL longitude. Thereafter only transmitted motion changes its angle. All ten Mechanical moons inherit actual local sleeve mounts driven by the same crank graph. See [lunar-mechanism.md](lunar-mechanism.md) for the distinct structural arms, shaft transfers and model limits.

Supported dates remain 1800-01-01 through 2050-01-01 UTC midnight. The numerical comparison below is **against the published sidereal-period descriptors in `BODIES.periodDays`**, not JPL position errors or ephemeris accuracy.

## The actual path

1. The handle sits outside the base rim and turns a **horizontal line shaft** through two fixed journals.
2. One equal-tooth **1:1 miter pair** transfers rotation through 90° to the central vertical drive. Its sign reversal turns clockwise winding, viewed from outside the rim, into prograde output rotation. See [crank-drive.md](crank-drive.md) for geometry and pointer coordinates.
3. Mercury through Pluto each add a **reverted compound reduction**: central driver A → off-axis wheel B; B and pinion C share a visible rigid shaft; C → central output wheel D.
4. The output wheel is keyed to a hollow central sleeve. The next stage's driver is keyed to that same sleeve. Thus later planets inherit every preceding reduction; there are no independently animated train roots.
5. Each arm is a child of its output sleeve with a constant J2000 indexing angle. A named planet mount at the arm's physical end supplies the globe's world position.

The planetary drive has **48 kinematic nodes, 38 toothed wheels, 18 coplanar external meshes, one right-angle miter edge and 28 rigid edges**. Nine output paths reach the same crank. The model and renderer share the topology; positions, modules and tooth counts are not separately approximated for display.

Each compound uses two potentially different modules. Within each mesh, module and elevation match exactly, and center distance is `m × (ZA + ZB) / 2`. Both pairs use the same 3.4-unit shaft separation. Successive compound planes are axially separated and clocked around the central stack for access. The geometry uses open spokes and indexed tooth/gap phases.

The faster inner sleeves start lower and extend higher. Slower outer sleeves start higher and end lower, leaving every arm its own unobstructed level. Sleeve walls, radial clearance, hollow collars and journal inserts are actual geometry, not mutually intersecting solid cylinders. Fixed radial bearing bridges stop short of their rotating shaft bores; the fixed annular chassis is below the lowest arm sweep.

## Propagation and error

For crank turns `t`, the input angle is `−2πt`. For each ordered edge:

- rigid shaft: `θB = θA`
- external mesh: `θB = −θA × ZA/ZB`
- equal-tooth right-angle miter pair: `θB = −θA`
- arm/globe azimuth: `θsleeve + fixed J2000 mounting angle`

The theoretical ratio is obtained by propagating a unit input through those same edges, not by assigning each planet `30 / periodDays` as a speed. Fixed tooth choices were searched once to minimize cumulative period error; nothing is fitted during playback.

| Output | Compound A:B — C:D | Output turns / crank turn | Resulting period, days | Period error, days | Drift, degrees / Julian century |
|---|---|---:|---:|---:|---:|
| Mercury | 89:100 — 41:107 | 0.341028037383 | 87.969306659 | +0.000049484 | −0.084081137 |
| Venus | 59:100 — 71:107 | 0.133510883047 | 224.700783303 | −0.000015912 | +0.004143961 |
| Earth | 39:47 — 43:58 | 0.082134171265 | 365.256013884 | −0.000341466 | +0.033654660 |
| Mars | 25:32 — 49:72 | 0.043669426996 | 686.979474276 | −0.000111624 | +0.003110009 |
| Jupiter | 67:87 — 21:102 | 0.006923921995 | 4332.804445435 | −0.015683315 | +0.010984767 |
| Saturn | 28:59 — 73:86 | 0.002789218872 | 10755.699489305 | +0.000844805 | −0.000096022 |
| Uranus | 24:40 — 59:101 | 0.000977607407 | 30687.165209599 | +0.012208099 | −0.000170462 |
| Neptune | 89:55 — 23:73 | 0.000498421510 | 60190.018718387 | −0.010911613 | +0.000039603 |
| Pluto | 41:58 — 63:67 | 0.000331297674 | 90553.005319262 | −0.012093238 | +0.000019392 |

`driftDegreesPerCentury = 360 × 36525 × (1/Pgear − 1/Preference)`. `accumulatedErrorDeg` multiplies this by elapsed Julian centuries from J2000, preserving sign during reverse scrubbing. Finite-tooth error is much smaller than the intentionally omitted eccentric orbital speed variation; **these figures must not be presented as sky-position accuracy**.

## APIs and diagnostics

- `createDriveTrain()` returns `topology`, `outputs`, `propagate(inputAngle)` and `atDate(date)`.
- `createMechanism().update(date, playing)` writes every rotor from propagation and returns the output records.
- `outputMounts` maps planet IDs to actual sleeve groups. `createInstrument` mounts arms on these groups and never overwrites their rotations per frame.
- `mechanism.diagnostics()` includes topology, all node angles, mesh pairs, actual gear angles, paths, signed output ratios, reference/result periods, period errors, century drift and current accumulated error.
- Scene `diagnostics().driveOutputs` includes the **measured arm angle and actual globe world position**, alongside the transmission output angle. In Observatory, globe coordinates intentionally differ from the dormant mechanical arm.
- A restrained token-derived emissive highlight identifies the selected planet's upstream gear path. It has no separate clock or moving effect.
- `controlPoints()` returns canvas-relative pixel coordinates. The grip rotates in a vertical plane about the horizontal shaft; picking transforms hits into its stationary local frame.

## Focused checks

```sh
node --test tests/crank-layout.test.js tests/mechanism.test.js tests/lunar-mechanism.test.js tests/support-arms.test.js
```

The tests check graph reachability, tooth-count ratios, spur pitch centers and phases, rigid-shaft constraints, miter axes and common apex, nested sleeves, continuous PVD supports, arm/mount inheritance, forward/reverse propagation and local-frame crank picking. They do not establish manufacturing tolerances or full solid-body clearance.

## Limitations

This is kinematically connected exhibition geometry, **not manufacturing CAD**. Spur flanks are authored silhouettes, not conjugate involutes; torque, contact forces, elastic compliance, backlash, friction, tooth stress and machining tolerances are not simulated. The tests establish the stated topology, shaft/mesh constraints and named clearances, not a full solid-body collision/engineering certification. In the top view the central stack remains visually dense; the oblique museum view and selected path are more legible. The cool-metal/platinum/titanium/black-glass material direction is preserved, with no belts, brass or hidden servos.
