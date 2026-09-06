# Orrery0.5Beta design notes

## Exhibit and controls

Mechanical and Observatory share the date, body selection, playback, Pluto and moon settings. Drag and zoom explore the specimen; Inspect pauses time before framing a planet or moon. Date/rate controls, reverse playback, top/perspective views, distance mapping and source links expose the model without a separate renderer clock.

The side crank sits outside the rim on a horizontal shaft carried by two fixed journals. One equal-tooth miter pair transfers its motion to the vertical central drive. Each full turn advances 30 days; manual winding disengages automatic playback. Physical and accessible controls operate the same state.

Planet arms are attached to hollow output sleeves. Continuous black-PVD twin bars and slender nested supports carry the planets and moons; the lower gear cluster remains visible. All ten moons have crank-driven local sleeve/arm mounts. Their enclosed reductions preserve rational rates, but the internal lunar gears and their fit inside the supports are not modeled. See [mechanical-drive.md](mechanical-drive.md), [crank-drive.md](crank-drive.md) and [lunar-mechanism.md](lunar-mechanism.md).

## Inspection and surfaces

The catalog includes Moon, Io, Europa, Ganymede, Callisto, Enceladus, Titan, Miranda, Triton and Charon. Inspectors provide individual moon actions; selecting a moon opens its paused close-up. Hiding an inspected moon returns to its parent. Charon follows Pluto visibility.

Planet portraits distinguish surfaces, clouds, Saturn's rings and Uranus's axis framing. Pluto and every moon are explicitly illustrated. Moon maps use deterministic 512 × 256 spherical detail, smooth longitude seams and single-valued poles. Titan depicts opaque golden haze rather than exposed ground. Feature positions, palettes, sizes and orientations are authored, not calibrated maps. See [moon-surfaces.md](moon-surfaces.md).

Desktop inspector content scrolls within the stage height; narrow layouts use ordinary document flow. Planet labels default off. Background/machinery selection and Escape outside dialogs or form fields clear selection without moving the camera. Free inspection supports close orbiting, zoom and pan. Nebula and Obsidian finishes share the same mechanism.

## Model limits

Mechanical uses uniform mean motion and finite integer-tooth ratios, not a positional ephemeris. Observatory uses the JPL approximate planetary calculation. Moon phases, orbital planes and display spacing remain schematic in both modes. The source discrepancies, conservative date interval and Earth/Pluto regression boundaries are documented in [science.md](science.md) and [moons.md](moons.md).

The central stack is dense in top view; small moon labels may be difficult to read in narrow family views. Text descriptions and individual inspection remain available. Geometry and projection tests do not establish manufacturing readiness, full collision clearance, physical-device frame rate or assistive-technology certification.

Asset rights, browser coverage, installation and deployment are documented separately in [assets.md](assets.md), [browser-support.md](browser-support.md), [pwa.md](pwa.md) and [deployment.md](deployment.md).
