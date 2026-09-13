# Signal Shield — Game Bible

Status: **Pre-production / vertical-slice candidate**  
Primary audience: **Upper Primary and JHS**  
Advanced audience: **SHS defensive SOC-lite progression**  
Safety posture: **defensive cybersecurity and digital citizenship only**

---

# 1. Identity

**Title:** Signal Shield  
**Working codename:** School CyberOps  
**Genre:** Defensive cyber investigation + incident-response simulation  
**Primary platform/input:** Desktop/tablet; mouse/touch; keyboard shortcuts optional  
**Player fantasy:** I am a trusted cyber defender protecting school and community accounts, devices and information by investigating evidence and taking safe response actions.  
**Learning promise:** Learners build cyber-safety judgment by inspecting realistic clues and carrying out defensive procedures, not by memorizing the “safe” answer button.  
**Differentiation:** Signal Shield is an evidence workstation: the player opens artifacts, marks signals, verifies identity, chooses tools and executes a containment/recovery plan.

## Shipping sentence

> In Signal Shield, the learner is a cyber defender who repeatedly receives a case, inspects evidence, verifies claims, marks suspicious or trustworthy signals, chooses defensive actions and observes the resulting state of accounts/devices/network assets. Learning privacy, phishing detection, authentication, permissions, updates, recovery and incident-response reasoning makes them better at protecting the simulated community. They return because new case families, tools, responsibilities and a persistent defensive operations room unlock over time.

---

# 2. Design pillars

- **Inspect before acting** — evidence gathering is a playable action, not decorative text around a question.
- **Defence is procedural** — identify, verify, contain, recover and document.
- **Consequences come from decisions, not reading speed** — no threat bar damages the network while a child thinks.
- **Real enough to transfer, safe enough for school** — scenarios resemble everyday digital life without teaching offensive intrusion.
- **Explain signals, not fear** — learners should leave more confident and capable, not convinced the internet is a constant emergency.
- **Age-appropriate authenticity** — Upper Primary sees understandable messages/accounts/devices; SHS can progress into SOC-lite logs and access-control concepts.

## Anti-pillars

Signal Shield must never become:

- a four-option phishing quiz with a cyber background;
- a fake countdown where “hackers” win while a learner reads;
- an offensive hacking simulator;
- a command-injection/exploit tutorial;
- a scare game full of red sirens and catastrophic language;
- a password-shaming experience;
- a trivia test about security acronyms;
- a black/green fake terminal used only for aesthetics.

---

# 3. Audience and age-band architecture

## Upper Primary — Digital Safety Ranger

**Session:** 8–20 minutes.  
**Reading:** short messages, simple sender/domain clues, icons and voice support where needed.  
**Core concepts:** suspicious messages, personal information, trusted adults/reporting, passwords/passphrases, basic account protection, app permissions, updates, safe Wi-Fi decisions.  
**Core actions:** open message, inspect sender, preview link destination safely, compare identity clues, mark evidence, report/quarantine, adjust permission, recover account.  
**Failure:** safe simulation shows why a choice leaves risk; player can revise/recover.  
**Assessment:** evidence identified + defensive sequence/outcome.

## JHS — Cyber Defence Operator

**Session:** 15–35 minutes.  
**Concepts:** phishing/social engineering, MFA, password manager concepts, session/account recovery, privacy permissions, updates/patches, device security, public/shared networks, basic access logs, impersonation.  
**Actions:** correlate message/account clues, revoke sessions, enable MFA, reset credentials, review permissions, quarantine/report, patch affected device, document case.

## SHS — SOC Analyst Lite

**Session:** 20–60 minutes.  
**Concepts:** identity/access management, authentication logs, event correlation, least privilege, data classification, incident playbooks, patch posture, account compromise indicators, network zones at conceptual level, backup/recovery policy, reporting.  
**Actions:** triage queue, inspect simplified logs, scope affected assets, contain account/device, revoke access, require credential reset/MFA, prioritize patches, produce incident note.

**Safety boundary:** even SHS scenarios stay defensive. They may analyze indicators of compromise and logs but do not instruct learners to exploit targets, bypass authentication, deploy malware or evade detection.

