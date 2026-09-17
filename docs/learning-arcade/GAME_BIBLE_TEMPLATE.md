# SukuuNova Game Bible Template

Every flagship, expansion or major mode must complete this document before production code is approved.

---

# 1. Identity

**Title:**  
**Working codename:**  
**Genre:**  
**Target age band(s):**  
**Primary platform/input:**  
**One-line player fantasy:**  
**One-line learning promise:**  
**One-line differentiation:** Why can this not be mistaken for another SukuuNova game?

## Shipping sentence

> In this game, the learner is a ______ who repeatedly ______ in order to ______. The world responds by ______. Learning ______ makes them better at the game. They return because ______.

---

# 2. Design pillars

Choose 3–5. Every feature must support at least one pillar.

Example format:

- **Build, do not guess** — learning is expressed through manipulation.
- **World remembers decisions** — state persists and consequences matter.
- **Career authenticity** — tools resemble the real profession at the appropriate age.
- **Safe experimentation** — failure teaches and recovery is fast.

Also list explicit **anti-pillars**: things this game must never become.

---

# 3. Audience and age-band design

For each supported band define:

- learner profile;
- reading expectation;
- session length;
- input complexity;
- abstraction level;
- scaffolding;
- tone;
- failure/recovery style;
- assessment method;
- progression expectations.

Do not write “same game, easier questions.”

---

# 4. World and story

## Premise

What happened before the player arrives?

## Player role

Who are they in-world? Why do people/systems trust them with the task?

## Long-term goal

What visible world change or career goal takes weeks/months to reach?

## Story structure

Define acts/seasons/chapters/districts/cases.

## Characters/factions

For each important character:

- role;
- personality;
- gameplay function;
- relationship progression;
- what they teach without becoming a lecture bot.

## World locations

For each location:

- purpose;
- visual identity;
- mechanics introduced;
- unlock condition;
- replay purpose.

---

# 5. Core gameplay

## Primary verbs

List the 3–7 actions the player performs most often.

## 10–60 second loop

Write the actual sequence:

1. Player observes ______.
2. Player chooses/plans ______.
3. Player manipulates ______.
4. System simulates ______.
5. Player reads feedback ______.
6. Player adjusts/continues ______.

## Session loop

What happens in a normal 10–30 minute session?

## Meta loop

What happens over days/weeks?

## Toy test

What can the player do for fun even before a mission tells them to?

If the answer is “nothing,” the game may be over-scripted.

---

# 6. Rules and state model

Document every major variable/system:

- resources;
- world state;
- player capability;
- equipment;
- health/integrity only if meaningful;
- economy;
- reputation;
- inventory;
- time/calendar if used;
- relationships;
- mission state;
- randomness.

For each:

- how it changes;
- what the player can observe;
- what decisions affect it;
- min/max/bounds;
- recovery path.

---

# 7. Success, failure and recovery

Define:

- local success;
- mission success;
- long-term success;
- recoverable failure;
- hard failure, if any;
- retry cost;
- hints/scaffolds;
- undo/revision rules;
- no-win-state prevention.

Educational mistakes should produce useful feedback, not humiliation or unexplained punishment.

---

# 8. Learning architecture

For every curriculum concept:

| Concept | In-game action | Evidence of understanding | Common misconception | Feedback/recovery |
| --- | --- | --- | --- | --- |

Then define:

- prerequisite graph;
- difficulty progression;
- transfer tasks;
- deliberate practice opportunities;
- optional mastery challenges;
- how teacher standards map to missions.

## Learning-Action Test

For each core concept answer:

> What can the learner do better in the game after learning this?

If the answer is only “answer a question correctly,” redesign.

---

# 9. Mission design grammar

Define reusable mission structures without making them identical.

For each mission family:

- setup;
- objective;
- player verbs;
- variables that change;
- escalation;
- optional objectives;
- failure modes;
- reward type;
- narrative wrapper;
- replay variation.

Specify minimum launch counts and repetition caps.

---

# 10. Progression

Define progression on multiple axes:

- knowledge/mastery;
- world/campaign;
- tools/equipment;
- customization;
- relationships;
- rank/licence/career;
- creative portfolio;
- optional collectibles.

Avoid progression made only of XP/stars.

---

# 11. Economy and rewards

If the game uses currency/resources:

- sources;
- sinks;
- inflation controls;
- unlock pacing;
- failure recovery;
- anti-grind rules;
- whether resources have educational meaning.

