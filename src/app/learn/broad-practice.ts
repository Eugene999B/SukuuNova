import type { LearnQuestion, SessionConfig } from "./learn-domain";

type Seed = {
  q: string;
  a: string;
  wrong: [string, string, string];
  why: string;
};

const TOPICS = ["core-concepts", "applications", "problem-solving"] as const;

const SHS_PACKS: Record<string, Seed[]> = {
  "core-mathematics": [
    { q: "If 3x + 5 = 20, what is x?", a: "5", wrong: ["3", "15", "25"], why: "Subtract 5 to get 3x = 15, then divide by 3." },
    { q: "A bag contains 4 red and 6 blue balls. What is the probability of choosing a red ball?", a: "2/5", wrong: ["3/5", "2/3", "4/6"], why: "There are 10 balls in total, so the probability is 4/10 = 2/5." },
    { q: "What is the gradient of the line through (1, 3) and (5, 11)?", a: "2", wrong: ["1", "4", "8"], why: "Gradient = (11 - 3) / (5 - 1) = 8/4 = 2." },
  ],
  "english-language": [
    { q: "Which sentence has correct subject–verb agreement?", a: "Each of the students has a book.", wrong: ["Each of the students have a book.", "Each of the student have a book.", "Each students has a book."], why: "The subject 'Each' is singular, so it takes 'has'." },
    { q: "Which word best replaces 'very tired' in formal writing?", a: "Exhausted", wrong: ["Big", "Quick", "Loose"], why: "Exhausted is a precise synonym for very tired." },
    { q: "What is the main purpose of a topic sentence in a paragraph?", a: "To state the paragraph's central idea", wrong: ["To end the essay", "To list every source", "To repeat the title"], why: "A topic sentence signals the main idea developed by the paragraph." },
  ],
  "integrated-science": [
    { q: "Which organelle is the main site of aerobic respiration in a cell?", a: "Mitochondrion", wrong: ["Ribosome", "Nucleus", "Golgi apparatus"], why: "Most aerobic respiration and ATP production occur in mitochondria." },
    { q: "A force of 20 N moves an object 5 m in the direction of the force. How much work is done?", a: "100 J", wrong: ["4 J", "25 J", "200 J"], why: "Work = force × distance = 20 × 5 = 100 joules." },
    { q: "Which change is chemical rather than physical?", a: "Iron rusting", wrong: ["Ice melting", "Water boiling", "Salt dissolving in water"], why: "Rusting forms new substances, including iron oxides." },
  ],
  "social-studies": [
    { q: "Which principle prevents one branch of government from exercising all state power?", a: "Separation of powers", wrong: ["Population density", "Free trade", "Urbanisation"], why: "Separation of powers distributes authority among branches of government." },
    { q: "Which action is an example of responsible citizenship?", a: "Obeying lawful rules and participating in community decisions", wrong: ["Destroying public property", "Buying votes", "Ignoring all civic duties"], why: "Responsible citizenship combines respect for law with constructive participation." },
    { q: "A policy that improves access to clean water most directly supports which development goal?", a: "Public health", wrong: ["Currency depreciation", "Deforestation", "Import substitution"], why: "Safe water reduces water-borne disease and improves health outcomes." },
  ],
  "elective-mathematics": [
    { q: "Differentiate f(x) = x³.", a: "3x²", wrong: ["x²", "3x", "x⁴/4"], why: "By the power rule, d(x³)/dx = 3x²." },
    { q: "If log₁₀ x = 2, what is x?", a: "100", wrong: ["20", "10", "1,000"], why: "log₁₀ x = 2 means 10² = x." },
    { q: "For vectors a = (2, 1) and b = (3, 4), what is a · b?", a: "10", wrong: ["7", "11", "14"], why: "The dot product is 2×3 + 1×4 = 10." },
  ],
  physics: [
    { q: "A car changes velocity from 10 m/s to 20 m/s in 5 s. What is its average acceleration?", a: "2 m/s²", wrong: ["5 m/s²", "10 m/s²", "30 m/s²"], why: "Acceleration = change in velocity / time = 10/5 = 2 m/s²." },
    { q: "Which quantity is measured in volts?", a: "Potential difference", wrong: ["Current", "Resistance", "Power"], why: "The volt is the SI unit of electric potential difference." },
    { q: "When light moves from air into glass, which property remains unchanged?", a: "Frequency", wrong: ["Speed", "Wavelength", "Direction in every case"], why: "Frequency is fixed by the source; speed and wavelength change in a new medium." },
  ],
  chemistry: [
    { q: "What is the atomic number of an element equal to?", a: "Number of protons", wrong: ["Number of neutrons", "Mass number", "Number of shells"], why: "Atomic number is defined by the number of protons in the nucleus." },
    { q: "Which type of bond forms by transfer of electrons?", a: "Ionic bond", wrong: ["Covalent bond", "Hydrogen bond", "Metallic lattice only"], why: "Ionic bonding involves electron transfer and electrostatic attraction between ions." },
    { q: "What is the pH of a neutral aqueous solution at about room temperature?", a: "7", wrong: ["0", "1", "14"], why: "At about 25°C, neutral water has pH 7." },
  ],
  biology: [
    { q: "Which molecule carries hereditary information in most organisms?", a: "DNA", wrong: ["ATP", "Glucose", "Cellulose"], why: "DNA stores genetic information in most organisms." },
    { q: "Which process produces gametes with half the normal chromosome number?", a: "Meiosis", wrong: ["Mitosis", "Binary fission", "Transcription"], why: "Meiosis reduces chromosome number to form haploid gametes." },
    { q: "Which relationship describes organisms competing for the same limited food source?", a: "Competition", wrong: ["Mutualism", "Commensalism", "Decomposition"], why: "Competition occurs when organisms require the same limited resource." },
  ],
  economics: [
    { q: "According to the law of demand, what usually happens to quantity demanded when price rises, other things equal?", a: "It falls", wrong: ["It rises", "It stays fixed by definition", "It becomes supply"], why: "The law of demand describes an inverse relationship between price and quantity demanded, ceteris paribus." },
    { q: "What is opportunity cost?", a: "The value of the next best alternative forgone", wrong: ["All money spent", "A government tax", "Total revenue"], why: "Opportunity cost is what is sacrificed when choosing one option over the next best alternative." },
    { q: "Which measure is commonly used to track the average change in consumer prices?", a: "Consumer Price Index", wrong: ["Balance sheet", "Population census only", "Exchange reserve"], why: "The Consumer Price Index tracks changes in prices of a representative basket of consumer goods and services." },
  ],
  government: [
    { q: "What is a constitution?", a: "A body of fundamental rules governing a state", wrong: ["A political campaign", "A tax receipt", "A population register"], why: "A constitution establishes core rules, institutions, powers and rights." },
    { q: "Which branch of government primarily interprets laws?", a: "Judiciary", wrong: ["Executive", "Legislature", "Civil service"], why: "Courts in the judiciary interpret and apply the law." },
    { q: "What is universal adult suffrage?", a: "The right of eligible adult citizens to vote", wrong: ["Voting only by property owners", "Rule by judges", "Automatic appointment to parliament"], why: "Universal adult suffrage extends voting rights broadly to eligible adult citizens." },
  ],
  geography: [
    { q: "Which instrument is used to measure rainfall?", a: "Rain gauge", wrong: ["Barometer", "Anemometer", "Thermometer"], why: "A rain gauge collects and measures precipitation." },
    { q: "What do contour lines on a map join?", a: "Points of equal elevation", wrong: ["Places with equal population", "Equal rainfall only", "Political boundaries"], why: "Contours connect points at the same height above a reference level." },
    { q: "Which process is a major cause of rural–urban migration?", a: "Movement in search of jobs and services", wrong: ["Plate tectonics", "Ocean currents", "Photosynthesis"], why: "Employment, education and services are common pull factors for urban migration." },
  ],
  "financial-accounting": [
    { q: "An increase in an asset is normally recorded on which side?", a: "Debit", wrong: ["Credit", "Either side randomly", "Memorandum only"], why: "Asset increases are normally debited." },
    { q: "Which statement reports assets, liabilities and equity at a point in time?", a: "Statement of financial position", wrong: ["Income statement", "Cash receipt", "Purchase order"], why: "The statement of financial position reports the entity's position at a specific date." },
    { q: "If total assets are GH₵50,000 and liabilities are GH₵18,000, what is equity?", a: "GH₵32,000", wrong: ["GH₵68,000", "GH₵18,000", "GH₵50,000"], why: "Equity = assets - liabilities = 50,000 - 18,000." },
  ],
  "business-management": [
    { q: "Which management function involves setting objectives and deciding how to achieve them?", a: "Planning", wrong: ["Controlling", "Staffing only", "Auditing"], why: "Planning sets objectives and determines actions for achieving them." },
    { q: "Delegation means:", a: "Assigning responsibility and authority to another person", wrong: ["Avoiding all accountability", "Closing the business", "Eliminating communication"], why: "Delegation transfers defined tasks and authority while overall accountability remains with management." },
    { q: "Which activity is part of controlling?", a: "Comparing actual performance with targets", wrong: ["Ignoring results", "Removing all standards", "Avoiding measurement"], why: "Controlling measures performance against plans and supports corrective action." },
  ],
  "food-and-nutrition": [
    { q: "Which nutrient is the body's main concentrated energy store?", a: "Fat", wrong: ["Water", "Minerals", "Vitamins"], why: "Fat provides more energy per gram than carbohydrate or protein." },
    { q: "Which vitamin is important for normal blood clotting?", a: "Vitamin K", wrong: ["Vitamin C only", "Vitamin D only", "Vitamin B12 only"], why: "Vitamin K is required for synthesis of several clotting factors." },
    { q: "Which practice best reduces cross-contamination in food preparation?", a: "Keeping raw and ready-to-eat foods separate", wrong: ["Using the same unwashed knife", "Leaving food uncovered", "Thawing meat in direct sun"], why: "Separating raw and ready-to-eat foods reduces transfer of harmful microorganisms." },
  ],
  "general-knowledge-in-art": [
    { q: "Which element of art describes the lightness or darkness of a colour?", a: "Value", wrong: ["Texture only", "Balance", "Rhythm"], why: "Value refers to relative lightness or darkness." },
    { q: "Complementary colours are located where on a traditional colour wheel?", a: "Opposite each other", wrong: ["Next to each other only", "At the centre", "Outside the wheel"], why: "Complementary colours lie opposite each other and create strong contrast." },
    { q: "Which principle describes the visual distribution of weight in a composition?", a: "Balance", wrong: ["Hue", "Line", "Medium"], why: "Balance concerns how visual weight is arranged within a work." },
  ],
  "graphic-design": [
    { q: "What is the main purpose of visual hierarchy in a design?", a: "To guide attention in order of importance", wrong: ["To make all elements identical", "To remove contrast", "To hide the message"], why: "Visual hierarchy helps viewers know what to notice first, second and next." },
    { q: "Which file type is commonly preferred for scalable vector graphics?", a: "SVG", wrong: ["JPG", "MP3", "TXT"], why: "SVG stores vector shapes that scale without pixelation." },
    { q: "Kerning refers to adjustment of:", a: "Space between individual letter pairs", wrong: ["Page margins only", "Image resolution", "Paper thickness"], why: "Kerning fine-tunes spacing between specific pairs of letters." },
  ],
  "general-agriculture": [
    { q: "Which soil component most directly improves water-holding capacity and nutrient retention?", a: "Organic matter", wrong: ["Plastic", "Glass", "Concrete"], why: "Organic matter improves soil structure, nutrient supply and water retention." },
    { q: "Crop rotation can help reduce:", a: "Build-up of some pests and diseases", wrong: ["Sunlight", "All rainfall", "Seed germination entirely"], why: "Rotating crop families can interrupt pest and disease life cycles." },
    { q: "What is selective breeding used for?", a: "Increasing desirable inherited traits", wrong: ["Changing weather", "Creating soil minerals", "Preventing all mutation"], why: "Selective breeding chooses parents with desirable traits to influence offspring." },
  ],
  "technical-drawing": [
    { q: "Orthographic projection commonly represents an object using:", a: "Separate front, top and side views", wrong: ["One random sketch", "Only a photograph", "A written paragraph"], why: "Orthographic drawing uses aligned 2D views to describe 3D form accurately." },
    { q: "Which line type is typically used for visible outlines?", a: "Continuous thick line", wrong: ["Dashed thin line", "Chain thin line", "Freehand break only"], why: "Visible edges are conventionally drawn with continuous thick lines." },
    { q: "A scale of 1:50 means 1 unit on the drawing represents:", a: "50 units on the object", wrong: ["5 units", "1 unit only", "5000 units"], why: "A 1:50 scale reduces real dimensions by a factor of 50." },
  ],
  computing: [
    { q: "Which data structure follows first in, first out?", a: "Queue", wrong: ["Stack", "Tree", "Set"], why: "A queue removes items in arrival order." },
    { q: "What does an IP address identify?", a: "A network interface on an IP network", wrong: ["A person's password", "A keyboard key", "A file extension"], why: "IP addresses are used to identify and route to network interfaces." },
    { q: "Which practice best protects an online account?", a: "Using a unique password and multi-factor authentication", wrong: ["Sharing passwords", "Using 1234 everywhere", "Posting recovery codes publicly"], why: "Unique credentials and an additional factor reduce account-compromise risk." },
  ],
};

