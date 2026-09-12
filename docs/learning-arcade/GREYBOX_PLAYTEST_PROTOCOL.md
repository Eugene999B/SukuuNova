# Learning Arcade — Greybox Playtest Protocol

Status: **Studio standard / pre-production**  
Applies to: every flagship greybox before vertical-slice promotion  
Related: #159, #172, draft PR #162

---

# 1. Why this protocol exists

A game can compile, look attractive and still fail immediately when a child touches it.

Automated tests can prove arithmetic, state transitions, security and performance. They cannot prove that a learner:

- understands who they are in the game;
- knows what they can do;
- connects their action to the world response;
- learns from a failed attempt;
- wants to continue;
- can transfer the idea into a changed situation;
- experiences the title as a game rather than a decorated worksheet.

Every Learning Arcade flagship therefore needs observed play before polished production scale-up.

This is not a marketing satisfaction survey. It is an interaction, learning and replay test.

---

# 2. Core principles

## Observe before explaining

For the opening task, the facilitator should avoid teaching the controls unless safety, distress or complete deadlock requires intervention.

The team needs to see what the interface teaches by itself.

## Record behavior, not only opinion

“Fun” is useful but insufficient. Watch what the learner actually does:

- where they tap/click first;
- what they try after a failure;
- whether they replay voluntarily;
- whether they use evidence or guess;
- whether they notice world feedback;
- whether they can transfer the skill.

## Separate concept difficulty from interface difficulty

A learner can understand the mathematics/programming/cyber concept and still fail because a drag target is tiny or an instruction is unreadable.

Code observations separately:

- **C** — concept/learning difficulty;
- **I** — interface/control difficulty;
- **R** — reading/language difficulty;
- **F** — fantasy/rule comprehension difficulty;
- **P** — performance/technical problem;
- **A** — accessibility barrier.

## Do not coach toward the expected answer

Hints used in the production design may be activated normally. The observer must not accidentally become an extra hint system.

## Playtest the greybox, not the pitch

Do not tell a child what the game is “supposed to become.” Test what is actually interactive today.

---

# 3. Required participant profile

Exact recruitment depends on school access and safeguarding procedures. A useful early round can be small if observations are deep.

## First interaction round

Target roughly **5–8 representative learners per materially different age/input band** where feasible.

The objective is not statistical significance. It is to expose obvious interaction failures before expensive production.

## Later validation round

After major fixes, test with a fresh group where possible so familiarity does not hide onboarding problems.

## Diversity considerations

Where feasible include variation in:

- prior subject mastery;
- reading confidence;
- gaming familiarity;
- touch/mouse/keyboard familiarity;
- device size;
- accessibility needs relevant to the mechanic.

Never collect unnecessary sensitive personal information for a playtest.

---

# 4. Safeguarding and consent

Playtests involving children must follow the school/organization's applicable safeguarding, guardian-consent and data-handling procedures.

At minimum:

- responsible adult/school process approves participation;
- learner knows they are testing the **game**, not being tested as a person;
- participation can stop at any time;
- do not request private credentials, health details or unrelated personal data;
- recordings require appropriate consent; notes are preferred when recording is not approved;
- anonymize reports where learner identity is unnecessary;
- never shame mistakes or compare children publicly.

The facilitator should say, in age-appropriate language, that problems are useful because they show the team what to improve.

---

# 5. Session setup

Record before play:

- game + schema/version;
- commit/build identifier;
- device/browser;
- input method;
- age band;
- mission/mechanic tested;
- whether participant has played this title/build before;
- audio on/off;
- accessibility settings used;
- network mode if relevant.

Use the same test build for a round unless a blocking bug requires a documented hotfix.

---

# 6. Universal opening test — first 90 seconds

The observer should capture timestamps and behavior.

## Questions the product must answer through play

### 1. Role comprehension

Can the learner tell or show **who they are / what they are doing**?

Examples:
- “I’m planting the garden.”
- “I’m making the robot move.”
- “I’m checking if the message is fake.”
- “I’m serving this customer.”

Formal vocabulary is not required.

### 2. Action discovery

Does the learner discover the primary verb without an adult saying exactly where to click?

### 3. Goal comprehension

Can they tell or show what success looks like?

### 4. Causal feedback

After their first meaningful action, do they notice what changed and connect it to their action?

### 5. Error recovery

If the first attempt is imperfect, what happens next?

Observe whether the learner:
- revises intentionally;
- retries randomly;
- freezes;
- looks for an answer button;
- asks the adult;
- abandons the task.

---

# 7. Universal observation sheet

Use one row per notable event.