Do not reward speed unless speed is a target skill.

---

# 12. UI/UX Bible

## Presentation metaphor

What is the interface in-world? Workbench, farm map, SOC console, sketchbook, laboratory, etc.

## Screen map

List every major screen and transition.

## HUD

What must always be visible? Why?

## Interaction grammar

- click/tap;
- drag/drop;
- keyboard;
- typing;
- drawing;
- map gestures;
- controller if ever supported.

## Onboarding

Teach controls through play. Define first 5 minutes exactly.

## Error states

How does the interface explain invalid actions?

## Responsive behavior

Desktop, tablet, phone and low-power device behavior.

---

# 13. Art Bible

Define:

- visual references/mood words;
- 2D/3D/illustrated/flat/isometric/etc.;
- camera;
- scale;
- silhouette rules;
- environment style;
- character style;
- animation principles;
- colour system;
- typography;
- iconography;
- VFX rules;
- what this title must NOT visually resemble.

---

# 14. Audio Bible

Define:

- music identity;
- ambience;
- UI sounds;
- world interaction sounds;
- success/failure language;
- voice/narration;
- dynamic music states;
- silence strategy;
- accessibility equivalents;
- volume defaults.

---

# 15. Technology plan

For each dependency state:

- purpose;
- why native React/DOM is insufficient if using a game/rendering library;
- bundle/performance cost;
- mobile implications;
- accessibility implications;
- maintenance risk;
- fallback.

Define:

- renderer/engine;
- physics;
- animation;
- audio;
- editor/tooling;
- save model;
- server grading boundary;
- asset pipeline;
- telemetry;
- offline/cache strategy.

---

# 16. Security and assessment boundary

Document:

- what stays server-authoritative;
- what the client may simulate optimistically;
- what answer/solution data must never reach the client early;
- anti-tamper strategy for scored outcomes;
- creative/unscored modes;
- audit events;
- teacher-visible evidence.

---

# 17. Accessibility

Complete a title-specific checklist for:

- touch;
- keyboard;
- reduced motion;
- contrast;
- colour blindness;
- captions;
- narration;
- readable type;
- motor alternatives;
- cognitive load;
- age-appropriate help.

---

# 18. Performance budget

Define before art production:

- first-load target;
- route/game bundle target;
- texture/audio budgets;
- maximum concurrent entities;
- low-power mode;
- target frame rate;
- fallback frame rate;
- network resilience;
- supported minimum viewport.

---

# 19. Telemetry and learning analytics

Measure meaningful events, for example:

- strategies attempted;
- revisions;
- misconception categories;
- hint usage;
- construction/debug paths;
- mission completion;
- voluntary exploration;
- replay;
- abandonment point.

Do not optimize the product around meaningless clicks or raw speed.

---

# 20. Content QA

Before content ships verify:

- factual correctness;
- grammar;
- age appropriateness;
- ambiguity;
- curriculum fit;
- cultural fit;
- safety;
- repetition;
- answer uniqueness where applicable;
- visual/audio consistency;
- generated-content guardrails.

---

# 21. Prototype plan

## Paper prototype

What can be tested without code?

## Greybox

What is the smallest playable core loop?

## Learning prototype

What proves the learning is actually in the mechanic?

## Vertical slice

What one chapter/mission demonstrates final quality?

Define kill/redesign criteria before implementation.

---

# 22. Playtest protocol

Test with real target learners.

Observe, do not coach immediately.

Record:

- first confusion point;
- first delight point;
- dominant action;
- voluntary experimentation;
- strategy changes;
- UI errors;
- content errors;
- requests to continue;
- spontaneous explanation of what was learned.

Afterward ask the learner to explain the game in their own words.

---

# 23. Production backlog

Break work into disciplines:

- game design;
- curriculum;
- engineering;
- art;
- animation;
- audio;
- narrative;
- UX;
- accessibility;
- QA;
- security;
- analytics;
- teacher/admin reporting.

A flagship is not “an engineer ticket.”

---

# 24. Definition of done

A title is ready for production/release only when:

- core loop is fun/understandable in greybox;
- learning changes play quality;
- controls match fantasy;
- UI is title-specific;
- audiovisual identity is title-specific;
- progression goes beyond stars/XP;
- content quality is audited;
- age-band design is validated;
- accessibility is tested;
- performance budgets pass;
- scored assessment remains secure;
- real learners have playtested it;
- the team can explain why it could not be mistaken for another SukuuNova game.