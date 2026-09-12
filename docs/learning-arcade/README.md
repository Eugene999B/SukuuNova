# Learning Arcade Studio Pre-production

This directory is the source of truth for the Learning Arcade rebuild.

## Documents

### Studio standards

- `STUDIO_CONSTITUTION.md` — non-negotiable definition of what counts as a SukuuNova game.
- `AGE_BAND_ARCHITECTURE.md` — Creche/KG, Primary, JHS and SHS experience rules.
- `GAME_BIBLE_TEMPLATE.md` — mandatory design document before production work.
- `PORTFOLIO_REDESIGN_MASTERPLAN.md` — redesign direction for all 18 live flagships plus incubating worlds.
- `PORTFOLIO_MECHANICS_AUDIT.md` — source-grounded audit of the current 18 implementations, preservation/rebuild classification and production waves.
- `TECHNICAL_ARCHITECTURE_RESET.md` — vNext separation between shared platform services and game-owned runtimes; replaces the universal question/answer assumption with versioned game schemas, structured actions and authoritative graders.
- `ARCADE_SESSION_VNEXT_RFC.md` — implementable session/API proposal covering game adapters, action journals, idempotency, snapshots, authoritative grading, legacy coexistence and the four proof adapters.

### Approved pre-production references / prototype candidates

- `bibles/CEDI_CITY_GAME_BIBLE.md` — business/economy simulation reference.
- `bibles/NUMBER_BLOOM_GAME_BIBLE.md` — Creche/KG direct-manipulation numeracy garden.
- `bibles/CODEBOTS_GAME_BIBLE.md` — executable programming and robotics simulation from blocks to SHS text code.
- `bibles/SIGNAL_SHIELD_GAME_BIBLE.md` — evidence-driven defensive cyber investigation and incident response.

These Bibles are design specifications, not claims that the corresponding games are already rebuilt.

## Current production rule

No new flagship gameplay production begins until its Game Bible passes concept review. Existing Arcade work may continue only for critical bug/security fixes. Incremental reskin/prompt/timer changes are not considered a flagship redesign.

The pre-production package also freezes two architectural anti-patterns for new work:

1. a generic `prompt + options + answers[]` contract may not be used as the default mechanic for unlike games;
2. non-speed games may not damage state or reduce reward merely because a learner takes time to think or read.

## Current technical direction

The future Arcade is a **platform hosting multiple game runtimes**, not one game shell with eighteen skins.

Shared services may include authentication, age-band targeting, accessibility preferences, save/resume, curriculum/mastery reporting, telemetry primitives, secure grading infrastructure and launcher/navigation. Each title owns its renderer, controls, mission state, content schema, feedback, failure/recovery, HUD, simulation and audiovisual identity.

The first vNext platform proofs deliberately span very different interaction families:

- Number Bloom — touch/direct manipulation;
- Cedi City — economy/business simulation;
- CodeBots — executable programming;
- Signal Shield — evidence investigation/defensive incident response.

If one universal gameplay component is required to make all four work, that is a warning sign rather than a design goal.

## Current portfolio classification

The mechanics audit intentionally avoids a blanket rewrite:

- **Strong base / deepen:** TurboType, Nova Millionaire.
- **Keep a real toy/system but rebuild assessed learning:** Nova Runner, Animation Story Lab, CodeBots, Chronicle Vault, Style Studio Ghana, Number Bloom.
- **Core-loop rebuild required:** AstroLab, Circuit Forge, Word Kingdom, Reading Quest, GeoQuest, Cedi City, Signal Shield, EcoGrid Ghana, BioQuest, Solar Navigator.

“Strong base” does not mean finished; it means the core player action is already worth preserving.

## Immediate next milestones

1. Review the studio package, mechanics audit and four prototype Bibles against issue #159.
2. Turn `ARCADE_SESSION_VNEXT_RFC.md` into work packages and a zero-game-enabled platform prototype while legacy sessions remain operational.
3. Prove idempotency, public/private mission separation, save/resume and authoritative grading using a test-only fixture adapter before a real game depends on vNext.
4. Build greybox prototypes before polished production code: Number Bloom direct manipulation, CodeBots deterministic robot interpreter/world, Signal Shield evidence workstation and Cedi City transaction simulation.
5. Create explicit playtest scripts and measurable promotion gates for each slice.
6. Test the four loops with representative learners before scaling content, campaigns or art production.
7. Promote one slice at a time through concept → paper prototype → greybox → learning prototype → vertical slice → child playtest → controlled rollout.
8. Continue writing Bibles for the remaining 14 live flagships; do not declare the Arcade rebuild complete until every title passes its game-specific bar.
