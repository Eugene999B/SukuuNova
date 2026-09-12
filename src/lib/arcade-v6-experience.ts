import type { ArcadeV5GameKey } from "./arcade-v5-design";

export type ArcadeTimingPolicy = "untimed" | "soft-pressure" | "skill-timed";
export type ArcadeOpeningStyle = "runner" | "racing" | "station" | "blueprint" | "storybook" | "trail" | "factory" | "atlas" | "market" | "cyber" | "eco" | "biolab" | "archive" | "studio";

export type ArcadeExperienceProfile = {
  family: string;
  openingStyle: ArcadeOpeningStyle;
  menuSubtitle: string;
  learningPromise: string;
  timing: ArcadeTimingPolicy;
  timingLabel: string;
  help: readonly [string, string, string];
  controls: readonly string[];
};

export const ARCADE_V6_EXPERIENCES: Record<ArcadeV5GameKey, ArcadeExperienceProfile> = {
  math: {
    family: "Arcade runner",
    openingStyle: "runner",
    menuSubtitle: "Run, dodge and solve — without racing the learner through the mathematics.",
    learningPromise: "Fluency, number sense and flexible problem-solving are embedded in an endless runner loop.",
    timing: "soft-pressure",
    timingLabel: "No answer countdown · movement creates the pressure",
    help: ["Run through a changing sci-fi route and avoid hazards.", "Knowledge Gates pause the run so you can think before choosing.", "The route adapts to recent mastery; a wrong answer never ends the run."],
    controls: ["Space / tap: jump", "1–4: choose at a Knowledge Gate", "P: pause"],
  },
  "keyboard-ninja": {
    family: "Typing tournament",
    openingStyle: "racing",
    menuSubtitle: "A real typing race where speed matters because typing is the skill.",
    learningPromise: "Accuracy, rhythm, weak-key recovery and words-per-minute improve through repeated heats.",
    timing: "skill-timed",
    timingLabel: "Timed by design · speed is part of typing mastery",
    help: ["Type the race text as accurately as possible.", "Clean keystrokes build speed; repeated mistakes trigger support.", "Cups increase challenge without hiding accuracy behind raw speed."],
    controls: ["Keyboard: type the shown text", "Esc / pause control: pause", "Touch keyboard supported on mobile"],
  },
  "force-motion-lab": {
    family: "Science survival",
    openingStyle: "station",
    menuSubtitle: "Protect a research station by understanding forces, motion and energy.",
    learningPromise: "Physics reasoning drives tactical defence decisions instead of disconnected quiz cards.",
    timing: "soft-pressure",
    timingLabel: "Event pressure · thinking windows stay generous",
    help: ["Read the station incident and inspect the evidence.", "Choose the physics action that best stabilises the system.", "Pressure changes the world, but support mode protects thinking time."],
    controls: ["1–4 / tap: choose an action", "Enter: commit", "Pause: freeze the incident"],
  },
  "circuit-logic": {
    family: "Engineering workshop",
    openingStyle: "blueprint",
    menuSubtitle: "Diagnose, build and repair a school microgrid like an engineer.",
    learningPromise: "Circuit logic, measurement and safe fault reasoning are learned through repair contracts.",
    timing: "untimed",
    timingLabel: "Untimed engineering · reason before you energise",
    help: ["Inspect the fault symptoms and circuit clues.", "Plan the safest repair or measurement step.", "Protection devices are never bypassed; the contract rewards sound engineering."],
    controls: ["Tap / click components and choices", "Enter: confirm a repair", "Help remains available during contracts"],
  },
  word: {
    family: "Fantasy word adventure",
    openingStyle: "storybook",
    menuSubtitle: "Explore a kingdom where vocabulary and grammar change what happens next.",
    learningPromise: "Meaning, context, grammar and sentence craft become tools for progressing through a story world.",
    timing: "untimed",
    timingLabel: "Untimed adventure · read, think and explore",
    help: ["Meet characters and recover lost word-runes.", "Use context and grammar clues to make story decisions.", "Replays remix encounters so the chapter is not a memorised worksheet."],
    controls: ["Tap / 1–4: choose", "Enter: continue", "Read-aloud support can be enabled"],
  },
  "comprehension-quest": {
    family: "Reading expedition",
    openingStyle: "trail",
    menuSubtitle: "Follow evidence trails, investigate texts and defend your inference.",
    learningPromise: "Comprehension grows through evidence gathering, prediction, inference and source reasoning.",
    timing: "untimed",
    timingLabel: "Untimed reading · evidence comes before speed",
    help: ["Read or listen to the expedition text.", "Collect clues before choosing an interpretation.", "Use evidence, not guessing, to complete the trail."],
    controls: ["Tap / 1–4: choose evidence", "Scroll: inspect the text", "Enter: continue"],
  },
  "coding-sequence": {
    family: "Automation sandbox",
    openingStyle: "factory",
    menuSubtitle: "Program robots, test logic and debug the factory line.",
    learningPromise: "Sequences, loops, conditions and debugging are learned by making systems work.",
    timing: "untimed",
    timingLabel: "Untimed coding · test, debug and try again",
    help: ["Study the robot goal and available commands.", "Build or choose the logic that should achieve it.", "Failure is feedback: debug the plan instead of losing to a clock."],
    controls: ["Tap / drag logic pieces", "Run: test the program", "Reset: safely try another approach"],
  },
  "ghana-map-master": {
    family: "Geography expedition",
    openingStyle: "atlas",
    menuSubtitle: "Travel Ghana through routes, regions, capitals and geographic clues.",
    learningPromise: "Spatial memory and Ghanaian geography grow through exploration rather than flashcards alone.",
    timing: "untimed",
    timingLabel: "Untimed expedition · explore before answering",
    help: ["Open the atlas and follow the expedition mission.", "Use map clues, regions and features to plan the route.", "Weather changes the expedition but never steals reading time."],
    controls: ["Tap map areas and choices", "Scan: reveal a clue, never the answer", "Enter: confirm route"],
  },
  "money-math-market": {
    family: "Market simulation",
    openingStyle: "market",
    menuSubtitle: "Serve customers, manage cedis and make smart everyday money decisions.",
    learningPromise: "Change, budgets, discounts, saving, profit and trade-offs live inside a shop simulation.",
    timing: "soft-pressure",
    timingLabel: "Queue pressure · no instant failure for careful maths",
    help: ["Serve customers and inspect their basket or budget.", "Calculate the best financial decision before committing.", "Busy periods add pressure, but accuracy and judgement matter more than rushing."],
    controls: ["1–4 / tap: choose", "S: scan a clue", "Enter: serve customer"],
  },
  "cyber-safety": {
    family: "Defensive cyber campaign",
    openingStyle: "cyber",
    menuSubtitle: "Investigate signals and defend a school network safely.",
    learningPromise: "Privacy, phishing, identity and recovery habits are practised through defensive incidents.",
    timing: "soft-pressure",
    timingLabel: "Threat pressure · evidence remains readable",
    help: ["Inspect the incoming signal and its warning signs.", "Use defensive actions only; suspicious links are never clickable.", "Signal Scan gives evidence without revealing the graded answer."],
    controls: ["1–4 / tap: choose defence", "S: Signal Scan", "Enter: contain incident"],
  },
  "environment-guardian": {
    family: "Community strategy",
    openingStyle: "eco",
    menuSubtitle: "Restore a Ghanaian community through practical environmental decisions.",
    learningPromise: "Systems thinking grows through water, waste, energy, habitat and resilience trade-offs.",
    timing: "untimed",
    timingLabel: "Untimed strategy · plan before committing resources",
    help: ["Inspect the district problem, forecast and available resources.", "Choose a project that improves the system safely.", "Field Survey reveals evidence without giving away the decision."],
    controls: ["1–4 / tap: choose project", "F: Field Survey", "Enter: commit project"],
  },
  "body-explorer": {
    family: "Biology case adventure",
    openingStyle: "biolab",
    menuSubtitle: "Explore fictional human-body cases and connect systems together.",
    learningPromise: "Learners build biological systems thinking without pretending to diagnose real people.",
    timing: "untimed",
    timingLabel: "Untimed casework · observe and reason",
    help: ["Open a fictional case and inspect the body-system clues.", "Connect organs to their normal functions and relationships.", "BioScan offers educational clues, not medical diagnosis."],
    controls: ["1–4 / tap: choose", "Scan: inspect a clue", "Enter: stabilise case"],
  },
  "history-timeline": {
    family: "Historical investigation",
    openingStyle: "archive",
    menuSubtitle: "Repair the archive by testing chronology, provenance and cause.",
    learningPromise: "Historical thinking grows through source comparison and evidence-based explanations.",
    timing: "untimed",
    timingLabel: "Untimed investigation · evidence before verdict",
    help: ["Inspect the archive case and its sources.", "Check chronology, provenance and corroborating evidence.", "Make a verdict only after the evidence supports it."],
    controls: ["Tap evidence and choices", "Compare: inspect sources", "Enter: submit verdict"],
  },
  "culture-heritage": {
    family: "Dress-up design studio",
    openingStyle: "studio",
    menuSubtitle: "Create freely, style a model, then solve design briefs without grading personal taste.",
    learningPromise: "Textile heritage, pattern mathematics, functional design, repair and source respect are learned through dressing and making.",
    timing: "untimed",
    timingLabel: "Untimed studio · creativity and careful design come first",
    help: ["Use Free Style to mix outfits with no correctness score.", "Open Design Missions when you want a client brief with one objective learning constraint.", "Try pieces on the model, ask for a clue, then commit the look for secure review."],
    controls: ["Touch / 1–4 / arrows: choose wardrobe pieces", "H: studio clue", "Enter: commit a Design Mission"],
  },
};

export function arcadeExperienceProfile(game: string) {
  return ARCADE_V6_EXPERIENCES[game as ArcadeV5GameKey] ?? ARCADE_V6_EXPERIENCES.math;
}

export function arcadeUsesHardTimer(game: string) {
  return arcadeExperienceProfile(game).timing === "skill-timed";
}