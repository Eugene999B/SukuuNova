import {
  resolveCatalogSelection,
  type CognitiveChallenge,
  type LearnQuestion,
  type QuestionStimulus,
  type SessionConfig,
} from "./learn-domain";

type NursingConcept = {
  id: string;
  term: string;
  definition: string;
  clues: readonly string[];
  priorityAction: string;
  unsafeAction: string;
  rationale: string;
  relatedActions: readonly string[];
};

type NursingDomain =
  | "foundations"
  | "medical-surgical"
  | "pharmacology"
  | "microbiology"
  | "community"
  | "maternal-child"
  | "mental-health"
  | "critical-care"
  | "leadership"
  | "anatomy-physiology"
  | "general";

const NAMES = ["Adwoa", "Yaw", "Akosua", "Kofi", "Esi", "Kwame", "Abena", "Sena"] as const;
const AGES = [19, 24, 31, 42, 55, 63, 71, 78] as const;
const SETTINGS = [
  "during morning assessment",
  "during an evening shift",
  "at a district hospital",
  "in an outpatient clinic",
  "on a medical ward",
  "during community follow-up",
  "at a nursing skills laboratory",
  "during a handover review",
] as const;

export const NURSING_TOPIC_CAPACITY = 36_000_000;

const FOUNDATIONS: readonly NursingConcept[] = [
  {
    id: "hand-hygiene",
    term: "hand hygiene",
    definition: "cleaning the hands at appropriate moments to reduce transmission of microorganisms",
    clues: ["before touching a patient", "after contact with body fluids", "after removing gloves"],
    priorityAction: "perform hand hygiene using the appropriate method at the required moment",
    unsafeAction: "skip hand hygiene because gloves were worn",
    rationale: "Gloves do not replace hand hygiene, and contaminated hands can transmit microorganisms between surfaces and patients.",
    relatedActions: ["use appropriate personal protective equipment", "clean shared equipment between patients", "maintain aseptic technique when indicated"],
  },
  {
    id: "patient-identification",
    term: "two-identifier patient verification",
    definition: "confirming a patient's identity with at least two approved identifiers before care that depends on correct identity",
    clues: ["before medication administration", "before specimen collection", "before a procedure"],
    priorityAction: "verify the patient with two approved identifiers before proceeding",
    unsafeAction: "identify the patient only by bed number",
    rationale: "Bed location is not a reliable patient identifier; identity should be verified using approved identifiers.",
    relatedActions: ["compare identifiers with the order", "resolve any mismatch before continuing", "involve the patient in verification when possible"],
  },
  {
    id: "falls",
    term: "fall-risk prevention",
    definition: "individualised actions that reduce the chance of an inpatient fall",
    clues: ["unsteady gait", "recent sedating medication", "history of falls"],
    priorityAction: "assess fall risk and apply measures matched to the patient's risk factors",
    unsafeAction: "leave an unsteady patient to walk alone because the distance is short",
    rationale: "Fall prevention should respond to individual risks such as weakness, medication effects and unsafe mobility.",
    relatedActions: ["keep commonly used items within reach", "assist with mobility when indicated", "review medicines that may increase fall risk"],
  },
  {
    id: "pressure-injury",
    term: "pressure-injury prevention",
    definition: "reducing prolonged pressure and other modifiable risks to protect skin and underlying tissue",
    clues: ["limited mobility", "persistent moisture", "poor nutritional intake"],
    priorityAction: "inspect the skin and institute an individual repositioning and pressure-relief plan",
    unsafeAction: "massage persistent redness over a bony prominence",
    rationale: "Persistent redness can indicate tissue injury; pressure should be relieved and the area assessed rather than massaged.",
    relatedActions: ["manage moisture", "support adequate nutrition and hydration", "use appropriate pressure-redistributing surfaces"],
  },
  {
    id: "documentation",
    term: "objective clinical documentation",
    definition: "timely, factual recording of assessment findings, care, response and relevant communication",
    clues: ["change in condition", "medication response", "procedure completed"],
    priorityAction: "document relevant findings and care accurately and promptly",
    unsafeAction: "record an intervention before it has actually been performed",
    rationale: "Clinical records should reflect what was assessed and done, not what is merely planned.",
    relatedActions: ["use objective language", "record significant patient responses", "document escalation when condition changes"],
  },
  {
    id: "informed-consent",
    term: "informed consent",
    definition: "voluntary agreement by a person with decision-making capacity after receiving relevant information",
    clues: ["planned invasive procedure", "questions about risks", "uncertainty about alternatives"],
    priorityAction: "ensure questions are addressed and valid consent is obtained before the procedure proceeds",
    unsafeAction: "pressure the patient to sign because the procedure has already been scheduled",
    rationale: "Consent must be informed and voluntary; scheduling convenience does not override the patient's right to decide.",
    relatedActions: ["support comprehension", "respect refusal", "escalate unresolved questions to the appropriate clinician"],
  },
  {
    id: "pain-assessment",
    term: "comprehensive pain assessment",
    definition: "assessing pain intensity together with location, quality, timing, aggravating factors and impact",
    clues: ["new pain report", "change after analgesia", "pain limiting movement"],
    priorityAction: "assess the pain systematically before and after an intervention",
    unsafeAction: "assume pain severity from facial expression alone",
    rationale: "Pain is subjective and should be assessed using the patient's report plus relevant clinical information.",
    relatedActions: ["use an appropriate pain scale", "reassess after intervention", "document response and adverse effects"],
  },
  {
    id: "asepsis",
    term: "aseptic technique",
    definition: "practices used to protect susceptible sites and key parts from contamination during procedures",
    clues: ["wound dressing", "vascular access", "sterile procedure field"],
    priorityAction: "protect key parts and key sites from contamination throughout the procedure",
    unsafeAction: "touch a sterile key part with a non-sterile glove and continue",
    rationale: "Once a critical sterile component is contaminated, the technique must be corrected before proceeding.",
    relatedActions: ["prepare equipment before starting", "maintain a clean working field", "replace contaminated sterile items"],
  },
];

