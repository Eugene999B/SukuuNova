import {
  resolveCatalogSelection,
  type CognitiveChallenge,
  type LearnQuestion,
  type SessionConfig,
} from "./learn-domain";

type Family = "vocabulary" | "translation" | "grammar" | "dialogue" | "reading" | "editing" | "meaning" | "transfer";
type Pair = { target: string; english: string };

const TOPIC_CAPACITY = 48_000_000;

const FRENCH_VOCAB: readonly Pair[] = [
  { target: "l'école", english: "school" }, { target: "la maison", english: "home" },
  { target: "le livre", english: "book" }, { target: "l'eau", english: "water" },
  { target: "la nourriture", english: "food" }, { target: "un ami", english: "a friend" },
  { target: "la famille", english: "family" }, { target: "le professeur", english: "teacher" },
  { target: "l'élève", english: "pupil" }, { target: "le marché", english: "market" },
  { target: "le matin", english: "morning" }, { target: "le soir", english: "evening" },
  { target: "le travail", english: "work" }, { target: "un arbre", english: "a tree" },
  { target: "un oiseau", english: "a bird" }, { target: "la santé", english: "health" },
  { target: "l'environnement", english: "environment" }, { target: "l'ordinateur", english: "computer" },
  { target: "le cahier", english: "notebook" }, { target: "la fenêtre", english: "window" },
];

const FRENCH_SENTENCES: readonly Pair[] = [
  { target: "Je vais à l'école chaque matin.", english: "I go to school every morning." },
  { target: "Ama lit un livre à la maison.", english: "Ama reads a book at home." },
  { target: "Nous protégeons notre environnement.", english: "We protect our environment." },
  { target: "Le professeur explique la leçon.", english: "The teacher explains the lesson." },
  { target: "Les élèves travaillent en groupe.", english: "The pupils work in a group." },
  { target: "Kojo boit de l'eau après le sport.", english: "Kojo drinks water after sports." },
  { target: "Ma mère va au marché le samedi.", english: "My mother goes to the market on Saturday." },
  { target: "J'aime apprendre le français.", english: "I like learning French." },
  { target: "Nous devons respecter les autres.", english: "We must respect other people." },
  { target: "La classe commence à huit heures.", english: "The class starts at eight o'clock." },
];

const FRENCH_DIALOGUES = [
  { prompt: "Bonjour !", answer: "Bonjour !", wrong: ["Bonne nuit !", "Merci beaucoup.", "Je ne sais pas."] },
  { prompt: "Comment ça va ?", answer: "Ça va bien, merci.", wrong: ["Je m'appelle lundi.", "Au marché.", "J'ai un livre rouge."] },
  { prompt: "Merci beaucoup.", answer: "De rien.", wrong: ["À demain matin.", "Je suis une école.", "Combien coûte la route ?"] },
  { prompt: "Comment tu t'appelles ?", answer: "Je m'appelle Ama.", wrong: ["J'ai douze ans demain hier.", "Je vais parce que.", "Bonsoir le livre."] },
  { prompt: "Au revoir !", answer: "À bientôt !", wrong: ["Bon appétit !", "Pardon le cahier.", "Je suis marché."] },
  { prompt: "Quel âge as-tu ?", answer: "J'ai douze ans.", wrong: ["Je suis douze ans.", "J'ai à l'école.", "Je vais douze."] },
] as const;

const FRENCH_VERBS = [
  { subject: "Je", infinitive: "être", answer: "suis", wrong: ["es", "sommes", "sont"] },
  { subject: "Tu", infinitive: "être", answer: "es", wrong: ["suis", "êtes", "sont"] },
  { subject: "Nous", infinitive: "être", answer: "sommes", wrong: ["suis", "êtes", "sont"] },
  { subject: "Vous", infinitive: "avoir", answer: "avez", wrong: ["ai", "a", "avons"] },
  { subject: "Ils", infinitive: "avoir", answer: "ont", wrong: ["ai", "as", "avons"] },
  { subject: "Nous", infinitive: "aller", answer: "allons", wrong: ["vais", "va", "allez"] },
  { subject: "Vous", infinitive: "aller", answer: "allez", wrong: ["vais", "vas", "allons"] },
  { subject: "Ils", infinitive: "parler", answer: "parlent", wrong: ["parle", "parles", "parlons"] },
] as const;