---

# 4. World and story

## Premise

A school/community digital network supports learning, communication, files, devices and accounts. Everyday incidents arrive: suspicious messages, exposed permissions, unusual sign-ins, outdated devices, impersonation attempts and lost access.

The player works from **Signal Shield Operations**, a calm defensive room. The goal is reliable judgment, not cinematic panic.

## Player role

The learner is a **Shield Operator** whose responsibility grows with demonstrated capability.

They protect fictional accounts and assets only. No scenario should encourage testing techniques against real external services.

## Long-term goal

Earn trust across several defensive desks and eventually coordinate multi-step incidents that require correct prioritization and recovery.

## Operations desks

### 1. Inbox Watch

Messages, phishing, impersonation and link inspection.

### 2. Account Guard

Passwords/passphrases, MFA, sign-ins, recovery and session control.

### 3. Privacy Desk

App permissions, data sharing and least-necessary access.

### 4. Device Bay

Updates, device lock, safe software/update decisions and lost-device response.

### 5. Network Watch

Wi-Fi/network trust at age-appropriate level and simplified device/service relationships.

### 6. Incident Room

JHS/SHS multi-artifact cases combining message, identity, account and device evidence.

### 7. SOC Desk — SHS

Simplified event timelines, access logs, alerts, assets and playbooks.

---

# 5. Characters

## Adwoa — Cyber Safety Lead

**Role:** mentor/incident commander.  
**Personality:** calm, methodical, never sensational.  
**Gameplay function:** introduces case objectives and asks the learner to justify evidence.  
**Teaching method:** “What signal supports that?” rather than “Which answer is correct?”

## Kojo — Helpdesk Coordinator

**Role:** reports user symptoms and recovery needs.  
**Gameplay:** makes account recovery and communication human-centered.

## Naa — Privacy Officer

**Role:** teaches data minimization, permissions and responsible sharing through case decisions.

## Shield AI assistant — optional later

Must behave as a tool, not an omniscient answer bot. It can organize evidence the learner already opened or explain terminology; it must not silently solve graded cases.

---

# 6. Core gameplay

## Primary verbs

- inspect;
- open;
- compare;
- trace;
- verify;
- mark evidence;
- report;
- quarantine;
- revoke;
- reset;
- configure;
- patch;
- document.

## 10–60 second loop

1. An incident/case appears with a concrete asset or user need.
2. Player opens one or more evidence artifacts.
3. Player actively inspects details: sender identity, domain, link destination, requested information, permissions, sign-in history, device state, etc.
4. Player marks relevant signals or links related pieces of evidence.
5. Player chooses a defensive tool/action and applies it.
6. Simulated system state changes.
7. Player inspects whether risk is contained/recovery complete and adjusts if necessary.

The case is solved by evidence and procedure, not by clicking one response label.

## Session loop

- receive 2–4 cases or one larger incident;
- triage what needs attention;
- inspect evidence;
- contain/recover;
- review a short reconstruction of the evidence used;
- unlock a tool/case family or advance certification.

## Meta loop

- earn defensive certifications;
- expand the operations room;
- unlock tools and more complex evidence views;
- build a case notebook showing concepts mastered;
- later handle multi-stage incidents and policy trade-offs.

## Toy test

A safe Practice Desk lets learners inspect fictional sample messages/accounts/permissions without grades, mark clues and see explanatory overlays. There is no offensive sandbox.

---

# 7. Core case families

## 7.1 Phishing / suspicious message

### Evidence panes

- message body;
- display name;
- actual sender address/domain;
- safe link-preview card showing destination domain/path at an age-appropriate level;
- requested information/action;
- optional context such as “school notices normally come from…”

### Player actions

- inspect sender;
- preview destination safely;
- highlight suspicious/trust signals;
- verify through an approved channel where scenario supports it;
- report/quarantine message;
- optionally notify account holder.

### Wrong/unsafe action simulation

Do **not** send the learner to a real malicious site. A safe simulation can show “This would have taken you to a look-alike sign-in page” and immediately move into recovery practice if needed.

## 7.2 Account takeover / suspicious sign-in recovery

### Evidence