const MED_SURG: readonly NursingConcept[] = [
  {
    id: "hypoglycaemia",
    term: "hypoglycaemia",
    definition: "abnormally low blood glucose that can impair neurological function and become an emergency",
    clues: ["sweating and tremor", "confusion or behaviour change", "low measured blood glucose"],
    priorityAction: "confirm glucose promptly and treat according to the patient's level of consciousness and local protocol",
    unsafeAction: "give oral intake to an unconscious patient",
    rationale: "An unconscious person may not protect the airway; treatment route must match consciousness and swallowing safety.",
    relatedActions: ["recheck glucose after treatment", "identify contributing factors", "monitor for recurrence"],
  },
  {
    id: "heart-failure",
    term: "worsening heart failure",
    definition: "clinical deterioration caused by inadequate cardiac function and/or fluid congestion",
    clues: ["increasing breathlessness", "new peripheral oedema", "rapid increase in body weight"],
    priorityAction: "assess respiratory status, oxygenation and signs of fluid overload and escalate deterioration",
    unsafeAction: "encourage unrestricted fluid intake despite clear signs of congestion",
    rationale: "Breathlessness and fluid accumulation can indicate worsening congestion and require prompt reassessment.",
    relatedActions: ["monitor fluid balance", "review daily weight trends", "position to ease breathing when appropriate"],
  },
  {
    id: "asthma-deterioration",
    term: "acute asthma deterioration",
    definition: "worsening airflow obstruction that can progress to respiratory failure",
    clues: ["increasing work of breathing", "wheeze with difficulty speaking", "falling oxygen saturation"],
    priorityAction: "assess airway and breathing immediately and initiate prescribed acute-asthma measures while escalating care",
    unsafeAction: "delay assessment until the next routine observation round",
    rationale: "Increasing respiratory effort and impaired speech can signal significant airflow limitation requiring prompt action.",
    relatedActions: ["monitor respiratory rate and oxygenation", "reassess response to treatment", "watch for exhaustion or reduced air entry"],
  },
  {
    id: "dvt",
    term: "possible deep-vein thrombosis",
    definition: "a suspected thrombus in a deep vein, commonly presenting with unilateral limb findings",
    clues: ["new unilateral leg swelling", "localized tenderness", "warmth compared with the other limb"],
    priorityAction: "limit unnecessary manipulation, assess the patient and escalate for diagnostic evaluation",
    unsafeAction: "vigorously massage the swollen limb",
    rationale: "A suspected thrombus requires assessment and medical evaluation; vigorous massage is inappropriate.",
    relatedActions: ["compare limb findings", "review thrombosis risk factors", "monitor for symptoms suggesting pulmonary embolism"],
  },
  {
    id: "shock",
    term: "circulatory shock",
    definition: "inadequate tissue perfusion that threatens organ function",
    clues: ["cool clammy skin", "tachycardia", "hypotension with altered mental status"],
    priorityAction: "recognise the emergency, assess ABCs and escalate immediately while supporting circulation as prescribed",
    unsafeAction: "wait for routine rounds despite progressive hypotension and confusion",
    rationale: "Shock is time-critical because persistent inadequate perfusion can rapidly cause organ injury.",
    relatedActions: ["monitor vital-sign trends", "assess urine output when relevant", "identify and report possible causes"],
  },
  {
    id: "pneumonia",
    term: "possible lower respiratory infection",
    definition: "infection affecting lower airways or lung tissue that may impair gas exchange",
    clues: ["fever with productive cough", "increased respiratory rate", "new oxygen desaturation"],
    priorityAction: "assess respiratory status and oxygenation, obtain ordered investigations and escalate deterioration",
    unsafeAction: "focus only on temperature while ignoring worsening oxygenation",
    rationale: "Respiratory compromise can be more urgent than fever alone and should be assessed promptly.",
    relatedActions: ["monitor sputum and respiratory findings", "support hydration if appropriate", "evaluate response to prescribed treatment"],
  },
  {
    id: "dehydration",
    term: "dehydration",
    definition: "a deficit of body water that can reduce circulating volume and disturb electrolyte balance",
    clues: ["reduced urine output", "dry mucous membranes", "postural dizziness"],
    priorityAction: "assess hydration status, fluid balance and haemodynamic stability and address the cause",
    unsafeAction: "record poor intake without assessing urine output or circulation",
    rationale: "Hydration assessment requires more than intake alone and should consider output, circulation and clinical signs.",
    relatedActions: ["measure intake and output", "review relevant laboratory results", "monitor response to fluid replacement"],
  },
  {
    id: "postoperative-deterioration",
    term: "postoperative deterioration",
    definition: "a clinically significant worsening after surgery that requires prompt reassessment for complications",
    clues: ["new tachycardia", "increasing pain with pallor", "falling blood pressure"],
    priorityAction: "perform a focused ABC assessment and escalate the change without delay",
    unsafeAction: "attribute all new postoperative changes to normal recovery without reassessment",
    rationale: "New abnormal vital signs after surgery may signal bleeding, infection or other complications and should not be dismissed.",
    relatedActions: ["inspect relevant drains or dressings", "review urine output", "trend observations rather than relying on one value"],
  },
];