const TWI_VOCAB: readonly Pair[] = [
  { target: "akwaaba", english: "welcome" }, { target: "meda wo ase", english: "thank you" },
  { target: "mepa wo kyɛw", english: "please" }, { target: "nsuo", english: "water" },
  { target: "aduan", english: "food" }, { target: "sukuu", english: "school" },
  { target: "fie", english: "home" }, { target: "nwoma", english: "book" },
  { target: "dua", english: "tree" }, { target: "anomaa", english: "bird" },
  { target: "ɔba", english: "child" }, { target: "agya", english: "father" },
  { target: "ɛna", english: "mother" }, { target: "anɔpa", english: "morning" },
  { target: "adwuma", english: "work" }, { target: "sika", english: "money" },
  { target: "adamfo", english: "friend" }, { target: "akyerɛkyerɛfo", english: "teacher" },
  { target: "suani", english: "student" }, { target: "abusua", english: "family" },
  { target: "amammerɛ", english: "culture" }, { target: "nokware", english: "truth" },
  { target: "asomdwoe", english: "peace" },
];

const TWI_SENTENCES: readonly Pair[] = [
  { target: "Me kɔ sukuu anɔpa biara.", english: "I go to school every morning." },
  { target: "Ama kenkan nwoma wɔ fie.", english: "Ama reads a book at home." },
  { target: "Kojo nom nsuo.", english: "Kojo drinks water." },
  { target: "Akosua boa ne adamfo.", english: "Akosua helps her friend." },
  { target: "Yɛka nokware bere nyinaa.", english: "We tell the truth all the time." },
  { target: "Abena ne ne maame kɔ gua so.", english: "Abena and her mother go to the market." },
  { target: "Agya no reyɛ adwuma.", english: "The father is working." },
  { target: "Suani no wɔ nwoma foforo.", english: "The student has a new book." },
  { target: "Yɛpɛ asomdwoe wɔ yɛn man mu.", english: "We want peace in our country." },
];

const TWI_COMPLETIONS = [
  { prompt: "Me ___ sukuu anɔpa biara.", answer: "kɔ", wrong: ["nom", "da", "to"] },
  { prompt: "Kojo ___ nsuo.", answer: "nom", wrong: ["kenkan", "kɔ", "twerɛ"] },
  { prompt: "Ama ___ nwoma.", answer: "kenkan", wrong: ["nom", "da", "kɔ"] },
  { prompt: "Yɛka ___ bere nyinaa.", answer: "nokware", wrong: ["nsuo", "sika", "dua"] },
  { prompt: "Meda wo ___.", answer: "ase", wrong: ["fie", "sukuu", "dua"] },
  { prompt: "Mepa wo ___.", answer: "kyɛw", wrong: ["ase", "nsuo", "adwuma"] },
] as const;

const TWI_DIALOGUES = [
  { prompt: "Kofi ka, “Maakye.”", answer: "Yaa agya.", wrong: ["Maadwo.", "Meda wo ase.", "Mepa wo kyɛw."] },
  { prompt: "Ama ka, “Meda wo ase.”", answer: "Yoo.", wrong: ["Maakye.", "Akwaaba.", "Nsuo."] },
  { prompt: "Obi ba wo fie na wokae sɛ:", answer: "Akwaaba.", wrong: ["Maadwo.", "Nwoma.", "Adwuma."] },
  { prompt: "Wopɛ biribi fi obi hɔ a, wobɛka sɛ:", answer: "Mepa wo kyɛw.", wrong: ["Meda wo ase.", "Akwaaba.", "Anɔpa."] },
] as const;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function difficulty(levelId: string): 1 | 2 | 3 | 4 | 5 {
  if (/basic-[12]/.test(levelId)) return 1;
  if (/basic-[34]/.test(levelId)) return 2;
  if (/basic-[56]|jhs-1/.test(levelId)) return 3;
  if (/jhs-[23]|shs-[12]/.test(levelId) || levelId === "practice") return 4;
  return 5;
}