| Time | Context | Learner action | World/UI response | Learner reaction/quote | Code | Severity | Design hypothesis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 00:18 | First seed task | Drags seed beside bed | Seed snaps back | Tries same spot twice | I | High | Drop target unclear/small |
| 02:10 | Changed route | Runs program | Bot turns wrong | Opens program, points at turn block | — | Positive | Debug loop understood |

Severity:

- **Blocker** — cannot continue without adult/bug workaround;
- **High** — major confusion/frustration or incorrect learned model;
- **Medium** — noticeable friction but recovery occurs;
- **Low** — polish/detail issue;
- **Positive** — behavior worth preserving.

Do not log only problems. Successful self-discovery is evidence too.

---

# 8. Learning transfer test

A game is not successful because the child memorized one screen.

After the learner demonstrates the target once, change **surface features while preserving the concept**.

Examples:

## Number Bloom

Same target quantity, different object arrangement/bed layout.

## Cedi City

Same change concept, different products/amounts/customer.

## CodeBots

Same loop/condition concept, altered route/sensor placement.

## Signal Shield

Same phishing/recovery principle, different message polish/display name/evidence arrangement.

## Circuit Forge later

Same circuit principle, components laid out differently.

## Reading Quest later

Same inference skill, new passage/evidence location.

Record whether strategy transfers or the learner falls back to screen-position memory/guessing.

---

# 9. Replay and toy test

At the end of the required task, do **not** immediately direct the learner to the next lesson.

Present a neutral opportunity:

> “You can stop, try something here, or choose what you want to do next.”

Observe:

- replay same mechanic;
- enter Free Grow/Sandbox/Practice;
- explore a tool;
- choose another mission;
- leave immediately;
- ask what unlocks next.

Voluntary continuation is stronger evidence of engagement than a 1–5 “fun” rating alone.

For games with an explicit toy/sandbox, record:

- whether learner enters it voluntarily;
- what they do without a task prompt;
- how long meaningful experimentation lasts;
- whether the toy reveals additional understanding.

---

# 10. Think-aloud — use carefully

Think-aloud can reveal reasoning but can also distort play, especially for young children.

## Early years

Do not require constant narration. Use occasional simple prompts after an action:

- “What happened?”
- “What are you trying now?”
- “How did you know?”

## Older learners

For debugging/investigation games, a light think-aloud can help:

- “What are you checking?”
- “What makes you think that?”
- “What did the run/test tell you?”

Never turn the facilitator into a teacher leading them to the answer.

---

# 11. Game-specific first-wave scripts

## 11.1 Number Bloom

### Tasks

1. Plant a requested quantity 1–5.
2. Correct an intentionally easy overfill/underfill opportunity through normal play.
3. Make a target quantity across two beds.
4. Compare two differently spaced groups.
5. Transfer quantity task to new layout.
6. Offer Free Grow.

### Critical observations

- child can act without reading;
- touch/drag works on real device;
- one-to-one counting behavior;
- understands last count as total;
- recognizes more/less despite spacing trap;
- self-correction is calm;
- Free Grow attracts voluntary play.

### Immediate blockers

- asks “which answer do I press?”;
- cannot identify draggable objects/bed;
- repeated accidental drops;
- animation obscures count;
- voice is too long or confusing.

---

## 11.2 Cedi City

### Tasks

1. Serve one simple basket.
2. Build exact payment/change.
3. Fix an incorrect tender/change state.
4. Complete a sale and observe stock/till change.
5. Restock one item.
6. Run a second customer with changed amounts.

### Critical observations

- understands money objects represent value;
- explains why change is owed;
- notices stock/till causality;
- multiple valid money combinations do not confuse the interface;
- learner behaves like a shop operator rather than quiz respondent.

### Immediate blockers

- searches for one correct receipt option;
- cash movement does not feel connected to total;
- ledger/till values are unreadable or decorative;
- wrong transaction cannot be repaired without restarting.

---

## 11.3 CodeBots

### Tasks

1. One-command movement to goal.
2. Move + turn sequence.
3. Repeated route that motivates loop.
4. Wrong run requiring revision.
5. Use Step to inspect behavior.
6. JHS: repair one conditional using visible test evidence.
7. Transfer route/test.

### Critical observations

- learner predicts code/world relationship;
- presses Run expecting world consequence;
- wrong run leads eyes back to program;
- Step highlights understandable execution unit;
- loop solves a felt problem rather than vocabulary exercise;
- debugging is evidence-driven.

### Immediate blockers

