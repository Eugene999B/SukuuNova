# Learning Arcade — Current Mechanics Audit

Status: **Pre-production evidence review**  
Scope: **all 18 live flagships**  
Purpose: classify the current implementation by its actual moment-to-moment interaction, not by title, theme, CSS or curriculum description.

---

## 1. Audit rule

A title is not mechanically distinct because it has a different:

- background;
- fictional resource;
- progress bar;
- character name;
- icon set;
- audio sting;
- “boss” label;
- timer name;
- question bank.

The audit asks what the learner physically/mentally **does to change game state**.

If the main assessed action is still “select one of several strings and commit it,” the title remains choice-driven regardless of presentation quality.

---

## 2. Score dimensions

Each dimension uses 1–5.

### Mechanical distinctness

1 = essentially the shared choice loop.  
3 = contains a meaningful bespoke interaction but choice loop still dominates.  
5 = core play is unmistakably its own game.

### Fantasy-action alignment

1 = fantasy mostly decorative.  
3 = some actions support fantasy.  
5 = the repeated player verbs are exactly what the fantasy promises.

### Direct learning interaction

1 = learning is demonstrated mainly by selecting an answer.  
3 = some manipulation/construction demonstrates learning.  
5 = curriculum understanding is expressed through the actual game system.

### Thinking-time safety

1 = wall-clock hesitation directly damages state/reward.  
3 = pressure exists but is not always decisive / can be removed.  
5 = pacing is intrinsically appropriate and does not punish careful reasoning; speed is measured only where speed is the skill.

### Replay/toy depth

1 = replay mostly means another question.  
3 = some free/sandbox/procedural variation.  
5 = a satisfying underlying toy/simulation supports experimentation and mastery.

### Architecture independence

1 = strongly bound to `prompt + options + answers[]`.  
3 = uses a bespoke representation inside the generic envelope.  
5 = naturally wants/uses game-specific structured state/actions.

Scores describe **current implementation**, not the quality target.

---

## 3. Portfolio snapshot

| Game | Distinct | Fantasy fit | Direct learning | Time safety | Replay/toy | Arch independence | Current classification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Nova Runner | 4 | 3 | 2 | 4 | 3 | 2 | **Keep runner; rebuild knowledge gates** |
| TurboType | 5 | 5 | 5 | 5 | 4 | 4 | **Strong base; deepen** |
| AstroLab | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild** |
| Circuit Forge | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild** |
| Word Kingdom | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild** |
| Animation Story Lab | 3 | 4 | 2 | 5 | 4 | 2 | **Keep creative toy; rebuild assessed missions** |
| Reading Quest | 2 | 2 | 1 | 1 | 1 | 1 | **Core rebuild** |
| CodeBots | 4 | 4 | 3 | 1 | 3 | 3 | **Strong prototype base; replace pressure + deepen execution** |
| GeoQuest | 2 | 3 | 1 | 1 | 2 | 1 | **Core rebuild around map interaction** |
| Cedi City | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild around business simulation** |
| Signal Shield | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild around evidence/incident state** |
| EcoGrid Ghana | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild around resource/system simulation** |
| BioQuest | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild around body-system relationships** |
| Chronicle Vault | 3 | 3 | 2 | 1 | 2 | 2 | **Keep chronology manipulation; rebuild investigation core** |
| Style Studio Ghana | 3 | 4 | 2 | 5 | 4 | 2 | **Keep creative toy; rebuild assessed design missions** |
| Solar Navigator | 1 | 2 | 1 | 1 | 1 | 1 | **Core rebuild around navigation/astronomy model** |
| Number Bloom | 3 | 4 | 2 | 5 | 3 | 2 | **Keep garden/toy; rebuild assessed numeracy as manipulation** |
| Nova Millionaire | 5 | 5 | 4 | 5 | 3 | 3 | **Strong base for its genre; deepen content/production** |

The score table is intentionally harsh. A visually polished choice interface does not earn mechanical points merely because it is attractive.

---

# 4. Game-by-game evidence and decision

## 4.1 Nova Runner

### What exists now

