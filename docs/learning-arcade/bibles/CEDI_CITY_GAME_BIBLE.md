# Cedi City — Game Bible v0.1

Status: **Vertical-slice candidate**  
Role in portfolio: proof that SukuuNova can build a deep Ghanaian career simulation rather than a quiz shell.

---

# 1. Identity

**Genre:** business/life simulation + mathematics + financial literacy  
**World:** fictional Ghanaian commercial town  
**Target bands:** Primary, JHS, SHS; optional KG mini-mode later  
**Primary platform:** web, tablet, desktop; touch + mouse; keyboard for advanced tools  

## Player fantasy

You start with a tiny roadside business and grow into a trusted entrepreneur managing shops, staff, suppliers and finances across Cedi City.

## Learning promise

Mathematics and financial literacy are not questions attached to the game: they determine whether the business survives, earns customer trust and expands.

## Shipping sentence

> In Cedi City, the learner is a young entrepreneur who repeatedly buys, prices, sells, budgets and expands in order to grow a real business. The world responds through customers, stock, cash flow, reputation and new opportunities. Better mathematics and financial judgement create better business outcomes. Players return to grow their shop, unlock districts, meet characters and build a business story that belongs to them.

---

# 2. Design pillars

## Shop first, worksheet never

The main screen is a place of business with customers, goods and direct actions. A learner gives change by manipulating money, not by selecting a textual amount from four buttons.

## Every cedi has meaning

Money is persistent state. Revenue, change, stock purchases, wages and expenses come from actual transactions.

## Ghanaian without becoming a stereotype

Use familiar commercial rhythms, cedi currency, markets, mobile money, local products and business situations with contemporary visual quality and respectful variety.

## Grow a life, not a score

The player builds a persistent business: shelves, equipment, reputation, staff, locations, records and stories.

## Learn through consequence

Pricing too high, buying too much stock, giving wrong change or ignoring cash flow should create understandable business outcomes. Thinking slowly never reduces the reward by itself.

### Anti-pillars

Cedi City must never become:

- five money questions per round;
- four receipt buttons;
- a generic top-three-meter dashboard;
- speed maths disguised as customer pressure;
- a static finance lesson with decorative customers.

---

# 3. Age-band versions

## Primary: My First Shop

### Player role

Run a small stall/kiosk with help from a mentor character.

### Main learning

- coin/note recognition;
- addition/subtraction;
- totals;
- change;
- simple multiplication/grouping;
- needs vs wants;
- simple saving and budgeting.

### Inputs

- drag goods into customer basket;
- drag GH₵ notes/coins to till tray;
- tap/count stock;
- choose shelf placement;
- simple shopping list planning.

### Session structure

1. Open shop.
2. Serve 3–6 customers.
3. Restock one or two items.
4. Choose one shop improvement/saving goal.
5. Close shop and see a visual day summary.

### UI

Large illustrated store, physical till tray, shelf inventory, character speech bubbles, minimal text.

---

## JHS: Cedi City Entrepreneur

### Main learning

- percentages;
- discounts;
- mark-up;
- profit/loss;
- unit price;
- ratios;
- budgeting;
- inventory;
- supplier comparison;
- basic wages;
- savings/borrowing trade-offs.

### New systems

- suppliers with different prices/lead times;
- spoilage/slow-moving stock;
- customer segments;
- promotions;
- staff shifts;
- simple ledger;
- shop rent/utilities;
- expansion decisions.

### UI

Storefront play remains central; office/ledger/inventory views appear when the player needs them.

---

## SHS: Cedi City Enterprise

### Main learning

- cash flow;
- income/expense categorization;
- gross/net profit;
- simple financial statements;
- payroll concepts;
- credit/financing;
- break-even reasoning;
- pricing strategy;
- inventory turnover;
- budgeting/forecasting;
- entrepreneurship/economics scenarios.

### New systems

- multiple branches;
- managers/staff;
- bank/financing offers;
- supplier contracts;
- business shocks;
- customer data;
- monthly planning;
- procurement;
- performance dashboard;
- client/business briefs.

### UI

Authentic but accessible tools: ledger, cash-flow chart, invoice view, payroll sheet, inventory report. These screens are earned as the learner becomes more advanced.

---

# 4. World and story

## Cedi City districts

### Starter Street

Small kiosks and stalls. Teaches direct selling, stock and change.

### Market Square

Higher foot traffic, more suppliers, bargaining/trade-offs and perishables.

### School Road

Predictable demand cycles, stationery/food businesses, budgeting and peak periods.

### Workshop District

Tools, parts and service businesses; introduces job costing and inventory complexity.

### Business Centre

Larger shops, staff, payroll, invoices, digital payments and financing.

### Enterprise Park

SHS-level multi-branch management and long-horizon business strategy.

## Main mentor characters

### Auntie Ama — starter mentor

Warm but practical. Teaches through shop situations rather than lectures. Eventually stops prompting as player mastery grows.

### Kojo — supplier rep

Introduces supplier comparison, bulk discounts, delivery terms and negotiation.

### Efua — customer/community connector

Represents customer needs and reputation. Opens community event missions.