const PHARMACOLOGY: readonly NursingConcept[] = [
  {
    id: "medication-rights",
    term: "safe medication verification",
    definition: "systematic checks that help ensure the correct medicine reaches the correct patient by the correct route, dose and time",
    clues: ["before administration", "new medication order", "high workload"],
    priorityAction: "verify the order, patient, medicine, dose, route, time and relevant safety checks before administration",
    unsafeAction: "administer from memory because the medicine is familiar",
    rationale: "Familiarity does not replace medication verification; errors can occur with common medicines.",
    relatedActions: ["check allergies", "confirm indication when unclear", "document after administration"],
  },
  {
    id: "allergy",
    term: "medication-allergy verification",
    definition: "checking documented and reported allergy information before giving a medicine",
    clues: ["new prescription", "patient reports previous rash", "drug from a related class"],
    priorityAction: "stop and clarify the allergy history before administering the medicine",
    unsafeAction: "give the medicine first and monitor for a reaction",
    rationale: "A possible allergy should be clarified before exposure whenever clinically possible.",
    relatedActions: ["document the reaction history accurately", "alert the prescriber or pharmacist when needed", "distinguish allergy from non-allergic adverse effects"],
  },
  {
    id: "high-alert",
    term: "high-alert medication safety",
    definition: "additional safeguards for medicines that can cause serious harm when used incorrectly",
    clues: ["insulin", "anticoagulant", "concentrated electrolyte"],
    priorityAction: "apply the required independent checks and monitoring for the specific high-alert medicine",
    unsafeAction: "bypass a required double-check because the ward is busy",
    rationale: "High-alert medicines warrant safeguards because errors can have severe consequences.",
    relatedActions: ["confirm dose calculations", "use standard concentrations when applicable", "monitor relevant clinical or laboratory parameters"],
  },
  {
    id: "dose-calculation",
    term: "medication dose calculation",
    definition: "determining the quantity to administer from the prescribed dose and available strength or concentration",
    clues: ["dose differs from stock strength", "liquid concentration", "weight-based order"],
    priorityAction: "convert compatible units and calculate the amount before administration, then verify reasonableness",
    unsafeAction: "ignore unit differences and use the numerical values directly",
    rationale: "Dose errors commonly arise when units or concentrations are handled incorrectly.",
    relatedActions: ["write units throughout the calculation", "recheck decimal placement", "seek an independent check when required"],
  },
  {
    id: "adverse-effect",
    term: "adverse medication effect",
    definition: "an unintended harmful response associated with a medicine used at normal doses",
    clues: ["new symptom after starting a medicine", "unexpected physiological change", "temporal relationship to administration"],
    priorityAction: "assess severity, hold or continue only according to clinical direction, and report the suspected reaction appropriately",
    unsafeAction: "dismiss a new severe symptom because the medicine was prescribed",
    rationale: "Prescribed medicines can still cause adverse effects that require assessment and escalation.",
    relatedActions: ["review timing and dose", "document the reaction", "monitor for progression"],
  },
  {
    id: "medication-reconciliation",
    term: "medication reconciliation",
    definition: "creating and comparing an accurate medication list during transitions of care",
    clues: ["hospital admission", "transfer between units", "discharge"],
    priorityAction: "compare current medicines with new orders and resolve unexplained discrepancies",
    unsafeAction: "assume the old medication list is complete without verification",
    rationale: "Transitions can introduce omissions, duplications and dose discrepancies unless medicine lists are reconciled.",
    relatedActions: ["include non-prescription medicines when relevant", "clarify stopped or changed medicines", "communicate the final list to the patient"],
  },
];

const COMMUNITY: readonly NursingConcept[] = [
  {
    id: "incidence",
    term: "incidence",
    definition: "the number or rate of new cases occurring in a population during a specified period",
    clues: ["new cases this month", "risk over time", "disease occurrence among initially unaffected people"],
    priorityAction: "count new cases during the defined period using an appropriate population denominator",
    unsafeAction: "include all old and new cases and label the result incidence",
    rationale: "Incidence focuses on newly occurring cases, not all existing disease.",
    relatedActions: ["define the population at risk", "specify the time period", "use consistent case definitions"],
  },
  {
    id: "prevalence",
    term: "prevalence",
    definition: "the proportion of a population that has a condition at a specified point or during a specified period",
    clues: ["all existing cases", "current burden", "snapshot of disease"],
    priorityAction: "count existing cases relative to the defined population",
    unsafeAction: "count only cases newly diagnosed during the observation period",
    rationale: "Prevalence describes how common a condition currently is, not just how many new cases occurred.",
    relatedActions: ["define the population clearly", "state whether prevalence is point or period", "interpret chronic-disease burden carefully"],
  },
  {
    id: "screening",
    term: "screening",
    definition: "systematic testing of apparently well people to identify those who may need further assessment",
    clues: ["asymptomatic population", "early detection", "follow-up diagnostic testing"],
    priorityAction: "use an appropriate screening method and ensure a clear pathway for confirmatory assessment",
    unsafeAction: "tell a person that a positive screening result is automatically a definitive diagnosis",
    rationale: "Screening identifies elevated probability and generally requires confirmatory evaluation.",
    relatedActions: ["explain possible results", "support follow-up", "consider benefits and harms of screening"],
  },
  {
    id: "outbreak",
    term: "outbreak response",
    definition: "coordinated investigation and control when disease occurrence exceeds what is expected",
    clues: ["cluster of similar illness", "shared exposure", "rising case count"],
    priorityAction: "verify cases, notify the appropriate public-health pathway and begin control measures based on likely transmission",
    unsafeAction: "wait until every possible case is laboratory-confirmed before initiating any proportionate control action",
    rationale: "Early investigation and proportionate control can be important while confirmation is still underway.",
    relatedActions: ["develop a case definition", "describe cases by person place and time", "communicate prevention measures"],
  },
  {
    id: "health-education",
    term: "patient-centred health education",
    definition: "education adapted to the learner's needs, understanding, language and readiness",
    clues: ["new diagnosis", "home-care instructions", "behaviour-change counselling"],
    priorityAction: "assess current understanding, teach in clear steps and confirm comprehension",
    unsafeAction: "give complex instructions rapidly and assume silence means understanding",
    rationale: "Education is more effective when matched to the person's needs and checked for understanding.",
    relatedActions: ["use teach-back", "prioritise essential information", "adapt materials to health literacy"],
  },
];

