import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

type Region = {
  region: string;
  capital: string;
  x: number;
  y: number;
  zone: string;
  clue: string;
};

type Feature = {
  key: string;
  answer: string;
  prompt: string;
  explanation: string;
  x: number;
  y: number;
  zone: string;
};

export type GeoQuestQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: ArcadeWorldScene & { cue: string; meterLabels: string[] };
};

const REGIONS: readonly Region[] = [
  { region: "Upper West Region", capital: "Wa", x: 28, y: 14, zone: "north-west", clue: "Ghana's far north-western region." },
  { region: "Upper East Region", capital: "Bolgatanga", x: 63, y: 13, zone: "north-east", clue: "Ghana's far north-eastern region." },
  { region: "North East Region", capital: "Nalerigu", x: 65, y: 25, zone: "north-east", clue: "A north-eastern region south of Upper East." },
  { region: "Northern Region", capital: "Tamale", x: 52, y: 29, zone: "north", clue: "A major northern region whose capital is Tamale." },
  { region: "Savannah Region", capital: "Damongo", x: 36, y: 31, zone: "north-west", clue: "A broad north-western interior region whose capital is Damongo." },
  { region: "Oti Region", capital: "Dambai", x: 75, y: 43, zone: "east", clue: "An eastern interior region north of Volta." },
  { region: "Bono East Region", capital: "Techiman", x: 47, y: 44, zone: "middle", clue: "A middle-belt region whose capital is Techiman." },
  { region: "Bono Region", capital: "Sunyani", x: 35, y: 49, zone: "middle-west", clue: "A middle-western region whose capital is Sunyani." },
  { region: "Ahafo Region", capital: "Goaso", x: 31, y: 59, zone: "forest-west", clue: "A forest-zone region whose capital is Goaso." },
  { region: "Ashanti Region", capital: "Kumasi", x: 48, y: 59, zone: "forest-middle", clue: "A central-southern forest region that includes Kumasi." },
  { region: "Eastern Region", capital: "Koforidua", x: 63, y: 68, zone: "south-east", clue: "A south-eastern interior region whose capital is Koforidua." },
  { region: "Volta Region", capital: "Ho", x: 78, y: 66, zone: "east", clue: "An eastern region along Ghana's side of the Togo border." },
  { region: "Western North Region", capital: "Sefwi Wiawso", x: 24, y: 65, zone: "forest-west", clue: "A forested western interior region north of Western Region." },
  { region: "Western Region", capital: "Sekondi-Takoradi", x: 20, y: 80, zone: "south-west coast", clue: "A south-western coastal region." },
  { region: "Central Region", capital: "Cape Coast", x: 44, y: 84, zone: "central coast", clue: "A central coastal region whose capital is Cape Coast." },
  { region: "Greater Accra Region", capital: "Accra", x: 68, y: 84, zone: "south-east coast", clue: "The coastal region containing Ghana's national capital." },
];

const FEATURES: readonly Feature[] = [
  { key: "lake-volta", answer: "Lake Volta", prompt: "The beacon is over Ghana's large reservoir in the east-central part of the country. Which feature should the atlas record?", explanation: "Lake Volta is the large reservoir occupying much of eastern Ghana's interior.", x: 68, y: 51, zone: "east-central water" },
  { key: "gulf-guinea", answer: "Gulf of Guinea", prompt: "The survey marker is just off Ghana's southern coastline. Which water body is being mapped?", explanation: "Ghana's southern coast faces the Gulf of Guinea in the Atlantic Ocean.", x: 51, y: 95, zone: "southern coast" },
  { key: "togo-border", answer: "Togo", prompt: "The expedition reaches Ghana's eastern international border. Which neighbouring country lies across it?", explanation: "Togo borders Ghana to the east.", x: 87, y: 58, zone: "eastern border" },
  { key: "cote-divoire-border", answer: "Côte d’Ivoire", prompt: "The expedition reaches Ghana's western international border. Which neighbouring country lies across it?", explanation: "Côte d’Ivoire borders Ghana to the west.", x: 12, y: 57, zone: "western border" },
  { key: "burkina-border", answer: "Burkina Faso", prompt: "The expedition reaches Ghana's northern international border. Which neighbouring country lies across it?", explanation: "Burkina Faso borders Ghana to the north.", x: 50, y: 5, zone: "northern border" },
];

