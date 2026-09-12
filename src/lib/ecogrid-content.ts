import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

export type EcoGridMission = "waste" | "water" | "sanitation" | "energy" | "habitat" | "climate" | "transport" | "ewaste" | "circularity";

export type EcoGridScene = ArcadeWorldScene & {
  ecoMission: EcoGridMission;
  zone: string;
  event: string;
  resource: string;
  ecoSignals: string[];
  riskLevel: 1 | 2 | 3 | 4 | 5;
  forecast: string;
  projectId: string;
};

export type EcoGridQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: EcoGridScene;
};

type EcoTemplate = {
  id: string;
  mission: EcoGridMission;
  zone: string;
  event: string;
  resource: string;
  prompt: string;
  answer: string;
  wrong: [string, string, string];
  explanation: string;
  cue: string;
  signals: string[];
  forecast: string;
  minDifficulty: number;
};

const PROJECTS: EcoTemplate[] = [
  {
    id: "leaking-tap",
    mission: "water",
    zone: "School Quarter",
    event: "Water loss",
    resource: "Clean water",
    prompt: "A school tap keeps dripping after learners leave the wash area. Which project best protects the community's water supply?",
    answer: "Close the tap fully and report the leak so it can be repaired",
    wrong: ["Leave it running because the water is clean", "Put a bucket under it and ignore the broken tap", "Open nearby taps so the pressure becomes lower"],
    explanation: "Stopping avoidable leaks and repairing faulty fittings reduces water loss without reducing access to safe water.",
    cue: "Fix the source of the loss instead of only collecting the water after it leaks.",
    signals: ["continuous drip", "avoidable loss", "repair needed"],
    forecast: "Dry week ahead",
    minDifficulty: 1,
  },
  {
    id: "market-sort",
    mission: "waste",
    zone: "Market Loop",
    event: "Mixed waste surge",
    resource: "Clean streets",
    prompt: "Food scraps, plastic bottles and cardboard are mixed together after market day. What is the strongest first step?",
    answer: "Separate the waste into appropriate streams for reuse, recycling, composting or safe collection",
    wrong: ["Burn everything together behind the market", "Push the mixed waste into a drain", "Leave it until rain carries it away"],
    explanation: "Separating waste makes recovery and safe disposal possible and keeps drains and public spaces cleaner.",
    cue: "Different materials need different destinations; mixing them makes recovery harder.",
    signals: ["mixed materials", "recoverable items", "drainage risk"],
    forecast: "Busy market weekend",
    minDifficulty: 1,
  },
  {
    id: "drain-care",
    mission: "sanitation",
    zone: "River Ward",
    event: "Rain preparation",
    resource: "Drainage",
    prompt: "Heavy rain is expected and litter is gathering around a neighbourhood drain. What should the community prioritise?",
    answer: "Remove the litter safely and keep waste out of the drainage channel",
    wrong: ["Pack more waste over the drain opening", "Pour used oil into the drain to move the litter", "Wait for floodwater to wash everything downstream"],
    explanation: "Clear drains can carry stormwater more effectively, while dumping waste into them can worsen blockage and pollution.",
    cue: "Keep the water pathway open and stop new waste from entering it.",
    signals: ["rain forecast", "blocked drain", "litter buildup"],
    forecast: "Storm clouds building",
    minDifficulty: 1,
  },
  {
    id: "shade-trees",
    mission: "habitat",
    zone: "Green Belt",
    event: "Hot schoolyard",
    resource: "Tree cover",
    prompt: "A schoolyard has little shade and several suitable planting spaces. Which plan creates the most lasting benefit?",
    answer: "Plant suitable trees and include watering, protection and long-term care in the plan",
    wrong: ["Plant many seedlings but make no plan to care for them", "Cut the remaining shade trees so new ones have space", "Cover every planting area with concrete"],
    explanation: "Tree projects work best when species and locations are suitable and young trees receive ongoing care.",
    cue: "A planting project is not finished on planting day; survival and maintenance matter.",
    signals: ["low shade", "planting space", "maintenance needed"],
    forecast: "Hot afternoons",
    minDifficulty: 1,
  },
  {
    id: "switch-off",
    mission: "energy",
    zone: "School Quarter",
    event: "Power demand",
    resource: "Electricity",
    prompt: "Lights, fans and computers remain on in empty classrooms. Which routine best reduces unnecessary energy use?",
    answer: "Switch off equipment that is not needed and use efficient settings when practical",
    wrong: ["Leave everything on so it is ready for tomorrow", "Turn on more devices so the electricity is shared", "Cover the lights so the room looks darker"],
    explanation: "Avoiding unnecessary electricity use reduces demand while keeping needed services available.",
    cue: "Start with energy that is being used without providing a benefit.",
    signals: ["empty rooms", "devices still on", "avoidable demand"],
    forecast: "Normal school day",
    minDifficulty: 2,
  },
  {
    id: "stream-buffer",
    mission: "habitat",
    zone: "River Ward",
    event: "Riverbank pressure",
    resource: "Biodiversity",
    prompt: "Vegetation along a stream is being removed right up to the water's edge. What is the more protective choice?",
    answer: "Protect and restore suitable vegetation along the stream edge",
    wrong: ["Clear every plant so the bank looks tidy", "Dump soil and rubbish into the stream to make more land", "Burn the remaining vegetation each dry season"],
    explanation: "Vegetated stream edges can help stabilise banks, provide habitat and reduce direct runoff into the water.",
    cue: "Think about what protects both the bank and the living things around the water.",
    signals: ["bare riverbank", "runoff pathway", "habitat loss"],
    forecast: "Rain later this week",
    minDifficulty: 2,
  },
  {
    id: "refill-station",
    mission: "circularity",
    zone: "Market Loop",
    event: "Single-use packaging",
    resource: "Material use",
    prompt: "A school event uses many disposable water bottles every week. Which change can reduce repeated packaging waste?",
    answer: "Provide safe refill access and encourage reusable bottles where appropriate",
    wrong: ["Use twice as many disposable bottles", "Throw used bottles into open drains", "Burn the bottles after every event"],
    explanation: "Safe reuse and refill systems can prevent waste before it is created, alongside proper recycling where available.",
    cue: "Waste prevention usually comes before deciding how to dispose of an item.",
    signals: ["repeated purchase", "single-use item", "reuse opportunity"],
    forecast: "Sports week",
    minDifficulty: 2,
  },
  {
    id: "ewaste-route",
    mission: "ewaste",
    zone: "Tech Yard",
    event: "Old electronics",
    resource: "Safe materials",
    prompt: "The computer lab has damaged batteries and old electronics. What is the safest environmental plan?",
    answer: "Store them safely and use an approved electronics or battery collection route",
    wrong: ["Burn the electronics to reduce their size", "Break batteries open to see what is inside", "Mix damaged batteries into ordinary food waste"],
    explanation: "Electronic waste and batteries can contain hazardous materials and should go through appropriate collection and recovery systems.",
    cue: "Treat batteries and electronics as a special waste stream, not ordinary rubbish.",
    signals: ["damaged battery", "electronic parts", "special collection"],
    forecast: "Lab upgrade",
    minDifficulty: 3,
  },
  {
    id: "clean-journey",
    mission: "transport",
    zone: "Transit Gate",
    event: "School travel",
    resource: "Air quality",
    prompt: "For a short school journey with a safe walking route, which choice can reduce transport pollution while supporting activity?",
    answer: "Walk when it is safe and practical, or share/public transport when a vehicle is needed",
    wrong: ["Use a separate idling vehicle for every learner", "Keep engines running while waiting for long periods", "Take the longest vehicle route on purpose"],
    explanation: "Walking where safe and practical, shared transport and reducing unnecessary idling can lower fuel use and emissions.",
    cue: "Match the transport choice to distance, safety and how many people can travel together.",
    signals: ["short distance", "safe route", "many separate trips"],
    forecast: "Clear morning",
    minDifficulty: 3,
  },
  {
    id: "heat-plan",
    mission: "climate",
    zone: "Community Square",
    event: "Heat stress",
    resource: "Climate resilience",
    prompt: "A paved community space becomes extremely hot in the afternoon. Which long-term improvement can help reduce heat exposure?",
    answer: "Add suitable shade trees or shade structures and preserve useful green space",
    wrong: ["Remove all nearby vegetation", "Paint over every drain opening", "Burn waste nearby to keep the area clear"],
    explanation: "Shade and well-planned green space can reduce direct heat exposure and improve comfort in hot public areas.",
    cue: "Look for a solution that changes the space itself, not just how people tolerate the heat.",
    signals: ["large paved area", "little shade", "afternoon heat"],
    forecast: "Hot spell",
    minDifficulty: 3,
  },
  {
    id: "waterway-oil",
    mission: "water",
    zone: "Workshop Lane",
    event: "Used oil disposal",
    resource: "Water quality",
    prompt: "A workshop has a container of used engine oil. Which disposal choice best protects drains and waterways?",
    answer: "Keep it contained and send it through an appropriate used-oil collection or recovery route",
    wrong: ["Pour it into a roadside drain", "Mix it with rainwater and release it slowly", "Spread it on bare soil behind the workshop"],
    explanation: "Used oil should be contained and handled through appropriate recovery or disposal systems rather than released to soil or drains.",
    cue: "Contain pollutants at the source and keep them out of water pathways.",
    signals: ["used oil", "nearby drain", "collection needed"],
    forecast: "Rain possible",
    minDifficulty: 3,
  },
  {
    id: "food-waste",
    mission: "circularity",
    zone: "Market Loop",
    event: "Organic waste",
    resource: "Circular materials",
    prompt: "A market generates clean fruit and vegetable scraps every day. Where local systems allow it, which option recovers more value from that material?",
    answer: "Separate suitable organic scraps for composting instead of mixing them with all other waste",
    wrong: ["Mix them with broken batteries", "Push them into storm drains", "Burn the wet scraps beside food stalls"],
    explanation: "Separating suitable organic material can support composting and keeps it from contaminating other recoverable materials.",
    cue: "Ask whether a material can safely return to a useful cycle instead of becoming mixed waste.",
    signals: ["clean organics", "daily volume", "compost opportunity"],
    forecast: "Peak harvest market",
    minDifficulty: 4,
  },
  {
    id: "flood-space",
    mission: "climate",
    zone: "River Ward",
    event: "Flood-risk planning",
    resource: "Community resilience",
    prompt: "A low-lying area beside a watercourse regularly stores floodwater during heavy rain. Which planning choice is more resilient?",
    answer: "Keep high-risk flood space clear where possible and protect natural drainage or storage functions",
    wrong: ["Block the watercourse so the water has nowhere to go", "Fill every drainage path with solid waste", "Build directly across the flow path without drainage planning"],
    explanation: "Keeping flood pathways and storage areas functional can reduce obstruction and helps communities plan around predictable water movement.",
    cue: "Do not remove the space water needs during extreme rain without a safe drainage plan.",
    signals: ["low-lying land", "repeated flooding", "natural flow path"],
    forecast: "Seasonal heavy rain",
    minDifficulty: 4,
  },
  {
    id: "repair-first",
    mission: "circularity",
    zone: "Repair Hub",
    event: "Broken equipment",
    resource: "Material lifespan",
    prompt: "Several classroom chairs have loose screws but sound frames. What is the strongest circular-economy response?",
    answer: "Repair the usable chairs before buying replacements",
    wrong: ["Throw every chair away immediately", "Burn the chairs because one part is loose", "Buy replacements first and leave the old chairs outdoors"],
    explanation: "Repairing safe, usable items can extend their life and reduce the materials and money needed for replacements.",
    cue: "Check whether the useful product can stay in service safely before replacing it.",
    signals: ["minor fault", "usable frame", "repair possible"],
    forecast: "New term setup",
    minDifficulty: 4,
  },
];

