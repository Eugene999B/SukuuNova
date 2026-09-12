export type ArcadeV5GameKey =
  | "number-pop"
  | "math"
  | "logic"
  | "keyboard-ninja"
  | "force-motion-lab"
  | "circuit-logic"
  | "word"
  | "comprehension-quest"
  | "coding-sequence"
  | "ghana-map-master"
  | "money-math-market"
  | "cyber-safety"
  | "environment-guardian"
  | "body-explorer"
  | "history-timeline"
  | "culture-heritage"
  | "space-explorer";

export type ArcadeProgressionMode = "endless" | "tournament" | "survival" | "contracts" | "adventure" | "expedition" | "simulation" | "campaign" | "investigation" | "studio" | "navigation" | "garden" | "ladder";

export type ArcadeProgressionSpec = {
  mode: ArcadeProgressionMode;
  modeLabel: string;
  unitLabel: string;
  unitPlural: string;
  selectableNodes: boolean;
  nodes: readonly string[];
  startLabel: string;
  portalTitle: string;
  portalCopy: string;
  remixDimensions: readonly string[];
};

export type ArcadeGameIdentity = {
  game: ArcadeV5GameKey;
  name: string;
  world: string;
  rewardName: string;
  rewardSymbol: string;
  accent: string;
  accent2: string;
  glow: string;
  canvas: string;
  surface: string;
  introKicker: string;
  introTitle: string;
  introCopy: string;
  progression: ArcadeProgressionSpec;
};

const REMIX = ["world state", "mission frame", "pressure profile", "objective modifier", "encounter pattern", "bonus condition"] as const;
const NODES = {
  bloom: ["Tiny Seeds", "Three-Flower Patch", "Five-Flower Patch", "Ladybird Lane", "Make-a-Number Bed", "More or Same Meadow", "Butterfly Count", "Rain Garden", "Number Steps", "Bloom Festival"],
  millionaire: ["First Light", "Pattern Pulse", "Sequence Stage", "Odd-One Arena", "Number Logic", "Shape Logic", "Deduction Desk", "Multi-Step Spotlight", "Mastermind Chair", "Nova Crown"],
  turbo: ["Rookie Cup", "Accuracy Cup", "Rhythm Cup", "Shift Cup", "Symbol Cup", "Velocity Cup", "Elite Cup", "Nova Championship"],
  circuit: ["Lighting Fault", "Switchboard Repair", "Series Retrofit", "Parallel Upgrade", "Meter Audit", "Fuse Recovery", "Ohm Works", "Grid Control", "Master Bus"],
  word: ["Rune Meadow", "Meaning Woods", "Grammar Keep", "Synonym Vale", "Sentence Forge", "Context Hall", "Scribe Maze", "Royal Library", "Crown Chamber", "Kingdom Throne"],
  reading: ["Clue Creek", "Evidence Woods", "Inference Ridge", "Purpose Pass", "Viewpoint Vale", "Source Camp", "Deep Reading Cavern", "Argument Peak", "Explorer Crown"],
  bots: ["Command Belt", "Sequence Bay", "Loop Works", "Condition Cell", "Debug Dock", "Sensor Hall", "Logic Grid", "Automation Floor", "Factory Core", "Bot Nexus"],
  geo: ["Coastal Route", "Forest Route", "Volta Crossing", "Ashanti Survey", "Northern Track", "Capital Circuit", "Border Watch", "Feature Hunt", "National Grid", "Atlas Vault"],
  signal: ["Inbox Watch", "Link Check", "Privacy Gate", "Wi-Fi Patrol", "Update Dock", "Recovery Room", "Imposter Alley", "Threat Grid", "Firewall Ring", "Cyber Command"],
  eco: ["Water Ward", "Waste Works", "Sanitation Street", "Energy Quarter", "Habitat Grove", "E-Waste Depot", "Transit Loop", "Climate Ridge", "Circular City", "Eco Summit"],
  bio: ["Heart Case", "Breathing Case", "Digestive Case", "Movement Case", "Nerve Case", "Kidney Case", "Immune Case", "Hormone Case", "Systems Link", "Bio Command"],
  chronicle: ["Time Rail", "Source Desk", "Ghana Record", "Empire Wing", "Cause Chamber", "Evidence Vault", "Corroboration Hall", "World Record", "Paradox Gallery", "Chronicle Crown"],
  solar: ["Launch Bay", "Inner Worlds", "Earth-Moon Link", "Mars Relay", "Asteroid Passage", "Jupiter Flyby", "Saturn Ring Plane", "Ice Giants", "Kuiper Watch", "Solar System Command"],
} as const;

