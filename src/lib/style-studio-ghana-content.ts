import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

export type StyleStudioMission = "weaving" | "heritage" | "pattern" | "function" | "repair" | "materials";
export type StyleStudioSlot = "fabric" | "top" | "bottom" | "wrap" | "accessory" | "outer";
export type StyleStudioPattern = "kente" | "stripe" | "check" | "solid" | "repeat" | "mirror" | "rework" | "weather";

export type StyleStudioPiece = {
  id: string;
  label: string;
  slot: StyleStudioSlot;
  pattern: StyleStudioPattern;
  swatch: "sun" | "forest" | "sky" | "berry" | "earth" | "night" | "coral" | "mint";
};

export type StyleStudioScene = ArcadeWorldScene & {
  studioMission: StyleStudioMission;
  client: string;
  brief: string;
  constraint: string;
  runwayTheme: string;
  wardrobe: StyleStudioPiece[];
  heritageNote: string;
  studioId: string;
};

export type StyleStudioQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: StyleStudioScene;
};

type StyleTemplate = {
  id: string;
  mission: StyleStudioMission;
  client: string;
  brief: string;
  constraint: string;
  runwayTheme: string;
  prompt: string;
  answer: StyleStudioPiece;
  wrong: [StyleStudioPiece, StyleStudioPiece, StyleStudioPiece];
  explanation: string;
  cue: string;
  heritageNote: string;
  minDifficulty: number;
};

const piece = (id: string, label: string, slot: StyleStudioSlot, pattern: StyleStudioPattern, swatch: StyleStudioPiece["swatch"]): StyleStudioPiece => ({ id, label, slot, pattern, swatch });