### Mr. Mensah — accountant/finance mentor

Appears only in later bands. Introduces record keeping and financial interpretation.

### Zuri — fellow young entrepreneur

Friendly rival/peer. Provides benchmark challenges without turning the game into pure competition.

---

# 5. Core gameplay loops

## 20–60 second customer loop

1. Customer enters with need/budget.
2. Player reads visual/dialogue clues.
3. Player finds/chooses product(s).
4. Till computes or asks player to construct total depending on age/scaffold.
5. Customer pays with actual note/coin/digital amount.
6. Player creates change/payment outcome.
7. Transaction resolves.
8. Cash and stock update physically.
9. Customer reaction/reputation reflects service quality, availability and correctness.

## 3–8 minute shop-management loop

1. Inspect stock.
2. Decide what to restock.
3. Compare supplier offers.
4. Spend available cash.
5. Arrange/prioritize stock.
6. Serve next wave.
7. Observe consequences.

## 10–25 minute session loop

1. Review today's goal.
2. Open business.
3. Serve customers and handle events.
4. Make one meaningful management decision.
5. Close shop.
6. Inspect day summary.
7. Save/invest/upgrade/plan tomorrow.

## Meta loop

Earn trust → improve shop → unlock products/tools → qualify for new district → hire/train staff → open second business → build enterprise network.

---

# 6. Simulation state

Core persistent variables:

- cash on hand;
- bank/savings balance where age-appropriate;
- inventory per SKU;
- cost price;
- sale price;
- demand rating;
- reputation;
- shop condition;
- staff roster;
- daily fixed costs;
- supplier relationships;
- unlocked districts;
- business licences/skills;
- saved goals;
- debts/financing only for advanced bands.

Every value must have a visible reason to exist.

---

# 7. Rules

## Transaction rules

A sale changes:

- cash;
- stock;
- revenue history;
- optional reputation;
- customer state.

Wrong change does not secretly alter a score. The till physically becomes wrong and the customer responds; the player can often correct before completion.

## Pricing rules

Demand and margin respond to price bands. Primary gets simplified feedback. JHS/SHS see increasingly explicit business data.

## Stock rules

You cannot sell what you do not have. Overstock ties up cash. Some advanced products may spoil/depreciate.

## Customer rules

Customer patience may animate, but no academic reward is reduced simply because a learner thinks longer. Time pressure may appear in optional challenge/event modes, never as the normal learning default.

## Debt rules

Advanced modes must teach borrowing as a trade-off, not free money or moral failure.

---

# 8. Mission families

## Serve & Change

Customer buys items; player completes transaction using manipulable money/payment interface.

## Stock the Shop

Given cash and expected demand, choose quantities from supplier catalogue.

## Price It

Set or adjust prices under simple/advanced constraints.

## Budget Day

Allocate a limited amount across stock, utilities, savings and improvements.

## Supplier Choice

Compare unit price, delivery, quality and quantity terms.

## Promotion Day

Design/choose discount strategy and observe margin vs demand.

## Staff Shift

Plan staffing within wage budget and expected traffic.

## Business Rescue

Diagnose why cash is falling: bad pricing, excessive stock, expenses, weak demand, debt burden, etc.

## Expansion Brief

Decide whether the business can afford a new shelf, freezer, kiosk or branch.

## Community Contract

Fulfil a school/event/business order with quantity, costing and deadline constraints.

No family should collapse into the same answer-card interaction.

---

# 9. Direct-manipulation money system

The till is a central learning toy.

## Primary

- visible Ghana cedi denominations;
- drag money into payment/change trays;
- group identical notes/coins;
- optional counting aloud/narration;
- visual number line/ten-frame support for younger learners.

## JHS

- till supports cash, mobile money and receipts;
- percentages/discounts can alter transaction totals;
- player can inspect calculation tape.

## SHS

- transaction records feed accounting systems;
- sales can be cash/digital/credit where curriculum allows;
- summaries become source data for financial statements.

Correctness should be computed from transaction state, not hidden multiple-choice answers.

---

# 10. Progression

## Business progression

Roadside table → kiosk → full shop → specialist store → second location → multi-branch enterprise.

## Skill progression

Cash handling → stock → pricing → budgeting → suppliers → staff → accounting → financing → strategy.

## Tool progression

Cash box → basic till → receipt printer → inventory scanner → digital ledger → analytics dashboard.

## World progression

Each district changes product demand, visual identity, business complexity and characters.

## Personal expression

Shop name, signboard, layout, uniform/apron colors, shelf arrangement and decorations where appropriate. Cosmetic customization must not overshadow learning systems.

---

# 11. Failure and recovery

There is no arbitrary “game over” for being bad at maths.

Possible business problems:

- low stock;
- cash shortage;
- unsustainable price;
- customer complaints;
- expensive supplier choice;
- missed business goal.

Recovery tools:

- mentor explanation;
- undo before finalizing certain actions;
- smaller order;
- sell unused inventory;
- revise prices;
- practice shift;
- emergency challenge with transparent rules;
- restart day from checkpoint in younger modes.

