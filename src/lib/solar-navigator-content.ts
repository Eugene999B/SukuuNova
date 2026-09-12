import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

export type SolarMission = "planet" | "orbit" | "moon" | "rotation" | "scale" | "navigation" | "communication" | "small-bodies";

export type SolarNavigatorScene = ArcadeWorldScene & {
  spaceMission: SolarMission;
  sector: string;
  targetBody: string;
  missionObjective: string;
  flightRule: string;
  telemetry: string[];
  fuelRisk: 1 | 2 | 3 | 4 | 5;
  commsStatus: string;
  navCode: string;
};

export type SolarNavigatorQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: SolarNavigatorScene;
};

type MissionTemplate = {
  id: string;
  mission: SolarMission;
  sector: string;
  targetBody: string;
  objective: string;
  flightRule: string;
  prompt: string;
  answer: string;
  wrong: [string, string, string];
  explanation: string;
  cue: string;
  telemetry: [string, string, string];
  fuelRisk: 1 | 2 | 3 | 4 | 5;
  commsStatus: string;
  minDifficulty: number;
};

const MISSIONS: MissionTemplate[] = [
  {
    id: "rocky-inner-worlds", mission: "planet", sector: "Inner System", targetBody: "Mars", objective: "Choose a rocky destination for a surface-imaging mission.", flightRule: "Select a terrestrial planet, not a giant planet.",
    prompt: "Mission Control needs a rocky planet with a solid surface for the next imaging target. Which destination fits the brief?",
    answer: "Mars", wrong: ["Jupiter", "Saturn", "Neptune"], explanation: "Mars is a terrestrial, rocky planet. Jupiter, Saturn and Neptune are giant planets without a solid surface like Earth's or Mars's.",
    cue: "Look for an inner planet made mainly of rock and metal.", telemetry: ["Inner-system target", "Solid-surface brief", "Remote imaging"], fuelRisk: 1, commsStatus: "Strong relay", minDifficulty: 1,
  },
  {
    id: "largest-planet", mission: "planet", sector: "Jovian Approach", targetBody: "Jupiter", objective: "Identify the Solar System's largest planet for a flyby briefing.", flightRule: "Use planetary size, not brightness in Earth's sky.",
    prompt: "The navigation team is preparing a briefing on the largest planet in the Solar System. Which target should appear on the display?",
    answer: "Jupiter", wrong: ["Earth", "Mars", "Mercury"], explanation: "Jupiter is the largest planet in the Solar System.",
    cue: "The answer is a gas giant and the most massive planet.", telemetry: ["Giant-planet sector", "High gravity", "Flyby only"], fuelRisk: 1, commsStatus: "Deep-space relay", minDifficulty: 1,
  },
  {
    id: "earth-moon", mission: "moon", sector: "Earth-Moon Link", targetBody: "Moon", objective: "Lock the tracker onto Earth's natural satellite.", flightRule: "Choose the body that naturally orbits Earth.",
    prompt: "Which body should the tracker identify as Earth's natural satellite?",
    answer: "The Moon", wrong: ["Mars", "Venus", "The Sun"], explanation: "The Moon is Earth's natural satellite and orbits Earth.",
    cue: "A natural satellite travels around a planet.", telemetry: ["Earth orbit", "Natural satellite", "One primary moon"], fuelRisk: 1, commsStatus: "Near-Earth link", minDifficulty: 1,
  },
  {
    id: "planet-year", mission: "orbit", sector: "Heliocentric Track", targetBody: "Earth", objective: "Explain what completes one planetary year.", flightRule: "Distinguish revolution around the Sun from rotation on an axis.",
    prompt: "What motion of Earth defines one year?",
    answer: "One complete orbit around the Sun", wrong: ["One rotation on its axis", "One orbit of the Moon around Earth", "One sunrise and sunset"], explanation: "A year is based on Earth completing one revolution around the Sun. Rotation on its axis gives the day-night cycle.",
    cue: "Think about the long path around the Sun, not the daily spin.", telemetry: ["Solar orbit", "Annual cycle", "Revolution"], fuelRisk: 2, commsStatus: "Stable", minDifficulty: 1,
  },
  {
    id: "planet-day", mission: "rotation", sector: "Rotation Lab", targetBody: "Earth", objective: "Connect planetary rotation to day and night.", flightRule: "Use axial rotation, not orbital revolution.",
    prompt: "Which motion most directly produces Earth's cycle of day and night?",
    answer: "Earth rotating on its axis", wrong: ["Earth orbiting the Sun", "The Moon orbiting Earth", "The Sun orbiting Earth once a day"], explanation: "Earth's rotation turns different parts of the planet toward and away from the Sun, producing day and night.",
    cue: "The relevant motion is the planet's spin.", telemetry: ["24-hour-scale cycle", "Axial spin", "Sunlit hemisphere"], fuelRisk: 1, commsStatus: "Stable", minDifficulty: 1,
  },
  {
    id: "asteroid-belt", mission: "small-bodies", sector: "Asteroid Passage", targetBody: "Main Belt", objective: "Place the main asteroid belt on the route chart.", flightRule: "Locate the broad region between the inner and outer planets.",
    prompt: "Where is the Solar System's main asteroid belt located?",
    answer: "Mostly between Mars and Jupiter", wrong: ["Between Earth and the Moon", "Inside the Sun", "Beyond every known planet"], explanation: "The main asteroid belt lies mostly between the orbits of Mars and Jupiter.",
    cue: "Find the boundary region between the rocky inner planets and the giant planets.", telemetry: ["Small-body traffic", "Mars outbound", "Jupiter inbound"], fuelRisk: 2, commsStatus: "Good", minDifficulty: 2,
  },
  {
    id: "mars-moons", mission: "moon", sector: "Mars Relay", targetBody: "Mars", objective: "Verify the names of Mars's two small moons.", flightRule: "Select the pair that both orbit Mars.",
    prompt: "Which pair names the two natural moons of Mars?",
    answer: "Phobos and Deimos", wrong: ["Europa and Titan", "Io and Triton", "Moon and Europa"], explanation: "Mars has two small natural satellites named Phobos and Deimos.",
    cue: "Both names belong to the same red-planet system.", telemetry: ["Two moons", "Small irregular bodies", "Mars system"], fuelRisk: 2, commsStatus: "Mars relay online", minDifficulty: 2,
  },
  {
    id: "saturn-rings", mission: "planet", sector: "Ring Plane", targetBody: "Saturn", objective: "Choose the planet famous for its broad visible ring system.", flightRule: "Use the most prominent ring system in basic observation imagery.",
    prompt: "Which planet is especially known for its extensive, easily recognised ring system?",
    answer: "Saturn", wrong: ["Mercury", "Venus", "Mars"], explanation: "Saturn is famous for its extensive ring system. The other giant planets also have rings, but Saturn's are especially prominent.",
    cue: "The target is a giant planet with a broad icy ring system.", telemetry: ["Ring particles", "Outer Solar System", "Gas giant"], fuelRisk: 2, commsStatus: "Delayed but clear", minDifficulty: 2,
  },
  {
    id: "inner-order", mission: "navigation", sector: "Inner Worlds", targetBody: "Venus", objective: "Validate an outbound route through the inner planets.", flightRule: "Use orbital order outward from the Sun.",
    prompt: "Which sequence lists the four inner planets in order outward from the Sun?",
    answer: "Mercury → Venus → Earth → Mars", wrong: ["Venus → Mercury → Mars → Earth", "Earth → Mars → Mercury → Venus", "Mars → Earth → Venus → Mercury"], explanation: "From the Sun outward, the four terrestrial planets are Mercury, Venus, Earth and Mars.",
    cue: "Start with the planet closest to the Sun, then move outward one orbit at a time.", telemetry: ["Four rocky worlds", "Outbound route", "Sun-centred chart"], fuelRisk: 3, commsStatus: "Strong", minDifficulty: 2,
  },
  {
    id: "sun-star", mission: "scale", sector: "Solar Observatory", targetBody: "Sun", objective: "Classify the central object correctly.", flightRule: "Use astronomical object type rather than apparent size.",
    prompt: "What type of astronomical object is the Sun?",
    answer: "A star", wrong: ["A planet", "A moon", "An asteroid"], explanation: "The Sun is a star. Its gravity dominates the Solar System and the planets orbit it.",
    cue: "It produces its own light and energy through processes inside the star.", telemetry: ["System centre", "Self-luminous", "Dominant gravity"], fuelRisk: 2, commsStatus: "Solar interference monitored", minDifficulty: 2,
  },
  {
    id: "ice-giants", mission: "planet", sector: "Outer Watch", targetBody: "Neptune", objective: "Identify the Solar System's ice giants.", flightRule: "Separate ice giants from gas giants and terrestrial planets.",
    prompt: "Which pair are classified as the Solar System's ice giants?",
    answer: "Uranus and Neptune", wrong: ["Jupiter and Saturn", "Earth and Mars", "Mercury and Venus"], explanation: "Uranus and Neptune are commonly classified as ice giants; Jupiter and Saturn are gas giants.",
    cue: "Look to the two outermost major planets.", telemetry: ["Outer-system pair", "Cold atmospheres", "Ice-giant class"], fuelRisk: 3, commsStatus: "Long-delay relay", minDifficulty: 3,
  },
  {
    id: "moon-orbit", mission: "orbit", sector: "Satellite Dynamics", targetBody: "Moon", objective: "Distinguish a moon's orbit from a planet's solar orbit.", flightRule: "Track which larger body the satellite travels around directly.",
    prompt: "In the Earth-Moon system, what does the Moon orbit directly?",
    answer: "Earth", wrong: ["Mars", "Jupiter", "Venus"], explanation: "The Moon directly orbits Earth. The Earth-Moon system also travels around the Sun.",
    cue: "Identify the Moon's immediate primary body.", telemetry: ["Bound satellite", "Earth primary", "Nested motion"], fuelRisk: 2, commsStatus: "Near-Earth link", minDifficulty: 3,
  },
  {
    id: "distance-signal", mission: "communication", sector: "Deep-Space Network", targetBody: "Neptune", objective: "Plan communications for a very distant spacecraft.", flightRule: "Account for the finite travel time of radio signals.",
    prompt: "A spacecraft is operating far from Earth near Neptune. Which communication expectation is scientifically sound?",
    answer: "Commands and replies take significant time to travel, so the spacecraft must handle some tasks autonomously", wrong: ["Messages arrive instantly at any distance", "Radio signals stop working outside Earth's atmosphere", "The spacecraft can wait for a live voice conversation with no delay"], explanation: "Radio signals travel at the speed of light, so communication across very large Solar System distances has a noticeable delay.",
    cue: "The signal is fast, but the distance is enormous.", telemetry: ["Very long range", "Light-speed signal", "Autonomy required"], fuelRisk: 4, commsStatus: "Long-delay link", minDifficulty: 3,
  },
  {
    id: "pluto-region", mission: "small-bodies", sector: "Kuiper Watch", targetBody: "Pluto", objective: "Place Pluto in the correct broad Solar System region.", flightRule: "Use its distant trans-Neptunian location.",
    prompt: "Pluto is a dwarf planet associated with which distant region of the Solar System?",
    answer: "The Kuiper Belt", wrong: ["The main asteroid belt between Mars and Jupiter", "Earth's atmosphere", "The rings of Saturn"], explanation: "Pluto is a dwarf planet in the Kuiper Belt, a distant region beyond Neptune containing many icy bodies.",
    cue: "Look beyond Neptune for a population of icy small bodies.", telemetry: ["Beyond Neptune", "Dwarf planet", "Icy-body region"], fuelRisk: 4, commsStatus: "Deep-space delay", minDifficulty: 4,
  },
  {
    id: "orbital-speed", mission: "orbit", sector: "Trajectory Analysis", targetBody: "Mercury", objective: "Compare orbital periods using distance from the Sun.", flightRule: "Use the broad pattern that closer planets complete solar orbits more quickly.",
    prompt: "Which planet completes an orbit around the Sun in the shortest time?",
    answer: "Mercury", wrong: ["Earth", "Jupiter", "Neptune"], explanation: "Mercury is the closest planet to the Sun and has the shortest orbital period of the eight planets.",
    cue: "Choose the innermost planetary orbit.", telemetry: ["Closest planet", "Short year", "Fast orbital cycle"], fuelRisk: 4, commsStatus: "Solar-noise caution", minDifficulty: 4,
  },
  {
    id: "venus-temperature", mission: "planet", sector: "Atmosphere Review", targetBody: "Venus", objective: "Interpret why surface temperature does not simply follow distance from the Sun.", flightRule: "Consider atmospheric greenhouse effects as well as distance.",
    prompt: "Mercury is closer to the Sun, yet Venus has the hotter average surface. What best explains this?",
    answer: "Venus has a very dense carbon-dioxide atmosphere that traps heat strongly", wrong: ["Venus is a star", "Mercury produces its own cooling light", "Venus is inside the Sun's atmosphere"], explanation: "Venus's dense carbon-dioxide atmosphere creates an extreme greenhouse effect, making its surface hotter on average than Mercury's.",
    cue: "Distance matters, but so does how an atmosphere handles heat.", telemetry: ["Dense atmosphere", "Strong greenhouse effect", "Hot surface"], fuelRisk: 5, commsStatus: "Atmospheric relay", minDifficulty: 4,
  },
];