- recent sign-in list;
- device/location labels simplified appropriately;
- password/MFA status;
- active sessions;
- user report.

### Actions

- identify suspicious session;
- revoke session(s);
- change/reset credentials through simulated control;
- enable MFA;
- confirm recovery contact/process;
- document closure.

### Learning

Containment often requires more than changing one setting.

## 7.3 Permission audit

### Evidence

A fictional learning/photo/chat app requests or already has access to contacts, camera, microphone, files or location.

### Actions

- inspect why the app needs each permission;
- revoke unnecessary permissions;
- allow only needed access;
- understand “ask every time”/limited access concept where device metaphor supports it.

### Learning

Privacy is not “never allow anything”; it is purposeful, least-necessary access.

## 7.4 Update and patch case

### Evidence

- device/app version posture;
- update source/trust context;
- support status;
- user disruption constraints.

### Actions

- schedule/apply official update in simulation;
- avoid suspicious fake-update prompts;
- verify source;
- restart/confirm state if relevant.

## 7.5 Shared/public network decision

Age-appropriate comparison of network context and sensitive actions. Avoid teaching network attacks.

## 7.6 Impersonation/social engineering

Compare identity, urgency, unusual request and independent verification channel.

## 7.7 SHS event correlation

A small set of simplified logs/alerts must be connected into an incident timeline.

Learner actions remain defensive: identify affected account, revoke, reset, patch, report and recommend prevention.

---

# 8. Evidence interaction grammar

Signal Shield should develop reusable **investigation primitives**, not reusable answer cards.

## Open

Click/tap evidence item to inspect details.

## Mark

Select a phrase/field/icon and tag it:

- suspicious;
- trusted/expected;
- needs verification;
- personal/sensitive data;
- affected asset.

Tags available depend on age and case.

## Compare

Place two identity/domain/account items side-by-side or use a compare view.

## Link evidence

JHS/SHS can connect related artifacts into a causal/evidence chain.

## Act

Defensive toolbox contains only actions relevant to current role/case.

## Verify outcome

After action, system state updates and learner checks whether all required containment/recovery conditions are satisfied.

---

# 9. Rules and state model

A case state can include:

- incidents;
- messages;
- accounts;
- sessions;
- devices;
- permissions;
- patches;
- network/service relationships;
- evidence marks;
- containment actions;
- recovery state;
- case notes;
- support/hints used.

## No elapsed threat damage

There is **no universal threat-pressure meter** that consumes firewall health while the learner reads.

A case may contain a narrative timeline (“the account was accessed yesterday”) or a turn-based consequence after a player action, but the passage of real wall-clock thinking time is not failure.

## Decision consequences

If the player chooses an incomplete containment action, the simulation may show the remaining risk because of the decision.

Example:

- learner changes password but leaves a suspicious active session open;
- system displays that the session is still active;
- learner can inspect and revoke it.

This is causal and recoverable, not punitive timing.

---

# 10. Success, failure and recovery

## Local success

Relevant evidence identified or a correct defensive action changes the intended state.

## Case success

Required containment/recovery conditions are satisfied and the learner can point to evidence supporting the action.

## Long-term success

Learner recognizes patterns across new scenarios and uses a disciplined inspect → verify → contain → recover process.

## Recoverable failure

Examples:

- quarantines message but misses compromised account;
- revokes wrong permission and leaves unnecessary sensitive access enabled;
- resets password but not active sessions;
- marks a clue suspicious without corroboration.

The simulation shows remaining state and lets the player continue.

## Hard failure

Avoid in core learning mode. Optional advanced drills may score completeness, but retry/reconstruction remains available.

## Hints

1. remind learner of case objective;
2. indicate unopened evidence category;
3. ask a strategy question (“Does the display name match the actual sender?”);
4. highlight a field to inspect;
5. guided practice may demonstrate procedure but then should not claim independent mastery.

---

# 11. Learning architecture

