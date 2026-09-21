import type { CatalogLevel, CatalogProgram, CatalogSubject, CatalogTopic } from "./learn-domain";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultTopicsForCourse(label: string) {
  const value = label.toLowerCase();

  if (/contract/.test(value)) return ["Offer & acceptance", "Consideration & intention", "Terms & interpretation", "Breach & discharge", "Remedies & case analysis"];
  if (/constitutional/.test(value)) return ["Constitutional structure", "Separation of powers", "Fundamental rights", "Judicial review", "Constitutional interpretation"];
  if (/criminal/.test(value)) return ["Elements of offences", "Actus reus & mens rea", "Defences", "Participation & liability", "Criminal case analysis"];
  if (/tort/.test(value)) return ["Duty of care", "Breach & standard of care", "Causation & remoteness", "Defences", "Damages & remedies"];
  if (/land law|property/.test(value)) return ["Interests in land", "Title & ownership", "Transfers & registration", "Land use & obligations", "Disputes & remedies"];
  if (/company|commercial law|business law/.test(value)) return ["Legal personality & formation", "Governance & duties", "Commercial transactions", "Liability & compliance", "Disputes & remedies"];
  if (/evidence|procedure|jurisprudence|legal systems|legal research/.test(value)) return ["Legal method & reasoning", "Authority & precedent", "Procedure & proof", "Case analysis", "Legal research & writing"];
  if (/law/.test(value)) return ["Legal method & reasoning", "Rights, duties & liability", "Procedure & proof", "Case analysis", "Remedies & legal research"];

  if (/data structures|algorithm/.test(value)) return ["Arrays, lists & sequences", "Stacks, queues & hashing", "Trees & graphs", "Searching & sorting", "Complexity & algorithm design"];
  if (/object-oriented/.test(value)) return ["Classes & objects", "Encapsulation", "Inheritance", "Polymorphism", "Design & testing"];
  if (/programming|coding/.test(value)) return ["Variables & data types", "Control flow", "Functions & modularity", "Data structures", "Debugging & testing"];
  if (/database/.test(value)) return ["Data modelling", "Relational design", "SQL queries", "Transactions & integrity", "Database security & optimisation"];
  if (/operating system/.test(value)) return ["Processes & threads", "Memory management", "File systems", "Scheduling & concurrency", "Security & resource management"];
  if (/computer architecture|computer systems|hardware|microprocessor|embedded/.test(value)) return ["Digital representation", "CPU & instruction execution", "Memory & storage", "Input/output & interfaces", "Embedded systems & performance"];
  if (/network|data communication/.test(value)) return ["Network models & protocols", "Addressing & subnetting", "Routing & switching", "Performance & troubleshooting", "Network security"];
  if (/cyber|information security/.test(value)) return ["Security principles", "Authentication & access control", "Cryptography", "Network & application security", "Risk, incidents & governance"];
  if (/web|mobile application|digital transformation|enterprise systems/.test(value)) return ["Application architecture", "User interfaces", "Data & APIs", "Security & deployment", "Testing & maintenance"];
  if (/artificial intelligence|machine learning|data mining/.test(value)) return ["Problem representation", "Learning & inference", "Data preparation", "Model evaluation", "Ethics & deployment"];
  if (/cloud|distributed/.test(value)) return ["Distributed architecture", "Virtualisation & containers", "Storage & networking", "Scalability & reliability", "Security & operations"];
  if (/computer|information technology|digital/.test(value)) return ["Programming & algorithms", "Data & databases", "Networks & cybersecurity", "Computer systems", "Software & digital services"];

  if (/calculus/.test(value)) return ["Functions & limits", "Differentiation", "Applications of derivatives", "Integration", "Applications of integration"];
  if (/linear algebra/.test(value)) return ["Vectors", "Matrices & systems", "Determinants", "Vector spaces", "Linear transformations"];
  if (/probability/.test(value)) return ["Probability rules", "Random variables", "Probability distributions", "Expectation & variance", "Conditional probability"];
  if (/statistics|regression|econometrics|biostatistics/.test(value)) return ["Descriptive statistics", "Probability & distributions", "Sampling & estimation", "Hypothesis testing", "Regression & data interpretation"];
  if (/mathematics|quantitative/.test(value)) return ["Algebra & equations", "Functions & modelling", "Geometry & measurement", "Statistics, probability & data", "Percentages & financial mathematics"];

  if (/anatomy/.test(value)) return ["Anatomical terminology", "Cells, tissues & organisation", "Musculoskeletal system", "Organ systems", "Applied anatomy"];
  if (/physiology/.test(value)) return ["Cell physiology", "Cardiovascular physiology", "Respiratory physiology", "Renal & endocrine regulation", "Homeostasis & integration"];
  if (/biochemistry/.test(value)) return ["Biomolecules", "Enzymes", "Metabolism", "Molecular biology", "Biochemical analysis"];
  if (/microbiology/.test(value)) return ["Microbial structure", "Growth & genetics", "Pathogenesis", "Host defence", "Laboratory identification"];
  if (/immunology/.test(value)) return ["Innate immunity", "Adaptive immunity", "Antibodies & lymphocytes", "Immune disorders", "Vaccines & immunological tests"];
  if (/pathology/.test(value)) return ["Cell injury & adaptation", "Inflammation & repair", "Haemodynamic disorders", "Neoplasia", "Systemic pathology"];
  if (/pharmacology/.test(value)) return ["Pharmacokinetics", "Pharmacodynamics", "Drug classes & mechanisms", "Adverse effects & interactions", "Safe prescribing"];
  if (/therapeutic/.test(value)) return ["Clinical assessment", "Treatment selection", "Dose & monitoring", "Adverse effects & interactions", "Evidence-based therapeutics"];
  if (/nursing/.test(value)) return ["Assessment & care planning", "Patient safety", "Clinical procedures", "Communication & ethics", "Evaluation of care"];
  if (/public health|epidemiology|community health|health policy|global health|occupational health/.test(value)) return ["Population health measures", "Study designs & surveillance", "Prevention & health promotion", "Health systems & policy", "Data interpretation & evaluation"];
  if (/medicine|surgery|paediatric|obstetric|gynaecology|psychiatry|clinical|emergency|family medicine/.test(value)) return ["Clinical assessment", "Diagnosis & differential reasoning", "Investigations", "Management & treatment", "Safety, ethics & follow-up"];
  if (/pharmacy|pharmaceutic|pharmacognosy|medicinal chemistry/.test(value)) return ["Medicines & formulation", "Drug action & disposition", "Quality & safety", "Patient-centred use", "Pharmacy practice & regulation"];
  if (/biology|genetic|molecular biology|cell biology|human biology/.test(value)) return ["Cells & organisation", "Physiology", "Genetics & inheritance", "Ecology & evolution", "Scientific investigation"];
  if (/chemistry/.test(value)) return ["Quantitative chemistry & reactions", "Atomic structure & bonding", "Acids, bases & solutions", "Organic chemistry", "Laboratory analysis"];

  if (/thermodynamic|heat transfer|energy systems/.test(value)) return ["Properties & state", "Energy balances", "First & second laws", "Heat transfer processes", "Engineering applications"];
  if (/fluid|hydraulic|water resource/.test(value)) return ["Fluid properties", "Pressure & statics", "Flow & continuity", "Energy & momentum", "Pipes, channels & applications"];
  if (/mechanic|dynamics|mechanics of materials/.test(value)) return ["Forces & equilibrium", "Motion & dynamics", "Stress & strain", "Energy & momentum", "Engineering problem solving"];
  if (/circuit|electric|electronic|power|signal|control/.test(value)) return ["Circuit quantities", "DC & AC analysis", "Signals & systems", "Control & feedback", "Power, safety & applications"];
  if (/structural|concrete|foundation|soil|geotechnical/.test(value)) return ["Loads & equilibrium", "Materials & stress", "Structural analysis", "Design & safety", "Construction & field application"];
  if (/survey|transportation|highway|construction/.test(value)) return ["Measurement & field data", "Planning & design", "Materials & methods", "Analysis & safety", "Project delivery"];
  if (/drawing|architecture|design studio|building/.test(value)) return ["Technical drawing & scale", "Materials & construction", "Design principles", "Systems & services", "Project evaluation"];
  if (/engineering|robotic|mechatronic|manufactur/.test(value)) return ["Mechanics & motion", "Electricity, circuits & power", "Materials & structures", "Engineering drawing & scale", "Systems & design"];

  if (/financial accounting|financial reporting|accounting/.test(value)) return ["Accounting equation & double entry", "Adjustments & accruals", "Financial statements", "Analysis & interpretation", "Controls, ethics & reporting"];
  if (/audit/.test(value)) return ["Audit planning", "Risk & internal control", "Audit evidence", "Testing & procedures", "Reporting & ethics"];
  if (/tax/.test(value)) return ["Tax principles", "Taxable income", "Computation & rates", "Compliance & administration", "Planning & ethics"];
  if (/finance|investment|bank|portfolio|derivative|risk/.test(value)) return ["Time value of money", "Risk & return", "Valuation", "Financing & capital structure", "Investment & portfolio decisions"];
  if (/economics|microeconom|macroeconom|monetary|international economics|labour economics|development economics/.test(value)) return ["Scarcity & opportunity cost", "Demand, supply & markets", "Elasticity & incentives", "Macroeconomic indicators", "Policy & economic analysis"];
  if (/marketing|consumer|advertising|brand|retail|sales/.test(value)) return ["Customers & markets", "Segmentation & positioning", "Marketing mix", "Research & analytics", "Strategy & digital channels"];
  if (/human resource|organisational behaviour|leadership|change management|talent|performance management/.test(value)) return ["People & organisations", "Recruitment & development", "Performance & reward", "Leadership & change", "Employment relations & analytics"];
  if (/procurement|logistics|inventory|supply chain|purchasing|sourcing/.test(value)) return ["Procurement cycle", "Supplier & contract management", "Inventory & logistics", "Operations & supply networks", "Risk, sustainability & analytics"];
  if (/management|entrepreneur|operations|strategy|project management/.test(value)) return ["Planning & decision making", "Organising & operations", "Leadership & people", "Control & performance", "Strategy & enterprise"];
  if (/business/.test(value)) return ["Accounting & financial analysis", "Markets & economic decisions", "Management & operations", "Customers & marketing", "Strategy & enterprise"];

  if (/psycholog|cognitive|personality|counsell|neuropsych/.test(value)) return ["Biological & cognitive processes", "Learning & development", "Personality & individual differences", "Social & clinical behaviour", "Research methods & ethics"];
  if (/politic|governance|international relation|public policy|public administration|security studies|foreign policy/.test(value)) return ["Political ideas & institutions", "Governance & public administration", "Comparative & national politics", "International relations", "Policy, participation & evidence"];
  if (/sociolog|social theory|population|gender|criminology/.test(value)) return ["Social theory", "Institutions & culture", "Inequality & stratification", "Population & social change", "Research & applied sociology"];
  if (/journalism|media|communication|public relations|broadcast|advertising/.test(value)) return ["Communication theory", "Writing & storytelling", "Media production", "Audiences, law & ethics", "Digital strategy & research"];
  if (/education|teaching|curriculum|pedagogy|classroom|assessment/.test(value)) return ["Learning & development", "Curriculum & planning", "Teaching & inclusion", "Assessment & feedback", "Professional practice & research"];
  if (/agricultur|crop|animal|soil|farm|fisher|agribusiness/.test(value)) return ["Soil & crop systems", "Animal systems", "Farm technology & operations", "Agribusiness & economics", "Sustainability & research"];
  if (/hospitality|tourism|hotel|food production|event|destination/.test(value)) return ["Guest & service operations", "Food safety & production", "Tourism & destinations", "Revenue, marketing & events", "Quality, sustainability & management"];
  if (/art|design|music|drama|dance|textile|sculpt|visual/.test(value)) return ["Elements & principles", "Materials & techniques", "Creation & performance", "Interpretation & criticism", "Production & presentation"];
  if (/english|literature|french|communication|writing|language|academic writing/.test(value)) return ["Language foundations", "Reading & interpretation", "Writing & communication", "Applied language", "Critical analysis"];
  if (/research|methodology|project|capstone|thesis/.test(value)) return ["Research design", "Sampling & evidence", "Variables & measurement", "Data interpretation", "Evaluation & conclusions"];

  return [
    `${label}: key ideas`,
    `${label}: methods & processes`,
    `${label}: application & problem solving`,
    `${label}: evidence & interpretation`,
    `${label}: review & professional practice`,
  ];
}