const UNIVERSITY_PACKS: Record<string, Seed[]> = {
  "medicine|human-anatomy": [
    { q: "Which chamber of the heart pumps blood into the systemic circulation?", a: "Left ventricle", wrong: ["Right ventricle", "Right atrium", "Left atrium"], why: "The left ventricle ejects oxygenated blood into the aorta." },
    { q: "Which plane divides the body into left and right portions?", a: "Sagittal plane", wrong: ["Transverse plane", "Coronal plane", "Oblique axis"], why: "A sagittal plane divides the body into left and right portions." },
    { q: "Which nerve carries visual information from the retina?", a: "Optic nerve", wrong: ["Vagus nerve", "Facial nerve", "Femoral nerve"], why: "The optic nerve carries retinal signals toward the brain." },
  ],
  "medicine|human-physiology": [
    { q: "Which hormone lowers blood glucose by promoting cellular uptake and storage?", a: "Insulin", wrong: ["Glucagon", "Adrenaline", "Thyroxine"], why: "Insulin lowers blood glucose by supporting uptake and storage." },
    { q: "Where does most gas exchange occur in the lungs?", a: "Alveoli", wrong: ["Trachea", "Larynx", "Pleural cavity"], why: "Alveoli provide a thin, large surface for diffusion." },
    { q: "Which part of the nephron is the initial site of blood filtration?", a: "Glomerulus", wrong: ["Collecting duct", "Loop of Henle", "Ureter"], why: "Filtration begins across the glomerular capillaries into Bowman's capsule." },
  ],
  "pharmacy|general-chemistry": SHS_PACKS.chemistry,
  "pharmacy|organic-chemistry": [
    { q: "Which functional group defines an alcohol?", a: "Hydroxyl group", wrong: ["Carboxyl group", "Amino group", "Carbonyl group only"], why: "Alcohols contain a hydroxyl (-OH) group bonded to carbon." },
    { q: "What type of hydrocarbon contains only single carbon-carbon bonds?", a: "Alkane", wrong: ["Alkene", "Alkyne", "Arene only"], why: "Alkanes are saturated hydrocarbons with single C-C bonds." },
    { q: "Which reaction commonly converts an alkene to an alkane?", a: "Hydrogenation", wrong: ["Dehydration", "Hydrolysis", "Esterification"], why: "Hydrogenation adds hydrogen across a carbon-carbon double bond." },
  ],
  "law|legal-systems-and-methods": [
    { q: "What is precedent in a common-law system?", a: "A prior judicial decision used as authority in later similar cases", wrong: ["A new tax", "A police arrest only", "A parliamentary election"], why: "Precedent allows earlier judicial decisions to guide later cases with similar legal issues." },
    { q: "What does ratio decidendi mean?", a: "The legal principle necessary for the decision", wrong: ["A judge's biography", "A witness list", "Court fees"], why: "The ratio decidendi is the binding legal reasoning essential to the outcome." },
    { q: "What is statutory interpretation?", a: "The process of determining the meaning and application of legislation", wrong: ["Drafting a newspaper", "Electing a judge", "Registering land only"], why: "Courts interpret legislation to determine how statutory words apply." },
  ],
  "law|constitutional-law-i": [
    { q: "Constitutional supremacy means:", a: "The constitution is the highest legal authority", wrong: ["Every minister is above the law", "Courts cannot review government action", "Only customs are binding"], why: "Under constitutional supremacy, inconsistent laws or actions may be invalid." },
    { q: "Which principle divides state power among different branches?", a: "Separation of powers", wrong: ["Double jeopardy", "Privity", "Estoppel only"], why: "Separation of powers allocates authority among branches such as legislature, executive and judiciary." },
    { q: "What is judicial review?", a: "Court examination of the legality or constitutionality of public action", wrong: ["A newspaper review", "A cabinet meeting", "A census"], why: "Judicial review enables courts to assess whether public action complies with law and constitution." },
  ],
  "economics|principles-of-microeconomics": SHS_PACKS.economics,
  "economics|principles-of-macroeconomics": [
    { q: "GDP measures:", a: "The market value of final goods and services produced within a country over a period", wrong: ["Only government salaries", "All wealth ever accumulated", "Only exports"], why: "GDP is a flow measure of final production within an economy." },
    { q: "Inflation is best described as:", a: "A sustained rise in the general price level", wrong: ["A fall in one product's price", "An increase in population only", "A budget surplus"], why: "Inflation concerns broad and sustained increases in prices." },
    { q: "Which policy tool is normally associated with a central bank?", a: "Policy interest rate", wrong: ["School timetable", "Import invoice", "Company dividend declaration"], why: "Central banks use monetary tools such as policy rates to influence financial conditions." },
  ],
  "civil-engineering|engineering-mathematics": SHS_PACKS["elective-mathematics"],
  "civil-engineering|engineering-mechanics": [
    { q: "For an object in static equilibrium, the vector sum of forces is:", a: "Zero", wrong: ["Always positive", "Equal to mass", "Equal to velocity"], why: "Static equilibrium requires zero net force and zero net moment." },
    { q: "Moment of a force about a point equals:", a: "Force × perpendicular distance", wrong: ["Mass × volume", "Speed ÷ time", "Pressure × temperature"], why: "The turning effect is force multiplied by perpendicular lever arm." },
    { q: "Which law states that every action has an equal and opposite reaction?", a: "Newton's third law", wrong: ["Hooke's law", "Boyle's law", "Ohm's law"], why: "Newton's third law describes paired interaction forces." },
  ],
  "mechanical-engineering|engineering-mathematics": SHS_PACKS["elective-mathematics"],
  "mechanical-engineering|engineering-mechanics": [
    { q: "Stress is defined as:", a: "Force divided by cross-sectional area", wrong: ["Area divided by force", "Mass × acceleration only", "Energy per second"], why: "Normal stress is force per unit cross-sectional area." },
    { q: "A free-body diagram is used to show:", a: "External forces and moments acting on an isolated body", wrong: ["Only internal colours", "Chemical composition", "Computer source code"], why: "Free-body diagrams isolate a body and display external mechanical actions." },
    { q: "The SI unit of torque is:", a: "newton metre", wrong: ["watt", "pascal", "coulomb"], why: "Torque is force times perpendicular distance, measured in N·m." },
  ],
  "electrical-electronic-engineering|engineering-mathematics": SHS_PACKS["elective-mathematics"],
  "electrical-electronic-engineering|circuit-fundamentals": [
    { q: "Ohm's law is:", a: "V = IR", wrong: ["P = IV only", "F = ma", "E = mc²"], why: "Ohm's law relates voltage, current and resistance." },
    { q: "Two resistors in series carry:", a: "The same current", wrong: ["Always the same voltage", "No current", "Infinite power"], why: "Series components share a single current path." },
    { q: "Electrical power can be calculated as:", a: "P = VI", wrong: ["P = V/I only", "P = I/V", "P = R/V"], why: "Power transferred electrically is voltage multiplied by current." },
  ],
  "psychology|introduction-to-psychology": [
    { q: "Psychology is the scientific study of:", a: "Behaviour and mental processes", wrong: ["Only dreams", "Only medicine", "Only economics"], why: "Modern psychology scientifically studies behaviour and mental processes." },
    { q: "Which approach emphasises learning through association and consequences?", a: "Behavioural approach", wrong: ["Astronomical approach", "Geological approach", "Anatomical naming only"], why: "Behavioural theories focus on observable learning through conditioning." },
    { q: "What is a hypothesis?", a: "A testable prediction", wrong: ["A guaranteed fact", "A random opinion that cannot be tested", "A research participant"], why: "A scientific hypothesis states a prediction that evidence can test." },
  ],
  "public-health|introduction-to-public-health": [
    { q: "Public health primarily focuses on:", a: "Improving health at population level", wrong: ["Treating only one patient at a time", "Building roads only", "Banking regulation"], why: "Public health uses population-level prevention, protection and promotion." },
    { q: "Incidence describes:", a: "New cases occurring in a population over a period", wrong: ["All existing cases only", "Hospital cost", "Birth weight"], why: "Incidence measures the occurrence of new cases." },
    { q: "Vaccination is an example of:", a: "Primary prevention", wrong: ["Tertiary prevention only", "Financial auditing", "Case litigation"], why: "Primary prevention aims to prevent disease before it occurs." },
  ],
  "biomedical-science|cell-biology": [
    { q: "Which organelle contains most nuclear DNA in a human cell?", a: "Nucleus", wrong: ["Lysosome", "Golgi apparatus", "Ribosome"], why: "The nucleus houses most of the cell's DNA." },
    { q: "Ribosomes are directly responsible for:", a: "Protein synthesis", wrong: ["DNA storage", "Lipid digestion only", "Cell movement only"], why: "Ribosomes translate mRNA into polypeptide chains." },
    { q: "The plasma membrane is primarily built from:", a: "A phospholipid bilayer with proteins", wrong: ["Cellulose only", "DNA only", "Calcium carbonate"], why: "Phospholipids form the basic bilayer, with proteins and other components embedded." },
  ],
  "accounting|financial-accounting-i": SHS_PACKS["financial-accounting"],
  "finance|principles-of-finance": [
    { q: "The time value of money means:", a: "Money available today can be worth more than the same amount received later", wrong: ["Money never changes value", "Interest has no effect", "Future cash is always worth more"], why: "Current money can earn returns, so timing affects value." },
    { q: "Diversification mainly helps reduce:", a: "Asset-specific risk", wrong: ["All market risk", "Every possible loss", "Inflation automatically"], why: "Holding varied assets can reduce idiosyncratic risk." },
    { q: "Net present value compares:", a: "Present value of expected cash inflows with present value of outflows", wrong: ["Only accounting profit", "Number of employees", "Tax rates only"], why: "NPV discounts project cash flows to a common present-value basis." },
  ],
};

