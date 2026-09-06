# Lunar supports and transmission

## Construction constraint

Planet-support arms are continuous, rigid black-PVD twin bars. Moon supports are separate small PVD arms and risers attached to local output sleeves. All ten moons are crank-driven in Mechanical mode. There are no radial gear rows along the support bars.

A slender, separate shaft runs between each moon-bearing planet's support rails. Vertical planet supports carry smooth nested PVD sleeves and a compact lower collar. External lunar gear stacks, outboard frames and compound-shaft towers are absent, including hidden geometry. Shaft and sleeve rotation follow the shared crank graph; the structural bars remain rigid. The lower central planetary gear cluster remains visible. Its horizontal edge-crank input is described in [crank-drive.md](crank-drive.md).

## Limits

The enclosed lunar reductions and ideal right-angle transfers are kinematic constraints. The retained gear graph preserves integer-tooth ratios and deterministic motion; its gear coordinates are a ratio-study layout, not physical internals fitted inside the slender supports. Internal gears, packaging, contact geometry, loads, stiffness and backlash are not modeled or engineering-validated. Do not cite graph reachability or passing browser tests as proof of a fully buildable instrument.

Every moon globe inherits its actual sleeve/arm mount rather than receiving an independent mechanical-mode position animation. The nested tubes run continuously from their compact lower hubs to their arms, with annular journals at both ends. Observatory retains its distinct circular reference calculation. Initial phases, sizes and spacing remain illustrative.

The annular clearance check covers geometry-derived local moon families and neighbouring family sweeps. Additional existing tests cover local moon arms, pins, parent globes and tilted Saturn rings. That is not an exhaustive collision certificate for the central machinery or the enclosed transfers.

## Focused checks

```sh
node --test tests/support-arms.test.js tests/lunar-clearance.test.js tests/lunar-mechanism.test.js
```

The support regression rejects gear rows and gear towers, including hidden geometry. It checks continuous PVD rails, slender sleeves, separate crank-driven shafts and the retained central clockwork. Lunar tests check deterministic ratios, local output transforms and the named clearance envelopes. These are model-contract checks, not buildability certification.