function mappedCourse(label: string, topicLabels?: string[]): CatalogSubject {
  const topics = (topicLabels?.length ? topicLabels : defaultTopicsForCourse(label)).map(
    (topic): CatalogTopic => ({ id: slug(topic), label: topic }),
  );
  return { id: slug(label), label, topics };
}

function readyCourse(id: string, label: string, topics: Array<[string, string]>): CatalogSubject {
  return {
    id,
    label,
    topics: topics.map(([topicId, topicLabel]) => ({ id: topicId, label: topicLabel })),
  };
}

function mappedLevel(id: string, label: string, courses: string[]): CatalogLevel {
  return { id, label, subjects: courses.map((course) => mappedCourse(course)) };
}

function pathway(id: string, label: string, description: string, electiveSubjects: string[]): CatalogProgram {
  const core = ["English Language", "Core Mathematics", "Integrated Science", "Social Studies"];
  const subjects = [...core, ...electiveSubjects];
  return {
    id,
    label,
    description,
    levels: [
      { id: "shs-1", label: "SHS 1", subjects: subjects.map((subject) => mappedCourse(subject)) },
      { id: "shs-2", label: "SHS 2", subjects: subjects.map((subject) => mappedCourse(subject)) },
      { id: "shs-3", label: "SHS 3", subjects: subjects.map((subject) => mappedCourse(subject)) },
    ],
  };
}

