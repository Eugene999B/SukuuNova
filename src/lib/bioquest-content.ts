import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

export type BioQuestSystem = "circulatory" | "respiratory" | "digestive" | "nervous" | "skeletal" | "muscular" | "immune" | "excretory" | "endocrine" | "coordination";

export type BioQuestScene = ArcadeWorldScene & {
  bodySystem: BioQuestSystem;
  organ: string;
  caseTitle: string;
  vitalFocus: string;
  scanSignals: string[];
  strainLevel: 1 | 2 | 3 | 4 | 5;
  bay: string;
  caseId: string;
};

export type BioQuestQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: BioQuestScene;
};

type BioTemplate = {
  id: string;
  system: BioQuestSystem;
  organ: string;
  caseTitle: string;
  vitalFocus: string;
  prompt: string;
  answer: string;
  wrong: [string, string, string];
  explanation: string;
  cue: string;
  signals: string[];
  bay: string;
  minDifficulty: number;
};

const CASES: BioTemplate[] = [
  { id: "heart-pump", system: "circulatory", organ: "Heart", caseTitle: "Pulse pathway", vitalFocus: "blood flow", prompt: "Which organ acts as the main pump that keeps blood moving around the body?", answer: "The heart", wrong: ["The stomach", "The skull", "The skin"], explanation: "The heart contracts rhythmically to pump blood through blood vessels around the body.", cue: "Look for the organ whose repeated contractions drive circulation.", signals: ["rhythmic contraction", "blood vessels", "whole-body transport"], bay: "Pulse Bay", minDifficulty: 1 },
  { id: "lungs-gas", system: "respiratory", organ: "Lungs", caseTitle: "Air exchange", vitalFocus: "oxygen exchange", prompt: "Which organs are mainly responsible for exchanging oxygen and carbon dioxide with the air?", answer: "The lungs", wrong: ["The kidneys", "The bones", "The intestines"], explanation: "The lungs contain tiny air spaces where gases move between air and blood.", cue: "Trace where inhaled air meets the blood supply.", signals: ["inhaled air", "oxygen enters blood", "carbon dioxide leaves"], bay: "Breath Bay", minDifficulty: 1 },
  { id: "stomach-digestion", system: "digestive", organ: "Stomach", caseTitle: "Food processing", vitalFocus: "digestion", prompt: "What is one main job of the stomach in digestion?", answer: "Mix food with digestive juices and begin breaking it down", wrong: ["Pump blood to the lungs", "Control every voluntary movement", "Make the skeleton rigid"], explanation: "The stomach churns food and mixes it with digestive substances before food moves onward.", cue: "Follow food after swallowing and before most nutrients are absorbed.", signals: ["food arrives from oesophagus", "muscular mixing", "digestive juices"], bay: "Nutrition Bay", minDifficulty: 1 },
  { id: "bones-support", system: "skeletal", organ: "Skeleton", caseTitle: "Body framework", vitalFocus: "support and protection", prompt: "Why is the skeleton important to the body?", answer: "It supports the body, protects organs and provides attachment for movement", wrong: ["It pumps oxygen into the blood", "It digests all food", "It produces thoughts and memories"], explanation: "Bones form a supporting framework, protect structures such as the brain and help muscles create movement.", cue: "Think about structure, protection and what muscles pull against.", signals: ["rigid framework", "organ protection", "muscle attachment"], bay: "Structure Bay", minDifficulty: 1 },
  { id: "muscle-movement", system: "muscular", organ: "Skeletal muscles", caseTitle: "Motion control", vitalFocus: "movement", prompt: "How do skeletal muscles help move a limb?", answer: "They contract and pull on bones across joints", wrong: ["They turn food directly into bone", "They replace the nervous system", "They filter waste from the blood"], explanation: "Skeletal muscles shorten when they contract and pull on bones through tendons to create movement.", cue: "Movement happens when force is applied across a joint.", signals: ["muscle contraction", "tendon connection", "joint movement"], bay: "Motion Bay", minDifficulty: 1 },
  { id: "skin-barrier", system: "immune", organ: "Skin", caseTitle: "First barrier", vitalFocus: "protection", prompt: "How does intact skin help protect the body?", answer: "It forms a physical barrier that blocks many harmful organisms and substances", wrong: ["It pumps blood around the body", "It stores every memory", "It produces urine"], explanation: "Skin is part of the body's first line of defence because it separates internal tissues from many outside hazards.", cue: "Consider what stands between internal tissues and the outside environment.", signals: ["outer barrier", "blocks entry", "first-line defence"], bay: "Defence Bay", minDifficulty: 1 },
  { id: "small-intestine", system: "digestive", organ: "Small intestine", caseTitle: "Nutrient transfer", vitalFocus: "absorption", prompt: "Where does most nutrient absorption from digested food take place?", answer: "The small intestine", wrong: ["The trachea", "The spinal cord", "The femur"], explanation: "The small intestine has a large surface area that allows digested nutrients to move into the blood and lymph.", cue: "Find the digestive organ specialised for moving nutrients into transport systems.", signals: ["large surface area", "digested nutrients", "absorption into transport"], bay: "Nutrition Bay", minDifficulty: 2 },
  { id: "brain-signals", system: "nervous", organ: "Brain", caseTitle: "Signal command", vitalFocus: "information processing", prompt: "Which organ processes sensory information and coordinates many body responses?", answer: "The brain", wrong: ["The pancreas", "The ribs", "The bladder"], explanation: "The brain receives and processes information and helps coordinate responses through the nervous system.", cue: "Look for the central organ that interprets incoming signals and sends instructions.", signals: ["sensory input", "processing", "response commands"], bay: "Neural Bay", minDifficulty: 2 },
  { id: "red-cells", system: "circulatory", organ: "Red blood cells", caseTitle: "Oxygen transport", vitalFocus: "oxygen delivery", prompt: "What is a major job of red blood cells?", answer: "Carry oxygen from the lungs to body tissues", wrong: ["Digest proteins in the stomach", "Build electrical impulses in bones", "Filter urine in the bladder"], explanation: "Haemoglobin in red blood cells binds oxygen and carries it through the circulation.", cue: "Trace oxygen after it crosses from the lungs into the blood.", signals: ["haemoglobin", "oxygen carriage", "tissue delivery"], bay: "Pulse Bay", minDifficulty: 2 },
  { id: "kidney-filter", system: "excretory", organ: "Kidneys", caseTitle: "Fluid balance", vitalFocus: "waste removal", prompt: "What do the kidneys do as they filter blood?", answer: "Remove certain wastes and help control water and salt balance", wrong: ["Pump blood through arteries", "Exchange air in the lungs", "Control the body's bones"], explanation: "Kidneys filter blood, remove wastes into urine and help regulate fluid and electrolyte balance.", cue: "Think about blood filtration, urine formation and body-fluid balance.", signals: ["blood filtration", "urine formation", "water and salt balance"], bay: "Balance Bay", minDifficulty: 3 },
  { id: "reflex-route", system: "nervous", organ: "Spinal cord", caseTitle: "Fast response", vitalFocus: "reflex signalling", prompt: "Why can a withdrawal reflex happen very quickly after touching something painfully hot?", answer: "A rapid nerve pathway through the spinal cord can trigger movement before full conscious processing", wrong: ["The stomach sends a digestive command", "The bones pump the muscles", "The kidneys control the fingers directly"], explanation: "Some reflex pathways use the spinal cord to organise a fast protective response while signals also travel to the brain.", cue: "Look for the shortest protective nerve pathway between sensation and muscle response.", signals: ["sensory neuron", "spinal pathway", "rapid motor response"], bay: "Neural Bay", minDifficulty: 3 },
  { id: "white-cells", system: "immune", organ: "White blood cells", caseTitle: "Defence response", vitalFocus: "immune defence", prompt: "What is one important role of white blood cells?", answer: "Help recognise and respond to harmful organisms or abnormal cells", wrong: ["Carry most oxygen using haemoglobin", "Digest all fats in the stomach", "Form the hard outer part of teeth only"], explanation: "Different white blood cells contribute to immune defence by detecting threats and coordinating or carrying out responses.", cue: "Identify the blood cells specialised for defence rather than oxygen transport.", signals: ["threat recognition", "immune response", "defence cells"], bay: "Defence Bay", minDifficulty: 3 },
  { id: "pancreas-glucose", system: "endocrine", organ: "Pancreas", caseTitle: "Glucose control", vitalFocus: "hormone regulation", prompt: "Which statement best describes the pancreas in blood-glucose regulation?", answer: "It releases hormones that help keep blood glucose within a useful range", wrong: ["It replaces the heart as the blood pump", "It stores all oxygen for the lungs", "It forms the spinal cord"], explanation: "The pancreas releases hormones including insulin and glucagon that help regulate blood glucose.", cue: "Think about chemical messengers that adjust glucose storage and release.", signals: ["hormone release", "glucose regulation", "chemical signalling"], bay: "Control Bay", minDifficulty: 4 },
  { id: "exercise-sync", system: "coordination", organ: "Heart + lungs + muscles", caseTitle: "Exercise systems sync", vitalFocus: "multi-system coordination", prompt: "During exercise, why do breathing rate and heart rate usually increase together?", answer: "Working muscles need faster oxygen delivery and carbon-dioxide removal", wrong: ["Bones need to digest more food immediately", "The skin becomes the main blood pump", "The kidneys stop filtering blood completely"], explanation: "Respiratory and circulatory systems work together to meet the increased gas-exchange and transport needs of active muscles.", cue: "Connect muscle energy demand with gas exchange and blood transport.", signals: ["active muscles", "higher oxygen demand", "faster transport"], bay: "Systems Bay", minDifficulty: 4 },
  { id: "temperature-sync", system: "coordination", organ: "Skin + circulation + nervous system", caseTitle: "Temperature regulation", vitalFocus: "homeostasis", prompt: "When the body gets too warm, which coordinated response can help release heat?", answer: "Sweating and increased blood flow near the skin surface", wrong: ["Stopping all circulation to the skin", "Closing the lungs completely", "Making every skeletal muscle contract continuously"], explanation: "Sweating supports evaporative cooling, while increased skin blood flow can transfer more internal heat toward the body surface.", cue: "Choose the response that moves heat outward and supports cooling.", signals: ["temperature sensors", "skin blood flow", "evaporative cooling"], bay: "Systems Bay", minDifficulty: 4 },
];