function rotate<T>(values: readonly T[], offset: number) {
  if (!values.length) return [] as T[];
  const shift = offset % values.length;
  return [...values.slice(shift), ...values.slice(0, shift)];
}

function options(answer: string, wrong: readonly string[], seed: number) {
  const values = Array.from(new Set([answer, ...wrong])).slice(0, 4);
  const rotated = rotate(values, seed);
  return {
    options: rotated.map((label, index) => ({ id: String(index), label })),
    answer: String(rotated.indexOf(answer)),
  };
}

function labels(config: SessionConfig) {
  const selection = resolveCatalogSelection(config);
  return {
    subject: selection.subject?.contentLabel ?? selection.subject?.label ?? config.subjectId.replaceAll("-", " "),
    topic: selection.topic?.label ?? "Mixed language practice",
  };
}

function make(
  config: SessionConfig,
  family: Family,
  position: number,
  seed: number,
  prompt: string,
  answer: string,
  wrong: readonly string[],
  explanation: string,
  skill: string,
): LearnQuestion {
  const selected = labels(config);
  const picked = options(answer, wrong, seed + position);
  const challenges: CognitiveChallenge[] = ["Recall", "Apply", "Analyse", "Transfer"];
  return {
    id: "language-" + config.subjectId + "-" + config.levelId + "-" + family + "-" + seed + "-" + position,
    exposureKey: "language:" + config.lane + ":" + config.programId + ":" + config.levelId + ":" + config.subjectId + ":" + config.topicId + ":" + family + ":" + seed + ":" + position,
    kind: "single",
    subject: selected.subject,
    topic: selected.topic,
    skill,
    difficulty: difficulty(config.levelId),
    challenge: challenges[position % challenges.length],
    mission: config.subjectId === "french" ? "Communiquer naturellement en français" : "Sua Asante Twi kasa ne nkyerɛwee yiye",
    generationFamily: "language-" + config.subjectId + "-" + family,
    prompt,
    options: picked.options,
    answer: picked.answer,
    explanation,
  };
}