/**
 * Popular SHS pathways are presented as navigation aids, not rigid national
 * programme rules. NaCCA's current secondary subject-combination guidance
 * allows schools to contextualise combinations based on capacity and learner
 * pathways, so these groupings stay flexible in the UI.
 */
export const SHS_PROGRAMS: CatalogProgram[] = [
  pathway(
    "shs-general-science",
    "General Science",
    "Science pathway with strong mathematics and laboratory-science emphasis.",
    ["Elective Mathematics", "Physics", "Chemistry", "Biology", "Computing"],
  ),
  pathway(
    "shs-general-arts",
    "General Arts",
    "Humanities and social-science pathway with flexible subject combinations.",
    ["Economics", "Government", "Geography", "History", "Literature in English", "French", "Religious & Moral Education"],
  ),
  pathway(
    "shs-business",
    "Business",
    "Business pathway covering accounting, management, economics and quantitative skills.",
    ["Financial Accounting", "Business Management", "Economics", "Cost Accounting", "Elective Mathematics", "ICT"],
  ),
  pathway(
    "shs-visual-arts",
    "Visual Arts",
    "Creative pathway spanning design, studio practice and material-based art disciplines.",
    ["General Knowledge in Art", "Graphic Design", "Picture Making", "Sculpture", "Textiles", "Ceramics", "Leatherwork", "Basketry"],
  ),
  pathway(
    "shs-home-economics",
    "Home Economics",
    "Applied living-science pathway covering food, textiles and family-resource management.",
    ["Food & Nutrition", "Clothing & Textiles", "Management in Living", "Biology", "Chemistry"],
  ),
  pathway(
    "shs-agriculture",
    "Agriculture",
    "Agriculture pathway from crop and animal systems to soils, agribusiness and natural resources.",
    ["General Agriculture", "Crop Husbandry & Horticulture", "Animal Husbandry", "Soil Science", "Fisheries", "Agribusiness"],
  ),
  pathway(
    "shs-technical",
    "Technical",
    "Technical pathway for engineering drawing, electricity, electronics, construction and fabrication.",
    ["Technical Drawing", "Applied Electricity", "Electronics", "Building Construction", "Auto Mechanics", "Metalwork", "Woodwork", "Elective Mathematics"],
  ),
  pathway(
    "shs-stem",
    "STEM / Engineering",
    "Modern STEM pathway combining advanced mathematics, computing, engineering and design.",
    ["Additional Mathematics", "Physics", "Chemistry", "Computing", "Engineering", "Robotics", "Biomedical Science", "Aviation & Aerospace Engineering"],
  ),
  pathway(
    "shs-performing-arts",
    "Performing Arts",
    "Creative performance pathway for music, theatre, movement and production.",
    ["Music", "Drama", "Dance", "Performing Arts", "Design Communication Technology"],
  ),
];