Bankruptcy-style hard failure should be avoided in early bands and used very carefully, if at all, in advanced simulations.

---

# 12. UI/UX Bible

## Primary shop screen

- 70–80% world/storefront;
- shelf objects large enough for touch;
- customer and basket visible;
- till opens as a physical drawer/tray interaction;
- current cash/stock shown only when relevant;
- mentor button visually secondary.

## Management screen

Presented as back office/tablet rather than generic platform dashboard.

Tabs unlock gradually:

- Stock
- Suppliers
- Goals
- Ledger
- Staff
- Reports

## City map

Isometric/illustrated district map with visible owned stores and locked opportunities.

## Onboarding — first 5 minutes

1. Player names shop.
2. Auntie Ama asks them to place three products on shelf.
3. First customer buys one item.
4. Customer hands a visible note.
5. Player drags correct change.
6. Till rings; shelf count and cash visibly change.
7. Second transaction differs slightly.
8. Player chooses one restock item.
9. Day ends with simple “You earned / you spent / you saved” animation.

No tutorial wall of text.

---

# 13. Art direction

Keywords: vibrant, contemporary Ghanaian city, warm, tactile, aspirational, readable, not childish for older bands.

## Primary

Illustrated/isometric 2D with expressive characters and clear objects.

## JHS/SHS

Same city universe but cleaner, less toy-like tool interfaces and denser business views.

## Avoid

- generic neon sci-fi panels;
- identical purple/blue Arcade cards;
- stock-photo business look;
- caricatured/stereotyped market imagery;
- visual clutter that hides denominations or quantities.

---

# 14. Audio direction

- real shop ambience layer;
- subtle city ambience by district;
- satisfying till/payment sounds;
- stock placement sounds;
- customer greetings/reactions where voice production permits;
- distinct day-open/day-close motifs;
- calm planning music in back office;
- no constant anxiety music for ordinary learning.

Critical transaction feedback must also have visual equivalents.

---

# 15. Technology direction

## Vertical slice

Use the existing web platform for identity/saves/teacher reporting, but isolate Cedi City gameplay from generic Arcade question components.

Possible structure:

- React shell for route/account/accessibility;
- Phaser-class 2D scene for the interactive shop if DOM interaction proves too rigid;
- DOM/React for accessible ledger/report tools;
- shared domain model underneath both;
- server-authoritative scored transaction validation for assessment missions;
- deterministic local simulation for immediate visual feedback, reconciled with server state.

Do not import a game engine until a greybox proves direct DOM/canvas limitations. The dependency must be justified by interaction quality.

---

# 16. Secure grading

The client may know visible prices and money because the player needs them.

For scored missions, the server receives structured actions/state, e.g.:

- selected items;
- quantities;
- payment received;
- change constructed;
- chosen supplier quantities;
- submitted budget allocation.

The server derives correctness from scenario rules rather than sending a hidden “correct button” to the client.

Creative/customization actions are not correctness-graded.

---

# 17. Telemetry

Track learning-relevant events:

- denomination confusion;
- incorrect change amount/type;
- number of revisions before transaction lock;
- supplier comparison behavior;
- overstock patterns;
- pricing changes;
- budget allocation patterns;
- help usage;
- recovery after mistake;
- voluntary shop customization/exploration;
- return frequency.

Do not treat slow completion as poor learning by default.

---

# 18. Vertical slice scope

The first vertical slice should be deliberately small but polished.

## Content

- Starter Street only;
- one shop interior;
- 5 product types;
- 3 Ghana cedi denominations sufficient for scenarios;
- 4 customer archetypes;
- 1 supplier;
- direct cash/change mechanic;
- stock count;
- simple end-of-day summary;
- one shop upgrade;
- mentor onboarding;
- accessible audio controls;
- touch + mouse support.

## Learning

- totals within defined Primary range;
- exact change;
- simple restock cost;
- save vs spend choice.

## Success criteria

A child should be able to play the greybox and say, without prompting, “I’m running a shop.”

A teacher should be able to identify evidence of arithmetic/financial understanding from the transactions.

A reviewer should not see a four-choice question grid anywhere in the main loop.

A learner should be able to make a mistake, understand why the till/business changed, fix it and continue.

The shop must feel good to touch/click before additional districts/content are approved.

---

# 19. Kill/redesign criteria

Stop and redesign the slice if:

- serving customers feels like answering forms;
- most learning still happens in pop-up questions;
- transaction state is not visually understandable;
- the UI needs long instructions;
- the simulation punishes thinking time;
- the shop has no satisfying cause-and-effect;
- the Primary learner cannot understand the first transaction after short onboarding;
- adding content means only adding more generated prompts.

---

# 20. Long-term expansion ideas

Only after the vertical slice passes playtesting:

- mobile money flow;
- perishables;
- supplier negotiation;
- festivals/event demand;
- school/community contracts;
- multiple store types;
- staff and schedules;
- loans/financing;
- accounting office;
- business competition/co-op challenges;
- parent/teacher “what they learned through play” reports;
- JHS and SHS campaign layers.

The first job is not to build all of these. The first job is to prove that **running the shop itself is genuinely fun, understandable and educational**.