export type SchoolTopicBlueprint = { id: string; label: string };

type SubjectBlueprintMap = Record<string, readonly SchoolTopicBlueprint[]>;

function t(id: string, label: string): SchoolTopicBlueprint {
  return { id, label };
}

const languageProgression = {
  "basic-1": [
    t("oral-language", "Listening & speaking"),
    t("phonics", "Phonics & word recognition"),
    t("vocabulary", "Everyday vocabulary"),
    t("grammar", "Simple sentences & grammar"),
    t("reading", "Reading short texts"),
    t("writing", "Handwriting & sentence writing"),
  ],
  "basic-2": [
    t("oral-language", "Listening, speaking & retelling"),
    t("phonics", "Phonics, spelling & word families"),
    t("vocabulary", "Vocabulary in context"),
    t("grammar", "Sentence structure & grammar"),
    t("reading", "Reading comprehension"),
    t("writing", "Guided sentence & paragraph writing"),
  ],
  "basic-3": [
    t("oral-language", "Oral communication"),
    t("vocabulary", "Vocabulary & word meaning"),
    t("grammar", "Grammar & sentence building"),
    t("reading", "Reading comprehension"),
    t("writing", "Paragraph writing"),
    t("literature", "Stories, poems & response"),
  ],
  "basic-4": [
    t("oral-language", "Oral communication & presentation"),
    t("vocabulary", "Vocabulary & context clues"),
    t("grammar", "Grammar & sentence structure"),
    t("reading", "Reading comprehension & main ideas"),
    t("writing", "Paragraph planning & writing"),
    t("literature", "Stories, poems & literary response"),
  ],
  "basic-5": [
    t("oral-language", "Speaking, listening & presentation"),
    t("vocabulary", "Vocabulary, synonyms & context"),
    t("grammar", "Grammar, concord & punctuation"),
    t("reading", "Reading inference & comprehension"),
    t("writing", "Composition & paragraph development"),
    t("literature", "Literature, theme & response"),
  ],
  "basic-6": [
    t("oral-language", "Oral presentation & discussion"),
    t("vocabulary", "Vocabulary & figurative language"),
    t("grammar", "Grammar, usage & editing"),
    t("reading", "Comprehension, inference & summary"),
    t("writing", "Composition, organisation & editing"),
    t("literature", "Literature, theme & interpretation"),
  ],
} as const;