type UniversitySpec = {
  id: string;
  label: string;
  description: string;
  duration?: 4 | 5 | 6;
  levels: Record<string, string[]>;
};

const UNIVERSITY_SPECS: UniversitySpec[] = [
  {
    id: "computer-science",
    label: "Computer Science",
    description: "Programming, algorithms, systems, data, networks, software engineering and intelligent computing.",
    levels: {
      "level-100": ["Programming", "Computer Networks", "Discrete Mathematics", "Calculus for Computing", "Computer Systems", "Academic Writing"],
      "level-200": ["Data Structures & Algorithms", "Object-Oriented Programming", "Database Systems", "Operating Systems", "Computer Architecture", "Probability & Statistics"],
      "level-300": ["Software Engineering", "Web & Mobile Development", "Artificial Intelligence", "Data Communications", "Theory of Computation", "Human-Computer Interaction"],
      "level-400": ["Machine Learning", "Distributed Systems", "Cybersecurity", "Cloud Computing", "Research Methods", "Final-Year Project"],
    },
  },
  {
    id: "information-technology",
    label: "Information Technology",
    description: "Applied computing, systems administration, databases, networking, web systems and enterprise technology.",
    levels: {
      "level-100": ["Introduction to IT", "Programming Fundamentals", "Computer Hardware", "Mathematics for IT", "Communication Skills"],
      "level-200": ["Database Systems", "Web Development", "Networking", "Systems Analysis & Design", "Operating Systems"],
      "level-300": ["Information Security", "Cloud & Virtualisation", "Enterprise Systems", "Mobile Applications", "IT Project Management"],
      "level-400": ["IT Governance", "Digital Transformation", "Advanced Networks", "Research Methods", "Capstone Project"],
    },
  },
  {
    id: "computer-engineering",
    label: "Computer Engineering",
    description: "Hardware, software, electronics, embedded systems, networks and computer architecture.",
    levels: {
      "level-100": ["Engineering Mathematics", "Programming", "Basic Electronics", "Engineering Drawing", "Physics for Engineers"],
      "level-200": ["Digital Logic", "Computer Architecture", "Circuit Theory", "Data Structures", "Signals & Systems"],
      "level-300": ["Microprocessors", "Embedded Systems", "Computer Networks", "Control Systems", "Operating Systems"],
      "level-400": ["VLSI & Digital Systems", "IoT Systems", "Advanced Embedded Design", "Engineering Project", "Professional Practice"],
    },
  },
  {
    id: "nursing",
    label: "Nursing",
    description: "Anatomy, physiology, nursing practice, pharmacology, medical-surgical care and community health.",
    levels: {
      "level-100": ["Anatomy & Physiology", "Fundamentals of Nursing", "Biochemistry", "Psychology for Health", "Communication in Healthcare"],
      "level-200": ["Medical-Surgical Nursing I", "Pharmacology", "Microbiology", "Nutrition", "Community Health Nursing I"],
      "level-300": ["Medical-Surgical Nursing II", "Maternal & Child Health", "Mental Health Nursing", "Community Health Nursing II", "Research Methods"],
      "level-400": ["Advanced Clinical Nursing", "Nursing Leadership", "Emergency & Critical Care", "Public Health Practice", "Research Project"],
    },
  },
  {
    id: "medicine",
    label: "Medicine (MBChB)",
    description: "Pre-clinical sciences, pathology, pharmacology and clinical rotations across major specialties.",
    duration: 6,
    levels: {
      "level-100": ["Human Anatomy", "Human Physiology", "Medical Biochemistry", "Cell Biology", "Communication Skills"],
      "level-200": ["Anatomy II", "Physiology II", "Biochemistry II", "Medical Genetics", "Community Health"],
      "level-300": ["Pathology", "Pharmacology", "Microbiology", "Immunology", "Clinical Skills"],
      "level-400": ["Internal Medicine", "Surgery", "Paediatrics", "Obstetrics & Gynaecology", "Public Health"],
      "level-500": ["Medicine Clerkship", "Surgery Clerkship", "Paediatrics Clerkship", "Psychiatry", "Emergency Medicine"],
      "level-600": ["Advanced Clinical Rotations", "Family Medicine", "Elective Rotation", "Clinical Research", "Professional Practice"],
    },
  },
  {
    id: "pharmacy",
    label: "Pharmacy (PharmD)",
    description: "Medicinal chemistry, pharmacology, pharmaceutics, therapeutics and patient-centred pharmacy practice.",
    duration: 6,
    levels: {
      "level-100": ["General Chemistry", "Organic Chemistry", "Human Biology", "Mathematics for Pharmacy", "Communication Skills"],
      "level-200": ["Pharmaceutics I", "Pharmaceutical Chemistry", "Physiology", "Microbiology", "Biostatistics"],
      "level-300": ["Pharmacology I", "Medicinal Chemistry", "Pharmacognosy", "Pharmaceutics II", "Pathophysiology"],
      "level-400": ["Clinical Pharmacy I", "Pharmacology II", "Therapeutics I", "Pharmacy Law & Ethics", "Public Health Pharmacy"],
      "level-500": ["Clinical Pharmacy II", "Therapeutics II", "Hospital Pharmacy", "Community Pharmacy", "Research Methods"],
      "level-600": ["Advanced Pharmacy Practice", "Clinical Rotations", "Pharmacovigilance", "Research Project", "Professional Practice"],
    },
  },
  {
    id: "law",
    label: "Law (LLB)",
    description: "Legal systems, constitutional law, contracts, criminal law, torts, property, commercial and public law.",
    levels: {
      "level-100": ["Legal Systems & Methods", "Constitutional Law I", "Law of Contract I", "Criminal Law I", "Legal Research & Writing"],
      "level-200": ["Constitutional Law II", "Law of Contract II", "Criminal Law II", "Law of Torts", "Land Law I"],
      "level-300": ["Commercial Law", "Company Law", "Public International Law", "Equity & Trusts", "Land Law II"],
      "level-400": ["Civil Procedure", "Criminal Procedure", "Evidence", "Alternative Dispute Resolution", "Intellectual Property", "Jurisprudence"],
    },
  },
  {
    id: "economics",
    label: "Economics",
    description: "Microeconomics, macroeconomics, quantitative methods, econometrics and applied policy fields.",
    levels: {
      "level-100": ["Principles of Microeconomics", "Principles of Macroeconomics", "Mathematics for Economists", "Statistics", "Economic History"],
      "level-200": ["Intermediate Microeconomics", "Intermediate Macroeconomics", "Econometrics I", "Public Finance", "Development Economics"],
      "level-300": ["Econometrics II", "Monetary Economics", "International Economics", "Labour Economics", "Environmental Economics"],
      "level-400": ["Advanced Microeconomics", "Advanced Macroeconomics", "Financial Economics", "Health Economics", "Research Project"],
    },
  },
  {
    id: "business",
    label: "Business Administration",
    description: "Management, accounting, marketing, finance, operations, entrepreneurship and strategy.",
    levels: {
      "level-100": ["Principles of Management", "Financial Accounting", "Business Mathematics", "Microeconomics", "Business Communication"],
      "level-200": ["Marketing Management", "Corporate Finance", "Human Resource Management", "Business Statistics", "Operations Management"],
      "level-300": ["Strategic Management", "Entrepreneurship", "Management Information Systems", "Business Law", "Research Methods"],
      "level-400": ["Corporate Strategy", "International Business", "Leadership & Change", "Business Analytics", "Capstone Project"],
    },
  },
  {
    id: "accounting",
    label: "Accounting",
    description: "Financial accounting, management accounting, taxation, auditing and corporate reporting.",
    levels: {
      "level-100": ["Financial Accounting I", "Business Mathematics", "Economics", "Business Law", "Communication Skills"],
      "level-200": ["Financial Accounting II", "Cost & Management Accounting", "Taxation I", "Business Statistics", "Accounting Information Systems"],
      "level-300": ["Financial Reporting", "Auditing I", "Taxation II", "Public Sector Accounting", "Corporate Finance"],
      "level-400": ["Advanced Financial Reporting", "Auditing II", "Strategic Management Accounting", "Corporate Governance", "Accounting Research"],
    },
  },
  {
    id: "finance",
    label: "Finance",
    description: "Corporate finance, investments, banking, financial markets, risk and quantitative finance.",
    levels: {
      "level-100": ["Principles of Finance", "Financial Accounting", "Economics", "Business Mathematics", "Statistics"],
      "level-200": ["Corporate Finance I", "Money & Banking", "Financial Markets", "Business Statistics II", "Investment Fundamentals"],
      "level-300": ["Corporate Finance II", "Investment Analysis", "Risk Management", "International Finance", "Financial Modelling"],
      "level-400": ["Portfolio Management", "Derivatives", "Bank Management", "Behavioural Finance", "Finance Project"],
    },
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Consumer behaviour, brand strategy, digital marketing, research and integrated communications.",
    levels: {
      "level-100": ["Principles of Marketing", "Management", "Economics", "Business Communication", "Statistics"],
      "level-200": ["Consumer Behaviour", "Marketing Research", "Sales Management", "Digital Marketing", "Business Law"],
      "level-300": ["Brand Management", "Integrated Marketing Communications", "Services Marketing", "Retail Marketing", "Analytics"],
      "level-400": ["Marketing Strategy", "International Marketing", "E-Commerce", "Research Project", "Campaign Planning"],
    },
  },
  {
    id: "human-resource-management",
    label: "Human Resource Management",
    description: "People management, organisational behaviour, labour relations, talent, reward and workforce strategy.",
    levels: {
      "level-100": ["Principles of Management", "Introduction to HRM", "Psychology", "Business Communication", "Economics"],
      "level-200": ["Organisational Behaviour", "Recruitment & Selection", "Training & Development", "Labour Law", "Statistics"],
      "level-300": ["Compensation & Benefits", "Performance Management", "Industrial Relations", "HR Analytics", "Research Methods"],
      "level-400": ["Strategic HRM", "Talent Management", "Leadership", "Change Management", "HR Project"],
    },
  },
  {
    id: "procurement-supply-chain",
    label: "Procurement & Supply Chain",
    description: "Procurement, logistics, inventory, operations, sourcing and supply-chain strategy.",
    levels: {
      "level-100": ["Introduction to Procurement", "Management", "Accounting", "Economics", "Business Mathematics"],
      "level-200": ["Purchasing Management", "Logistics", "Inventory Management", "Business Law", "Statistics"],
      "level-300": ["Strategic Sourcing", "Supply Chain Management", "Operations Management", "Contract Management", "Analytics"],
      "level-400": ["Global Supply Chains", "Sustainable Procurement", "Risk Management", "Negotiation", "Capstone Project"],
    },
  },
  {
    id: "civil-engineering",
    label: "Civil Engineering",
    description: "Structures, geotechnics, transportation, water, surveying and construction engineering.",
    levels: {
      "level-100": ["Engineering Mathematics", "Engineering Mechanics", "Engineering Drawing", "Physics", "Introduction to Civil Engineering"],
      "level-200": ["Structural Analysis I", "Fluid Mechanics", "Surveying", "Engineering Materials", "Soil Mechanics I"],
      "level-300": ["Reinforced Concrete Design", "Transportation Engineering", "Hydraulics", "Geotechnical Engineering", "Construction Management"],
      "level-400": ["Structural Design", "Foundation Engineering", "Highway Engineering", "Water Resources", "Final-Year Project"],
    },
  },
  {
    id: "mechanical-engineering",
    label: "Mechanical Engineering",
    description: "Mechanics, thermodynamics, fluids, machines, manufacturing, design and energy systems.",
    levels: {
      "level-100": ["Engineering Mathematics", "Engineering Mechanics", "Engineering Drawing", "Physics", "Workshop Practice"],
      "level-200": ["Thermodynamics I", "Fluid Mechanics I", "Mechanics of Materials", "Manufacturing Processes", "Dynamics"],
      "level-300": ["Machine Design", "Heat Transfer", "Fluid Mechanics II", "Control Engineering", "Engineering Materials"],
      "level-400": ["Advanced Machine Design", "Energy Systems", "Mechatronics", "Maintenance Engineering", "Final-Year Project"],
    },
  },
  {
    id: "electrical-electronic-engineering",
    label: "Electrical & Electronic Engineering",
    description: "Circuits, electronics, signals, power, control, communications and embedded systems.",
    levels: {
      "level-100": ["Engineering Mathematics", "Circuit Fundamentals", "Physics", "Programming", "Engineering Drawing"],
      "level-200": ["Circuit Theory", "Analogue Electronics", "Digital Electronics", "Signals & Systems", "Electromagnetics"],
      "level-300": ["Power Systems I", "Communication Systems", "Control Systems", "Microprocessors", "Electrical Machines"],
      "level-400": ["Power Systems II", "Digital Signal Processing", "Embedded Systems", "Renewable Energy", "Final-Year Project"],
    },
  },
  {
    id: "architecture",
    label: "Architecture",
    description: "Design studio, architectural history, construction technology, structures, environment and professional practice.",
    levels: {
      "level-100": ["Design Studio I", "Architectural Graphics", "History of Architecture", "Building Materials", "Visual Communication"],
      "level-200": ["Design Studio II", "Building Construction", "Structures", "Environmental Design", "Digital Design Tools"],
      "level-300": ["Design Studio III", "Urban Design", "Building Services", "Professional Studies", "Research Methods"],
      "level-400": ["Design Studio IV", "Sustainable Architecture", "Project Management", "Professional Practice", "Thesis / Design Project"],
    },
  },
  {
    id: "psychology",
    label: "Psychology",
    description: "Cognitive, developmental, social, biological and clinical perspectives with research methods.",
    levels: {
      "level-100": ["Introduction to Psychology", "Biological Bases of Behaviour", "Developmental Psychology", "Statistics", "Academic Writing"],
      "level-200": ["Cognitive Psychology", "Social Psychology", "Personality", "Research Methods", "Psychological Assessment"],
      "level-300": ["Abnormal Psychology", "Counselling Psychology", "Health Psychology", "Industrial Psychology", "Advanced Research Methods"],
      "level-400": ["Clinical Psychology", "Community Psychology", "Neuropsychology", "Ethics", "Research Project"],
    },
  },
  {
    id: "political-science",
    label: "Political Science",
    description: "Political theory, comparative politics, governance, public policy and international relations.",
    levels: {
      "level-100": ["Introduction to Political Science", "Political Theory", "Ghanaian Politics", "Academic Writing", "Statistics"],
      "level-200": ["Comparative Politics", "Public Administration", "International Relations", "Political Economy", "Research Methods"],
      "level-300": ["Public Policy", "African Politics", "International Organisations", "Political Parties & Elections", "Governance"],
      "level-400": ["Advanced Political Theory", "Security Studies", "Foreign Policy", "Democracy & Development", "Research Project"],
    },
  },
  {
    id: "sociology",
    label: "Sociology",
    description: "Social theory, institutions, inequality, development, research and contemporary social change.",
    levels: {
      "level-100": ["Introduction to Sociology", "Social Institutions", "Ghanaian Society", "Statistics", "Academic Writing"],
      "level-200": ["Classical Social Theory", "Sociology of Family", "Social Stratification", "Research Methods", "Population Studies"],
      "level-300": ["Development Sociology", "Sociology of Education", "Gender Studies", "Urban Sociology", "Criminology"],
      "level-400": ["Contemporary Social Theory", "Globalisation", "Social Policy", "Applied Sociology", "Research Project"],
    },
  },
  {
    id: "communication-media",
    label: "Communication & Media Studies",
    description: "Journalism, media production, strategic communication, digital media and communication research.",
    levels: {
      "level-100": ["Introduction to Communication", "Media Writing", "Communication Theory", "Digital Literacy", "Academic Writing"],
      "level-200": ["Journalism", "Public Relations", "Broadcast Production", "Media Law & Ethics", "Research Methods"],
      "level-300": ["Digital Media", "Strategic Communication", "Advertising", "Media Management", "Data Journalism"],
      "level-400": ["Communication Strategy", "Advanced Production", "Political Communication", "Media Research", "Capstone Project"],
    },
  },
  {
    id: "public-health",
    label: "Public Health",
    description: "Epidemiology, biostatistics, environmental health, health promotion and health systems.",
    levels: {
      "level-100": ["Introduction to Public Health", "Human Biology", "Health Communication", "Statistics", "Sociology of Health"],
      "level-200": ["Epidemiology I", "Biostatistics I", "Environmental Health", "Health Promotion", "Microbiology"],
      "level-300": ["Epidemiology II", "Biostatistics II", "Health Policy", "Occupational Health", "Research Methods"],
      "level-400": ["Global Health", "Health Systems Management", "Monitoring & Evaluation", "Field Practice", "Research Project"],
    },
  },
  {
    id: "biomedical-science",
    label: "Biomedical Science",
    description: "Anatomy, physiology, biochemistry, microbiology, pathology and laboratory science.",
    levels: {
      "level-100": ["Cell Biology", "Human Anatomy", "Human Physiology", "General Chemistry", "Biochemistry I"],
      "level-200": ["Biochemistry II", "Microbiology", "Immunology", "Molecular Biology", "Biostatistics"],
      "level-300": ["Pathology", "Haematology", "Clinical Chemistry", "Medical Microbiology", "Research Methods"],
      "level-400": ["Molecular Diagnostics", "Clinical Immunology", "Advanced Pathology", "Laboratory Management", "Research Project"],
    },
  },
  {
    id: "biochemistry",
    label: "Biochemistry",
    description: "Molecular biology, metabolism, proteins, genetics, enzymology and biochemical analysis.",
    levels: {
      "level-100": ["General Chemistry", "Organic Chemistry", "Cell Biology", "Mathematics", "Physics"],
      "level-200": ["Biochemistry I", "Molecular Biology I", "Genetics", "Analytical Chemistry", "Statistics"],
      "level-300": ["Biochemistry II", "Enzymology", "Metabolism", "Molecular Biology II", "Bioinformatics"],
      "level-400": ["Advanced Biochemistry", "Biotechnology", "Protein Chemistry", "Research Methods", "Research Project"],
    },
  },
  {
    id: "actuarial-science",
    label: "Actuarial Science",
    description: "Probability, statistics, financial mathematics, risk modelling and actuarial applications.",
    levels: {
      "level-100": ["Calculus", "Linear Algebra", "Probability I", "Economics", "Programming"],
      "level-200": ["Probability II", "Statistics", "Financial Mathematics I", "Accounting", "Regression Analysis"],
      "level-300": ["Financial Mathematics II", "Survival Models", "Risk Theory", "Stochastic Processes", "Econometrics"],
      "level-400": ["Actuarial Modelling", "Pensions", "Insurance Mathematics", "Enterprise Risk", "Research Project"],
    },
  },
  {
    id: "statistics",
    label: "Statistics",
    description: "Probability, inference, regression, sampling, experimental design and statistical computing.",
    levels: {
      "level-100": ["Calculus", "Introduction to Statistics", "Probability I", "Linear Algebra", "Programming"],
      "level-200": ["Probability II", "Statistical Inference", "Regression I", "Sampling", "Statistical Computing"],
      "level-300": ["Regression II", "Experimental Design", "Time Series", "Multivariate Analysis", "Operations Research"],
      "level-400": ["Bayesian Statistics", "Data Mining", "Advanced Time Series", "Biostatistics", "Research Project"],
    },
  },
  {
    id: "education",
    label: "Education",
    description: "Learning theory, curriculum, assessment, educational psychology, pedagogy and school practice.",
    levels: {
      "level-100": ["Foundations of Education", "Educational Psychology", "Communication Skills", "ICT in Education", "Introduction to Teaching"],
      "level-200": ["Curriculum Studies", "Assessment & Evaluation", "Inclusive Education", "Classroom Management", "Teaching Methods"],
      "level-300": ["Educational Research", "Guidance & Counselling", "Instructional Technology", "School Leadership", "Teaching Practice I"],
      "level-400": ["Advanced Pedagogy", "Education Policy", "Teaching Practice II", "Action Research", "Research Project"],
    },
  },
  {
    id: "agriculture",
    label: "Agriculture",
    description: "Crop, animal, soil, agribusiness, extension and sustainable agricultural systems.",
    levels: {
      "level-100": ["Introduction to Agriculture", "Plant Biology", "Animal Biology", "Chemistry", "Agricultural Economics"],
      "level-200": ["Soil Science", "Crop Production", "Animal Production", "Agricultural Engineering", "Statistics"],
      "level-300": ["Plant Protection", "Animal Nutrition", "Agribusiness", "Extension", "Research Methods"],
      "level-400": ["Sustainable Agriculture", "Farm Management", "Agricultural Policy", "Field Practicum", "Research Project"],
    },
  },
  {
    id: "hospitality-tourism",
    label: "Hospitality & Tourism",
    description: "Hospitality operations, tourism management, food service, events and destination development.",
    levels: {
      "level-100": ["Introduction to Hospitality", "Introduction to Tourism", "Food & Beverage Basics", "Business Communication", "Accounting"],
      "level-200": ["Front Office Operations", "Food Production", "Tourism Geography", "Marketing", "Events Management"],
      "level-300": ["Hotel Management", "Destination Management", "Service Quality", "Tourism Economics", "Research Methods"],
      "level-400": ["Strategic Hospitality Management", "Sustainable Tourism", "Revenue Management", "Internship", "Capstone Project"],
    },
  },
];