const MATERNAL_CHILD: readonly NursingConcept[] = [
  {
    id: "postpartum-haemorrhage",
    term: "possible postpartum haemorrhage",
    definition: "abnormal bleeding after birth that can cause rapid circulatory compromise",
    clues: ["heavy vaginal bleeding after birth", "boggy uterus", "tachycardia with falling blood pressure"],
    priorityAction: "recognise the emergency, call for help and begin the immediate postpartum-haemorrhage response according to protocol",
    unsafeAction: "leave the patient unassessed while waiting for the next routine observation time",
    rationale: "Significant postpartum bleeding can progress quickly and requires immediate assessment and escalation.",
    relatedActions: ["assess uterine tone", "monitor haemodynamic status", "quantify blood loss when possible"],
  },
  {
    id: "preeclampsia-warning",
    term: "severe pre-eclampsia warning signs",
    definition: "features in pregnancy that may indicate severe hypertensive disease and risk of complications",
    clues: ["severe headache", "visual disturbance", "marked hypertension"],
    priorityAction: "perform urgent maternal assessment and escalate according to obstetric protocol",
    unsafeAction: "reassure without checking blood pressure because headache is common",
    rationale: "Severe headache and visual symptoms with hypertension can indicate significant maternal risk.",
    relatedActions: ["assess for additional severe features", "monitor maternal observations", "prepare for prescribed treatment and further evaluation"],
  },
  {
    id: "newborn-thermal",
    term: "newborn thermal care",
    definition: "measures that minimise heat loss and help maintain a safe newborn temperature",
    clues: ["wet newborn", "cool environment", "low measured temperature"],
    priorityAction: "dry the newborn, provide skin-to-skin or appropriate warming and reassess temperature",
    unsafeAction: "leave wet linens in place after birth",
    rationale: "Evaporation from wet skin can rapidly lower a newborn's temperature.",
    relatedActions: ["cover the head when appropriate", "delay unnecessary exposure", "monitor temperature response"],
  },
  {
    id: "breastfeeding",
    term: "effective breastfeeding support",
    definition: "support that promotes comfortable positioning, effective attachment and adequate milk transfer",
    clues: ["painful latch", "poor milk transfer", "newborn feeding difficulty"],
    priorityAction: "observe a feed and help correct positioning and attachment",
    unsafeAction: "tell the mother to continue a painful ineffective latch without assessment",
    rationale: "Pain and poor transfer often warrant assessment of position and attachment rather than simply increasing feeding duration.",
    relatedActions: ["assess feeding cues", "review urine and stool output when relevant", "refer persistent difficulty for additional support"],
  },
];

const MENTAL_HEALTH: readonly NursingConcept[] = [
  {
    id: "therapeutic-communication",
    term: "therapeutic communication",
    definition: "purposeful communication that supports expression, assessment and a respectful clinical relationship",
    clues: ["distressed patient", "difficult disclosure", "uncertainty about feelings"],
    priorityAction: "use open questions, reflection and attentive listening without judgement",
    unsafeAction: "immediately change the subject when the patient expresses distress",
    rationale: "Therapeutic communication creates space to clarify concerns and supports accurate assessment.",
    relatedActions: ["allow appropriate silence", "validate emotion without making false promises", "summarise key concerns"],
  },
  {
    id: "suicide-risk",
    term: "acute suicide-risk assessment",
    definition: "direct assessment of suicidal thoughts, intent, plan, means and immediate safety",
    clues: ["expressed wish to die", "specific suicide plan", "recent preparatory behaviour"],
    priorityAction: "ensure immediate safety, directly assess risk and escalate according to emergency mental-health procedures",
    unsafeAction: "leave a high-risk patient alone because talking about suicide may upset them",
    rationale: "Direct assessment does not create suicidal intent and immediate safety takes priority when risk is high.",
    relatedActions: ["remove access to immediate means when appropriate", "maintain required observation", "document and communicate risk clearly"],
  },
  {
    id: "hallucination",
    term: "response to hallucinations",
    definition: "supportive care that assesses safety while acknowledging the person's experience without reinforcing the hallucination as fact",
    clues: ["hearing voices", "fear related to perceived voices", "responding to unseen stimuli"],
    priorityAction: "assess safety and distress, acknowledge the experience and orient to shared reality without arguing",
    unsafeAction: "confirm that the voices are definitely real and act on their instructions",
    rationale: "The nurse can validate distress without validating the hallucinated content as objective reality.",
    relatedActions: ["assess command content", "reduce environmental stress when helpful", "encourage coping strategies"],
  },
  {
    id: "de-escalation",
    term: "verbal de-escalation",
    definition: "using calm, respectful communication and environmental strategies to reduce escalating agitation",
    clues: ["rising voice", "pacing", "increasing irritability"],
    priorityAction: "maintain a safe distance, use calm concise communication and reduce unnecessary stimulation",
    unsafeAction: "crowd the person and argue loudly to establish authority",
    rationale: "Confrontation and crowding can increase perceived threat and worsen agitation.",
    relatedActions: ["offer simple choices when appropriate", "keep an exit route available", "call for additional support early if risk rises"],
  },
];