| Concept | In-game action | Evidence of understanding | Common misconception | Feedback/recovery |
| --- | --- | --- | --- | --- |
| Phishing clues | Inspect sender/link/request and mark signals | Uses multiple relevant clues | Trusts display name/logo alone | Compare actual sender/destination |
| Verification | Use separate trusted channel/tool | Confirms identity independently | Replies directly to suspicious request | Explain why independent channel matters |
| Password/passphrase safety | Configure/recover fictional account | Chooses stronger strategy + MFA where applicable | Reuses/simple predictable password concepts | Strength explanation without collecting real passwords |
| MFA | Enable/understand second factor | Protects recovered account | Thinks password reset alone ends session risk | Show session + MFA state separately |
| Permissions | Revoke/allow based on need | Applies least-necessary access | “All permissions are bad/good” | Show app function vs requested access |
| Updates | Verify/apply official update | Selects trusted update path | Clicks fake update prompt | Compare official settings vs unsolicited prompt |
| Account recovery | Revoke/reset/secure sequence | Completes containment | Performs one action only | Remaining-risk checklist |
| Event correlation | Link logs/events to affected asset | Builds plausible incident timeline | Treats every alert as independent/critical | Timeline/asset relationships |

## Learning-action test

After learning a concept, the learner must be able to **investigate or secure the simulated system more effectively**. Merely naming “phishing” does not count.

---

# 12. Assessment architecture

## Evidence dimensions

The grader can consider:

- relevant evidence inspected;
- evidence tags/links;
- defensive actions selected;
- action ordering only where order materially affects safety;
- final simulated state;
- unnecessary/disruptive actions where curriculum addresses proportional response;
- hint level;
- transfer to a changed case.

## Multiple valid response paths

Where two defensive sequences are both safe and meet the case requirements, both should pass.

Do not hard-code one “correct button order” merely because it is easier to grade.

## Structured submission

Example:

```ts
type SignalShieldActionV1 =
  | { type: "inspect"; evidenceId: string }
  | { type: "mark"; evidenceId: string; tag: EvidenceTag }
  | { type: "link_evidence"; fromId: string; toId: string }
  | { type: "quarantine_message"; messageId: string }
  | { type: "revoke_session"; sessionId: string }
  | { type: "enable_mfa"; accountId: string }
  | { type: "set_permission"; appId: string; permission: string; value: string }
  | { type: "apply_patch"; deviceId: string; patchId: string }
  | { type: "submit_case" };
```

The server owns the authoritative case solution/constraints and computes final evidence.

---

# 13. Safety and ethics guardrails

Signal Shield is a defensive education product.

## Allowed

- recognizing social engineering;
- analyzing fictional sender/domain/link evidence;
- account protection and recovery;
- MFA concepts;
- permissions/privacy;
- software updates/patching;
- simplified defensive logs;
- access control/least privilege;
- backup/recovery concepts;
- incident reporting/documentation;
- safe password/passphrase education without collecting real credentials.

## Not part of gameplay

- exploiting real or fictional vulnerable services through actionable attack steps;
- password cracking;
- credential theft techniques;
- malware creation/deployment;
- phishing kit construction;
- evasion/persistence;
- DDoS instruction;
- bypassing security controls;
- scanning external networks;
- weaponized payloads or commands.

If a future curriculum objective touches how an attack works, present only the minimum conceptual explanation needed to recognize/defend against it.

## Privacy

Never ask learners to enter their real password, recovery code, private message contents or authentication token into the game.

All cases use fictional identities/data generated for the simulation.

---

# 14. Progression

## Certifications

- Inbox Watch;
- Account Guard;
- Privacy Guard;
- Device Defender;
- Incident Responder;
- SOC Analyst Lite (SHS).

Certification unlocks should require demonstrated case competence, not XP alone.

## Tool progression

Tools become more sophisticated:

- sender inspector;
- safe link preview;
- verification directory;
- session manager;
- MFA control;
- permission inspector;
- patch dashboard;
- timeline/log viewer;
- case notebook.

New tools must create new reasoning, not just bigger numbers.

## Operations room

The room evolves visually as desks/certifications unlock, giving long-term world progression without turning security into combat.

---

# 15. UI/UX Bible

## Presentation metaphor

A clean defensive operations workstation.

The interface is information-rich only when age-appropriate.

### Upper Primary

Large case cards/artifacts, one main evidence pane at a time, simple toolbox, plain-language labels.

### JHS

