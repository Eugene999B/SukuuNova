import type { CatalogLevel, CatalogProgram, CatalogSubject, CatalogTopic } from "./learn-domain";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mappedCourse(label: string, topicLabels?: string[]): CatalogSubject {
  const topics = (topicLabels?.length ? topicLabels : ["Core concepts", "Applications", "Problem solving"]).map(
    (topic): CatalogTopic => ({ id: slug(topic), label: topic, availability: "expanding" }),
  );
  return { id: slug(label), label, availability: "expanding", topics };
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
    id: "business-administration",
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
  "business-administration": [
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