const MISSIONS: StyleTemplate[] = [
  {
    id: "loom-woven",
    mission: "weaving",
    client: "Studio Museum",
    brief: "Choose the material that demonstrates loom weaving.",
    constraint: "The exhibit must show interlaced threads rather than a printed imitation.",
    runwayTheme: "Threads in Motion",
    prompt: "The studio is preparing a textile exhibit. Which wardrobe piece best represents cloth created by weaving threads on a loom?",
    answer: piece("woven-kente", "Woven kente strip", "wrap", "kente", "sun"),
    wrong: [piece("paper-print", "Printed paper sash", "wrap", "stripe", "sky"), piece("plastic-sheet", "Plastic sheet cape", "outer", "solid", "mint"), piece("foil-wrap", "Metallic foil wrap", "wrap", "solid", "night")],
    explanation: "Kente is a woven textile. Loom weaving interlaces threads to build cloth rather than merely printing a pattern onto a surface.",
    cue: "Focus on how the material is made: threads are interlaced on a loom.",
    heritageNote: "Ghana Tourism Authority material describes kente weaving communities including Bonwire/Adanwomase and Kpetoe.",
    minDifficulty: 1,
  },
  {
    id: "kpetoe",
    mission: "heritage",
    client: "Heritage Gallery",
    brief: "Label a textile story from the Volta Region accurately.",
    constraint: "Use a documented weaving location, not a made-up origin story.",
    runwayTheme: "Volta Looms",
    prompt: "A gallery card highlights a Ghanaian community renowned for Ewe kente weaving. Which location belongs on the card?",
    answer: piece("kpetoe-label", "Kpetoe weaving label", "accessory", "kente", "forest"),
    wrong: [piece("tamale-label", "Tamale weaving label", "accessory", "stripe", "earth"), piece("cape-coast-label", "Cape Coast weaving label", "accessory", "check", "sky"), piece("elmina-label", "Elmina weaving label", "accessory", "solid", "coral")],
    explanation: "Kpetoe in Ghana's Volta Region is known for Ewe kente weaving.",
    cue: "Think of the Volta Region kente-weaving village near the Togo border.",
    heritageNote: "Visit Ghana identifies Kpetoe as a long-standing Ewe kente weaving community.",
    minDifficulty: 2,
  },
  {
    id: "bonwire",
    mission: "heritage",
    client: "Ashanti Craft Room",
    brief: "Connect an Asante kente story to a documented weaving centre.",
    constraint: "The location must be associated with Asante kente heritage.",
    runwayTheme: "Bonwire Heritage",
    prompt: "Which place is strongly associated with Asante kente weaving heritage?",
    answer: piece("bonwire-label", "Bonwire heritage tag", "accessory", "kente", "sun"),
    wrong: [piece("ada-label", "Ada heritage tag", "accessory", "stripe", "sky"), piece("axim-label", "Axim heritage tag", "accessory", "check", "forest"), piece("bole-label", "Bole heritage tag", "accessory", "solid", "earth")],
    explanation: "Bonwire in the Ashanti Region is widely associated with Asante kente weaving heritage.",
    cue: "Look for the Ashanti-region weaving centre in the wardrobe labels.",
    heritageNote: "Visit Ghana documents Bonwire and nearby Adanwomase in the Ashanti Region as kente-weaving destinations.",
    minDifficulty: 2,
  },
  {
    id: "warp-before-weave",
    mission: "weaving",
    client: "Young Weaver Workshop",
    brief: "Prepare the loom before decorative weaving begins.",
    constraint: "The loom needs its lengthwise thread system prepared first.",
    runwayTheme: "Loom Lab",
    prompt: "Before weaving a strip, which preparation step establishes the lengthwise threads on the loom?",
    answer: piece("warping", "Warp the loom threads", "fabric", "stripe", "forest"),
    wrong: [piece("buttoning", "Sew on buttons first", "accessory", "solid", "coral"), piece("painting", "Paint the finished cloth first", "fabric", "solid", "sky"), piece("packaging", "Package the garment first", "outer", "check", "earth")],
    explanation: "Warping prepares the lengthwise threads that weaving works across.",
    cue: "The loom needs its long, tensioned thread structure before the crossing threads can build cloth.",
    heritageNote: "Weaving tours in Adanwomase include thread spinning, warping and weaving demonstrations.",
    minDifficulty: 3,
  },
  {
    id: "abab-repeat",
    mission: "pattern",
    client: "Pattern Lab",
    brief: "Complete a repeating A-B-A-B motif.",
    constraint: "The next unit must preserve the established alternation.",
    runwayTheme: "Repeat Beat",
    prompt: "A border follows GOLD · BLUE · GOLD · BLUE · GOLD · ?. Which swatch keeps the repeating pattern?",
    answer: piece("blue-repeat", "Blue repeat swatch", "fabric", "repeat", "sky"),
    wrong: [piece("gold-repeat", "Gold repeat swatch", "fabric", "repeat", "sun"), piece("green-repeat", "Green repeat swatch", "fabric", "repeat", "forest"), piece("berry-repeat", "Berry repeat swatch", "fabric", "repeat", "berry")],
    explanation: "The sequence alternates GOLD and BLUE, so BLUE completes the next A-B repeat.",
    cue: "Name the repeating unit, then continue it once.",
    heritageNote: "Textile design can combine cultural knowledge with mathematical ideas such as repetition and sequence.",
    minDifficulty: 1,
  },
  {
    id: "mirror-balance",
    mission: "pattern",
    client: "Runway Graphics",
    brief: "Create a mirror-symmetrical front panel.",
    constraint: "The left and right sides must reflect each other across the centre line.",
    runwayTheme: "Mirror Walk",
    prompt: "Which design instruction creates mirror symmetry on a front panel?",
    answer: piece("mirror-panel", "Repeat the left motif in reverse on the right", "top", "mirror", "berry"),
    wrong: [piece("random-panel", "Place unrelated motifs anywhere", "top", "repeat", "earth"), piece("one-side-panel", "Put every motif only on the left", "top", "stripe", "forest"), piece("size-drift", "Change every motif to a random size", "top", "check", "coral")],
    explanation: "Mirror symmetry means one side reflects the other around a central line.",
    cue: "Imagine folding the design down the middle; corresponding shapes should line up.",
    heritageNote: "This mission teaches a general design principle without assigning a single meaning to any Ghanaian pattern.",
    minDifficulty: 2,
  },
  {
    id: "rain-layer",
    mission: "function",
    client: "Outdoor Showcase",
    brief: "Prepare a model for a short walk in light rain.",
    constraint: "Keep the outfit practical for wet weather.",
    runwayTheme: "Rain Ready",
    prompt: "The forecast changes to light rain. Which added layer best serves the functional brief?",
    answer: piece("rain-shell", "Light rain-resistant outer shell", "outer", "weather", "sky"),
    wrong: [piece("paper-cape", "Paper cape", "outer", "solid", "sun"), piece("heavy-blanket", "Heavy indoor blanket", "outer", "check", "earth"), piece("open-net", "Open decorative net only", "outer", "repeat", "mint")],
    explanation: "A suitable rain-resistant outer layer is designed to help keep clothing underneath drier in light rain.",
    cue: "Choose for the weather function, not just appearance.",
    heritageNote: "Style Studio separates creative taste from functional design constraints; many looks can be beautiful while serving different purposes.",
    minDifficulty: 1,
  },
  {
    id: "hot-day",
    mission: "function",
    client: "Afternoon Festival Team",
    brief: "Plan comfortable clothing for a hot daytime outdoor event.",
    constraint: "Prioritise breathability and sun protection without claiming one cultural style is mandatory.",
    runwayTheme: "Sun Smart",
    prompt: "For a hot outdoor afternoon, which styling plan best matches the comfort-and-protection brief?",
    answer: piece("light-layer", "Light breathable layer with a shade hat", "outer", "weather", "mint"),
    wrong: [piece("sealed-heavy", "Sealed heavy winter layers", "outer", "solid", "night"), piece("wet-cardboard", "Wet cardboard wrap", "outer", "check", "earth"), piece("plastic-stack", "Several thick plastic layers", "outer", "solid", "coral")],
    explanation: "Light breathable clothing and practical shade can improve comfort in hot conditions.",
    cue: "Think about airflow, heat and direct sun rather than fashion popularity.",
    heritageNote: "Functional clothing choices should respond to weather, activity and comfort; they do not define cultural identity.",
    minDifficulty: 2,
  },
  {
    id: "repair-button",
    mission: "repair",
    client: "Rework Corner",
    brief: "Keep a favourite shirt in use after a minor fault.",
    constraint: "The fabric is sound; only one button is loose.",
    runwayTheme: "Second Life",
    prompt: "A shirt is in good condition but one button is loose. What is the strongest first design response?",
    answer: piece("repair-button", "Resew the loose button", "top", "rework", "forest"),
    wrong: [piece("discard-shirt", "Throw away the whole shirt", "top", "solid", "earth"), piece("cut-random", "Cut large holes into the sound fabric", "top", "check", "coral"), piece("hide-fault", "Ignore the loose button until it falls off", "top", "stripe", "sky")],
    explanation: "Repairing a minor fault can extend the useful life of clothing and reduce unnecessary waste.",
    cue: "The main garment still works; solve the small failure first.",
    heritageNote: "Repair and reuse are practical design skills as well as resource-saving habits.",
    minDifficulty: 1,
  },
  {
    id: "scrap-accessory",
    mission: "materials",
    client: "Zero-Waste Desk",
    brief: "Use clean leftover fabric instead of discarding it.",
    constraint: "The offcuts are too small for a full garment but large enough for a small item.",
    runwayTheme: "Scrap to Style",
    prompt: "Which choice gives clean fabric offcuts a useful second life?",
    answer: piece("scrap-band", "Turn suitable offcuts into a headband or patch", "accessory", "rework", "berry"),
    wrong: [piece("burn-scraps", "Burn the clean offcuts", "accessory", "solid", "earth"), piece("drain-scraps", "Push the offcuts into a drain", "accessory", "solid", "sky"), piece("soil-scraps", "Scatter synthetic scraps on bare soil", "accessory", "check", "forest")],
    explanation: "Repurposing suitable clean offcuts can keep useful material in circulation for longer.",
    cue: "Look for a new use that fits the size and condition of the material.",
    heritageNote: "Creative reuse is a design challenge: the material limitation becomes part of the brief.",
    minDifficulty: 2,
  },
  {
    id: "movement-safe",
    mission: "function",
    client: "Dance Rehearsal",
    brief: "Style a learner for an energetic rehearsal.",
    constraint: "The look must allow safe movement and keep loose pieces secured.",
    runwayTheme: "Move Free",
    prompt: "Which adjustment best supports an energetic rehearsal?",
    answer: piece("secure-fit", "Secure loose accessories and choose a comfortable movement-friendly fit", "accessory", "weather", "forest"),
    wrong: [piece("floor-trail", "Add a long loose piece that drags across the floor", "wrap", "solid", "earth"), piece("vision-cover", "Cover the learner's eyes with decoration", "accessory", "check", "night"), piece("unstable-stack", "Stack unstable objects on the head", "accessory", "repeat", "coral")],
    explanation: "Design for movement should consider comfort, visibility and loose items that could create avoidable hazards.",
    cue: "Imagine the model turning, stepping and dancing rather than standing still for a photo.",
    heritageNote: "Good design considers the person, activity and setting—not appearance alone.",
    minDifficulty: 2,
  },
  {
    id: "care-label",
    mission: "materials",
    client: "Wardrobe Care Desk",
    brief: "Protect a garment before cleaning it.",
    constraint: "The fabric may have specific care requirements.",
    runwayTheme: "Care & Keep",
    prompt: "Before washing an unfamiliar garment, what is the strongest first step?",
    answer: piece("read-care", "Check the garment's care instructions", "fabric", "solid", "sky"),
    wrong: [piece("boil-first", "Boil it immediately without checking", "fabric", "solid", "coral"), piece("bleach-all", "Use strong bleach on every fabric", "fabric", "solid", "sun"), piece("guess-care", "Guess the cleaning method from colour alone", "fabric", "check", "earth")],
    explanation: "Care instructions help match washing, drying or ironing to the material and construction of the garment.",
    cue: "Use information about the garment before choosing a treatment.",
    heritageNote: "Caring for clothing well can help preserve both everyday garments and valued textiles for longer.",
    minDifficulty: 3,
  },
  {
    id: "motif-scale",
    mission: "pattern",
    client: "Miniature Design Lab",
    brief: "Adapt a repeating motif to a much smaller accessory.",
    constraint: "The motif must remain readable at the new size.",
    runwayTheme: "Scale Shift",
    prompt: "A large repeating motif is being adapted for a narrow wristband. Which design move best preserves the pattern idea?",
    answer: piece("scale-motif", "Reduce the motif size while keeping its repeating structure", "accessory", "repeat", "sun"),
    wrong: [piece("erase-repeat", "Remove the repeating structure completely", "accessory", "solid", "earth"), piece("oversize-cut", "Keep motifs so large that only random fragments fit", "accessory", "check", "coral"), piece("unrelated-fill", "Replace every repeat with unrelated symbols", "accessory", "mirror", "sky")],
    explanation: "Scaling a motif while preserving its repeat can adapt a design to a smaller surface without losing the underlying pattern logic.",
    cue: "Keep the rule of the pattern; change its size to fit the new space.",
    heritageNote: "Pattern design involves mathematical thinking about repetition, scale, spacing and balance.",
    minDifficulty: 4,
  },
  {
    id: "source-respect",
    mission: "heritage",
    client: "Student Fashion Journal",
    brief: "Write a respectful caption about a textile-inspired look.",
    constraint: "Separate documented facts from personal interpretation.",
    runwayTheme: "Credit the Craft",
    prompt: "Which captioning practice is strongest when presenting a look inspired by a named weaving tradition?",
    answer: piece("credit-source", "Credit the documented tradition or weaving community and label personal interpretations as your own", "accessory", "kente", "forest"),
    wrong: [piece("invent-meaning", "Invent a traditional meaning and present it as fact", "accessory", "repeat", "berry"), piece("claim-all", "Claim one style represents every Ghanaian community", "accessory", "solid", "sun"), piece("erase-makers", "Remove all reference to makers or source communities", "accessory", "check", "earth")],
    explanation: "Respectful design communication credits sources and distinguishes verified cultural information from a designer's own creative choices.",
    cue: "Ask what you know from evidence, what you created yourself, and who deserves credit.",
    heritageNote: "Ghana has multiple weaving traditions and communities; Style Studio avoids treating Ghanaian culture as one uniform costume.",
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

function safeDifficulty(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.trunc(value))) as 1 | 2 | 3 | 4 | 5;
}