function french(config: SessionConfig, family: Family, position: number, seed: number) {
  const index = hash(seed + ":" + position + ":" + family);

  if (family === "vocabulary" || family === "translation") {
    const item = FRENCH_VOCAB[index % FRENCH_VOCAB.length];
    if (family === "vocabulary") {
      const wrong = rotate(FRENCH_VOCAB.filter((entry) => entry.english !== item.english), index).slice(0, 3).map((entry) => entry.english);
      return make(config, family, position, seed, "Que signifie « " + item.target + " » en anglais ?", item.english, wrong,
        "« " + item.target + " » signifie « " + item.english + " ».", "Comprendre le vocabulaire en contexte");
    }
    const wrong = rotate(FRENCH_VOCAB.filter((entry) => entry.target !== item.target), index).slice(0, 3).map((entry) => entry.target);
    return make(config, family, position, seed, "Choisis le mot français qui signifie « " + item.english + " ».", item.target, wrong,
      "La bonne traduction est « " + item.target + " ».", "Choisir une traduction précise");
  }

  if (family === "grammar") {
    const item = FRENCH_VERBS[index % FRENCH_VERBS.length];
    return make(config, family, position, seed,
      "Complète correctement : « " + item.subject + " ___ ». Utilise le verbe « " + item.infinitive + " » au présent.",
      item.answer, item.wrong, "Avec « " + item.subject + " », la forme correcte est « " + item.answer + " ».", "Accorder un verbe au présent");
  }

  if (family === "dialogue") {
    const item = FRENCH_DIALOGUES[index % FRENCH_DIALOGUES.length];
    return make(config, family, position, seed,
      "Dans une conversation, quelqu'un dit : « " + item.prompt + " » Quelle réponse est la plus naturelle ?",
      item.answer, item.wrong, "Dans ce contexte, « " + item.answer + " » est une réponse naturelle.", "Répondre naturellement dans un dialogue");
  }

  if (family === "reading") {
    const people = ["Ama", "Kojo", "Esi", "Yaw"] as const;
    const places = ["à l'école", "à la bibliothèque", "au marché", "au terrain de sport"] as const;
    const activities = ["lit un livre", "travaille avec ses amis", "achète des fruits", "joue au football"] as const;
    const person = people[index % people.length];
    const place = places[Math.floor(index / 4) % places.length];
    const activity = activities[Math.floor(index / 16) % activities.length];
    const passage = person + " va " + place + ". " + person + " " + activity + ".";
    return make(config, family, position, seed, "Lis ce petit texte : « " + passage + " » Qui est le personnage principal ?",
      person, people.filter((value) => value !== person), "Le texte décrit ce que " + person + " fait.", "Lire un court texte et repérer une information");
  }

  const item = FRENCH_SENTENCES[index % FRENCH_SENTENCES.length];
  if (family === "editing") {
    const wrong = [item.target.replace(" à ", " a "), item.target.replace(/\.$/, ""), item.target.replace(/^./u, (letter) => letter.toLowerCase())].filter((value) => value !== item.target);
    return make(config, family, position, seed, "Quelle phrase est écrite correctement ?", item.target, wrong,
      "La phrase correcte est : « " + item.target + " »", "Relire et corriger une phrase");
  }
  if (family === "meaning") {
    const wrong = rotate(FRENCH_SENTENCES.filter((entry) => entry.english !== item.english), index).slice(0, 3).map((entry) => entry.english);
    return make(config, family, position, seed, "Que veut dire cette phrase ? « " + item.target + " »", item.english, wrong,
      "La phrase signifie : « " + item.english + " »", "Comprendre le sens d'une phrase");
  }
  const wrong = rotate(FRENCH_SENTENCES.filter((entry) => entry.target !== item.target), index).slice(0, 3).map((entry) => entry.target);
  return make(config, family, position, seed,
    "Un élève veut exprimer cette idée : « " + item.english + " » Quelle phrase française convient le mieux ?",
    item.target, wrong, "« " + item.target + " » exprime correctement cette idée.", "Transférer le français à une situation réelle");
}