function shuffle<T>(values: readonly T[]) {
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

export function createSolarNavigatorQuestions(difficulty: number, length = 5): SolarNavigatorQuestion[] {
  const level = safeDifficulty(difficulty);
  const count = Math.max(1, Math.min(50, Math.trunc(length)));
  const ceiling = level <= 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4;
  const pool = MISSIONS.filter((mission) => mission.minDifficulty <= ceiling);
  let deck = shuffle(pool);
  const selected: MissionTemplate[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!deck.length) deck = shuffle(pool);
    selected.push(deck.pop()!);
  }
  return selected.map((mission, index) => {
    const options = shuffle([mission.answer, ...mission.wrong]);
    return {
      id: String(index),
      kind: "simulation",
      prompt: mission.prompt,
      answer: mission.answer,
      options,
      explanation: mission.explanation,
      conceptKey: `solar-navigator:${mission.mission}:${mission.id}`,
      scene: {
        boardTitle: "Solar Navigator Mission Control",
        spaceMission: mission.mission,
        sector: mission.sector,
        targetBody: mission.targetBody,
        missionObjective: mission.objective,
        flightRule: mission.flightRule,
        telemetry: [...mission.telemetry],
        fuelRisk: mission.fuelRisk,
        commsStatus: mission.commsStatus,
        navCode: `HEL-${String(index + 1).padStart(2, "0")}-${randomInt(100, 999)}`,
        cue: mission.cue,
        meterLabels: [mission.sector, mission.targetBody, mission.commsStatus],
      },
    };
  });
}