const CRITICAL: readonly NursingConcept[] = [
  {
    id: "airway",
    term: "airway priority",
    definition: "recognising and addressing threats to airway patency before less urgent problems",
    clues: ["stridor", "inability to speak normally", "reduced consciousness with airway risk"],
    priorityAction: "assess and support airway immediately while summoning appropriate emergency help",
    unsafeAction: "complete a routine history before responding to an obvious airway threat",
    rationale: "A threatened airway can rapidly become fatal and takes priority over non-immediate assessment tasks.",
    relatedActions: ["position appropriately", "prepare airway equipment", "monitor oxygenation and consciousness"],
  },
  {
    id: "severe-bleeding",
    term: "severe external bleeding",
    definition: "significant blood loss that can rapidly compromise circulation",
    clues: ["rapid ongoing blood loss", "soaked dressings", "tachycardia with pallor"],
    priorityAction: "call for help and apply effective bleeding-control measures while assessing circulation",
    unsafeAction: "repeatedly remove pressure to inspect the wound every few seconds",
    rationale: "Effective continuous pressure and rapid escalation are central to initial control of major external bleeding.",
    relatedActions: ["monitor for shock", "use additional haemorrhage-control measures per protocol", "prepare for definitive treatment"],
  },
  {
    id: "seizure",
    term: "seizure safety",
    definition: "protecting a person from injury while maintaining airway awareness during and after a seizure",
    clues: ["generalised convulsive movement", "loss of consciousness", "postictal confusion"],
    priorityAction: "protect from injury, time the seizure and support airway and recovery positioning as appropriate",
    unsafeAction: "force an object into the person's mouth during convulsions",
    rationale: "Objects should not be forced into the mouth; care focuses on safety, airway awareness and post-seizure assessment.",
    relatedActions: ["remove nearby hazards", "observe seizure characteristics", "escalate prolonged or recurrent seizures"],
  },
  {
    id: "deterioration",
    term: "clinical deterioration",
    definition: "a meaningful change in physiological or neurological status suggesting increasing risk",
    clues: ["rising respiratory rate", "new confusion", "falling blood pressure"],
    priorityAction: "repeat an ABC assessment, compare trends and escalate promptly using the local deterioration pathway",
    unsafeAction: "document abnormal observations without reassessing the patient",
    rationale: "Trend changes and altered mental status can be early indicators of significant deterioration.",
    relatedActions: ["repeat vital signs", "seek senior or emergency review", "communicate using a structured handover"],
  },
];

const LEADERSHIP: readonly NursingConcept[] = [
  {
    id: "delegation",
    term: "safe delegation",
    definition: "assigning a task to an appropriate team member while retaining suitable oversight and accountability",
    clues: ["multiple competing tasks", "different staff competencies", "changing patient acuity"],
    priorityAction: "match the task to the team member's competence and the patient's stability, then provide clear instructions and follow-up",
    unsafeAction: "delegate an assessment requiring professional judgement to someone not authorised or competent to perform it",
    rationale: "Delegation must consider scope, competence, patient condition and the level of supervision required.",
    relatedActions: ["clarify expected outcomes", "remain available for escalation", "evaluate the completed task"],
  },
  {
    id: "handover",
    term: "structured clinical handover",
    definition: "clear transfer of relevant patient information, current risks and required actions between clinicians",
    clues: ["shift change", "transfer to another unit", "urgent escalation"],
    priorityAction: "communicate current situation, relevant background, assessment and required next actions clearly",
    unsafeAction: "omit a recent deterioration because it is already written somewhere in the notes",
    rationale: "Critical changes should be actively communicated during handover rather than relying on passive record review.",
    relatedActions: ["highlight pending actions", "confirm understanding", "prioritise immediate safety concerns"],
  },
  {
    id: "incident-learning",
    term: "patient-safety incident response",
    definition: "immediate patient protection followed by transparent reporting and system learning after an error or near miss",
    clues: ["medication error", "near miss", "unexpected preventable harm"],
    priorityAction: "address immediate patient safety, notify the appropriate clinician and follow the reporting pathway",
    unsafeAction: "hide the incident because no harm is immediately visible",
    rationale: "Near misses and errors can reveal system risks and should be managed transparently according to policy.",
    relatedActions: ["monitor the patient as indicated", "document factual information", "participate in systems-focused review"],
  },
];

const ANATOMY_PHYSIOLOGY: readonly NursingConcept[] = [
  {
    id: "gas-exchange",
    term: "alveolar gas exchange",
    definition: "diffusion of oxygen and carbon dioxide across the alveolar-capillary membrane",
    clues: ["alveoli", "oxygen diffusion", "carbon dioxide removal"],
    priorityAction: "relate effective gas exchange to ventilation, perfusion and an intact diffusion surface",
    unsafeAction: "describe oxygen exchange as occurring primarily in the large bronchi",
    rationale: "Most pulmonary gas exchange occurs across the thin alveolar-capillary interface.",
    relatedActions: ["connect ventilation to alveolar air", "connect perfusion to pulmonary blood flow", "recognise diffusion limitations"],
  },
  {
    id: "cardiac-output",
    term: "cardiac output",
    definition: "the volume of blood pumped by a ventricle per minute",
    clues: ["heart rate", "stroke volume", "systemic perfusion"],
    priorityAction: "calculate or reason about cardiac output as heart rate multiplied by stroke volume",
    unsafeAction: "treat cardiac output as identical to blood pressure",
    rationale: "Cardiac output reflects flow per minute, while blood pressure reflects pressure within the circulation.",
    relatedActions: ["consider preload and contractility", "relate output to tissue perfusion", "interpret trends in clinical context"],
  },
  {
    id: "renal-filtration",
    term: "glomerular filtration",
    definition: "movement of plasma water and small solutes from glomerular capillaries into Bowman's space",
    clues: ["glomerulus", "filtrate", "renal blood flow"],
    priorityAction: "relate filtration to glomerular pressure and membrane properties",
    unsafeAction: "describe normal filtration as active pumping of whole blood cells into the nephron",
    rationale: "Normal glomerular filtration allows water and small solutes through while retaining cells and most large proteins.",
    relatedActions: ["connect filtration with GFR", "distinguish filtration from tubular reabsorption", "relate renal perfusion to kidney function"],
  },
  {
    id: "homeostasis",
    term: "homeostasis",
    definition: "dynamic regulation that keeps internal conditions within ranges compatible with normal function",
    clues: ["negative feedback", "temperature regulation", "blood glucose control"],
    priorityAction: "identify the sensor, control process and effector response involved in restoring a regulated variable",
    unsafeAction: "define homeostasis as keeping every body variable absolutely constant",
    rationale: "Homeostasis maintains controlled ranges through feedback rather than eliminating all physiological variation.",
    relatedActions: ["distinguish negative and positive feedback", "identify regulated variables", "connect failure of regulation with disease"],
  },
];

