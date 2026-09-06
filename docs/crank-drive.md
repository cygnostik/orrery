# Edge crank drive

## Engineering choice

Use one straight-tooth, equal-size miter pair to turn the horizontal input into the existing vertical central drive. KHK states: “Miter gears are a special class of bevel gears where the shafts intersect at 90° and the gear ratio is 1:1.”[1] This preserves the existing input ratio without adding a reduction stage.

A screw-like worm drive is not needed here. KHK states: “These gears allow for a very large reduction ratio in a single pair.”[2] Its worm guidance also says: “However when the lead angle is especially small, the worm wheel can not turn the worm and it is called its self locking feature.”[2] That is a conditional backdriving limitation, not a claim that worms cannot be driven backward by their input. The miter choice keeps the required 1:1 input and avoids introducing worm-specific reduction and backdriving behavior.

The manufacturer references establish the choice of mechanism, not the validity of this exhibit's dimensions or a selected catalog part.

## Layout and drive path

All dimensions below are scene units, not manufacturing dimensions.

- Crank shaft: outward along normalized `(0.22, 0, 1)`, radius `15.72`, world height `-1.57`. The arm and grip sweep vertically outside the `15.12` base rim; grip reach remains `1.12`.
- Continuous line shaft: radius `0.095`, nominal length `15.42`, from crank to the central pinion. Two stationary annular journals at radial positions `14.9` and `0.70` sit on short feet at deck height `-1.92`. Small rotating collars flank the rim journal.
- Miter pair: 20 teeth each, module `0.03`, large-end pitch radius `0.30`, axial face depth `0.09`, pitch cones `45°`. Both pitch apices meet at `(0, -1.57, 0)`. The pinion axis points outward; the driven gear axis is world +Y. The driven gear's large-end center is `(0, -1.27, 0)`.
- The driven miter feeds `mercury-driver` through a hollow input shaft: inner radius `0.13`, outer radius `0.145`. Two fixed internal journals seat on the instrument's existing `0.115`-radius solar axle; no new support tower.

The graph path is:

```text
crank-spindle --rigid--> crank-miter --right-angle (-1)--> central-miter
             --rigid--> mercury-driver --> central reductions/sleeves
```

Every rendered gear is a driven graph node. The input uses no deck idlers or tall crank pedestal. The lower central gear cluster uses black DLC alongside platinum/titanium components. Planet and moon supports are continuous PVD bars and slender sleeves; their separate shafts drive schematic enclosed lunar reductions. The internal lunar gears are not rendered or fitted hardware.

## Scene integration contract

`createMechanism()` retains `crank`, `crankCenter`, `crankHandle`, `hitTargets`, `lever`, and `switchTip`; it also returns `crankFrame`.

- `crank.parent === crankFrame`. This is a stationary oriented frame; `crank.position` is local zero, not a world-space position.
- Frame local +Y is world `(0.21486178267511977, 0, 0.9766444667050899)` relative to the untransformed mechanism group. Local +X is rim-tangent and local +Z points down.
- `crank.rotation.y` remains the shared `crank-spindle` node angle. A negative full turn advances 30 days.
- `crankCenter` is a static sibling of the crank at local `(0, 0.42, 0)`. The handle center is at crank-local `(1.12, 0.42, 0)`.
- Build the picking plane from the frame's transformed +Y normal and `crankCenter`'s world position. After intersecting that plane, use the static frame, not world X/Z and not the spinning crank, to recover angle:

```js
mechanism.crank.parent.worldToLocal(planeHit);
const angle = Math.atan2(-planeHit.z, planeHit.x);
```

Clockwise motion viewed from outside is negative local Y rotation and therefore advances time. The sign of `crankDeltaTurns` follows this convention. Transform pointer hits into the stationary frame, not world X/Z coordinates or the spinning crank.

The main topology uses the `right-angle` type, interpreted as `-angle` by both drive evaluators. Nodes expose `axisVector`. `diagnostics().pairs` still contains only coplanar spur meshes; `rightAnglePairs` contains the single miter edge. Shaft diagnostics include `length`, `axis`, and `mesh`.

Mesh names are `wheel-crank-miter`, `wheel-central-miter`, and `wheel-<central-node-id>`. Spoke/negative-space checks use `wheel-mercury-driver`; the compact bevel pair is unspoked.

## Checks and limits

```sh
node --test tests/crank-layout.test.js tests/mechanism.test.js tests/lunar-mechanism.test.js tests/support-arms.test.js
```

The checks cover graph reachability, signed propagation, central spur pitch centers/phases, perpendicular miter axes and common apex, tapered geometry and bores, line-shaft endpoints, fixed journals, sampled crank clearance, local-frame picking, clockwise projected drag with handle tracking, finishes, nested sleeves, lunar output transforms and uninterrupted PVD supports.

`tests/crank-layout.test.js` retains numeric regression fixtures for all nine planetary and ten lunar outputs at J2000, one crank turn later, 1800-01-01 and 2050-01-01. They protect signed rates, periods and mounting phases. Sampled lunar angles allow scaled floating-point roundoff, not altered motion or phase.

Gear flanks are exhibition approximations. The miter model uses a hollow toothed frustum, not generated conjugate tooth surfaces. Axis/apex and transform checks do **not** prove tooth contact, collision-free conjugate meshing, backlash, strength, bearing loads, lubrication, shaft stiffness or manufacturability. Placement checks cover the named geometry and sampled crank sweep, not complete mechanical clearance.

## Sources

[1] https://www.khkgears.us/products/miter-gears
[2] https://www.khkgears.us/products/worm-gear-pair