Split case workspace: evidence list, detail pane, defensive tools, affected assets.

### SHS

SOC-lite multi-pane workspace: case queue, timeline/log pane, asset/account details, playbook/action panel and notes.

## No four-answer grid

The standard case screen must not contain four response buttons pretending to be tools. Actions should affect specific simulated objects/accounts/messages.

## First five minutes — Upper Primary

1. One fictional message arrives.
2. Adwoa says: “Before we trust it, let’s check who really sent it.”
3. Child taps sender and sees display name vs actual address.
4. Child taps a safe link-preview icon and sees the destination differs from expected school domain.
5. Child marks both clues and drags/clicks message into Report/Quarantine.
6. Short reconstruction shows exactly which clues mattered.

No countdown appears.

## First five minutes — JHS

After simple message case, learner receives a suspicious sign-in and uses account-session controls, demonstrating that Signal Shield is not only an inbox quiz.

---

# 16. Art Bible

**Mood:** calm competence, modern school/community cyber operations, readable evidence, credible without military paranoia.

**Colour:** dark/light workstation themes may exist, but status must use icon/text as well as colour.

**Network diagrams:** clean SVG nodes/links, used only when they represent actual state.

**Characters:** grounded and contemporary, not “hooded hacker” stereotypes.

**Threat visualization:** restrained. Avoid skulls, demonic malware, constant red flashing or fear-heavy imagery for children.

**SHS:** more professional density, fewer cartoon decorations.

**Do not resemble:** a hacking movie interface, shooter HUD, or quiz card stack.

---

# 17. Audio Bible

## Music identity

Minimal focused electronic pulse with warm human elements. Music should support investigation, not simulate panic.

## Functional sounds

- case arrival;
- evidence open;
- compare view;
- marker placed;
- quarantine/report;
- session revoked;
- MFA enabled;
- patch applied;
- case contained;
- remaining-risk notification.

## Alerts

No constant alarm tied to wall-clock time. A brief alert can accompany a newly revealed incident state triggered by a player action/story beat.

## Accessibility

Every audio cue has a visual/text equivalent.

---

# 18. Technology plan

## Renderer

Start with **React DOM + SVG for relationship/network views**.

Reasons:

- investigation is document/workstation interaction, not continuous physics;
- semantic accessible controls matter;
- text selection/marking and structured panels suit DOM;
- SVG can represent asset/network relationships without a heavy engine;
- easier responsive behavior on tablets/desktops.

No Phaser/Three.js is justified for the first slice.

## State engine

Use a deterministic domain reducer/state machine independent of presentation.

Conceptual flow:

```text
case definition
   -> public evidence serializer
   -> player defensive action
   -> server/domain transition
   -> safe state delta + feedback
   -> final grader/evidence emitter
```

For responsive feel, the client can optimistically animate obviously safe local interactions such as opening evidence, while authoritative security-state mutations are validated by the server/session engine.

---

# 19. Case data architecture

Public case example:

```ts
type SignalShieldCaseV1 = {
  caseId: string;
  ageBand: AgeBand;
  incidentType: "phishing" | "account" | "permissions" | "patch";
  publicBrief: string;
  evidence: PublicEvidenceItem[];
  assets: PublicAsset[];
  availableTools: DefensiveTool[];
  objectives: PublicObjective[];
};
```

Server-private definition includes:

- evidence truth model;
- required/acceptable containment states;
- misconception mappings;
- safe feedback ladder;
- hidden variation rules;
- scoring/mastery rubric.

The client must not receive `correctAction`, `correctOption` or a map that trivially reveals every suspicious item.

---

# 20. Content quality standards

Every case requires review for:

- grammatical, natural language;
- age-appropriate reading load;
- realistic but fictional context;
- no real credential/domain misuse;
- no ambiguous “gotcha” clue that only an expert could infer;
- enough evidence to justify expected action;
- no dependence on visual stereotypes like spelling mistakes alone;
- cultural/local relevance where appropriate without stereotyping;
- accurate cyber-safety guidance;
- defensive safety boundary;
- varied case structure and not just changed names/numbers.

### Phishing quality rule