function makeUniversityLevels(spec: UniversitySpec): CatalogLevel[] {
  return Object.entries(spec.levels).map(([id, courses]) => ({
    id,
    label: id.replace("level-", "Level "),
    subjects: courses.map((course) => mappedCourse(course)),
  }));
}

const existingReadyLevel100: Record<string, CatalogSubject[]> = {
  "computer-science": [
    readyCourse("programming", "Programming", [
      ["variables", "Variables & data types"],
      ["control-flow", "Control flow"],
      ["data-structures", "Data structures"],
    ]),
    readyCourse("networks", "Computer Networks", [
      ["network-basics", "Network basics"],
      ["protocols", "Protocols"],
    ]),
  ],
  nursing: [
    readyCourse("anatomy", "Anatomy & Physiology", [
      ["cardiovascular", "Cardiovascular system"],
      ["respiratory", "Respiratory system"],
    ]),
    readyCourse("fundamentals", "Fundamentals of Nursing", [["patient-care", "Patient care"]]),
  ],
  business: [
    readyCourse("accounting", "Financial Accounting", [
      ["double-entry", "Double entry"],
      ["statements", "Financial statements"],
    ]),
    readyCourse("management", "Principles of Management", [["functions", "Management functions"]]),
  ],
};

export const UNIVERSITY_PROGRAMS: CatalogProgram[] = UNIVERSITY_SPECS.map((spec) => {
  const levels = makeUniversityLevels(spec);
  const ready = existingReadyLevel100[spec.id];
  if (ready && levels[0]) {
    const mapped = levels[0].subjects.filter(
      (subject) => !ready.some((readySubject) => readySubject.label === subject.label),
    );
    levels[0] = { ...levels[0], subjects: [...ready, ...mapped] };
  }
  return {
    id: spec.id,
    label: spec.label,
    description: `${spec.description} Common course map for Ghanaian undergraduate study; exact course codes and semester order vary by institution.`,
    levels,
  };
});

export const UNIVERSITY_INSTITUTION_EXAMPLES = [
  "University of Ghana",
  "KNUST",
  "University of Cape Coast",
  "University for Development Studies",
  "University of Education, Winneba",
  "University of Professional Studies, Accra",
  "Ghana Communication Technology University",
  "University of Mines and Technology",
  "University of Health and Allied Sciences",
  "University of Energy and Natural Resources",
  "CK Tedam University of Technology and Applied Sciences",
  "Ashesi University",
  "Academic City University",
  "Central University",
  "Valley View University",
] as const;