function shuffle<T>(values: readonly T[]): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function levelForDifficulty(difficulty: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.trunc(difficulty))) as 1 | 2 | 3 | 4 | 5;
}

function eligibleProjects(difficulty: number) {
  const safeDifficulty = levelForDifficulty(difficulty);
  const ceiling = safeDifficulty <= 1 ? 1 : safeDifficulty === 2 ? 2 : safeDifficulty === 3 ? 3 : 4;
  const eligible = PROJECTS.filter((project) => project.minDifficulty <= ceiling);
  return eligible.length ? eligible : PROJECTS.slice(0, 4);
}

export function createEcoGridQuestions(difficulty: number, length = 5): EcoGridQuestion[] {
  const safeDifficulty = levelForDifficulty(difficulty);
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  const pool = eligibleProjects(safeDifficulty);
  const sequence: EcoTemplate[] = [];
  let deck = shuffle(pool);
  for (let index = 0; index < safeLength; index += 1) {
    if (!deck.length) deck = shuffle(pool);
    sequence.push(deck.pop()!);
  }

  return sequence.map((project, index) => {
    const riskLevel = Math.max(1, Math.min(5, Math.ceil((safeDifficulty + project.minDifficulty) / 2))) as 1 | 2 | 3 | 4 | 5;
    return {
      id: String(index),
      kind: "simulation",
      prompt: project.prompt,
      answer: project.answer,
      options: shuffle([project.answer, ...project.wrong]),
      explanation: project.explanation,
      conceptKey: `ecogrid:${project.mission}:${project.id}`,
      scene: {
        boardTitle: "EcoGrid Ghana",
        ecoMission: project.mission,
        zone: project.zone,
        event: project.event,
        resource: project.resource,
        ecoSignals: project.signals,
        riskLevel,
        forecast: project.forecast,
        projectId: `ECO-${String(index + 1).padStart(2, "0")}-${randomInt(100, 999)}`,
        cue: project.cue,
        meterLabels: [project.mission, `risk ${riskLevel}/5`, project.resource],
      },
    };
  });
}