const mathematicsProgression: Record<string, readonly SchoolTopicBlueprint[]> = {
  "basic-1": [
    t("number", "Counting, place value & number sense"),
    t("operations", "Addition & subtraction within 100"),
    t("patterns", "Simple patterns"),
    t("geometry", "Shapes & position"),
    t("measurement", "Length, time, money & comparison"),
    t("data", "Sorting, pictographs & simple data"),
  ],
  "basic-2": [
    t("number", "Place value & numbers to 1,000"),
    t("operations", "Addition & subtraction within 1,000"),
    t("multiplication-division", "Equal groups, multiplication & sharing"),
    t("fractions", "Halves, thirds & quarters"),
    t("geometry", "Shapes, symmetry & position"),
    t("measurement", "Length, mass, capacity, time & money"),
    t("data", "Tables, pictographs & data questions"),
  ],
  "basic-3": [
    t("number", "Place value & numbers to 10,000"),
    t("operations", "Four operations & mental strategies"),
    t("fractions", "Fractions of shapes & quantities"),
    t("patterns", "Number patterns & rules"),
    t("geometry", "2D and 3D shapes"),
    t("measurement", "Measurement, time & money"),
    t("data", "Collecting, representing & interpreting data"),
  ],
  "basic-4": [
    t("number", "Number & numeration to 100,000"),
    t("operations", "Multi-digit operations & estimation"),
    t("multiplication-division", "Multiplication & division strategies"),
    t("fractions-decimals", "Fractions & introductory decimals"),
    t("patterns", "Patterns & relationships"),
    t("geometry", "Shape, angles & spatial reasoning"),
    t("measurement", "Measurement, perimeter, time & money"),
    t("data", "Data collection, tables & graphs"),
  ],
  "basic-5": [
    t("number", "Whole numbers, place value & rounding"),
    t("operations", "Four operations & estimation"),
    t("fractions-decimals-percentages", "Fractions, decimals & percentages"),
    t("patterns", "Patterns, rules & relationships"),
    t("geometry", "Geometry, angles & symmetry"),
    t("measurement", "Measurement, perimeter & area"),
    t("data-chance", "Data interpretation & chance"),
  ],
  "basic-6": [
    t("number", "Number systems, place value & rounding"),
    t("operations", "Operations, factors, multiples & order"),
    t("fractions-decimals-percentages", "Fractions, decimals & percentages"),
    t("ratio-proportion", "Ratio & proportion"),
    t("patterns", "Patterns, relationships & algebra readiness"),
    t("geometry", "Geometry, symmetry & transformation"),
    t("measurement", "Measurement, area & volume"),
    t("data-chance", "Data analysis & probability"),
  ],
  "jhs-1": [
    t("number", "Number & numeration systems"),
    t("operations", "Number operations"),
    t("fractions-decimals-percentages", "Fractions, decimals & percentages"),
    t("ratio-proportion", "Ratios & proportion"),
    t("patterns", "Patterns & relations"),
    t("algebraic-expressions", "Algebraic expressions"),
    t("variables-equations", "Variables & equations"),
    t("geometry", "Shape & space"),
    t("measurement", "Measurement"),
    t("position-transformation", "Position & transformation"),
    t("data", "Data"),
    t("probability", "Chance & probability"),
  ],
  "jhs-2": [
    t("number", "Number & numeration systems"),
    t("operations", "Number operations & estimation"),
    t("fractions-decimals-percentages", "Fractions, decimals & percentages"),
    t("ratio-proportion", "Ratio, rate & proportion"),
    t("patterns", "Patterns, relations & sequences"),
    t("algebraic-expressions", "Algebraic expressions"),
    t("variables-equations", "Variables, equations & inequalities"),
    t("geometry", "Shape, space & angle reasoning"),
    t("measurement", "Measurement & mensuration"),
    t("position-transformation", "Position & transformation"),
    t("data", "Data representation & analysis"),
    t("probability", "Chance & probability"),
  ],
  "jhs-3": [
    t("number", "Number systems & quantitative reasoning"),
    t("operations", "Number operations & problem solving"),
    t("fractions-decimals-percentages", "Fractions, decimals & percentages"),
    t("ratio-proportion", "Ratio, proportion & rates"),
    t("patterns", "Patterns, relations & sequences"),
    t("algebraic-expressions", "Algebraic expressions & factorisation"),
    t("variables-equations", "Variables, equations & modelling"),
    t("geometry", "Geometry & spatial reasoning"),
    t("measurement", "Measurement & mensuration"),
    t("position-transformation", "Position & transformation"),
    t("data", "Statistics & data interpretation"),
    t("probability", "Probability & chance"),
  ],
};

