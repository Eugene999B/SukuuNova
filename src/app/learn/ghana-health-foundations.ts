import type { LearnQuestion, SessionConfig, CatalogLevel } from "./learn-domain";

// Original educational items. Curriculum and factual references are recorded in
// docs/ghana-learning-curriculum-2026-09-30.md. These are not official exam questions.
const ROWS = [
  [
    "therapeutic",
    "listening",
    "active listening",
    "giving focused attention and checking the speaker's meaning",
    "A patient pauses while describing a worry.",
    "Allow time, attend to the patient and invite them to continue.",
    "Interrupt and change the subject.",
    "Attention and clarification help the patient express concerns accurately."
  ],
  [
    "therapeutic",
    "listening",
    "open-ended questioning",
    "inviting an answer in the patient's own words",
    "You want to understand how a symptom affects daily life.",
    "Ask: How has this affected your usual activities?",
    "Ask only: You are fine now, aren't you?",
    "An open question gathers the patient's account without suggesting the answer."
  ],
  [
    "therapeutic",
    "understanding",
    "teach-back",
    "checking an explanation by asking the learner to explain it in their own words",
    "You have explained a care instruction to a patient.",
    "Ask the patient to explain the instruction back in their own words.",
    "Treat a nod as proof that the instruction was understood.",
    "Teach-back checks how clearly the information was explained; it is not a test of the patient's intelligence."
  ],
  [
    "therapeutic",
    "understanding",
    "clarification",
    "checking an unclear statement before interpreting it",
    "A patient says: I feel strange.",
    "Ask the patient to describe what strange means to them.",
    "Record a specific symptom without asking what the patient meant.",
    "Clarification reduces assumptions and improves the accuracy of assessment."
  ],
  [
    "therapeutic",
    "listening",
    "therapeutic silence",
    "allowing a purposeful pause that gives the person time to think or express emotion",
    "A patient becomes tearful during an interview.",
    "Remain attentive and allow a pause before gently inviting the patient to speak.",
    "Fill every pause with unrelated advice.",
    "A supportive pause can help a patient process feelings without being rushed."
  ],
  [
    "therapeutic",
    "understanding",
    "professional interpretation",
    "using an appropriate interpreter when a language barrier affects care",
    "A patient cannot understand the language used for an important care discussion.",
    "Arrange a suitable interpreter and speak directly to the patient.",
    "Assume that speaking louder will solve the language barrier.",
    "Interpretation supports accurate communication; loudness does not translate meaning."
  ],
  [
    "professional",
    "ethics",
    "confidentiality",
    "protecting personal information from unauthorised disclosure",
    "A visitor asks for details of a patient's diagnosis without permission.",
    "Follow the confidentiality procedure and verify authority before sharing information.",
    "Discuss the diagnosis with the visitor because they seem concerned.",
    "Concern alone does not establish authority to receive private information."
  ],
  [
    "professional",
    "ethics",
    "informed consent",
    "a voluntary decision made with relevant information and the opportunity to ask questions",
    "A patient says they do not understand a planned procedure.",
    "Pause and obtain an appropriate explanation before proceeding with consent.",
    "Ask for a signature without addressing the patient's questions.",
    "A signature alone does not establish an informed decision."
  ],
  [
    "professional",
    "practice",
    "scope of practice",
    "the boundaries of activities a practitioner is educated, competent and authorised to perform",
    "A student is asked to perform an unfamiliar procedure independently.",
    "Seek the supervising practitioner and explain the limits of current competence.",
    "Perform the procedure without supervision to appear confident.",
    "Recognising limits and obtaining supervision protects the patient and supports learning."
  ],
  [
    "professional",
    "practice",
    "accountability",
    "being answerable for one's decisions, actions and omissions",
    "A learner discovers an error in care they provided.",
    "Report promptly through the appropriate process and support corrective action.",
    "Hide the error to avoid an unfavourable assessment.",
    "Prompt reporting supports patient safety and a factual review of what happened."
  ],
  [
    "professional",
    "ethics",
    "professional boundaries",
    "maintaining a care relationship centred on the patient's needs",
    "A patient requests a personal relationship unrelated to their care.",
    "Respond respectfully and maintain the professional care boundary.",
    "Accept the request because the patient has offered a gift.",
    "Boundaries protect the therapeutic relationship from conflicting personal interests."
  ],
  [
    "professional",
    "practice",
    "reflective practice",
    "reviewing an experience to identify learning and improve future practice",
    "A supervised clinical session has ended.",
    "Identify what happened, what was learned and a specific improvement for next time.",
    "Record only that the session was completed.",
    "Reflection connects experience with deliberate improvement."
  ],
  [
    "informatics",
    "records",
    "objective documentation",
    "recording observable facts and attributed patient statements accurately",
    "A patient declines a meal and says they feel nauseated.",
    "Document the refusal and the patient's stated reason accurately.",
    "Write that the patient is difficult without describing what happened.",
    "Factual observations and attributed statements are more useful than judgemental labels."
  ],
  [
    "informatics",
    "security",
    "least-privilege access",
    "limiting access to the information needed for an authorised task",
    "A trainee can open many patient records but is caring for one assigned patient.",
    "Access only records needed for authorised care and training.",
    "Browse an unrelated neighbour's record out of curiosity.",
    "Technical access does not grant permission to use information for an unrelated purpose."
  ],
  [
    "informatics",
    "security",
    "individual authentication",
    "using a personal authorised account that identifies the person performing an action",
    "A colleague asks to use your clinical-system password.",
    "Decline and direct them to obtain their own authorised access.",
    "Share your password so their work appears under your account.",
    "Individual accounts support access control and an accurate audit trail."
  ],
  [
    "informatics",
    "records",
    "data validation",
    "checking that entered information is accurate and in the expected form",
    "A recorded temperature contains an obvious typing error.",
    "Check the original observation and correct the entry through the approved process.",
    "Guess a plausible number and overwrite the record silently.",
    "Corrections should be traceable and based on verified observations."
  ],
  [
    "informatics",
    "records",
    "audit trail",
    "a record of who performed an action and when it occurred",
    "A supervisor investigates a corrected electronic entry.",
    "Review the authorised audit history of the change.",
    "Remove the history so only the final value remains.",
    "The history supports accountability and helps reconstruct the sequence of events."
  ],
  [
    "informatics",
    "security",
    "secure workstation use",
    "protecting access to an electronic record when leaving a device",
    "You must leave an unlocked clinical workstation.",
    "Lock or sign out of the workstation according to local policy.",
    "Leave it open because the next person also works in the facility.",
    "An unattended signed-in session can permit unauthorised access or misleading entries."
  ],
  [
    "first-aid",
    "scene",
    "scene safety",
    "checking for hazards before approaching a casualty",
    "An injured person is beside exposed electrical wiring.",
    "Keep clear of the electrical hazard and obtain appropriate emergency help.",
    "Touch the casualty before the electrical danger is controlled.",
    "A rescuer must avoid becoming another casualty."
  ],
  [
    "first-aid",
    "scene",
    "emergency activation",
    "summoning appropriate help promptly when a serious emergency is recognised",
    "An assessment suggests an immediately life-threatening problem.",
    "Activate the local emergency response and give the location and observed problem.",
    "Wait until all routine paperwork is completed before seeking help.",
    "Early activation brings trained assistance and equipment to the scene."
  ],
  [
    "first-aid",
    "injury",
    "direct pressure",
    "applying firm pressure to help control external bleeding",
    "An injured person has severe external bleeding and the scene is safe.",
    "Apply firm direct pressure with an appropriate dressing while obtaining urgent help.",
    "Repeatedly remove the dressing to inspect the wound.",
    "Maintained pressure supports bleeding control; severe bleeding requires urgent care."
  ],
  [
    "first-aid",
    "injury",
    "burn cooling",
    "using cool running water to reduce heat in a thermal burn",
    "A person has a fresh thermal burn after contact with hot liquid.",
    "Cool the burn with cool running water and seek care appropriate to its severity.",
    "Apply ice or butter directly to the burn.",
    "Cooling removes heat; ice and household substances can cause further harm."
  ],
  [
    "first-aid",
    "scene",
    "structured handover",
    "communicating the event, observations and actions clearly to the next care provider",
    "An ambulance team arrives after first aid has been given.",
    "Report what happened, what you observed and what care was given.",
    "State only that everything has already been handled.",
    "A clear handover supports continuity and prevents important information being lost."
  ],
  [
    "first-aid",
    "injury",
    "safe response to a seizure",
    "protecting the person from injury during a seizure and obtaining help as indicated",
    "A person begins convulsing in a safe area.",
    "Clear nearby hazards, protect the head and time the seizure.",
    "Force an object into the person's mouth.",
    "Objects in the mouth and forceful restraint can cause injury; assessment and emergency escalation remain important."
  ],
  [
    "microbiology",
    "organisms",
    "bacterium",
    "a single-celled organism belonging to the domain Bacteria",
    "A laboratory teaching example describes a single-celled prokaryote.",
    "Classify it as a bacterium.",
    "Classify it as a human tissue cell.",
    "Bacteria are prokaryotic cells; human cells are eukaryotic."
  ],
  [
    "microbiology",
    "organisms",
    "virus",
    "an infectious agent that depends on a host cell to reproduce",
    "A teaching example describes a non-cellular infectious agent that replicates only within living host cells.",
    "Identify the agent as a virus.",
    "Assume that the agent reproduces independently on its own.",
    "Viruses depend on cellular machinery in a host for replication."
  ],
  [
    "microbiology",
    "prevention",
    "sterilisation",
    "a validated process intended to eliminate all forms of microbial life, including bacterial spores",
    "A reusable instrument must be sterile for its intended procedure.",
    "Use the validated sterilisation process appropriate to that instrument.",
    "Assume a visibly clean surface is necessarily sterile.",
    "Cleaning, disinfection and sterilisation are different processes."
  ],
  [
    "microbiology",
    "prevention",
    "standard precautions",
    "infection-prevention measures applied to all patients according to exposure risk",
    "A patient has no known infection but a task may involve body fluids.",
    "Apply standard precautions and appropriate protection for the task.",
    "Omit precautions because no infection has been diagnosed.",
    "An infection may be unrecognised; precautions are based on the task and exposure risk."
  ],
  [
    "microbiology",
    "prevention",
    "hand hygiene",
    "cleaning hands at appropriate moments to reduce microbial transmission",
    "A worker has just removed gloves after patient care.",
    "Perform hand hygiene using the appropriate method.",
    "Skip hand hygiene because gloves were used.",
    "Gloves do not replace hand hygiene."
  ],
  [
    "microbiology",
    "organisms",
    "antimicrobial resistance",
    "the ability of a microorganism to withstand an antimicrobial that would otherwise inhibit or kill it",
    "An isolate is not susceptible to an antimicrobial in laboratory testing.",
    "Interpret the result as resistance in the organism and follow the prescribed review process.",
    "State that the patient's body has become resistant to the medicine.",
    "Resistance describes the microorganism, not the patient's body."
  ],
  [
    "paediatric",
    "assessment",
    "growth monitoring",
    "following a child's measurements over time using an appropriate growth chart",
    "A clinic has several dated weight measurements for a child.",
    "Plot the measurements on an appropriate age- and sex-specific chart and assess the pattern.",
    "Judge long-term growth from a single weight without age or previous measurements.",
    "Serial measurements and the appropriate chart support interpretation; one isolated number does not describe a growth pattern."
  ],
  [
    "paediatric",
    "assessment",
    "age-appropriate assessment",
    "interpreting a child's findings in relation to their age and development",
    "You assess a young child using observations and vital signs.",
    "Use age-appropriate reference ranges and the child's clinical condition.",
    "Apply adult reference ranges to every child.",
    "Children's expected findings change with age; adult ranges are not universal paediatric ranges."
  ],
  [
    "paediatric",
    "family",
    "family-centred care",
    "planning care in partnership with the child and their family as appropriate",
    "A parent knows the child's usual behaviour and is worried about a change.",
    "Listen to the parent, assess the child and involve the family appropriately in the care plan.",
    "Dismiss the concern because the parent is not a clinician.",
    "Family observations help establish the child's baseline and may identify meaningful changes."
  ],
  [
    "paediatric",
    "family",
    "developmentally appropriate explanation",
    "explaining care in a way matched to the child's understanding",
    "A young child is anxious before a simple examination.",
    "Use clear age-appropriate language and allow suitable demonstration or play.",
    "Give a detailed adult technical lecture regardless of the child's understanding.",
    "Communication should match developmental ability and allow the child to ask or show concerns."
  ],
  [
    "paediatric",
    "assessment",
    "paediatric weight verification",
    "checking a current weight in kilograms before a weight-based calculation",
    "A simulated medicine calculation requires a child's weight.",
    "Confirm the current measured weight and its unit before calculating.",
    "Use an unverified old weight recorded in an unknown unit.",
    "A wrong weight or unit can produce a wrong calculation; a computed dose still requires clinical verification."
  ],
  [
    "paediatric",
    "family",
    "child injury prevention",
    "reducing hazards according to the child's stage of development",
    "A mobile toddler can reach a container of medicine at home.",
    "Store medicines securely out of the child's reach and sight.",
    "Rely on a warning label to stop the toddler opening the container.",
    "A young child's behaviour and development require environmental protection rather than reliance on reading instructions."
  ]
] as const;
type Row = typeof ROWS[number];
export function healthCourseKey(label: string): string | null {
  const value = label.toLowerCase();
  if (/primary care of children|foundations.*paediatric|applied diagnostics.*child|^paediatric nursing$/.test(value)) return "paediatric";
  if (/therapeutic communication|communication in healthcare/.test(value)) return "therapeutic";
  if (/professional adjustment|professionalism/.test(value)) return "professional";
  if (/informatics/.test(value)) return "informatics";
  if (/first aid/.test(value)) return "first-aid";
  if (/microbiology/.test(value)) return "microbiology";
  return null;
}
const TOPICS: Record<string,Record<string,string>> = {
  paediatric:{assessment:"Child assessment and growth",family:"Family partnership and child safety"},
  therapeutic:{listening:"Listening and therapeutic relationships",understanding:"Understanding and communication barriers"},
  professional:{ethics:"Ethics and patient rights",practice:"Professional practice and accountability"},
  informatics:{records:"Clinical records and data quality",security:"Confidentiality and digital security"},
  "first-aid":{scene:"Scene safety and emergency response",injury:"Injury recognition and first aid"},
  microbiology:{organisms:"Microorganisms and infection",prevention:"Infection prevention and control"},
};
export function ghanaHealthCourseTopics(label:string): string[] | null {
  const key=healthCourseKey(label);
  return key ? Object.values(TOPICS[key]) : null;
}
function slug(value:string) { return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function hash(value:string) { let h=2166136261; for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
function task(row:Row, config:SessionConfig, subject:string, family:number, seed:number): LearnQuestion {
  const [course, topic, term, definition, scenario, action, unsafe, rationale]=row;
  const other=ROWS.filter(item=>item[0]===course&&item[2]!==term);
  const key=`nursing:${config.programId}:${config.levelId}:${course}:${slug(term)}:${family}`;
  const q:LearnQuestion={
    id:key+":"+seed,exposureKey:key,subject,topic:TOPICS[course][topic],
    difficulty:family===0||family===2?1:2,challenge:family===0||family===2?"Recall":family===3?"Analyse":"Apply",
    kind:"single",prompt:"",answer:"",explanation:rationale,skill:term,
    generationFamily:"nursing-foundation-"+["concept","scenario","recall","practice-review"][family],
    provenance:{sourceType:"original",rightsStatus:"not-applicable"},
  };
  let correct="",wrong:string[]=[];
  if(family===0) {q.prompt=`Which term means ${definition}?`;correct=term;wrong=other.slice(0,3).map(item=>item[2]);}
  if(family===1) {q.prompt="What is the most appropriate response to this situation?";q.stimulus={kind:"passage",title:"Supervised practice scenario",text:scenario};correct=action;wrong=[unsafe,...other.slice(0,2).map(item=>item[5])];}
  if(family===2) {q.prompt=`Write the term for ${definition}.`;q.kind="short";q.answer=term;q.acceptedAnswers=[term];q.explanation=`${term}: ${definition}. ${rationale}`;return q;}
  if(family===3) {q.prompt="Does the documented response follow the principle being assessed?";q.kind="boolean";const safe=hash(key+seed)%2===0;q.answer=safe;q.stimulus={kind:"table",title:"Practice review",columns:["Item","Detail"],rows:[["Situation",scenario],["Response",safe?action:unsafe]]};q.explanation=`${safe?"The response is appropriate.":"The response needs correction."} ${rationale} Appropriate response: ${action}`;return q;}
  const values=[correct,...wrong];const offset=hash(key+seed)%values.length;const labels=[...values.slice(offset),...values.slice(0,offset)];
  q.options=labels.map((label,i)=>({id:String(i),label}));q.answer=String(labels.indexOf(correct));
  q.explanation=`Correct answer: ${correct} ${rationale}`;
  return q;
}
export function healthFoundationQuestions(config:SessionConfig, level:CatalogLevel, seed:number):LearnQuestion[] {
  const result:LearnQuestion[]=[];
  for(const subject of level.subjects) {
    if(config.subjectId!=="all"&&config.subjectId!==subject.id)continue;
    const course=healthCourseKey(subject.label);if(!course)continue;
    for(const row of ROWS.filter(item=>item[0]===course)) {
      if(config.topicId!=="all"&&config.topicId!==slug(TOPICS[course][row[1]]))continue;
      for(let family=0;family<4;family++)result.push(task(row,config,subject.label,family,seed));
    }
  }
  return result.sort((a,b)=>hash(a.exposureKey+seed)-hash(b.exposureKey+seed));
}
