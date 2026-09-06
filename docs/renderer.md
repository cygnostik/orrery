# Orrery renderer

## Runtime and ownership

`await createOrrery({container, onSelect, onError, onManualTurn, onAutoToggle})` from `src/scene.js` returns:

`update`, `render`, `resize`, `resetView`, `focusBody`, **`focusMoon`**, `projectLabels`, `controlPoints`, `diagnostics`, and idempotent `dispose`.

The host owns the only animation clock and the shared Date. There is no renderer rAF, independent gear clock, ambient auto-orbit, animated material, or per-planet servo. `update` accepts date/mode/selection/scale state plus `playing`, `baseStyle: 'nebula' | 'obsidian'`, and `moons`. Defaults are paused, nebula glass, moons enabled. Invalid state is rejected before committing scene state. OrbitControls is direct, without damping. ResizeObserver refits an unmodified home/top camera.

## Connected mechanical motion

See [mechanical-drive.md](mechanical-drive.md) for tooth counts, topology, rational periods, accumulated errors, engineering boundaries.

- The **horizontal edge-crank shaft** drives one equal-tooth 1:1 miter pair, followed by nine successive reverted compound reductions. The handle sweeps vertically outside the base rim.
- Every moving gear belongs to one connected input graph. Shaft equality and negative external-mesh tooth ratios determine all rotations.
- Each output wheel drives a hollow sleeve. Each planet arm is a child of that sleeve, with one constant J2000 indexing angle.
- The actual arm-end `planet-mount-{id}` world transform positions the planet. Mechanical never calls `mapPosition` or `positionAt` to overwrite transmitted outputs. `mapPosition(..., 'mechanical')` rejects misuse explicitly.
- Observatory alone computes live `positionAt` and `orbitPoints` from `science.js`. Mechanical is uniform mean motion with finite rational gear approximations, **not a JPL ephemeris**.
- All ten Mechanical moons inherit crank-driven local sleeve/arm mounts. Their enclosed lunar reductions are kinematic constraints: internal gears are neither rendered nor fitted inside the slender supports. Observatory uses a separate schematic circular calculation. See [lunar-mechanism.md](lunar-mechanism.md).

`mechanism.diagnostics()` exposes topology, mesh pairs, node/gear/output angles, paths, signed ratios, reference and geared periods, period error and accumulated mean-rate drift. Scene `diagnostics().driveOutputs` adds measured arm angles and actual planet world coordinates. Selected-planet gearing has a restrained token-derived emissive highlight, not an independent animation.

## Direct controls

Grab the actual `crank-handle` capsule. A capture-phase pointer handler prevents OrbitControls and host orbit bookkeeping from consuming the same input. Engagement emits `onManualTurn(0)` immediately so the host can pause automatic time before movement. Rays intersect the grip's vertical rotation plane about the horizontal shaft. Pointer angles are recovered in the stationary crank frame. Clockwise winding viewed from outside advances time; shortest-angle deltas are bounded to ±1/12 turn. The host applies **30 days per turn** and enforces date bounds.

The physical flip lever invokes `onAutoToggle()`. Its inclination reflects the supplied `playing` state. Pointer release/cancel, lost capture, mode changes and disposal restore camera interaction. Controls cannot be picked in Observatory. Accessible DOM equivalents remain host-owned.

`controlPoints()` and `diagnostics().controlPoints` provide **canvas-relative CSS pixels** for `crankGrip`, `crankAxle`, `autoSwitch`, each `{x, y, world, visible}`. Existing `crank`, `crankCenter`, `switch` and `diagnostics().controls` aliases remain. Add the canvas rect's left/top when automating page-coordinate pointer events. The axle projection is the axis reference at grip height, not a floating gear. `visible` means in-frustum in Mechanical, not an arbitrary-camera occlusion guarantee.

## Planet, family and moon inspection

`focusBody(id)` fits the body, Saturn's full ring radius and the generic `satellites.inspectionRadius(id)` family extent. It applies parent scale once. The limiting horizontal/vertical perspective field of view determines camera distance, so portrait framing is not hardcoded to Earth/Jupiter.

`focusMoon(id)` consumes `satellites.inspectionTarget(id)` and fits that moon's world-space sphere. It returns false for missing/hidden moons or a hidden parent. Enceladus deliberately shows its authored south-polar fractures; Charon shows its north cap, with a lit-side horizontal direction. These are specimen viewing poses, not body-attitude predictions. Individual inspection suppresses 3D moon-label sprites in favor of the host's accessible inspection badge; the suppression survives same-selection updates. Family focus, reset, selection/mode changes restore normal family labels without overriding Show labels off. Near-target OrbitControls limits permit genuine small-moon closeups. Neither method advances the date. Both are **one-shot poses, not tracking**; the host must pause time before Inspect. Reset, selection and label ownership remain host-controlled.