const scienceProgression: Record<string, readonly SchoolTopicBlueprint[]> = {
  "basic-1": [
    t("living-things", "Living and non-living things"),
    t("materials", "Everyday materials"),
    t("body-health", "My body, senses & health"),
    t("environment", "Home, school & environment"),
    t("forces-energy", "Light, sound & simple movement"),
    t("inquiry", "Observing, sorting & asking questions"),
  ],
  "basic-2": [
    t("living-things", "Plants, animals & their needs"),
    t("materials", "Materials and their properties"),
    t("body-health", "Body care, food & health"),
    t("earth-sky", "Weather, earth & sky"),
    t("forces-energy", "Pushes, pulls, light & sound"),
    t("inquiry", "Observation, comparison & simple investigation"),
  ],
  "basic-3": [
    t("living-things", "Life cycles & living systems"),
    t("materials", "Materials, mixtures & changes"),
    t("body-health", "Human body, nutrition & health"),
    t("earth-sky", "Earth, weather & sky"),
    t("forces-energy", "Heat, light, force & motion"),
    t("environment", "Environment & responsible use"),
    t("inquiry", "Fair tests, measurement & evidence"),
  ],
  "basic-4": [
    t("materials-mixtures", "Materials, mixtures & separation"),
    t("earth-sky", "Objects in the sky & earth systems"),
    t("living-things", "Living things, life cycles & habitats"),
    t("body-health", "Human body, nutrition & health"),
    t("forces-energy", "Force, heat, light & energy"),
    t("environment", "Environment, resources & sanitation"),
    t("inquiry", "Scientific observation, measurement & investigation"),
  ],
  "basic-5": [
    t("materials-changes", "Matter, mixtures & changes"),
    t("earth-space", "Earth, weather & space"),
    t("living-systems", "Plant, animal & human systems"),
    t("forces-energy", "Forces, electricity & energy"),
    t("environment", "Ecosystems, resources & sustainability"),
    t("inquiry", "Variables, measurement & scientific evidence"),
  ],
  "basic-6": [
    t("matter", "Matter, particles & material change"),
    t("earth-space", "Earth systems, weather & space"),
    t("living-systems", "Living systems, reproduction & health"),
    t("forces-energy", "Forces, electricity, energy & machines"),
    t("environment", "Ecosystems, resources & human impact"),
    t("inquiry", "Investigation, data & scientific explanation"),
  ],
  "jhs-1": [
    t("diversity-matter", "Diversity of matter"),
    t("cycles", "Cycles"),
    t("systems", "Systems"),
    t("forces-energy", "Forces & energy"),
    t("humans-environment", "Humans & the environment"),
    t("inquiry", "Science process, practical work & evidence"),
  ],
  "jhs-2": [
    t("diversity-matter", "Matter, materials & chemical change"),
    t("cycles", "Biological & earth cycles"),
    t("systems", "Living, electrical & mechanical systems"),
    t("forces-energy", "Force, motion & energy"),
    t("humans-environment", "Health, ecosystems & environment"),
    t("inquiry", "Investigation, variables, data & evaluation"),
  ],
  "jhs-3": [
    t("diversity-matter", "Matter, reactions & materials"),
    t("cycles", "Cycles & continuity"),
    t("systems", "Integrated biological and physical systems"),
    t("forces-energy", "Force, energy & quantitative reasoning"),
    t("humans-environment", "Human health, resources & environment"),
    t("inquiry", "Experimental design, data & scientific argument"),
  ],
};

const computingProgression: Record<string, readonly SchoolTopicBlueprint[]> = {
  "basic-4": [
    t("computer-parts", "Computer parts & technology tools"),
    t("input-output", "Input, output & storage devices"),
    t("files-folders", "Files, folders & basic operations"),
    t("digital-safety", "Safe and responsible technology use"),
    t("productivity", "Basic digital productivity"),
  ],
  "basic-5": [
    t("presentations", "PowerPoint presentations"),
    t("documents", "Documents, formatting & productivity"),
    t("files-folders", "File management"),
    t("internet", "Internet use & information searching"),
    t("digital-safety", "Digital safety, privacy & responsibility"),
  ],
  "basic-6": [
    t("networks", "Computer networks"),
    t("internet", "Internet facilities & online services"),
    t("productivity", "Digital productivity & collaboration"),
    t("data", "Data, tables & digital information"),
    t("coding", "Computational thinking & introductory coding"),
    t("digital-safety", "Cyber safety, privacy & responsible use"),
  ],
  "jhs-1": [
    t("systems", "Computer systems & architecture"),
    t("productivity", "Productivity software"),
    t("internet", "Internet & networks"),
    t("coding", "Computational thinking & programming"),
    t("data", "Data & information"),
    t("digital-safety", "Cyber safety & digital citizenship"),
  ],
  "jhs-2": [
    t("systems", "Computer systems & troubleshooting"),
    t("productivity", "Advanced productivity & collaboration"),
    t("internet", "Networking & internet services"),
    t("coding", "Programming, algorithms & debugging"),
    t("data", "Data representation & databases"),
    t("digital-safety", "Cybersecurity & privacy"),
  ],
  "jhs-3": [
    t("systems", "Computer systems, maintenance & emerging technology"),
    t("productivity", "Digital productivity & project work"),
    t("internet", "Networks, services & connectivity"),
    t("coding", "Programming, algorithms & problem solving"),
    t("data", "Data management & interpretation"),
    t("digital-safety", "Cybersecurity, ethics & digital citizenship"),
  ],
};