export function createStyleStudioQuestions(difficulty: number, length = 5): StyleStudioQuestion[] {
  const level = safeDifficulty(difficulty);
  const count = Math.max(1, Math.min(50, Math.trunc(length)));
  const ceiling = level <= 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4;
  const pool = MISSIONS.filter((mission) => mission.minDifficulty <= ceiling);
  let deck = shuffle(pool);
  const selected: StyleTemplate[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!deck.length) deck = shuffle(pool);
    selected.push(deck.pop()!);
  }

  return selected.map((mission, index) => {
    const wardrobe = shuffle([mission.answer, ...mission.wrong]);
    return {
      id: String(index),
      kind: "simulation",
      prompt: mission.prompt,
      answer: mission.answer.label,
      options: wardrobe.map((item) => item.label),
      explanation: mission.explanation,
      conceptKey: `style-studio:${mission.mission}:${mission.id}`,
      scene: {
        boardTitle: "Style Studio Ghana",
        studioMission: mission.mission,
        client: mission.client,
        brief: mission.brief,
        constraint: mission.constraint,
        runwayTheme: mission.runwayTheme,
        wardrobe,
        heritageNote: mission.heritageNote,
        studioId: `STYLE-${String(index + 1).padStart(2, "0")}-${randomInt(100, 999)}`,
        cue: mission.cue,
        meterLabels: [mission.mission, mission.client, mission.runwayTheme],
      },
    };
  });
}