function twi(config: SessionConfig, family: Family, position: number, seed: number) {
  const index = hash(seed + ":" + position + ":" + family);

  if (family === "vocabulary" || family === "translation") {
    const item = TWI_VOCAB[index % TWI_VOCAB.length];
    if (family === "vocabulary") {
      const wrong = rotate(TWI_VOCAB.filter((entry) => entry.english !== item.english), index).slice(0, 3).map((entry) => entry.english);
      return make(config, family, position, seed, "Asɛmfua « " + item.target + " » kyerɛ dɛn wɔ Borɔfo mu?", item.english, wrong,
        "« " + item.target + " » kyerɛ « " + item.english + " ».", "Hu asɛmfua ne ne nkyerɛase");
    }
    const wrong = rotate(TWI_VOCAB.filter((entry) => entry.target !== item.target), index).slice(0, 3).map((entry) => entry.target);
    return make(config, family, position, seed, "Asante Twi asɛmfua bɛn na ɛkyerɛ « " + item.english + " »?", item.target, wrong,
      "Asante Twi mu no, « " + item.english + " » ne « " + item.target + " ».", "Paw Asante Twi asɛmfua a ɛfata");
  }

  if (family === "grammar") {
    const item = TWI_COMPLETIONS[index % TWI_COMPLETIONS.length];
    return make(config, family, position, seed, "Asɛmfua bɛn na ɛfata baabi a wɔagyaw no hɔ? « " + item.prompt + " »", item.answer, item.wrong,
      "Mmuae a ɛfata ne « " + item.answer + " ».", "Fa asɛmfua a ɛfata wie kasamu");
  }

  if (family === "dialogue") {
    const item = TWI_DIALOGUES[index % TWI_DIALOGUES.length];
    return make(config, family, position, seed, item.prompt + " Mmuae a ɛfata paa ne deɛn?", item.answer, item.wrong,
      "Wɔ saa tebea yi mu no, mmuae a ɛfata ne « " + item.answer + " ».", "Bua nkɔmmɔ wɔ ɔkwan a ɛfata so");
  }

  if (family === "reading") {
    const passages = [
      { text: "Ama yɛ suani. Ɔkɔ sukuu anɔpa biara. Ɔpɛ sɛ ɔkenkan nwoma.", q: "Hena na ɔkɔ sukuu anɔpa biara?", a: "Ama", wrong: ["Kojo", "Agya", "Ɔkyerɛkyerɛfo"] },
      { text: "Kojo wɔ fie. Ɔnom nsuo na ɔkenkan nwoma ansa na wakɔ sukuu.", q: "Dɛn na Kojo yɛ ansa na wakɔ sukuu?", a: "Ɔnom nsuo na ɔkenkan nwoma.", wrong: ["Ɔkɔ gua so.", "Ɔda da mũ nyinaa.", "Ɔtɔn aduan."] },
      { text: "Abena ne ne maame kɔ gua so. Wɔtɔ aduan na wɔsan kɔ fie.", q: "Ɛhe na Abena ne ne maame kɔ?", a: "Gua so.", wrong: ["Sukuu mu.", "Asɔre mu.", "Ayaresabea."] },
      { text: "Yɛka nokware na yɛboa yɛn nnamfo. Eyi ma asomdwoe tena yɛn ntam.", q: "Dɛn na ɛboa ma asomdwoe tena yɛn ntam?", a: "Nokware ne mmoa.", wrong: ["Ntɔkwa.", "Atoro.", "Aniwuo."] },
    ] as const;
    const item = passages[index % passages.length];
    return make(config, family, position, seed, "Kenkan asɛm ketewa yi na bua asɛmmisa no: « " + item.text + " » " + item.q,
      item.a, item.wrong, "Mmuae no fi asɛm no mu pɛɛ.", "Kenkan asɛm na yi nsɛm titiriw");
  }

  const item = TWI_SENTENCES[index % TWI_SENTENCES.length];
  if (family === "editing") {
    const wrong = [item.target.replace(/\.$/, ""), item.target.replace("ɔ", "o"), item.target.replace("ɛ", "e")].filter((value) => value !== item.target);
    return make(config, family, position, seed, "Paw kasamu a wɔatwerɛ no yiye.", item.target, wrong,
      "Kasamu a wɔatwerɛ no yiye ne: « " + item.target + " »", "Hwɛ nkyerɛwee ne kasamu nhyehyɛe");
  }
  if (family === "meaning") {
    const wrong = rotate(TWI_SENTENCES.filter((entry) => entry.english !== item.english), index).slice(0, 3).map((entry) => entry.english);
    return make(config, family, position, seed, "Kasamu yi kyerɛ dɛn? « " + item.target + " »", item.english, wrong,
      "Kasamu no kyerɛ sɛ: « " + item.english + " »", "Te Asante Twi kasamu ase");
  }
  const wrong = rotate(TWI_SENTENCES.filter((entry) => entry.target !== item.target), index).slice(0, 3).map((entry) => entry.target);
  return make(config, family, position, seed, "Wopɛ sɛ wokyerɛ adwene yi: « " + item.english + " » Asante Twi kasamu bɛn na ɛfata paa?",
    item.target, wrong, "Kasamu a ɛfata ne « " + item.target + " »", "Fa Asante Twi di dwuma wɔ tebea foforo mu");
}