const commonSubjectProgressions: Record<string, Record<string, readonly SchoolTopicBlueprint[]>> = {
  history: {
    "basic-1": [t("self-family", "Myself, family & past"), t("community", "My community"), t("heritage", "Stories, symbols & heritage"), t("time", "Past, present & sequence")],
    "basic-2": [t("family-community", "Family & community history"), t("leaders", "Important people & leaders"), t("heritage", "Ghanaian heritage & symbols"), t("evidence", "Pictures, objects & oral evidence")],
    "basic-3": [t("community-history", "Community history"), t("migration-settlement", "Migration & settlement stories"), t("leaders", "Traditional and national leaders"), t("heritage", "Heritage sites, symbols & festivals"), t("evidence", "Historical evidence & timelines")],
    "basic-4": [t("ghana-origins", "Origins, peoples & settlement in Ghana"), t("kingdoms", "States, kingdoms & traditional authority"), t("heritage", "Heritage, culture & historical sites"), t("contact", "Early contact, trade & change"), t("evidence", "Timelines, sources & historical interpretation")],
    "basic-5": [t("precolonial", "Pre-colonial Ghanaian societies"), t("trade-contact", "Trade, contact & social change"), t("colonial", "Colonial rule & resistance"), t("leaders", "Leaders, reformers & national identity"), t("evidence", "Sources, chronology & cause")],
    "basic-6": [t("colonial", "Colonial rule & nationalist movements"), t("independence", "Independence & nation building"), t("leaders", "National leaders & civic legacy"), t("ghana-change", "Ghana through social and economic change"), t("evidence", "Sources, cause, consequence & continuity")],
  },
  rme: {
    "basic-1": [t("creation", "Creation & gratitude"), t("worship", "Simple forms of worship"), t("values", "Respect, kindness & honesty"), t("family", "Family and community responsibility")],
    "basic-2": [t("creator", "God, creation & care"), t("worship", "Prayer, worship & religious practices"), t("leaders", "Religious leaders & examples"), t("values", "Truthfulness, respect & responsibility")],
    "basic-3": [t("faith-leaders", "Faithful leaders & their examples"), t("worship", "Worship & religious practices"), t("values", "Obedience, honesty & compassion"), t("community", "Peace, cooperation & community life")],
    "basic-4": [t("worship", "Forms and meaning of worship"), t("religious-practices", "Christian, Islamic & Traditional religious practices"), t("leaders", "Religious leaders & moral lessons"), t("values", "Respect, humility, unity & gratitude"), t("community", "Religious diversity & peaceful living")],
    "basic-5": [t("identity", "Uniqueness, purpose & personal values"), t("worship", "Religious practice & commitment"), t("moral-decisions", "Moral choices & consequences"), t("community", "Tolerance, service & peaceful coexistence")],
    "basic-6": [t("belief-practice", "Belief, worship & religious responsibility"), t("leaders", "Religious leadership & moral example"), t("moral-decisions", "Ethical choices, rights & responsibility"), t("community", "Tolerance, conflict resolution & service")],
  },
  pe: {
    "basic-1": [t("movement", "Basic movement skills"), t("games", "Simple games"), t("fitness", "Active play & fitness"), t("safety", "Movement safety")],
    "basic-2": [t("movement", "Movement, balance & coordination"), t("games", "Games and ball skills"), t("fitness", "Fitness through active play"), t("safety", "Safe participation")],
    "basic-3": [t("movement", "Locomotor and non-locomotor skills"), t("games", "Throwing, catching & games"), t("gymnastics", "Basic gymnastics"), t("fitness", "Fitness & healthy activity"), t("safety", "Equipment and activity safety")],
    "basic-4": [t("movement", "Speed, force, balance & movement quality"), t("games", "Ball skills, games & teamwork"), t("gymnastics", "Gymnastics & body control"), t("fitness", "Fitness, endurance & flexibility"), t("safety", "Safety and responsible participation")],
    "basic-5": [t("movement", "Movement combinations & coordination"), t("games", "Games, rules & tactics"), t("fitness", "Fitness components & conditioning"), t("safety", "Sports equipment safety & injury prevention"), t("teamwork", "Teamwork & fair play")],
    "basic-6": [t("movement", "Advanced movement & coordination"), t("games", "Games, tactics & officiating"), t("fitness", "Fitness planning & healthy lifestyle"), t("safety", "Injury prevention & first response"), t("teamwork", "Leadership, teamwork & fair play")],
  },
};