- real Canvas runner loop;
- continuous world movement;
- jumping and obstacle avoidance;
- energy/crystals/distance;
- distinct world rendering;
- knowledge gates periodically interrupt running;
- gate completion still takes a `question.options[index]` string and writes it to `answers[]`.

### What is worth keeping

The locomotion toy is real. Running and jumping are not fake UI chrome.

### Main problem

The educational interaction is bolted onto the runner at stationary knowledge gates. The player goes from actual game movement to a conventional answer-selection mode, so the learning and running are not yet one system.

### Reset direction

Keep the runner engine/feel as a candidate base, but redesign how mathematics/learning changes the route. Examples to prototype later:

- choose/construct a route by estimating quantities before a fork;
- collect representations satisfying a live target;
- transform values through gates whose consequences remain visible;
- spatial number-line/ratio/geometry mechanics embedded in motion.

Do not interrupt every stretch with a detached four-choice card.

---

## 4.2 TurboType

### What exists now

- learner types the target directly into an input;
- individual key accuracy is measured;
- WPM, total/correct keystrokes and troublesome keys are recorded;
- racer progress is tied to actual typing;
- speed is legitimate because typing speed/accuracy is the taught skill.

### What is worth keeping

Most of the core. This is one of the few titles where the physical action and learning objective are the same action.

### Reset direction

Deepen rather than replace:

- richer typing content and age-band progression;
- better race/opponent logic;
- targeted weak-key drills;
- word/sentence variety;
- ergonomics/posture breaks;
- optional competitive modes with healthy accuracy weighting;
- stronger bespoke audio/visual production.

TurboType is a reference example of **intrinsic skill-speed timing**.

---

## 4.3 AstroLab

### What exists now

- lab systems (shields/reactor/navigation) and an anomaly meter;
- four selectable responses;
- elapsed time increases threat;
- selecting a response drains/rewards fictional system resources;
- the actual graded evidence is one option string.

### Problem

The player is not manipulating force, motion or experimental variables. The lab is presentation around a choice loop.

### Rebuild direction

A real physics laboratory/defence simulation:

- change force vectors, mass, friction, velocity or trajectories;
- run the simulation;
- make measurements;
- predict then test;
- stabilize a system by changing physical variables;
- use graphs/sensors at older ages.

Thinking time is neutral; consequences arise after a simulated experiment/action.

---

## 4.4 Circuit Forge

### What exists now

- attractive microgrid presentation;
- supply, switch, load and return are displayed;
- scene/content data knows about circuits/faults;
- learner still chooses one textual “switch plan” from four options;
- diagram components are not wired, measured or tested;
- fault pressure rises with wall-clock time.

### Problem

The fantasy promises electrical engineering but the player never engineers the circuit.

### Rebuild direction

This is a high-priority direct-manipulation rebuild:

- drag components onto a workbench;
- wire terminals;
- open/close switches;
- energize/test safely;
- use virtual multimeter/test points;
- diagnose open/short/wrong-load states;
- compare series/parallel behavior;
- later design under voltage/current constraints.

Circuit topology and measurements become structured assessment evidence.

---

## 4.5 Word Kingdom

### What exists now

- fantasy realm, regions, mana, gate integrity and shadow advance;
- four rune choices;
- selected rune stored as answer string;
- wall-clock threat is a decorative/punitive wrapper.

### Problem

Words are being selected, not built/transformed/used.

### Rebuild direction

Prototype language construction systems:

- assemble word roots/prefixes/suffixes;
- manipulate sentence tiles with meaning-changing consequences;
- repair dialogue or instructions in world context;
- use vocabulary to interact with characters/objects;
- grammar transformations that visibly change meaning/action;
- creative sentence paths where several valid constructions exist.

The kingdom should react to language the learner constructs.

---

## 4.6 Animation Story Lab

### What exists now

Two different qualities coexist:

1. **Free Create** — genuine three-frame creative toy with backdrops, characters, actions, dialogue and preview;
2. **Director Missions** — still a question/options decision loop stored in `answers[]`.

### What is worth keeping

The free-creation identity is strong and correctly avoids grading personal imagination.

### Rebuild direction

Preserve and expand the creative studio. Replace assessed missions with editable storyboards:

- reorder shots/beats;
- revise dialogue in context;
- choose and manipulate camera/character staging;
- compare before/after pacing;
- satisfy constraints through a created artifact, not an option card;
- maintain freedom where taste/creativity has no single correct answer.

---

## 4.7 Reading Quest

### What exists now

- player chooses one of three themed routes;
- sees a short passage/cue;
- chooses one of four “evidence” options;
- fog grows with elapsed time;
- trail health/rewards wrap the same decision.

### Problem

The player is not actually marking, connecting or navigating textual evidence. Route choice is largely orthogonal to reading comprehension.

### Rebuild direction

A reading investigation workspace:

- highlight exact supporting phrases;
- connect claim ↔ evidence;
- order events from text;
- annotate character motive/source reliability;
- compare two sources;
- physically build an inference chain;
- explore text/world locations only where evidence unlocks them.

Careful reading must never cause fog damage.

---

## 4.8 CodeBots

### What exists now

- command palette;
- program rack;
- commands assembled in order;
- run/deploy metaphor;
- current answer is serialized program order;
- elapsed thinking drives heat/integrity pressure;
- program does not yet mature into a rich executable programming environment.

### What is worth keeping

The command-rack interaction is one of the strongest existing bridges away from answer selection.

### Main problems

- all required commands arrive as `options`;
- permutation can substitute for programming;
- fake heat punishes editing time;
- little observable execution/debugging compared with target product vision.

### Reset direction

Follow `CODEBOTS_GAME_BIBLE.md`: deterministic executable robot world, Run/Step/Reset, loops/conditions/variables/functions, debugging/tests, then a safely sandboxed SHS text-code path.

---

## 4.9 GeoQuest

### What exists now

- actual Ghana-shaped schematic map and moving expedition position;
- route choice affects cost/relief;
- target point is visible;
- learner still picks a textual place label from four options;
- weather damages expedition state with time.

### What is worth keeping

The map should remain the board.

### Rebuild direction

Make geography spatial:

- place pins;
- draw/choose routes directly on map;
- estimate direction/distance;
- layer regions/rivers/landforms/resources;
- match field evidence to locations;
- plan journeys under real geographic constraints;
- compare thematic maps.

The player’s map actions become the answer.

---

## 4.10 Cedi City

### What exists now

- attractive Ghana-currency market presentation;
- customer/basket/stock/till/trust fiction;
- receipt decision still selected from four option strings;
- queue pressure grows with thinking time.

### Problem

The learner is not operating a business or handling money; they are answering a market-themed maths question.

### Rebuild direction

Follow `CEDI_CITY_GAME_BIBLE.md`:

- handle notes/coins/change;
- scan/add real basket items;
- stock/restock shelves;
- set/manage budgets;
- choose suppliers/prices;
- read/build receipts/ledgers;
- manage profit/cash flow at older ages;
- grow from stall/shop to larger business systems.

This is one of the four vNext architecture proof games.

---

## 4.11 Signal Shield

### What exists now

- themed incident types and network diagram;
- scanner exposes pre-authored clues;
- response remains one selected option;
- wall-clock threat damages firewall integrity/reward chains.

### Problem

The learner does not inspect real case artifacts or manipulate protective controls.

### Rebuild direction

Follow `SIGNAL_SHIELD_GAME_BIBLE.md`:

- inspect sender/domain/link/account/session/permission/device evidence;
- mark and correlate signals;
- verify identity;
- quarantine/report;
- revoke sessions;
- enable MFA/recover account;
- adjust permissions;
- patch devices;
- SHS SOC-lite defensive logs only.

No offensive hacking and no reading-speed punishment.

---

## 4.12 EcoGrid Ghana

### What exists now

- community zones/resources and environmental themes;
- player chooses one of four environmental actions;
- elapsed time creates environmental stress and depletes resources;
- “survey” reveals clue text rather than a manipulable system.

### Problem

Systems thinking is described, not simulated.

### Rebuild direction

Build a resource/allocation simulation:

- place infrastructure/interventions;
- allocate limited water/energy/waste/land budgets;
- observe delayed consequences after actions/turns;
- model trade-offs and synergies;
- restore districts through planning rather than answer selection;
- use Ghanaian environmental contexts accurately and respectfully.

The system should change because of the learner’s plan, not because they spent thirty seconds reading.