Planet picking emits lowercase IDs including `sun`; moon picking emits the moon ID. The host selects its parent and opens that moon's paused inspection. Background or foreground-machinery hits emit `null` to clear selection. `bodyCount` remains Sun plus planets (9 without Pluto, 10 with Pluto); `moonCount` separately counts visible companions. The catalog currently has ten: Moon, Io, Europa, Ganymede, Callisto, Enceladus, Titan, Miranda, Triton and Charon. Pluto off hides Charon automatically.

`src/satellite-scene.js` owns local display spacing, procedural surfaces, guide/label visibility and parent transforms. The renderer consumes its interfaces rather than duplicating moon constants. Only the selected family shows local guides and labels; labels use the licensed HUD font on a foreground pass. Local orbits and globe radii are independently exaggerated, never true distance scale. See [moons.md](moons.md) for schematic-model provenance and limitations.

## Museum construction and lighting

Preserved materials: bevelled blackened-steel plinth, reflective black glass, smoked edge, platinum trim, satin titanium bridges, open annular skeleton tiers, machined fasteners, twin-bar arms and actual bearings. No belts, brass, unrelated sci-fi components or hidden output motors.

The planetary drive contains 36 central spur wheels, two compact miter gears and nested hollow output tubes. Planet supports are continuous slender black-PVD twin bars; local moon supports use smooth nested PVD sleeves rather than gear towers. Fixed support bridges clear rotating journals; the annular chassis sits below the lowest arm sweep. Cool metal remains dominant. The top view is still densely layered and should not be presented as a readable manufacturing schematic; the oblique view exposes the shaft/arm relationship more clearly.

Nebula and Obsidian reuse preallocated finish textures. Nebula is a restrained original fixed albedo ribbon, not an astronomical image or animation. A bounded 1024×1024 Three `Reflector` reflects the actual mechanical layer; the separate Sun-lit globe layer is not part of this planar reflection. This is a controlled exhibit-glass approximation, not calibrated optics.

RoomEnvironment/PMREM provides narrow studio reflection bands. Separate camera-layer render passes keep museum softboxes off planetary night sides: Three.js lights are camera-layer filtered, not mesh-layer filtered. ACES, explicit sRGB albedos, non-color roughness, PCF shadows and capped DPR remain. No bloom, external HDR request or dependency was added.

Physical material albedos are specimen properties. Semantic signal and engraving/label typography consume ProDyn tokens. The interface uses ProDyn DSM 2.2 tokens and the OFL-licensed Oxanium and Departure Mono fonts.

## Scientific and asset boundaries

- Observatory/display uniformly scales each entire orbital ellipse, retaining eccentricity/inclination while compressing inter-body spacing.
- Observatory/distance uses the common 0.34 units/AU factor. Globe sizes remain independently exaggerated, with inner-world scaling to avoid swallowing their orbits.
- Observatory paths refresh once per UTC day/scale change/first entry; instantaneous globe positions use the supplied date. Surface spin/orientation is not time-dependent physical attitude.
- Eight local 2K planet maps load using TextureLoader, sRGB and bounded anisotropy. Their existing Solar System Scope attribution remains host-owned. Missing maps retain deterministic generated fallbacks and appear in diagnostics; replaced maps are disposed.
- Sun/Pluto, Saturn ring banding and moon surfaces are authored procedural artwork. The seeded Observatory sky is decorative, not a catalogue. No runtime third-party requests were added.

## Validation boundaries

Focused transmission and geometry checks are listed in [mechanical-drive.md](mechanical-drive.md), [crank-drive.md](crank-drive.md) and [lunar-mechanism.md](lunar-mechanism.md). Renderer contracts cover state validation, shared-date ownership, world-space output mounts, visibility, family/individual inspection and resource disposal.

A passing projection or resource test does not establish visual quality, touch usability, sustained frame rate or manufacturing readiness. The central stack is dense in top view, and small moon labels can be difficult to read in a narrow family view; the text inspector and individual Inspect actions provide alternatives. Model geometry is not certified for conjugate involute tooth contact, force/torque, backlash or comprehensive solid collision clearance. Browser and deployment coverage belong to [browser-support.md](browser-support.md) and [deployment.md](deployment.md).