function languageTopics(levelId: string) {
  return languageProgression[levelId as keyof typeof languageProgression];
}

function primaryCreativeArts(levelId: string): readonly SchoolTopicBlueprint[] {
  const advanced = ["basic-5", "basic-6"].includes(levelId);
  return [
    t("visual-elements", advanced ? "Visual elements, design & composition" : "Line, shape, colour & visual design"),
    t("materials-techniques", advanced ? "Materials, tools & creative techniques" : "Materials, tools & techniques"),
    t("music", advanced ? "Music, rhythm, notation & performance" : "Music, rhythm & singing"),
    t("drama-dance", advanced ? "Drama, dance & performance" : "Drama, movement & dance"),
    t("appreciation", advanced ? "Art appreciation, critique & cultural meaning" : "Appreciation, culture & creative response"),
  ];
}

function ghanaianLanguageTopics(levelId: string): readonly SchoolTopicBlueprint[] {
  const upper = ["basic-4", "basic-5", "basic-6"].includes(levelId);
  return [
    t("oral", upper ? "Oral communication, proverbs & storytelling" : "Listening, speaking & storytelling"),
    t("vocabulary", "Vocabulary & word use"),
    t("grammar", upper ? "Grammar & language structures" : "Basic grammar & sentence building"),
    t("reading", upper ? "Reading comprehension & interpretation" : "Reading & comprehension"),
    t("writing", upper ? "Writing, composition & editing" : "Writing words and sentences"),
    t("culture", "Culture, customs & oral literature"),
  ];
}

function frenchTopics(levelId: string): readonly SchoolTopicBlueprint[] {
  const upper = ["basic-5", "basic-6", "jhs-1", "jhs-2", "jhs-3"].includes(levelId);
  return [
    t("listening-speaking", "Listening & speaking"),
    t("vocabulary", upper ? "Vocabulary in everyday contexts" : "Greetings & everyday vocabulary"),
    t("grammar", upper ? "Grammar & sentence structures" : "Simple sentence patterns"),
    t("reading", "Reading comprehension"),
    t("writing", upper ? "Guided writing & communication" : "Words and short sentences"),
    ...(levelId.startsWith("jhs-") ? [t("culture", "Francophone culture & communication")] : []),
  ];
}