function progression(mode: ArcadeProgressionMode, modeLabel: string, unitLabel: string, unitPlural: string, nodes: readonly string[], startLabel: string, portalTitle: string, portalCopy: string): ArcadeProgressionSpec {
  return { mode, modeLabel, unitLabel, unitPlural, selectableNodes: nodes.length > 0, nodes, startLabel, portalTitle, portalCopy, remixDimensions: REMIX };
}

export const ARCADE_V5_IDENTITIES: Record<ArcadeV5GameKey, ArcadeGameIdentity> = {
  "number-pop": { game:"number-pop", name:"Number Bloom", world:"Blooming Number Garden", rewardName:"Petal Stars", rewardSymbol:"✿", accent:"var(--color-success)", accent2:"color-mix(in srgb,var(--color-success) 45%,var(--arcade-text))", glow:"color-mix(in srgb,var(--color-success) 40%,transparent)", canvas:"var(--color-brand-deep)", surface:"var(--sn-ink)", introKicker:"BLOOMING NUMBER GARDEN", introTitle:"Tiny numbers. Big blooms.", introCopy:"Grow an untimed touch-first garden where young learners count real groups, match numerals to quantities, compare amounts and build numbers through pictures instead of quiz cards.", progression:progression("garden","GARDEN JOURNEY","patch","patches",NODES.bloom,"Visit patch","Choose a garden patch","Garden patches grow from tiny quantities to numbers within ten. Visual objects, number goals and challenge order remix on every visit while the child always has time to count.") },
  math: { game:"math", name:"Nova Runner", world:"Nova Causeway", rewardName:"Nova Crystals", rewardSymbol:"✦", accent:"#f97316", accent2:"#facc15", glow:"rgba(249,115,22,.42)", canvas:"#160d28", surface:"#28153f", introKicker:"NOVA CAUSEWAY", introTitle:"Engines hot. Gates ahead.", introCopy:"Enter an endless mathematics run where the road, questions, pressure and route keep mutating around your mastery.", progression:progression("endless","ENDLESS RUN","run","runs",[],"Start a new run","The causeway never ends","There is no fixed Level 1 here. Every run is generated as a fresh route with new learning encounters, pace and world conditions.") },
  logic: { game:"logic", name:"Nova Millionaire", world:"Nova Spotlight", rewardName:"Crown Lights", rewardSymbol:"♛", accent:"#eab308", accent2:"#c084fc", glow:"rgba(234,179,8,.42)", canvas:"#100b22", surface:"#241343", introKicker:"NOVA SPOTLIGHT", introTitle:"Climb the knowledge ladder.", introCopy:"Take the spotlight in an untimed reasoning show where patterns, sequences, classification and deduction feel like a live event without wagering, cash rewards or answer countdowns.", progression:progression("ladder","KNOWLEDGE LADDER","spotlight","spotlights",NODES.millionaire,"Enter spotlight","Choose your place on the knowledge ladder","Each spotlight unlocks deeper reasoning while puzzle order, framing and challenge combinations remix. Nova Lens offers answer-neutral reasoning support and earned progress is never taken away.") },
  "keyboard-ninja": { game:"keyboard-ninja", name:"TurboType", world:"Velocity League", rewardName:"Turbo Bolts", rewardSymbol:"⚡", accent:"#22d3ee", accent2:"#a3e635", glow:"rgba(34,211,238,.4)", canvas:"#071b24", surface:"#0d3440", introKicker:"VELOCITY LEAGUE", introTitle:"Start your typing engine.", introCopy:"Race through changing tracks that learn weak keys, accuracy and pace. Cups unlock, but every heat is remixed.", progression:progression("tournament","RACING LEAGUE","cup","cups",NODES.turbo,"Enter selected cup","Choose a racing cup","Cups provide progression without fixed scripts: every heat changes key patterns, track pressure and precision targets.") },
  "force-motion-lab": { game:"force-motion-lab", name:"AstroLab Defender", world:"NovaCore Station", rewardName:"Reactor Cores", rewardSymbol:"◉", accent:"#a855f7", accent2:"#38bdf8", glow:"rgba(168,85,247,.42)", canvas:"#100b24", surface:"#211442", introKicker:"NOVACORE STATION", introTitle:"Science station under pressure.", introCopy:"Survive changing station emergencies using force, motion and energy reasoning. No two defence shifts need to unfold alike.", progression:progression("survival","SURVIVAL DEFENCE","shift","shifts",[],"Start defence shift","How long can the station hold?","Survival sessions remix hazards, incident order, pressure and science encounters rather than following a fixed level ladder.") },
  "circuit-logic": { game:"circuit-logic", name:"Circuit Forge", world:"Sukuu Microgrid", rewardName:"Grid Cells", rewardSymbol:"ϟ", accent:"#facc15", accent2:"#fb7185", glow:"rgba(250,204,21,.4)", canvas:"#171409", surface:"#2d260b", introKicker:"SUKUU MICROGRID", introTitle:"Bring the school grid online.", introCopy:"Accept engineering contracts, diagnose changing faults and restore safe electricity without defeating protection systems.", progression:progression("contracts","ENGINEERING CONTRACTS","contract","contracts",NODES.circuit,"Accept contract","Choose a microgrid contract","Contracts unlock by mastery, while component faults, constraints and operating conditions are regenerated on every attempt.") },
  word: { game:"word", name:"Word Kingdom", world:"Lexicon Realm", rewardName:"Crown Runes", rewardSymbol:"◆", accent:"#e879f9", accent2:"#fbbf24", glow:"rgba(232,121,249,.4)", canvas:"#25102b", surface:"#441a4b", introKicker:"LEXICON REALM", introTitle:"The kingdom needs its words back.", introCopy:"Travel an adventure whose chapters unlock over time while riddles, characters, word encounters and mission conditions keep changing.", progression:progression("adventure","STORY ADVENTURE","chapter","chapters",NODES.word,"Enter chapter","Choose an adventure chapter","Chapters preserve a sense of journey, but each revisit remixes encounters and vocabulary so Chapter 1 is never one fixed worksheet.") },
  "comprehension-quest": { game:"comprehension-quest", name:"Reading Quest", world:"Evidence Wilds", rewardName:"Clue Shards", rewardSymbol:"◇", accent:"#14b8a6", accent2:"#f59e0b", glow:"rgba(20,184,166,.4)", canvas:"#061d1a", surface:"#0c3831", introKicker:"EVIDENCE WILDS", introTitle:"Every trail hides a clue.", introCopy:"Choose an expedition trail, gather evidence and make defensible inferences across changing texts, clues and route conditions.", progression:progression("expedition","READING EXPEDITION","trail","trails",NODES.reading,"Begin expedition","Choose an expedition trail","Unlocked trails are destinations, not fixed scripts. Texts, evidence, clue order and investigation pressure change between expeditions.") },
  "coding-sequence": { game:"coding-sequence", name:"CodeBots Logic Factory", world:"Logic Foundry", rewardName:"Bot Chips", rewardSymbol:"▣", accent:"#10b981", accent2:"#60a5fa", glow:"rgba(16,185,129,.42)", canvas:"#071b17", surface:"#10382f", introKicker:"LOGIC FOUNDRY", introTitle:"Factory line waiting for code.", introCopy:"Take factory jobs that remix sequences, loops, conditions and debugging constraints around the learner's current logic mastery.", progression:progression("contracts","FACTORY JOBS","job","jobs",NODES.bots,"Start factory job","Choose a Logic Foundry job","Each job family unlocks new complexity, but the robot goal, fault pattern and constraints are rebuilt for each session.") },
  "ghana-map-master": { game:"ghana-map-master", name:"GeoQuest Ghana Expedition", world:"Ghana Atlas", rewardName:"Atlas Tokens", rewardSymbol:"◎", accent:"#ef4444", accent2:"#facc15", glow:"rgba(239,68,68,.4)", canvas:"#210909", surface:"#401414", introKicker:"GHANA ATLAS", introTitle:"Pack the field kit.", introCopy:"Travel changing expedition routes across Ghana's regions, capitals, borders and geographic features under evolving field conditions.", progression:progression("expedition","GHANA EXPEDITION","route","routes",NODES.geo,"Begin route","Choose an expedition route","Routes unlock as the atlas expands, while weather, mission order, regions and geographic challenges remix on replay.") },
  "money-math-market": { game:"money-math-market", name:"Cedi City Market", world:"Cedi City", rewardName:"Market Medals", rewardSymbol:"₵", accent:"#22c55e", accent2:"#f59e0b", glow:"rgba(34,197,94,.4)", canvas:"#071c0d", surface:"#11381b", introKicker:"CEDI CITY", introTitle:"Open the market gates.", introCopy:"Run open-ended market days where customers, baskets, prices, budgets and business pressure change with every shift.", progression:progression("simulation","MARKET SIMULATION","market day","market days",[],"Open a new market day","Every market day is different","There is no artificial level ladder. The simulation creates fresh customers, financial decisions and operating pressure from current mastery.") },
  "cyber-safety": { game:"cyber-safety", name:"Signal Shield", world:"CyberOps Grid", rewardName:"Shield Keys", rewardSymbol:"⬢", accent:"#06b6d4", accent2:"#8b5cf6", glow:"rgba(6,182,212,.4)", canvas:"#071421", surface:"#102a43", introKicker:"CYBEROPS GRID", introTitle:"Network watch begins now.", introCopy:"Advance through defensive operations while incident sources, signals and decision pressure vary each time. Defensive learning only.", progression:progression("campaign","DEFENCE CAMPAIGN","operation","operations",NODES.signal,"Start operation","Choose a defensive operation","Operations unlock new defensive contexts, while safe incident scenarios and signal patterns are remixed for replayability.") },
  "environment-guardian": { game:"environment-guardian", name:"EcoGrid Ghana", world:"Green Districts", rewardName:"Eco Seeds", rewardSymbol:"♻", accent:"#16a34a", accent2:"#84cc16", glow:"rgba(22,163,74,.4)", canvas:"#081a0c", surface:"#12351a", introKicker:"GREEN DISTRICTS", introTitle:"Restore the community.", introCopy:"Restore districts through a campaign whose projects, risks, forecasts and resource pressure change from one attempt to the next.", progression:progression("campaign","RESTORATION CAMPAIGN","district","districts",NODES.eco,"Enter district","Choose a restoration district","Districts unlock a broader environmental campaign, while projects, forecasts and resource trade-offs are regenerated each visit.") },
  "body-explorer": { game:"body-explorer", name:"BioQuest: Human Systems", world:"BioLab Complex", rewardName:"Bio Cells", rewardSymbol:"♥", accent:"#f43f5e", accent2:"#fb7185", glow:"rgba(244,63,94,.4)", canvas:"#210810", surface:"#40101d", introKicker:"BIOLAB COMPLEX", introTitle:"Human systems need stabilising.", introCopy:"Work through age-appropriate biology cases where organs, clues and systems relationships change without pretending to diagnose real patients.", progression:progression("adventure","BIOLOGY CASE ADVENTURE","case","cases",NODES.bio,"Open case","Choose a BioLab case","Case families unlock progressively, while fictional educational scenarios and system clues are varied on every attempt.") },
  "history-timeline": { game:"history-timeline", name:"Chronicle Vault", world:"Archive Continuum", rewardName:"Chronicle Seals", rewardSymbol:"⌛", accent:"#d97706", accent2:"#f5d0a9", glow:"rgba(217,119,6,.4)", canvas:"#211408", surface:"#3b260f", introKicker:"ARCHIVE CONTINUUM", introTitle:"History has fractured.", introCopy:"Investigate archive cases through chronology, sources, provenance, cause and consequence as evidence sets shift between visits.", progression:progression("investigation","ARCHIVE INVESTIGATION","case","cases",NODES.chronicle,"Open investigation","Choose an archive investigation","Cases unlock deeper historical reasoning while evidence order, source combinations and investigation framing change on replay.") },
  "culture-heritage": { game:"culture-heritage", name:"Style Studio Ghana", world:"Ghana Design House", rewardName:"Studio Sparks", rewardSymbol:"✂", accent:"var(--color-accent-indigo)", accent2:"var(--color-success)", glow:"color-mix(in srgb,var(--color-accent-indigo) 40%,transparent)", canvas:"var(--color-brand-deep)", surface:"var(--sn-ink)", introKicker:"GHANA DESIGN HOUSE", introTitle:"Curtains open. Your collection starts here.", introCopy:"Create freely, then take design briefs that connect textile heritage, pattern mathematics, practical function, repair and respectful sourcing without grading personal taste.", progression:progression("studio","DESIGN STUDIO","collection","collections",[],"Open the studio","Create a collection, not a worksheet","Free Style has no correctness score. Design Missions regenerate objective briefs while your wardrobe, runway and creative choices remain yours.") },
  "space-explorer": { game:"space-explorer", name:"Solar Navigator: Mission Control", world:"Helios Mission Control", rewardName:"Orbit Badges", rewardSymbol:"◌", accent:"#6366f1", accent2:"#f59e0b", glow:"rgba(99,102,241,.42)", canvas:"#080b22", surface:"#12193b", introKicker:"HELIOS MISSION CONTROL", introTitle:"Plot the route. Read the sky.", introCopy:"Command astronomy missions through planets, moons and deep space by reading telemetry, managing navigation resources and committing evidence-based flight plans.", progression:progression("navigation","SOLAR NAVIGATION","mission","missions",NODES.solar,"Launch mission","Choose a Solar System mission","Mission sectors unlock deeper astronomy while target bodies, telemetry, flight rules and navigation pressure remix on every launch.") },
};