---

## 4.13 BioQuest

### What exists now

- body/system visual representation;
- multiple physiological meters;
- player chooses one of four explanations;
- elapsed time creates bodily strain;
- BioScan reveals clue text.

### Problem

The learner is not connecting organs, pathways or system interactions.

### Rebuild direction

A human-systems model:

- connect organ ↔ system ↔ function;
- route oxygen/nutrients/signals through simplified models;
- manipulate a variable and observe system response;
- diagnose fictional training cases from measured evidence;
- coordinate multiple systems for exercise/homeostasis scenarios;
- older learners interpret graphs/data without medicalizing real personal health.

No body harm for slow thinking.

---

## 4.14 Chronicle Vault

### What exists now

- normal choice questions for many records;
- importantly, `sort_plus` records already use an ordered list with move-up/down controls and serialize the rebuilt order;
- evidence clues/ChronoLens exist;
- paradox pressure still punishes elapsed time.

### What is worth keeping

The chronology ordering mechanic is a genuine seed of direct interaction.

### Rebuild direction

Expand from ordering into historical investigation:

- place events on timeline;
- connect cause/effect;
- compare primary/secondary sources;
- tag provenance/bias/context;
- build evidence chains supporting an interpretation;
- reconstruct an archive from artifacts.

Retire wall-clock paradox damage.

---

## 4.15 Style Studio Ghana

### What exists now

Like Animation Story Lab, this has two layers:

1. **Free Style** — real wardrobe composition/customization toy, no correctness grade;
2. **Design Missions** — selects a piece from answer options and commits it.

### What is worth keeping

The creative studio, mannequin preview, layered wardrobe and explicit “taste is never marked wrong” philosophy are strong foundations.

### Rebuild direction

Make assessed craft/design missions artifact-based:

- assemble whole looks/textile combinations;
- satisfy functional briefs;
- choose material/pattern construction for stated constraints;
- repair/modify an existing garment;
- reason about respectful heritage/context through source cards;
- evaluate the finished artifact against objective constraints while preserving subjective creativity.

---

## 4.16 Solar Navigator

### What exists now

- mission-control presentation, target body, telemetry and fuel/nav metrics;
- learner chooses one of several route text options;
- elapsed time drains navigation integrity;
- revisions can influence reward/chain in the current model.

### Problem

The learner is not plotting or simulating a route.

### Rebuild direction

Astronomy/navigation sandbox:

- drag route/transfer path;
- choose burn/observation points through spatial interaction;
- order missions based on orbital/planetary evidence;
- use scale, rotation, seasons, phases and gravity models where age-appropriate;
- run a simplified deterministic simulation and revise based on telemetry.

Revision must be encouraged; thinking time is neutral.

---

## 4.17 Number Bloom

### What exists now

- strong garden identity;
- direct-looking quantity visuals;
- calm no-race framing;
- genuine ungraded Free Grow toy;
- assessed garden tasks still render possible answers as choice buttons, even when those buttons show groups of objects.

### What is worth keeping

Garden fantasy, early-years tone, voice/picture direction and Free Grow premise.

### Rebuild direction

Follow `NUMBER_BLOOM_GAME_BIBLE.md`: Plant Count, Make the Bed, Compare Patches and later pattern/matching mechanics through direct manipulation.

This is one of the four vNext architecture proof games.

---

## 4.18 Nova Millionaire

### What exists now

- multiple reasoning scene families;
- explicit untimed show format;
- choice/lock interaction is genre-appropriate;
- server lock endpoint grades immediately and prevents changing a judged answer;
- lifeline gives reasoning strategy rather than answer;
- post-lock explanation creates a coherent game-show feedback loop.

### What is worth keeping

The core choice mechanic belongs here. A knowledge/reasoning game show naturally asks a contestant to select and lock a response.

### Reset direction

Deepen rather than replace:

- continue raising question/reasoning quality;
- stronger scene-specific visuals/interactions where they enrich reasoning without breaking game-show clarity;
- richer host/audience/audio production;
- meaningful difficulty ladder;
- content deduplication and age-band calibration;
- replay structures/tournaments that stay educational and non-gambling.

Nova Millionaire proves the reset is **not anti-choice**; it is anti-universal-choice.

