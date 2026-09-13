# PGA mechanism library — checklist

One planar PGA core (`pga.js`), one blueprint drawing kit (`pga-draw.js`), three asset
registries (`pga-assets-1/2/3.js`), one sheet (`PGA Asset Library.dc.html`), surfaced as
zone 2a of `Portfolio UI Mockups.dc.html`. 83 assets, 16 families. Nothing is bound to the
desktop or phone rigs yet — that is deliberate.

## Core (done)
- [x] 2D PGA P(R*2,0,1): full 8-blade geometric product, reverse, points, lines, ideal points
- [x] rotor / translator / motor, sandwich `Ap(M,p) = M p M~`, motor composition
- [x] normalised motor interpolation (`Slerp`) — used by RM-04
- [x] join, meet, perpendicular, foot, circle∩circle (clamped, no NaN at limits), line∩circle, tangent
- [x] drawing kit: pins, grounded pivots, rails, gears, ring gears, racks, sheaves, ropes,
      springs, hatching, PGA-line clipping, traces, displacement plots
- [x] runtime: per-asset pointer drive (drag-scrub / pointer / click / grab), IntersectionObserver
      culling, per-asset error isolation, tweak props (speed, construction lines, traces, labels)

## Built
- [x] Rigid motions (6) — RM-01 screw · RM-02 orbit + counter-rotation · RM-03 moving axis ·
      RM-04 motor interpolation · RM-05 translation along a rotating axis · RM-06 nested frames
- [x] Pulleys & cable (7) — PU-01 fixed · PU-02 movable · PU-03 block and tackle 4:1 ·
      PU-04 Weston differential · PU-05 winch drum · PU-06 capstan · PU-07 cable car
- [x] Gears (7) — GR-01 spur pair · GR-02 internal ring · GR-03 rack and pinion ·
      GR-04 idler train · GR-05 compound train · GR-06 planetary · GR-07 worm
- [x] Motion transformers (4) — MT-01 Geneva · MT-02 ratchet · MT-03 lead screw · MT-04 Cardan joint
- [x] Constraints (4) — CN-01 point on line · CN-02 point on circle · CN-03 rolling contact ·
      CN-04 tangency from a point
- [x] Linkages (10) — LK-01 four-bar · LK-02 slider-crank · LK-03 Scotch yoke ·
      LK-04 Whitworth · LK-05 over-centre toggle · LK-06 bell crank · LK-07 lazy tongs ·
      LK-08 Peaucellier–Lipkin · LK-09 Chebyshev · LK-10 walking leg (coupler gait)
- [x] Cams (5) — CM-01 eccentric + roller · CM-02 heart + flat face · CM-03 snail ·
      CM-04 oscillating follower · CM-05 cam synthesised from a displacement law
- [x] Engines (5) — EN-01 single cylinder + valve train · EN-02 inline-four · EN-03 V8 ·
      EN-04 radial five · EN-05 Wankel
- [x] Robotics (5) — RB-01 two-link IK · RB-02 SCARA · RB-03 planar Stewart 3-RPR ·
      RB-04 five-bar parallel · RB-05 parallel-jaw gripper
- [x] Vehicles (4) — VH-01 Ackermann · VH-02 double wishbone · VH-03 rocker-bogie · VH-04 open differential
- [x] Rolling & curves (6) — RC-01 cycloid · RC-02 epicycloid · RC-03 hypocycloid ·
      RC-04 spirograph · RC-05 involute generation · RC-06 ball bearing
- [x] Oscillators (5) — OS-01 double pendulum · OS-02 coupled pendulums · OS-03 lever escapement ·
      OS-04 Newton's cradle · OS-05 damped mass-spring
- [x] Deployables & chains (5) — DP-01 scissor lift · DP-02 expanding ring · DP-03 roller chain ·
      DP-04 tank track · DP-05 umbrella ribs
- [x] Construction (4) — CS-01 excavator · CS-02 tower crane · CS-03 bascule bridge · CS-04 forklift mast
- [x] Mathematical machines (3) — MM-01 orrery · MM-02 trammel of Archimedes · MM-03 Fourier synthesiser
- [x] Flight & gyro (3) — FL-01 swashplate · FL-02 contra-rotating props · FL-03 three-axis gimbal

## Queued
- [ ] Gears: cycloidal reducer, harmonic (strain-wave) drive, bevel, hypoid, herringbone
- [ ] Linkages: Hart inversor, Hoeken, exact Theo Jansen and Klann constants, pantograph
- [ ] Cams: barrel, globoidal, face cams; spring-loaded and offset followers
- [ ] Engines: Stirling, beam engine, double-acting steam, valve-timing diagram
- [ ] Robotics: 6-axis arm with IK, delta robot, three-finger hand, suction gripper
- [ ] Vehicles: MacPherson strut, multi-link, CV joint, tank steering, four-wheel steering
- [ ] Rolling: Euler's disk, sphere in sphere, needle and thrust bearings
- [ ] Oscillators: Foucault pendulum, triple pendulum, metronome, torsional oscillator
- [ ] Deployables: Miura-ori, Hoberman sphere (needs 3D), deployable antenna, folding solar array
- [ ] Factory: conveyor, palletiser, rotary indexing table, vibratory feeder, bucket elevator
- [ ] Fluid: Archimedes screw, Pelton wheel, peristaltic pump, gear pump, propeller
- [ ] Flight & gyro: tail rotor, tiltrotor, control-moment gyro, reaction wheel, landing gear
- [ ] Mathematical: Antikythera train, difference engine, planimeter, wheel-and-disc integrator
- [ ] Contact: dominoes, marble run, pinball, Rube Goldberg chain (needs a collision layer)

## Known limits
- Planar only. Anything genuinely 3D (Hoberman sphere, Stewart 6-DOF, hypoid) is projected or queued.
- Dynamics (OS-01/02/04/05, CS-02 load swing) use explicit integrators, not PGA forques —
  PGA carries the geometry, the integrator carries the state.
- LK-10 is a coupler-curve gait, not Jansen's published link set.
- No collision layer, so the contact-experiment family cannot start yet.
