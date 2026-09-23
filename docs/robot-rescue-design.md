# Robot Rescue: Signal Isles — chapter one

## The playable promise
A free, single-player, illustrated 2D physics game: plan a rescue flight, launch, brake, inspect the result and improve. Six authored missions recover six named robots and reconnect their islands. This is the first playable chapter, not the complete three-game proposal or a claim of universal educational effectiveness.

## Campaign
1. First signal / Pip — horizontal and vertical motion; full guided first flight.
2. Higher ground / Moss — reaching a raised platform.
3. Against the wind / Kite — a ridge and steady horizontal wind force.
4. Under the canopy / Luma — an overhead obstacle changes useful trajectories.
5. Precious cargo / Coral — greater mass at the same launch energy reduces speed.
6. Light the chain / Sol — combine clearance, distance, wind and braking.

Every mission has a regression-tested feasible landing. Later default settings intentionally need adjustment. Alternative solutions remain possible. Optional mastery stars reward an energy pickup and a landing at 5 m/s or slower; neither is required to progress.

## Physics contract
- Units are metres, seconds, kilograms, joules and newtons.
- Initial speed v = sqrt(2E/m); angle resolves horizontal and vertical components.
- Gravity is 9.81 m/s². Wind is a deliberately simplified steady horizontal force.
- Linear resistance opposes velocity. Braking adds resistance while fuel remains.
- Fixed integration at 1/120 s; constant-acceleration position update per step.
- Swept collision against expanded rectangular platforms prevents fast objects passing through thin walls.
- The craft has a square envelope with 0.55 m half-width. Landing requires the top of the goal, a fully contained craft and impact speed <= 9 m/s.
- The rock artwork matches the solid rectangles. Vegetation and glow are decoration.
- These are game simplifications, not structural engineering, aviation or weather models.

Explorer uses the same simulator for prediction and automatically brakes on descent above the goal. Precision removes that assistance and limits the aim guide. No teleporting, altered gravity or hidden success dice.

## Controls and accessibility
- Touch sliders or aim dragging; keyboard arrows adjust angle/energy.
- Space launches; subsequent holds brake. P pauses; R retries when the scene has focus.
- Dedicated touch brake uses pointer capture and clears on release/cancel/blur.
- Tab hiding or loss of focus pauses flight. Resume is explicit.
- Native dialogs provide focus containment for the mission map and guide.
- Optional audio with gesture-based activation; music independent of effects, volume control.
- Device reduced-motion preference disables ambient wind, bobbing and particle animation.
- No flashing failure effects, limited lives, paid retries, streak penalties or public chat.
- Canvas has a text description; settings, status, instruments and results are HTML. Visual spatial play is not claimed to be fully equivalent for nonvisual users.
- Small-screen flight mode prioritizes the scene and reachable brake controls.

## Persistence and scope
Validated, versioned browser-local progress only. No server account, school-record access or cross-device sync. Storage failure does not block play. The former Discovery Studio and saved projects remain at /explore; the homepage now points Play & learn to /play.

## Validation
Analytical trajectory comparison, energy/mass invariants, wind direction, fuel depletion, swept collisions, landing-surface and speed constraints, preview/flight agreement, mission solvability, challenge defaults and malformed save recovery. Browser smoke covers launch, pause, resume, rescue, progression and persistence.

## Technical references
- Fixed-step simulation: https://gafferongames.com/post/fix_your_timestep/
- Gesture-based audio and lifecycle: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices

## Further development
Playtest difficulty and controls with learners across age groups and actual low-end phones before expanding the campaign. Add more mechanics only after evidence that this chapter is understandable and enjoyable. A larger world, constructible machines, creator sharing, additional chapters and the two other proposed games are not implemented in this release.