function makeQuestion(prefix: string, subject: string, seed: Seed, index: number, difficulty: 1 | 2 | 3 | 4 | 5): LearnQuestion {
  const options = [seed.a, ...seed.wrong].map((label, optionIndex) => ({ id: String(optionIndex), label }));
  return {
    id: `${prefix}-${index}`,
    exposureKey: `broad:${prefix}:${index}`,
    kind: "single",
    subject,
    topic: TOPICS[index % TOPICS.length],
    skill: index === 0 ? "Recall a key concept" : index === 1 ? "Apply the concept" : "Reason through a problem",
    difficulty,
    prompt: seed.q,
    options,
    answer: "0",
    explanation: seed.why,
  };
}

function levelDifficulty(levelId: string): 1 | 2 | 3 | 4 | 5 {
  if (levelId === "shs-1" || levelId === "level-100") return 2;
  if (levelId === "shs-2" || levelId === "level-200") return 3;
  if (levelId === "shs-3" || levelId === "level-300") return 4;
  return 4;
}

export function broadPracticeQuestionsForSelection(config: SessionConfig): LearnQuestion[] {
  let pack: Seed[] | undefined;

  if (config.lane === "school" && config.programId.startsWith("shs-")) {
    pack = SHS_PACKS[config.subjectId];
  } else if (config.lane === "university") {
    pack = UNIVERSITY_PACKS[`${config.programId}|${config.subjectId}`];
  }

  if (!pack?.length) return [];

  const subject = config.subjectId
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");

  const questions = pack.map((seed, index) =>
    makeQuestion(
      `${config.lane}-${config.programId}-${config.levelId}-${config.subjectId}`,
      subject,
      seed,
      index,
      levelDifficulty(config.levelId),
    ),
  );

  if (config.topicId === "all") return questions;
  return questions.filter((question) => question.topic === config.topicId);
}