export const ARCADE_SESSION_VARIETY_MIN = 17 * 12 * 10 * 10 * 8 * 8;

export function arcadeV5Identity(game: string) {
  return ARCADE_V5_IDENTITIES[game as ArcadeV5GameKey] ?? ARCADE_V5_IDENTITIES.math;
}

export function arcadeV5Progression(game: string) {
  return arcadeV5Identity(game).progression;
}

export function arcadeProgressionNodeName(game: string, node: number | null | undefined) {
  const progression = arcadeV5Progression(game);
  if (!progression.selectableNodes || !node) return null;
  const safe = Math.max(1, Math.min(progression.nodes.length, Math.trunc(node)));
  return progression.nodes[safe - 1] ?? null;
}

export function arcadeProgressionDifficulty(game: string, node: number) {
  const progression = arcadeV5Progression(game);
  if (!progression.selectableNodes) return null;
  const count = Math.max(1, progression.nodes.length);
  const safe = Math.max(1, Math.min(count, Math.trunc(node)));
  const ratio = safe / count;
  return ratio <= .2 ? 1 : ratio <= .4 ? 2 : ratio <= .65 ? 3 : ratio <= .85 ? 4 : 5;
}

// Compatibility helper for older V5 callers while the new genre-aware progression rolls out.
export function arcadeLevelDifficulty(level: number) {
  const safe = Math.max(1, Math.min(12, Math.trunc(level)));
  return safe <= 2 ? 1 : safe <= 4 ? 2 : safe <= 7 ? 3 : safe <= 10 ? 4 : 5;
}

export function arcadeGameRewardCount(xp: number, stars: number) {
  return Math.max(0, Math.floor(Math.max(0, xp) / 20) + Math.max(0, stars));
}