- learner rearranges blocks randomly until success;
- execution animation and highlighted command are out of sync;
- Run behaves differently from Step result;
- all commands form an obvious permutation puzzle;
- hidden test feedback effectively reveals solution.

---

## 11.4 Signal Shield

### Tasks

1. Inspect a suspicious message.
2. Check actual sender and safe destination preview.
3. Mark evidence and quarantine/report.
4. Transfer case with polished grammar/familiar display name.
5. Recover a fictional account with an active suspicious session.
6. Audit app permissions.

### Critical observations

- learner inspects before acting;
- uses more than one signal for phishing;
- distinguishes display name from actual identity;
- understands that changing a credential and revoking sessions are separate states;
- does not learn “deny every permission”;
- feels competent rather than frightened.

### Immediate blockers

- case solved by clicking a response without inspection;
- “bad spelling = scam” becomes the only learned rule;
- learner thinks real passwords should be entered into the game;
- warning visuals create panic or hurry;
- remaining risk is invisible after incomplete recovery.

---

# 12. Post-session interview

Keep it short and age-appropriate. Ask open questions before rating questions.

Useful prompts:

1. “What were you trying to do in the game?”
2. “What was the easiest thing to understand?”
3. “Was there a moment you didn’t know what to do?”
4. “When something went wrong, how did you know?”
5. “Show me one thing you learned or got better at.”
6. “What would you choose to do if you played again?”
7. “What would you change?”

Then, if useful, ask a simple enjoyment rating suited to age.

Do not lead with “Was it fun?” because children may answer politely without revealing the problem.

---

# 13. Quantitative indicators

These are signals, not universal pass/fail numbers. Teams should define thresholds after baseline tests.

Useful measurements:

- time to first meaningful action;
- adult interventions required;
- invalid/mis-targeted input rate;
- hint usage;
- self-correction rate;
- transfer success rate;
- voluntary replay/exploration rate;
- abandonment point;
- first-task completion without adult instruction;
- time spent fighting controls vs using learning mechanic;
- crash/performance events;
- reading requests caused by UI language.

Do **not** optimize thinking-neutral games for minimum completion time.

---

# 14. Mechanical distinctness review

After each test round, reviewers should watch short clips/notes of the approved Arcade prototypes side by side.

Ask:

> If all branding, colors and character names were greyed out, would the player still be doing a recognizably different activity?

For the first four proofs, the answer should be obvious:

- Number Bloom — manipulate quantities in a garden;
- Cedi City — operate transactions/business state;
- CodeBots — construct/run/debug programs;
- Signal Shield — inspect evidence and secure systems.

If two prototypes reduce to the same input grammar and state loop, redesign before production scale-up.

---

# 15. Round review meeting

Within the team, classify every significant finding:

## Keep

Behavior works and should be protected from later polish/regression.

## Fix before next test

Interaction/learning issue likely to materially change observations.

## Investigate

Cause unclear; instrument or run focused prototype.

## Later polish

Does not block understanding, learning or replay.

## Reject mechanic

Evidence suggests the core idea itself is weak, not merely under-polished.

A team must be willing to reject a mechanic after testing. Pre-production exists to make that affordable.

---

# 16. Promotion report template

Every greybox seeking vertical-slice promotion should add a short report to its implementation PR/issue.

```md
## Greybox playtest report

Build / commit:
Game schema:
Age band:
Participants:
Devices / input:

### Core hypotheses
- H1:
- H2:
- H3:

### What worked
- ...

### Blockers / high-severity findings
- ...

### Learning transfer observations
- ...

### Replay / voluntary engagement
- ...

### Accessibility / control findings
- ...

### Changes made after observation
- ...

### Remaining known problems
- ...

### Decision
- [ ] reject/rethink core mechanic
- [ ] repeat greybox test
- [ ] promote to learning prototype
- [ ] promote to vertical slice

Evidence links/notes:
```

Do not write “playtest passed” without recording what was observed.

---

# 17. Studio-level promotion rules

A greybox should **not** move forward merely because most participants eventually finished.

Promotion requires credible evidence that:

- primary action is discovered with acceptable assistance;
- fantasy and goal are understandable;
- cause/effect is visible;
- mistakes produce intentional revision;
- the learning target is expressed through play;
- transfer works beyond one surface arrangement;
- controls/accessibility do not dominate difficulty;
- title is mechanically distinct from other Arcade proofs;
- no inappropriate wall-clock pressure shapes behavior;
- there is at least some evidence of voluntary continuation/replay or a clear plan to fix the toy before scaling.

If the greybox fails these conditions, the correct studio response is to revise or discard the mechanic—not to add prettier art, louder sound, more XP or more question content.