function domainFor(subject: string, topic: string): NursingDomain {
  const text = `${subject} ${topic}`.toLowerCase();
  if (/anatomy|physiology/.test(text)) return "anatomy-physiology";
  if (/pharmac/.test(text)) return "pharmacology";
  if (/microbiol|infection/.test(text)) return "microbiology";
  if (/community|public health|epidemiol/.test(text)) return "community";
  if (/maternal|child|obstetric|newborn|paediatric/.test(text)) return "maternal-child";
  if (/mental|psychiatr/.test(text)) return "mental-health";
  if (/emergency|critical|advanced clinical/.test(text)) return "critical-care";
  if (/leadership|management/.test(text)) return "leadership";
  if (/medical-surgical/.test(text)) return "medical-surgical";
  if (/fundamental|clinical procedure|patient safety|care planning|communication|ethic/.test(text)) return "foundations";
  return "general";
}

function conceptsFor(domain: NursingDomain): readonly NursingConcept[] {
  switch (domain) {
    case "foundations": return FOUNDATIONS;
    case "medical-surgical": return MED_SURG;
    case "pharmacology": return PHARMACOLOGY;
    case "microbiology": return [...FOUNDATIONS.slice(0, 2), ...COMMUNITY.slice(2, 4)];
    case "community": return COMMUNITY;
    case "maternal-child": return MATERNAL_CHILD;
    case "mental-health": return MENTAL_HEALTH;
    case "critical-care": return CRITICAL;
    case "leadership": return LEADERSHIP;
    case "anatomy-physiology": return ANATOMY_PHYSIOLOGY;
    default: return [...FOUNDATIONS, ...MED_SURG, ...PHARMACOLOGY, ...COMMUNITY, ...MENTAL_HEALTH, ...CRITICAL];
  }
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function rotate<T>(values: readonly T[], offset: number) {
  if (!values.length) return [] as T[];
  const shift = offset % values.length;
  return [...values.slice(shift), ...values.slice(0, shift)];
}

function pick<T>(values: readonly T[], seed: number, offset = 0) {
  return values[(seed + offset) % values.length];
}

function levelDifficulty(levelId: string): 1 | 2 | 3 | 4 | 5 {
  if (levelId === "level-100") return 3;
  if (levelId === "level-200") return 4;
  return 5;
}

function challengeFor(levelId: string, family: number): CognitiveChallenge {
  if (family <= 1) return levelId === "level-100" ? "Recall" : "Apply";
  if (family <= 5) return "Apply";
  if (family <= 9) return "Analyse";
  return family === 10 ? "Evaluate" : "Transfer";
}

function optionSet(correct: string, wrong: readonly string[], seed: number) {
  const choices = Array.from(new Set([correct, ...wrong])).slice(0, 4);
  const rotated = rotate(choices, seed);
  return {
    options: rotated.map((label, index) => ({ id: String(index), label })),
    answer: String(rotated.indexOf(correct)),
  };
}

function multiSet(correct: readonly string[], wrong: readonly string[], seed: number) {
  const choices = Array.from(new Set([...correct, ...wrong])).slice(0, 6);
  const rotated = rotate(choices, seed);
  return {
    options: rotated.map((label, index) => ({ id: String(index), label })),
    answer: correct.map((value) => String(rotated.indexOf(value))).filter((value) => value !== "-1"),
  };
}

function plausibleTerms(concepts: readonly NursingConcept[], item: NursingConcept, seed: number) {
  return rotate(concepts.filter((entry) => entry.id !== item.id), seed).slice(0, 3).map((entry) => entry.term);
}

function plausibleActions(concepts: readonly NursingConcept[], item: NursingConcept, seed: number) {
  return rotate(concepts.filter((entry) => entry.id !== item.id), seed).slice(0, 3).map((entry) => entry.priorityAction);
}

function labels(config: SessionConfig) {
  const { subject, topic } = resolveCatalogSelection(config);
  return {
    subject: subject?.label ?? "Nursing",
    topic: topic?.label ?? "Mixed nursing practice",
  };
}

function baseQuestion(
  config: SessionConfig,
  family: string,
  position: number,
  seed: number,
  prompt: string,
  skill: string,
  extras: Pick<LearnQuestion, "kind" | "answer" | "explanation"> & Partial<LearnQuestion>,
): LearnQuestion {
  const selected = labels(config);
  return {
    id: `nursing-${family}-${config.levelId}-${seed}-${position}`,
    exposureKey: `nursing:${config.programId}:${config.levelId}:${config.subjectId}:${config.topicId}:${family}:${seed}:${position}`,
    subject: selected.subject,
    topic: selected.topic,
    skill,
    difficulty: levelDifficulty(config.levelId),
    challenge: challengeFor(config.levelId, position % 12),
    mission: "Think like a nurse: assess, prioritise, act safely, and evaluate",
    generationFamily: `nursing-${family}`,
    provenance: { sourceType: "original", rightsStatus: "not-applicable" },
    prompt,
    ...extras,
  };
}

function clinicalTable(item: NursingConcept, seed: number): QuestionStimulus {
  const physiological = [
    "shock",
    "postoperative-deterioration",
    "deterioration",
    "asthma-deterioration",
    "heart-failure",
    "pneumonia",
    "dehydration",
    "hypoglycaemia",
    "postpartum-haemorrhage",
    "preeclampsia-warning",
  ].includes(item.id);

  if (!physiological) {
    return {
      kind: "table",
      title: "Clinical safety review",
      columns: ["Review item", "Finding"],
      rows: [
        ["Relevant cue", item.clues[seed % item.clues.length]],
        ["Additional cue", item.clues[(seed + 1) % item.clues.length]],
        ["Current practice", item.unsafeAction],
        ["Required follow-up", "Not yet completed"],
      ],
    };
  }

  const basePulse = 72 + (seed % 12);
  const baseResp = 16 + (seed % 4);
  const baseSbp = 118 + (seed % 10);
  const currentPulse = basePulse + 28 + (seed % 9);
  const currentResp = baseResp + 8 + (seed % 5);
  const currentSbp = baseSbp - 22 - (seed % 11);
  return {
    kind: "table",
    title: "Observation trend",
    columns: ["Observation", "Earlier", "Current"],
    rows: [
      ["Pulse", `${basePulse}/min`, `${currentPulse}/min`],
      ["Respiratory rate", `${baseResp}/min`, `${currentResp}/min`],
      ["Systolic BP", `${baseSbp} mmHg`, `${currentSbp} mmHg`],
      ["Mental status", "Alert", "New concern / change"],
    ],
  };
}

function buildQuestion(
  config: SessionConfig,
  concepts: readonly NursingConcept[],
  item: NursingConcept,
  position: number,
  seed: number,
): LearnQuestion {
  const family = position % 12;
  const local = hash(`${seed}:${position}:${item.id}`);
  const setting = pick(SETTINGS, local);
  const age = pick(AGES, local, 2);
  const clueA = item.clues[local % item.clues.length];
  const clueB = item.clues[(local + 1) % item.clues.length];

  if (family === 0) {
    const picked = optionSet(item.term, plausibleTerms(concepts, item, local), local);
    return baseQuestion(config, "recognition", position, seed,
      `Which nursing concept is most directly represented by the following finding or situation: ${clueA}?`,
      `Recognise ${item.term}`,
      {
        kind: "single",
        options: picked.options,
        answer: picked.answer,
        explanation: `${item.term}: ${item.definition}. ${item.rationale}`,
        hint: "Focus on the clinical meaning of the finding, not on a person's name or setting.",
      },
    );
  }

  if (family === 1) {
    const name = pick(NAMES, local);
    const picked = optionSet(item.priorityAction, plausibleActions(concepts, item, local), local);
    return baseQuestion(config, "named-vignette", position, seed,
      `${name}, aged ${age}, is being assessed ${setting}. The nurse notes ${clueA} and ${clueB}. Which response is most appropriate now?`,
      `Apply ${item.term} in a patient vignette`,
      {
        kind: "single",
        options: picked.options,
        answer: picked.answer,
        explanation: item.rationale,
        hint: "Identify the immediate nursing priority created by the findings.",
      },
    );
  }

  if (family === 2) {
    const picked = optionSet(item.priorityAction, [
      item.unsafeAction,
      ...rotate(item.relatedActions, local).slice(0, 2),
    ], local);
    return baseQuestion(config, "priority-first", position, seed,
      `A ${age}-year-old patient has ${clueA} together with ${clueB}. Which nursing action should receive priority?`,
      `Prioritise care for ${item.term}`,
      {
        kind: "single",
        options: picked.options,
        answer: picked.answer,
        explanation: item.rationale,
        hint: "Prioritise immediate safety and physiological risk before routine tasks.",
      },
    );
  }

  if (family === 3) {
    const correct = [item.priorityAction, ...item.relatedActions.slice(0, 2)];
    const wrong = [
      item.unsafeAction,
      ...rotate(concepts.filter((entry) => entry.id !== item.id), local).slice(0, 2).map((entry) => entry.unsafeAction),
    ];
    const picked = multiSet(correct, wrong, local);
    return baseQuestion(config, "select-all", position, seed,
      `Select all actions that are appropriate when applying the principle of ${item.term}.`,
      `Select safe actions for ${item.term}`,
      {
        kind: "multi",
        options: picked.options,
        answer: picked.answer,
        explanation: `${item.rationale} Appropriate actions include: ${correct.join("; ")}.`,
        hint: "More than one option may be correct. Judge each option independently.",
      },
    );
  }

  if (family === 4) {
    return baseQuestion(config, "fill-term", position, seed,
      `Fill in the nursing term: ______ is defined as ${item.definition}.`,
      `Recall the term ${item.term}`,
      {
        kind: "fill",
        answer: item.term,
        acceptedAnswers: [item.term, item.term.toLowerCase()],
        explanation: `The correct term is ${item.term}.`,
        hint: "Use the definition rather than the wording pattern to identify the concept.",
      },
    );
  }

  if (family === 5) {
    const picked = optionSet(item.unsafeAction, [
      item.priorityAction,
      ...rotate(item.relatedActions, local).slice(0, 2),
    ], local);
    return baseQuestion(config, "error-spotting", position, seed,
      `During a review of care related to ${item.term}, which action requires correction?`,
      `Detect unsafe practice in ${item.term}`,
      {
        kind: "single",
        options: picked.options,
        answer: picked.answer,
        explanation: `${item.unsafeAction} requires correction. ${item.rationale}`,
        hint: "Look for the action that introduces avoidable risk or contradicts the principle.",
      },
    );
  }

  if (family === 6) {
    const correct = item.rationale;
    const wrong = rotate(concepts.filter((entry) => entry.id !== item.id), local)
      .slice(0, 3)
      .map((entry) => entry.rationale);
    const picked = optionSet(correct, wrong, local);
    return baseQuestion(config, "rationale", position, seed,
      `Why is the following nursing action important: “${item.priorityAction}”?`,
      `Explain the rationale for ${item.term}`,
      {
        kind: "single",
        options: picked.options,
        answer: picked.answer,
        explanation: item.rationale,
        hint: "Choose the reason that connects the action to the clinical risk it is meant to address.",
      },
    );
  }

  if (family === 7) {
    const stimulus = clinicalTable(item, local);
    const picked = optionSet(item.priorityAction, plausibleActions(concepts, item, local), local);
    return baseQuestion(config, "chart-trend", position, seed,
      "Review the observation trend. Which nursing response is most appropriate based on the pattern shown?",
      `Interpret observations in relation to ${item.term}`,
      {
        kind: "single",
        options: picked.options,
        answer: picked.answer,
        explanation: item.rationale,
        stimulus,
        hint: "Compare the direction of change across observations instead of reading one value in isolation.",
      },
    );
  }

  if (family === 8) {
    const passage = `During handover, the outgoing nurse reports ${clueA}. A later review identifies ${clueB}. The patient has not yet received the planned reassessment. The next nurse must decide what information and action should be prioritised.`;
    const picked = optionSet(item.priorityAction, [
      item.unsafeAction,
      ...plausibleActions(concepts, item, local).slice(0, 2),
    ], local);
    return baseQuestion(config, "handover", position, seed,
      "Based on the handover information, what should the receiving nurse do next?",
      `Act on clinical handover involving ${item.term}`,
      {
        kind: "single",
        options: picked.options,
        answer: picked.answer,
        explanation: item.rationale,
        stimulus: { kind: "passage", title: "Clinical handover", text: passage },
        hint: "Use the change in condition and outstanding reassessment to decide the next action.",
      },
    );
  }

  if (family === 9) {
    return baseQuestion(config, "short-response", position, seed,
      `In one short phrase, name the nursing principle most relevant when a patient presents with ${clueA} and ${clueB}.`,
      `Generate the concept ${item.term}`,
      {
        kind: "short",
        answer: item.term,
        acceptedAnswers: [item.term, item.term.toLowerCase()],
        explanation: `${item.term} is the relevant principle. ${item.rationale}`,
        hint: "Give the nursing concept, not a full care plan.",
      },
    );
  }

  if (family === 10) {
    const assertion = local % 2 === 0
      ? `${item.priorityAction} is consistent with safe management of ${item.term}.`
      : `${item.unsafeAction} is an appropriate way to manage ${item.term}.`;
    const answer = local % 2 === 0;
    return baseQuestion(config, "evaluate-claim", position, seed,
      `Evaluate this clinical statement: “${assertion}”`,
      `Evaluate reasoning about ${item.term}`,
      {
        kind: "boolean",
        answer,
        explanation: answer ? item.rationale : `The statement is unsafe or inaccurate. ${item.rationale}`,
        hint: "Judge the clinical reasoning in the statement, not whether the wording sounds familiar.",
      },
    );
  }

  const distractors = rotate(concepts.filter((entry) => entry.id !== item.id), local).slice(0, 3);
  const correct = `${clueA} → ${item.term} → ${item.priorityAction}`;
  const wrong = distractors.map((entry) => `${pick(entry.clues, local)} → ${entry.term} → ${entry.priorityAction}`);
  const picked = optionSet(correct, wrong, local);
  return baseQuestion(config, "reasoning-chain", position, seed,
    "Which finding → interpretation → nursing-action chain is internally consistent?",
    `Connect findings to action for ${item.term}`,
    {
      kind: "single",
      options: picked.options,
      answer: picked.answer,
      explanation: `The consistent chain is: ${correct}. ${item.rationale}`,
      hint: "Check all three links: finding, interpretation, and action.",
    },
  );
}

export function nursingCapacityForSelection(config: SessionConfig) {
  if (config.lane !== "university" || config.programId !== "nursing") return 0;
  const { level, subject, topic } = resolveCatalogSelection(config);
  if (!level) return 0;
  if (config.subjectId !== "all" && !subject) return 0;

  if (config.topicId !== "all" && !topic) return 0;
  const subjects = config.subjectId === "all" ? level.subjects : subject ? [subject] : [];
  const topicCount = subjects.reduce(
    (total, current) => total + (config.topicId === "all" ? current.topics.length : current.topics.filter((entry) => entry.id === config.topicId).length),
    0,
  );
  return topicCount * NURSING_TOPIC_CAPACITY;
}

export function buildNursingQuestions(
  config: SessionConfig,
  requestedCount = config.count,
  seed = config.seed ?? Date.now(),
): LearnQuestion[] {
  if (config.lane !== "university" || config.programId !== "nursing") return [];

  const requested = Math.max(0, Math.min(500, Math.floor(requestedCount)));
  if (!requested) return [];

  const { level, subject: selectedSubject, topic: selectedTopic } = resolveCatalogSelection(config);
  if (!level) return [];

  const targets = (config.subjectId === "all" ? level.subjects : selectedSubject ? [selectedSubject] : []).flatMap((subject) => {
    const topics = config.topicId === "all"
      ? subject.topics
      : selectedTopic && selectedSubject?.id === subject.id ? [selectedTopic] : [];
    return topics.map((topic) => ({ subject, topic }));
  });
  if (!targets.length) return [];

  const output: LearnQuestion[] = [];
  const seenPrompts = new Set<string>();

  for (let position = 0; output.length < requested && position < requested * 30; position += 1) {
    const target = targets[position % targets.length];
    const domain = domainFor(target.subject.label, target.topic.label);
    const concepts = conceptsFor(domain);
    const local = hash(`${seed}:${target.subject.id}:${target.topic.id}:${position}`);
    const item = concepts[local % concepts.length];

    const localConfig: SessionConfig = {
      ...config,
      subjectId: target.subject.id,
      topicId: target.topic.id,
    };

    const question = buildQuestion(localConfig, concepts, item, position, seed);
    if (seenPrompts.has(question.prompt)) continue;
    seenPrompts.add(question.prompt);
    output.push(question);
  }

  return output;
}