function shuffle<T>(values: readonly T[]): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function safeDifficulty(difficulty: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.trunc(difficulty))) as 1 | 2 | 3 | 4 | 5;
}

function eligibleCases(difficulty: number) {
  const level = safeDifficulty(difficulty);
  const ceiling = level <= 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4;
  return CASES.filter((item) => item.minDifficulty <= ceiling);
}

export function createBioQuestQuestions(difficulty: number, length = 5): BioQuestQuestion[] {
  const level = safeDifficulty(difficulty);
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  const pool = eligibleCases(level);
  const sequence: BioTemplate[] = [];
  let deck = shuffle(pool);
  for (let index = 0; index < safeLength; index += 1) {
    if (!deck.length) deck = shuffle(pool);
    sequence.push(deck.pop()!);
  }
  return sequence.map((item, index) => {
    const strainLevel = Math.max(1, Math.min(5, Math.ceil((level + item.minDifficulty) / 2))) as 1 | 2 | 3 | 4 | 5;
    return {
      id: String(index),
      kind: "simulation",
      prompt: item.prompt,
      answer: item.answer,
      options: shuffle([item.answer, ...item.wrong]),
      explanation: item.explanation,
      conceptKey: `bioquest:${item.system}:${item.id}`,
      scene: {
        boardTitle: "BioQuest: Human Systems",
        bodySystem: item.system,
        organ: item.organ,
        caseTitle: item.caseTitle,
        vitalFocus: item.vitalFocus,
        scanSignals: item.signals,
        strainLevel,
        bay: item.bay,
        caseId: `BIO-${String(index + 1).padStart(2, "0")}-${randomInt(100, 999)}`,
        cue: item.cue,
        meterLabels: [item.system, item.vitalFocus, `strain ${strainLevel}/5`],
      },
    };
  });
}