---

# 5. Classification summary

## Strong base — deepen, do not rebuild blindly

### TurboType

Typing itself is the game and the measured skill.

### Nova Millionaire

Choice/lock is appropriate to the game-show fantasy and already has authoritative reveal.

These titles still need content, audiovisual and progression quality work; “strong base” does not mean “finished.”

---

## Keep a real toy/system, rebuild the assessed learning layer

### Nova Runner

Keep movement/runner; redesign knowledge integration.

### Animation Story Lab

Keep Free Create/storyboard; redesign Director Missions around artifacts.

### CodeBots

Keep command construction as a starting point; turn it into an executable programming environment.

### Chronicle Vault

Keep chronology ordering; expand into evidence/source investigation.

### Style Studio Ghana

Keep Free Style/design toy; redesign assessed briefs around constructed artifacts.

### Number Bloom

Keep garden/Free Grow; make numeracy tasks direct manipulation.

---

## Core-loop rebuild required

- AstroLab;
- Circuit Forge;
- Word Kingdom;
- Reading Quest;
- GeoQuest;
- Cedi City;
- Signal Shield;
- EcoGrid Ghana;
- BioQuest;
- Solar Navigator.

Their current thematic systems are useful references for art/content/world direction, but their assessed moment-to-moment interaction must be redesigned.

---

# 6. Recommended production waves

This order is about **de-risking architecture and interaction families**, not ranking subjects by importance.

## Wave 0 — platform proof

Before polished production:

- Arcade Session API vNext;
- structured mission/action schemas;
- game adapter boundary;
- authoritative grading contract;
- save/resume snapshot strategy;
- per-title lazy loading.

Legacy remains operational.

## Wave 1 — four opposite greybox proofs

### Number Bloom

Proves touch-first, non-reading direct manipulation.

### Cedi City

Proves persistent economy/business simulation and multi-object transactions.

### CodeBots

Proves executable programs, deterministic simulation and structured artifacts.

### Signal Shield

Proves evidence investigation and stateful defensive procedure.

Do not make these four share a gameplay component. They should share only platform services.

## Wave 2 — high-value direct-system rebuilds

- Circuit Forge;
- Reading Quest;
- GeoQuest;
- EcoGrid Ghana;
- BioQuest.

These force vNext to support wiring, text evidence, maps, resource systems and biological relationships.

## Wave 3 — language/science/history worlds

- AstroLab;
- Word Kingdom;
- Solar Navigator;
- Chronicle Vault deepening.

## Wave 4 — deepen strong/creative bases

- Nova Runner learning integration;
- TurboType competitive/adaptive depth;
- Animation Story Lab assessed artifact missions;
- Style Studio assessed artifact missions;
- Nova Millionaire production/content depth.

Waves may overlap after architecture proofs are stable, but a later wave must not be used as an excuse to leave any flagship in quiz-shell form permanently.

---

# 7. Portfolio-level gates

A title cannot move from pre-production to full production until:

1. its Game Bible defines a unique core loop and primary interaction;
2. a greybox proves the loop works without polished art;
3. the learning objective is demonstrated through the game action itself;
4. thinking time follows the Arcade timing policy;
5. the title has a game-specific mission/action schema or an explicitly justified compatible schema;
6. authoritative grading works without leaking solutions;
7. performance/accessibility budget is defined;
8. representative learners understand what to do and why outcomes occur;
9. replay does not depend only on receiving another question;
10. the title is mechanically distinguishable from the other approved slices in a ten-second interaction demo.

---

# 8. What this audit changes immediately

- Stop measuring progress by “number of games restyled.”
- Stop adding thematic pressure meters to simulate game tension.
- Stop treating `options[]` as the easiest universal integration format.
- Preserve genuinely useful existing toys/runtimes rather than rewriting everything for purity.
- Judge every new PR by player verbs and state transitions first.
- Make the four Wave 1 greyboxes intentionally incompatible at the gameplay layer so the platform boundary is proven under stress.

The quality reset succeeds only when a child can move from one flagship to another and immediately feel that they have entered a **different kind of game**, while SukuuNova still knows securely who they are, what they learned, where they stopped and what evidence supports mastery.