function jhsSubjectTopics(subjectId: string): readonly SchoolTopicBlueprint[] | undefined {
  if (subjectId === "english") return [
    t("oral-language", "Oral language & communication"),
    t("reading", "Reading comprehension & inference"),
    t("vocabulary", "Vocabulary & language use"),
    t("grammar", "Grammar, structure & usage"),
    t("writing", "Writing, composition & editing"),
    t("literature", "Literature & critical response"),
  ];
  if (subjectId === "social") return [
    t("environment", "Environment, resources & sustainability"),
    t("identity-society", "Identity, culture & socialisation"),
    t("governance", "Governance, democracy & citizenship"),
    t("development", "Development, work & national progress"),
    t("global", "Ghana, Africa & the wider world"),
    t("evidence", "Social inquiry, evidence & decision making"),
  ];
  if (subjectId === "pe-health") return [
    t("movement", "Movement skills & performance"),
    t("fitness", "Fitness, training & healthy living"),
    t("games-sport", "Games, sport, rules & tactics"),
    t("health-safety", "Health, safety & injury prevention"),
    t("leadership", "Teamwork, leadership & fair play"),
  ];
  if (subjectId === "creative-arts-design") return [
    t("visual-design", "Visual art & design"),
    t("music", "Music & sound"),
    t("drama-dance", "Drama, dance & performance"),
    t("materials", "Materials, tools & production"),
    t("criticism", "Appreciation, critique & cultural meaning"),
  ];
  if (subjectId === "career-technology") return [
    t("design-problem-solving", "Design & problem solving"),
    t("materials-tools", "Materials, tools & workshop practice"),
    t("food-home", "Food and home technology"),
    t("enterprise", "Enterprise, careers & production"),
    t("safety-sustainability", "Safety, maintenance & sustainability"),
  ];
  if (subjectId === "rme") return [
    t("beliefs", "Religious beliefs & sacred traditions"),
    t("worship", "Worship & religious practice"),
    t("leaders", "Religious leaders & moral example"),
    t("ethics", "Moral decision making & values"),
    t("peace", "Tolerance, peace & responsible citizenship"),
  ];
  if (subjectId === "ghanaian-language") return [
    t("oral", "Oral communication & oral literature"),
    t("vocabulary", "Vocabulary & idiomatic expression"),
    t("grammar", "Grammar & language structures"),
    t("reading", "Reading comprehension & interpretation"),
    t("writing", "Writing, composition & editing"),
    t("culture", "Culture, customs & literary response"),
  ];
  if (subjectId === "arabic") return [
    t("listening-speaking", "Listening & speaking"),
    t("reading", "Reading & comprehension"),
    t("vocabulary", "Vocabulary"),
    t("grammar", "Grammar & sentence structure"),
    t("writing", "Writing & composition"),
    t("culture", "Language in cultural context"),
  ];
  return undefined;
}

export function topicsForSchoolLevel(
  levelId: string,
  subjectId: string,
  fallback: readonly SchoolTopicBlueprint[],
): SchoolTopicBlueprint[] {
  if (subjectId === "mathematics" && mathematicsProgression[levelId]) return [...mathematicsProgression[levelId]];
  if (subjectId === "english" && languageTopics(levelId)) return [...languageTopics(levelId)!];
  if (subjectId === "science" && scienceProgression[levelId]) return [...scienceProgression[levelId]];
  if (subjectId === "computing" && computingProgression[levelId]) return [...computingProgression[levelId]];

  if (subjectId === "ghanaian-language" && levelId.startsWith("basic-")) return [...ghanaianLanguageTopics(levelId)];
  if (subjectId === "creative-arts" && levelId.startsWith("basic-")) return [...primaryCreativeArts(levelId)];
  if (subjectId === "french" && (levelId.startsWith("basic-") || levelId.startsWith("jhs-"))) return [...frenchTopics(levelId)];

  const subjectMap = commonSubjectProgressions[subjectId];
  if (subjectMap?.[levelId]) return [...subjectMap[levelId]];

  if (levelId.startsWith("jhs-")) {
    const mapped = jhsSubjectTopics(subjectId);
    if (mapped) return [...mapped];
  }

  return fallback.map((topic) => ({ id: topic.id, label: topic.label }));
}
