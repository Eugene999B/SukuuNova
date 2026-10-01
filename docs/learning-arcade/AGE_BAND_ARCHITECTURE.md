# SukuuNova Learning Arcade — Age-Band Experience Architecture

Status: **Pre-production standard**

## Purpose

SukuuNova must not treat Creche/KG, Primary, JHS and SHS as one game with easier or harder questions. Each band has different cognitive, motor, reading, motivational and identity needs. The same learning world may evolve across age bands, but its interaction model, interface density, abstraction level, story structure and assessment method must change.

---

## Experience bands

### Band A — Creche & KG: Play to discover

**Player need:** immediate cause-and-effect, safety, repetition, imagination, sensory feedback and confidence.

**Typical session:** 3–8 minutes.

**Primary verbs:** tap, drag, trace, match, stack, sort, move, listen, repeat, imitate, count visible objects.

**UI:** almost no conventional dashboard. Large illustrated objects. One task focus at a time. Spoken/narrated guidance. Minimal reading. Persistent home/back affordance that cannot be triggered accidentally.

**Story:** simple character need: help the animal, plant the garden, build the bridge, find the sound, deliver the shapes.

**Feedback:** immediate animation, voice, music sting, character reaction and world change.

**Failure:** no harsh game-over. Wrong actions create informative response and quick recovery.

**Assessment:** recognition, sorting, tracing path, counting manipulatives, matching sound/shape/letter/quantity, simple sequencing.

**Progression:** new places, characters, objects, songs, patterns and creative toys.

**Do not use:** dense text, conventional tables, countdown pressure, abstract scores as the main motivation, tiny icons, four-option question cards as default.

---

### Band B — Primary: Adventure to understand

**Player need:** agency, discovery, collection, characters, visible mastery and short goals.

**Typical session:** 8–20 minutes.

**Primary verbs:** move, explore, collect, build, combine, measure, arrange, route, trade, experiment, classify, code simple sequences.

**UI:** world-first. HUD only for resources needed now. Inventory and map introduced gradually. Concrete models before symbolic notation.

**Story:** chapter-based adventures, villages, expeditions, studios, workshops and character relationships.

**Failure:** understandable consequence plus retry/rebuild path. Protect curiosity.

**Assessment:** performance in the world: correct change given, bridge dimension chosen, route mapped, commands assembled, evidence found, pattern constructed.

**Progression:** tools, locations, companions, badges with mechanical meaning, workshop/farm/shop upgrades, story chapters.

---

### Band C — JHS: Systems to master

**Player need:** competence, identity, careers, strategy, social relevance and complex cause/effect.

**Typical session:** 15–35 minutes.

**Primary verbs:** plan, allocate, simulate, debug, investigate, compare, optimize, diagnose, negotiate, manage, program, design.

**UI:** diegetic professional-lite tools: dashboards, maps, logs, ledgers, consoles, workbenches. More data is acceptable when it serves a decision.

**Story:** multi-mission campaigns, apprenticeships, clubs, companies, labs, communities, tournaments and mysteries.

**Failure:** systems can deteriorate or projects can fail because of decisions, but never simply because the learner thought slowly.

**Assessment:** decisions, constructed systems, debugging paths, explanations, artifact quality against transparent rubrics and scenario outcomes.

**Progression:** licences, ranks, specializations, districts, equipment tiers, staff/robot abilities, long-term projects.

---

### Band D — SHS: Practice to become

**Player need:** authenticity, career relevance, creative ownership, advanced mastery and portfolio evidence.

**Typical session:** 20–60+ minutes.

**Primary verbs:** build, model, code, analyze, diagnose, research, manage, design, write, present, simulate, optimize, collaborate.

**UI:** can intentionally resemble professional tools: IDE, terminal, SOC, CAD-like workbench, accounting ledger, lab notebook, timeline editor, GIS-like map, media timeline.

**Story:** career simulation, client briefs, internships, research programmes, real-world cases and capstone projects.

**Failure:** realistic project consequences with save/revise/retrospective cycles.

**Assessment:** product + process: code execution, design constraints, financial accuracy, evidence reasoning, simulations, written rationale, teacher review and portfolio export.

**Progression:** career pathways, advanced specializations, certifications, portfolio, complex projects and mentorship characters.

---

## Cross-band evolution rule

A world may span several bands, but it must **mature**.

Example — Cedi City:

- KG: count coins/notes visually, match prices, choose enough money.
- Primary: run a small stall, calculate totals/change, manage a simple budget.
- JHS: inventory, discounts, percentages, profit/loss, supplier decisions and expansion.
- SHS: accounting, payroll, cash flow, finance, pricing strategy, entrepreneurship and economic shocks.

The world stays recognizable. The game does not.

---

## Reading load rules

- Creche/KG: narration first; text is optional reinforcement.
- Lower Primary: short phrases, icons, voice support.
- Upper Primary: short instructions and dialogue; avoid walls of text.
- JHS: authentic but chunked information.
- SHS: domain-realistic reading is acceptable where the profession requires it, with glossaries and scaffolds.

---

## Input rules

### Touch-first experiences

Use direct manipulation whenever possible: drag object to place, draw/trace, tap world object, pinch/zoom map where appropriate.

### Keyboard/mouse experiences

Use when the learning target includes typing, coding, desktop productivity, advanced design or professional software concepts.

### Avoid fake interaction

If a circuit game shows wires, the learner should manipulate wires. If a map game shows a map, the learner should point, route or navigate on it. If a coding game shows code, the learner should create or modify executable instructions.

---

## Scaffolding ladder

Difficulty does not mean “bigger numbers only.” Scaffolding may change:

1. representation — concrete objects → diagrams → symbols → professional notation;
2. number of simultaneous variables;
3. amount of guidance;
4. available tools/hints;
5. size of planning horizon;
6. ambiguity/noise in evidence;
7. number of systems interacting;
8. openness of the goal;
9. transfer to unfamiliar scenarios.

---

## Accessibility by band

- narration and replay for early learners;
- subtitles/captions for speech/audio cues;
- icon + text dual coding;
- large touch targets;
- reduced motion and flash-safe effects;
- colour-independent status symbols;
- adjustable text scale where layout permits;
- alternative input paths for motor constraints;
- optional reading support for older struggling readers without making the entire experience childish.

---

## Age-band release test

Before a vertical slice is approved, reviewers must answer:

- Would a learner in this band understand the fantasy?
- Are the dominant actions age-appropriate?
- Is the reading load appropriate?
- Is the UI density appropriate?
- Is failure emotionally appropriate?
- Does the game ask for thinking at the right abstraction level?
- Would an older learner find it childish?
- Would a younger learner find it incomprehensible?

If the same UI passes unchanged for KG and SHS, the architecture is almost certainly wrong.