export const GEOQUEST_REGION_COUNT = REGIONS.length;
export const GEOQUEST_CONTROLLED_CONCEPT_COUNT = REGIONS.length * 4 + FEATURES.length;

function shuffle<T>(values: readonly T[]): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function distractors(values: readonly string[], answer: string) {
  return shuffle(values.filter((value) => value !== answer)).slice(0, 3);
}

function regionQuestion(region: Region, mode: "region" | "capital" | "inverse" | "pair"): GeoQuestQuestion {
  const regionNames = REGIONS.map((item) => item.region);
  const capitals = REGIONS.map((item) => item.capital);
  const pairs = REGIONS.map((item) => `${item.region} — ${item.capital}`);
  let prompt = "The unknown beacon is at the marked position. Which Ghana region should the atlas log?";
  let answer = region.region;
  let choices = [answer, ...distractors(regionNames, answer)];
  let explanation = `${region.clue} Its regional capital is ${region.capital}.`;
  let conceptKey = `geo-region:${region.region}`;
  let focus = "region recognition";

  if (mode === "capital") {
    prompt = `The marked expedition beacon is in ${region.region}. Which regional capital should the field team record?`;
    answer = region.capital;
    choices = [answer, ...distractors(capitals, answer)];
    explanation = `${region.capital} is the capital of ${region.region}.`;
    conceptKey = `geo-capital:${region.region}`;
    focus = "regional capitals";
  } else if (mode === "inverse") {
    prompt = `The route note says the marked region has ${region.capital} as its capital. Which region is it?`;
    answer = region.region;
    choices = [answer, ...distractors(regionNames, answer)];
    explanation = `${region.capital} is the capital of ${region.region}, matching the marked location.`;
    conceptKey = `geo-inverse:${region.region}`;
    focus = "capital-to-region";
  } else if (mode === "pair") {
    prompt = "Which atlas entry correctly pairs the marked Ghana region with its regional capital?";
    answer = `${region.region} — ${region.capital}`;
    choices = [answer, ...distractors(pairs, answer)];
    explanation = `${region.region} is correctly paired with ${region.capital}.`;
    conceptKey = `geo-pair:${region.region}`;
    focus = "region-capital pairing";
  }

  return {
    id: "0",
    kind: "map",
    prompt,
    options: shuffle(choices),
    answer,
    explanation,
    conceptKey,
    scene: {
      x: region.x,
      y: region.y,
      boardTitle: "Ghana Expedition Atlas",
      cue: region.clue,
      meterLabels: [region.zone, focus, "Ghana"],
    },
  };
}

function featureQuestion(feature: Feature): GeoQuestQuestion {
  const answers = FEATURES.map((item) => item.answer);
  return {
    id: "0",
    kind: "map",
    prompt: feature.prompt,
    options: shuffle([feature.answer, ...distractors(answers, feature.answer)]),
    answer: feature.answer,
    explanation: feature.explanation,
    conceptKey: `geo-feature:${feature.key}`,
    scene: {
      x: feature.x,
      y: feature.y,
      boardTitle: "Ghana Expedition Atlas",
      cue: feature.explanation,
      meterLabels: [feature.zone, "national geography", "Ghana"],
    },
  };
}

export function createGeoQuestQuestions(difficulty: number, length = 5): GeoQuestQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  const pool: GeoQuestQuestion[] = REGIONS.map((region) => regionQuestion(region, "region"));
  if (safeDifficulty >= 2) pool.push(...REGIONS.map((region) => regionQuestion(region, "capital")));
  if (safeDifficulty >= 3) pool.push(...FEATURES.map(featureQuestion));
  if (safeDifficulty >= 4) pool.push(...REGIONS.map((region) => regionQuestion(region, "inverse")));
  if (safeDifficulty >= 5) pool.push(...REGIONS.map((region) => regionQuestion(region, "pair")));
  const selected = shuffle(pool).slice(0, safeLength);
  while (selected.length < safeLength) selected.push(regionQuestion(REGIONS[randomInt(REGIONS.length)], safeDifficulty >= 2 ? "capital" : "region"));
  return selected.map((question, index) => ({ ...question, id: String(index) }));
}