function families(config: SessionConfig): readonly Family[] {
  if (config.topicId !== "all") {
    if (/vocabulary/.test(config.topicId)) return ["vocabulary", "translation", "meaning"];
    if (/grammar/.test(config.topicId)) return ["grammar", "editing"];
    if (/reading/.test(config.topicId)) return ["reading", "meaning"];
    if (/writing/.test(config.topicId)) return ["editing", "translation", "transfer", "grammar"];
    if (/oral|listening-speaking/.test(config.topicId)) return ["dialogue", "meaning", "vocabulary"];
    if (/culture/.test(config.topicId)) return ["reading", "dialogue", "vocabulary", "meaning"];
  }
  if (/basic-[12]/.test(config.levelId)) return ["vocabulary", "translation", "dialogue", "meaning"];
  if (/basic-[34]/.test(config.levelId)) return ["vocabulary", "translation", "grammar", "dialogue", "reading", "meaning"];
  return ["vocabulary", "translation", "grammar", "dialogue", "reading", "editing", "meaning", "transfer"];
}

function languageSubject(id: string) {
  return id === "french" || id === "ghanaian-language";
}

export function languageCapacityForSelection(config: SessionConfig) {
  if (!languageSubject(config.subjectId) && config.subjectId !== "all") return 0;
  const selection = resolveCatalogSelection(config);
  if (!selection.level) return 0;
  const subjects = config.subjectId === "all"
    ? selection.level.subjects.filter((subject) => languageSubject(subject.id))
    : selection.level.subjects.filter((subject) => subject.id === config.subjectId);
  const count = config.topicId === "all"
    ? subjects.reduce((total, subject) => total + subject.topics.length, 0)
    : subjects.reduce((total, subject) => total + subject.topics.filter((topic) => topic.id === config.topicId).length, 0);
  return count * TOPIC_CAPACITY;
}

export function isNativeLanguageQuestion(question: LearnQuestion) {
  const subject = question.subject.toLowerCase();
  if (subject.includes("french")) {
    return /\b(?:que|quel|quelle|choisis|complète|lis|phrase|français|signifie|conversation)\b/i.test(question.prompt)
      && !/^(which|what|choose|a learner)\b/i.test(question.prompt.trim());
  }
  if (subject.includes("twi") || subject.includes("ghanaian language")) {
    return /(?:ɛ|ɔ|asɛmfua|kasamu|mmuae|kyerɛ|twi|kenkan|paw|wopɛ)/i.test(question.prompt)
      && !/^(which|what|choose|a learner)\b/i.test(question.prompt.trim());
  }
  return true;
}

export function buildSchoolLanguageQuestions(
  config: SessionConfig,
  requestedCount = config.count,
  seed = config.seed ?? Date.now(),
): LearnQuestion[] {
  const requested = Math.max(0, Math.min(500, Math.floor(requestedCount)));
  if (!requested) return [];
  const selection = resolveCatalogSelection(config);
  if (!selection.level) return [];

  const ids = config.subjectId === "all"
    ? selection.level.subjects.filter((subject) => languageSubject(subject.id)).map((subject) => subject.id)
    : languageSubject(config.subjectId) ? [config.subjectId] : [];
  if (!ids.length) return [];

  const available = families(config);
  const output: LearnQuestion[] = [];
  const prompts = new Set<string>();

  for (let position = 0; output.length < requested && position < requested * 24; position += 1) {
    const subjectId = ids[position % ids.length];
    const local = { ...config, subjectId };
    const family = available[(position + hash(String(seed) + ":family")) % available.length];
    const question = subjectId === "french" ? french(local, family, position, seed) : twi(local, family, position, seed);
    if (!isNativeLanguageQuestion(question) || prompts.has(question.prompt)) continue;
    prompts.add(question.prompt);
    output.push(question);
  }
  return output;
}