Not every malicious message should have terrible grammar, and not every urgent message is malicious. Learners must use multiple signals and verification habits rather than memorize superficial tropes.

---

# 21. Accessibility

- keyboard and touch navigation for evidence/artifact panels;
- screen-reader names for sender fields, links, permissions and actions;
- safe link preview available as readable text;
- high-contrast modes;
- no colour-only threat classification;
- adjustable text scale;
- reduced motion;
- plain-language glossary;
- reading support for younger/struggling readers;
- no action requires precise drag if equivalent click/tap flow can exist;
- evidence marking available via keyboard menus as well as pointer selection.

---

# 22. Telemetry and reporting

Useful gameplay events:

- evidence opened;
- evidence marked/tagged;
- compare/verify tool used;
- defensive action applied;
- remaining risk after action;
- recovery completed;
- hint requested;
- case submitted;
- transfer-case outcome.

Teacher/guardian evidence can summarize:

- “checks actual sender before trusting display name”;
- “uses independent verification in impersonation cases”;
- “understands that credential reset and active-session revocation are separate recovery steps”;
- “reviews app permissions by need.”

Avoid reporting frightening labels such as “child failed cyber attack” when “needs more support recognizing sender identity” is more accurate.

---

# 23. First vertical slice

The slice should prove three distinct defensive procedures.

## Case 1 — Phishing Inbox

**Artifacts:** one suspicious fictional message, sender details, safe link preview, school contact/reference card.  
**Required interactions:** inspect sender, inspect destination, mark evidence, quarantine/report.  
**Transfer variation:** polished grammar and familiar-looking display name so success does not rely on obvious typo stereotypes.

## Case 2 — Account Recovery

**Artifacts:** sign-in/session list, account protection pane.  
**Required interactions:** identify suspicious session, revoke it, reset credential state in simulation, enable MFA or verify it where appropriate.  
**Learning:** containment is multi-step.

## Case 3 — Permission Audit

**Artifacts:** three fictional apps/services with purpose and requested permissions.  
**Required interactions:** keep necessary access, revoke unnecessary sensitive permissions.  
**Learning:** nuanced least-necessary access, not “deny everything.”

## Practice Desk

Ungraded sample artifacts where learners can inspect fields and ask for explanations.

## Not included yet

- network-combat visualization;
- offensive tools;
- real URLs/accounts;
- complex SIEM query language;
- advanced forensic analysis;
- multiplayer incident response;
- large campaign.

---

# 24. Playtest plan

## Upper Primary

Observe:

- Do learners know to open sender details rather than trust display name?
- Can they explain in their own words why a link is suspicious?
- Does the interface make reporting/quarantine feel different from “select answer B”?
- Do they understand recovery steps without becoming anxious?
- Does reading load block the investigation?

## JHS

- Can learners correlate two or more evidence items?
- Do they verify before acting?
- Can they recover a compromised account completely?
- Do they distinguish unnecessary permission from legitimate permission?

## SHS future

- Can learners prioritize alerts without assuming every alert is a breach?
- Can they build a defensible timeline from logs?
- Does SOC UI feel credible without requiring professional prior knowledge?

### Promotion blockers

- learner can solve case without opening evidence;
- a four-choice response is still the main interaction;
- real-time pressure damages score/state while learner reads;
- cases rely on “bad spelling = scam” stereotypes;
- client payload exposes correct suspicious items/actions;
- content crosses into actionable offensive cyber instruction;
- learners leave more fearful but cannot describe a protective behavior;
- interface overwhelms target age band.

---

# 25. Production gate

Signal Shield enters full production only when:

- first three case families use actual evidence inspection and stateful defensive tools;
- server-authoritative grading evaluates evidence/action outcomes rather than one answer string;
- thinking time is neutral;
- no offensive capability is required for gameplay;
- public case payload contains no grading solution leak;
- multiple safe response paths can be accepted where appropriate;
- accessibility works for evidence fields and actions;
- content receives cybersecurity/safeguarding review;
- representative learners can explain the evidence behind their decision;
- the experience feels like investigation and defence even with temporary greybox art.

Signal Shield should make a learner think, “I know how to check before I trust,” not “I memorized which cyber button is correct.”
