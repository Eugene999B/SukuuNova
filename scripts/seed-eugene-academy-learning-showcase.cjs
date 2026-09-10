#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

const SCHOOL_CODE = "eug123";
const SCHOOL_NAME = "Eugene Academy";
const targetMode = String(process.env.EUGENE_ACADEMY_SHOWCASE_TARGET || "trial").trim();
const trialUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const productionUrl = String(process.env.DATABASE_URL || "").trim();

if (!['trial','production'].includes(targetMode)) throw new Error("EUGENE_ACADEMY_SHOWCASE_TARGET must be trial or production.");
if (targetMode === "trial") {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_TRIAL_SEED || "").trim() !== "YES") throw new Error("Refusing Eugene Academy learning showcase: trial acknowledgement is missing.");
  if (!trialUrl) throw new Error("TEST_DATABASE_URL is required for the Eugene Academy learning showcase.");
  if (productionUrl && productionUrl === trialUrl) throw new Error("Refusing Eugene Academy learning showcase: TEST_DATABASE_URL must differ from DATABASE_URL.");
} else {
  if (String(process.env.ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED || "").trim() !== "EUGENE_ACADEMY_ONLY") throw new Error("Refusing Eugene Academy production showcase: exact production acknowledgement is missing.");
  if (!productionUrl) throw new Error("DATABASE_URL is required for the Eugene Academy production showcase.");
  const railwayEnvironment = String(process.env.RAILWAY_ENVIRONMENT_NAME || "").trim();
  if (railwayEnvironment && railwayEnvironment !== "production") throw new Error("Refusing Eugene Academy production showcase outside Railway production.");
}

const databaseUrl = targetMode === "production" ? productionUrl : trialUrl;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, transactionOptions: { maxWait: 15000, timeout: 300000 } });

const definitions = [
  {
    title: "Ratio Practice Set", mode: "auto", guide: [],
    questions: [
      ["multiple_choice", "Which ratio is equivalent to 3:5?", ["6:10","6:8","9:10","12:15"], ["6:10"]],
      ["multiple_select", "Select every ratio equivalent to 2:3.", ["4:6","6:9","8:10","10:15"], ["4:6","6:9","10:15"]],
      ["true_false", "A ratio of 4:8 simplifies to 1:2.", [], ["true"]],
      ["ordering", "Put the steps for simplifying a ratio in the correct order.", ["Write the ratio","Find the greatest common factor","Divide both terms","Check the simplified ratio"], ["Write the ratio","Find the greatest common factor","Divide both terms","Check the simplified ratio"]],
      ["numeric", "If 4 exercise books cost GH₵28, what is the cost of 1 exercise book? Enter the number only.", [], ["7"]],
    ],
  },
  {
    title: "Reading Evidence Journal", mode: "review", guide: ["claim", "evidence", "quotation", "explain", "inference", "text"],
    questions: [
      ["multiple_choice", "Which statement is the strongest textual evidence?", ["I think the character is kind.","The character shared her lunch with a new pupil.","The story was interesting.","Kindness is important."], ["The character shared her lunch with a new pupil."]],
      ["multiple_select", "Which actions make evidence stronger?", ["Quote or paraphrase the text","Explain how it supports the claim","Ignore the source","Connect it to the inference"], ["Quote or paraphrase the text","Explain how it supports the claim","Connect it to the inference"]],
      ["true_false", "An inference should be supported by evidence from the text.", [], ["true"]],
      ["ordering", "Order a strong evidence paragraph.", ["State the claim","Present evidence","Explain the evidence","Link back to the idea"], ["State the claim","Present evidence","Explain the evidence","Link back to the idea"]],
      ["long_answer", "Write 3–5 sentences explaining how one piece of evidence can support an inference. Use the words claim, evidence and explain.", [], []],
    ],
  },
  {
    title: "Ecosystem Diagram", mode: "review", guide: ["producer", "consumer", "energy", "food chain", "ecosystem", "sun"],
    questions: [
      ["multiple_choice", "Which organism is a producer in a simple grassland food chain?", ["Grass","Goat","Hawk","Mushroom"], ["Grass"]],
      ["multiple_select", "Select the living parts of an ecosystem.", ["Plants","Animals","Rocks","Microorganisms"], ["Plants","Animals","Microorganisms"]],
      ["fill_blank", "Most food chains begin with energy from the ___.", [], ["sun"]],
      ["ordering", "Arrange this food chain from energy source to top consumer.", ["Sun","Grass","Grasshopper","Bird"], ["Sun","Grass","Grasshopper","Bird"]],
      ["long_answer", "Explain what could happen to the food chain if the producer population falls sharply.", [], []],
    ],
  },
  {
    title: "Civic Reflection", mode: "review", guide: ["responsibility", "community", "law", "respect", "participation", "citizen"],
    questions: [
      ["multiple_choice", "Which action best shows responsible citizenship?", ["Damaging public property","Following community rules and helping others","Ignoring elections","Spreading false information"], ["Following community rules and helping others"]],
      ["multiple_select", "Select responsibilities citizens can have in a community.", ["Obey lawful rules","Protect public property","Respect other people","Destroy shared facilities"], ["Obey lawful rules","Protect public property","Respect other people"]],
      ["true_false", "Rights and responsibilities can exist together.", [], ["true"]],
      ["ordering", "Put a respectful community problem-solving process in order.", ["Identify the problem","Gather facts","Discuss possible solutions","Agree and act","Review the result"], ["Identify the problem","Gather facts","Discuss possible solutions","Agree and act","Review the result"]],
      ["long_answer", "Describe one community problem and explain how a responsible citizen could help solve it peacefully.", [], []],
    ],
  },
  {
    title: "Computer Lab Safety", mode: "auto", guide: [],
    questions: [
      ["multiple_choice", "What should you do first if you notice a damaged power cable in the computer lab?", ["Touch it to test it","Report it to the teacher and keep away","Cover it with paper","Continue using the computer"], ["Report it to the teacher and keep away"]],
      ["multiple_select", "Select safe computer-lab practices.", ["Keep liquids away","Use clean dry hands","Arrange cables safely","Force plugs into sockets"], ["Keep liquids away","Use clean dry hands","Arrange cables safely"]],
      ["true_false", "It is safe to eat directly over a keyboard.", [], ["false"]],
      ["ordering", "Put a safe shutdown routine in order.", ["Save your work","Close applications","Use the operating system shutdown command","Wait for the computer to power down"], ["Save your work","Close applications","Use the operating system shutdown command","Wait for the computer to power down"]],
      ["fill_blank", "A secret word used to protect an account is called a ___.", [], ["password"]],
    ],
  },
  {
    title: "French Vocabulary Check", mode: "auto", guide: [],
    questions: [
      ["multiple_choice", "What does “Bonjour” mean?", ["Good morning / Hello","Good night","Thank you","Goodbye"], ["Good morning / Hello"]],
      ["multiple_select", "Select French greetings or polite expressions.", ["Bonjour","Merci","S'il vous plaît","Table"], ["Bonjour","Merci","S'il vous plaît"]],
      ["true_false", "“Merci” means thank you.", [], ["true"]],
      ["ordering", "Arrange the words to form a simple greeting sentence.", ["Bonjour","Madame","comment","allez-vous ?"], ["Bonjour","Madame","comment","allez-vous ?"]],
      ["fill_blank", "Complete: “Au ___” means goodbye / see you again.", [], ["revoir"]],
    ],
  },
  {
    title: "Creative Arts Perspective Task", mode: "review", guide: ["horizon", "vanishing point", "parallel lines", "depth", "foreground", "perspective"],
    questions: [
      ["multiple_choice", "In one-point perspective, parallel lines appear to meet at the…", ["vanishing point","foreground","frame edge","colour wheel"], ["vanishing point"]],
      ["multiple_select", "Which techniques can help create the illusion of depth?", ["Overlapping shapes","Changing apparent size","Using a vanishing point","Making every object exactly the same size"], ["Overlapping shapes","Changing apparent size","Using a vanishing point"]],
      ["true_false", "Objects usually appear smaller as they move farther away in a perspective drawing.", [], ["true"]],
      ["ordering", "Order a simple one-point perspective drawing process.", ["Draw the horizon line","Mark the vanishing point","Sketch the front object","Connect receding edges to the vanishing point","Refine and shade"], ["Draw the horizon line","Mark the vanishing point","Sketch the front object","Connect receding edges to the vanishing point","Refine and shade"]],
      ["long_answer", "Explain how you would use a horizon line and vanishing point to make a road look as if it continues into the distance.", [], []],
    ],
  },
  {
    title: "Fitness Reflection Log", mode: "review", guide: ["warm-up", "cool-down", "hydration", "heart rate", "safety", "recovery"],
    questions: [
      ["multiple_choice", "Why is a warm-up useful before vigorous activity?", ["It prepares the body gradually","It replaces all exercise","It makes hydration unnecessary","It guarantees no injury"], ["It prepares the body gradually"]],
      ["multiple_select", "Select sensible exercise-safety habits.", ["Warm up","Drink water when needed","Stop if you feel severe pain","Ignore dizziness"], ["Warm up","Drink water when needed","Stop if you feel severe pain"]],
      ["true_false", "A cool-down can help the body return gradually toward resting activity.", [], ["true"]],
      ["ordering", "Arrange a balanced activity session.", ["Warm-up","Main activity","Cool-down","Hydrate and reflect"], ["Warm-up","Main activity","Cool-down","Hydrate and reflect"]],
      ["long_answer", "Reflect on a recent physical activity. Describe effort, one safety choice and one improvement for next time.", [], []],
    ],
  },
  {
    title: "Algebra Exit Challenge", mode: "auto", guide: [],
    questions: [
      ["multiple_choice", "Solve x + 3 = 8.", ["3","5","8","11"], ["5"]],
      ["multiple_select", "Select every true algebra statement.", ["2(x+3)=2x+6","3x+x=4x","5x-2x=2x","x+x=2x"], ["2(x+3)=2x+6","3x+x=4x","x+x=2x"]],
      ["true_false", "If 2x = 14, then x = 7.", [], ["true"]],
      ["ordering", "Order the steps to solve 2x + 4 = 12.", ["Start with 2x + 4 = 12","Subtract 4 from both sides","Get 2x = 8","Divide both sides by 2","Get x = 4"], ["Start with 2x + 4 = 12","Subtract 4 from both sides","Get 2x = 8","Divide both sides by 2","Get x = 4"]],
      ["numeric", "Solve 3x = 27. Enter x.", [], ["9"]],
    ],
  },
  {
    title: "Narrative Paragraph", mode: "review", guide: ["topic sentence", "sequence", "detail", "transition", "conclusion", "paragraph"],
    questions: [
      ["multiple_choice", "Which opening most clearly starts a narrative event?", ["Yesterday, our class arrived early for the science trip.","Science is a subject.","Trips are things.","There are many buses."], ["Yesterday, our class arrived early for the science trip."]],
      ["multiple_select", "Select features that can strengthen a narrative paragraph.", ["Clear sequence","Specific details","Useful transitions","Random unrelated sentences"], ["Clear sequence","Specific details","Useful transitions"]],
      ["true_false", "A narrative paragraph should keep events in a sequence readers can follow.", [], ["true"]],
      ["ordering", "Arrange a simple narrative paragraph structure.", ["Opening / setting","First event","Next event","Key moment","Closing reflection"], ["Opening / setting","First event","Next event","Key moment","Closing reflection"]],
      ["long_answer", "Write a short narrative paragraph about a memorable school moment. Use a clear sequence and at least two specific details.", [], []],
    ],
  },
  {
    title: "Matter Classification", mode: "auto", guide: [],
    questions: [
      ["multiple_choice", "Which state of matter has a fixed volume but takes the shape of its container?", ["Solid","Liquid","Gas","Plasma"], ["Liquid"]],
      ["multiple_select", "Select physical changes of state.", ["Melting","Freezing","Evaporation","Burning paper"], ["Melting","Freezing","Evaporation"]],
      ["true_false", "Gas particles generally have more freedom to move than particles in a solid.", [], ["true"]],
      ["ordering", "Order the changes when ice is heated until it becomes water vapour.", ["Solid ice","Melting","Liquid water","Evaporation","Water vapour"], ["Solid ice","Melting","Liquid water","Evaporation","Water vapour"]],
      ["fill_blank", "The change from liquid water to water vapour is called ___.", [], ["evaporation","vaporization","vapourisation","vaporisation"]],
    ],
  },
  {
    title: "Community Leadership", mode: "review", guide: ["listen", "team", "goal", "fairness", "responsibility", "community"],
    questions: [
      ["multiple_choice", "Which behaviour best demonstrates constructive leadership?", ["Listening before deciding","Taking all credit","Ignoring disagreement","Hiding information"], ["Listening before deciding"]],
      ["multiple_select", "Select qualities that can strengthen a student leader.", ["Fairness","Responsibility","Clear communication","Bullying"], ["Fairness","Responsibility","Clear communication"]],
      ["true_false", "A leader can change a plan after listening to useful evidence from the team.", [], ["true"]],
      ["ordering", "Order a small community project cycle.", ["Identify a need","Agree on a goal","Plan roles and resources","Carry out the plan","Review the outcome"], ["Identify a need","Agree on a goal","Plan roles and resources","Carry out the plan","Review the outcome"]],
      ["long_answer", "Your class wants to improve one shared school space. Explain how you would lead the team fairly from idea to review.", [], []],
    ],
  },
];

function workId(index) { return `eug-work-${index + 1}`; }
function questionId(index, position) { return `eug-qv2-${index + 1}-${position}`; }
function answerId(index, submissionIndex, position) { return `eug-av2-${index + 1}-${submissionIndex + 1}-${position}`; }
function json(value) { return JSON.stringify(value); }
function wrongChoice(question) {
  const accepted = new Set(question.acceptedAnswers);
  return question.options.find((option) => !accepted.has(option)) || question.options[0] || "incorrect";
}
function answerFor(question, correct, guide) {
  if (question.type === "multiple_select") return { text: null, data: correct ? question.acceptedAnswers : question.acceptedAnswers.slice(0, 1) };
  if (question.type === "ordering") return { text: null, data: correct ? question.acceptedAnswers : [...question.acceptedAnswers].reverse() };
  if (question.type === "multiple_choice") return { text: null, data: correct ? question.acceptedAnswers[0] : wrongChoice(question) };
  if (question.type === "true_false") return { text: null, data: correct ? question.acceptedAnswers[0] : (question.acceptedAnswers[0] === "true" ? "false" : "true") };
  if (question.type === "numeric") return { text: null, data: correct ? question.acceptedAnswers[0] : String(Number(question.acceptedAnswers[0]) + 1) };
  if (question.type === "fill_blank" || question.type === "short_answer") return { text: correct ? question.acceptedAnswers[0] : "incorrect", data: correct ? question.acceptedAnswers[0] : "incorrect" };
  return { text: `My explanation connects ${guide.join(", ")} to the task and gives a clear example from the lesson.`, data: {} };
}

async function main() {
  const directory = await prisma.schoolLoginDirectory.findUnique({ where: { uniqueCode: SCHOOL_CODE }, select: { schoolId: true } });
  if (!directory) throw new Error("Eugene Academy must exist before the learning showcase can be added.");
  const schoolId = directory.schoolId;

  const summary = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_school_id',$1,true)", schoolId);
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, uniqueCode: true } });
    if (!school || school.uniqueCode !== SCHOOL_CODE || school.name !== SCHOOL_NAME) throw new Error("Refusing showcase write: eug123 is not the expected Eugene Academy tenant.");

    const expectedIds = definitions.map((_, index) => workId(index));
    const works = await tx.$queryRawUnsafe(
      `SELECT "id","title","maxScore","markingMode","teacherId","assessmentId" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "id" = ANY($2::text[])`,
      schoolId, expectedIds,
    );
    const byId = new Map(works.map((work) => [work.id, work]));
    if (byId.size !== definitions.length) throw new Error(`Expected ${definitions.length} Eugene Academy showcase activities, found ${byId.size}.`);

    let questionCount = 0;
    let answerCount = 0;
    for (let index = 0; index < definitions.length; index++) {
      const definition = definitions[index];
      const work = byId.get(workId(index));
      if (!work) throw new Error(`Missing ${workId(index)}.`);
      if (work.title !== definition.title) throw new Error(`Showcase activity title mismatch for ${work.id}.`);
      const maxScore = Number(work.maxScore);
      if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore % definition.questions.length !== 0) throw new Error(`Unsupported max score for ${work.id}.`);
      const points = maxScore / definition.questions.length;
      const questions = definition.questions.map((row, questionIndex) => ({
        id: questionId(index, questionIndex + 1), position: questionIndex + 1, type: row[0], prompt: row[1], options: row[2], acceptedAnswers: row[3], points,
      }));

      await tx.$executeRawUnsafe(
        `UPDATE "TeacherAcademicWork" SET "markingMode"=$3,"answerGuide"=$4::jsonb,"instructions"=$5,"updatedAt"=NOW() WHERE "schoolId"=$1 AND "id"=$2`,
        schoolId, work.id, definition.mode, json(definition.guide),
        definition.mode === "auto"
          ? "Complete all five interactive questions. Objective responses are marked automatically when you submit."
          : "Complete all five interactive questions. Objective responses are checked automatically and the written response is released after teacher review.",
      );
      await tx.$executeRawUnsafe(
        `UPDATE "Homework" SET "instructions"=$3,"points"=$4,"updatedAt"=NOW() WHERE "schoolId"=$1 AND "academicWorkId"=$2`,
        schoolId, work.id,
        definition.mode === "auto"
          ? "Open the learner activity, answer every question, review your choices and submit for instant objective marking."
          : "Open the learner activity, answer every question and submit. The system checks objective items while the teacher reviews the written response.",
        maxScore,
      );

      await tx.$executeRawUnsafe(
        `DELETE FROM "TeacherAcademicAnswer" WHERE "schoolId"=$1 AND "submissionId" IN (SELECT "id" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2)`,
        schoolId, work.id,
      );
      await tx.$executeRawUnsafe(`DELETE FROM "TeacherAcademicQuestion" WHERE "schoolId"=$1 AND "workId"=$2`, schoolId, work.id);

      for (const question of questions) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "TeacherAcademicQuestion" ("id","schoolId","workId","position","type","prompt","points","options","acceptedAnswers") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
          question.id, schoolId, work.id, question.position, question.type, question.prompt, question.points, json(question.options), json(question.acceptedAnswers),
        );
        questionCount++;
      }

      const submissions = await tx.$queryRawUnsafe(
        `SELECT "id","studentId","status","attemptNumber" FROM "TeacherAcademicSubmission" WHERE "schoolId"=$1 AND "workId"=$2 ORDER BY "studentId","attemptNumber"`,
        schoolId, work.id,
      );
      for (let submissionIndex = 0; submissionIndex < submissions.length; submissionIndex++) {
        const submission = submissions[submissionIndex];
        const graded = submission.status === "graded";
        const submitted = submission.status === "submitted";
        const inProgress = submission.status === "in_progress";
        let awardedTotal = 0;
        for (const question of questions) {
          if (inProgress && question.position > 2) continue;
          const intentionallyWrong = graded && submissionIndex % 4 === 3 && question.position === 1;
          const correct = !intentionallyWrong;
          const response = answerFor(question, correct, definition.guide);
          const award = graded ? (question.type === "long_answer" || correct ? Number(question.points) : 0) : null;
          if (award !== null) awardedTotal += award;
          await tx.$executeRawUnsafe(
            `INSERT INTO "TeacherAcademicAnswer" ("id","schoolId","submissionId","questionId","responseText","responseData","awardedScore","markingMode","markerComment","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,NOW(),NOW())`,
            answerId(index, submissionIndex, question.position), schoolId, submission.id, question.id, response.text, json(response.data), award,
            graded ? (question.type === "long_answer" ? "manual" : "auto") : null,
            graded ? (question.type === "long_answer" ? "Teacher review: clear explanation with the expected lesson vocabulary." : correct ? "Matched the teacher-supplied answer key." : "Review this item and try a similar example.") : null,
          );
          answerCount++;
        }
        if (graded) {
          await tx.$executeRawUnsafe(
            `UPDATE "TeacherAcademicSubmission" SET "totalAwarded"=$4,"reviewNotes"=$5,"updatedAt"=NOW() WHERE "schoolId"=$1 AND "id"=$2 AND "workId"=$3`,
            schoolId, submission.id, work.id, awardedTotal,
            definition.mode === "review" ? "Objective items checked by SukuuNova; written response reviewed by the teacher." : "Objective activity marked automatically from the teacher answer key.",
          );
          if (work.assessmentId) {
            await tx.$executeRawUnsafe(
              `UPDATE "Score" SET "value"=$4,"remarks"=$5 WHERE "schoolId"=$1 AND "studentId"=$2 AND "assessmentId"=$3`,
              schoolId, submission.studentId, work.assessmentId, awardedTotal, "Showcase homework result synchronized from the learner activity.",
            );
          }
        } else if (submitted) {
          await tx.$executeRawUnsafe(
            `UPDATE "TeacherAcademicSubmission" SET "totalAwarded"=NULL,"reviewedBy"=NULL,"reviewedAt"=NULL,"reviewNotes"=NULL,"updatedAt"=NOW() WHERE "schoolId"=$1 AND "id"=$2`,
            schoolId, submission.id,
          );
        }
      }
    }

    const typeRows = await tx.$queryRawUnsafe(
      `SELECT "type",COUNT(*)::int AS "count" FROM "TeacherAcademicQuestion" WHERE "schoolId"=$1 AND "workId" = ANY($2::text[]) GROUP BY "type" ORDER BY "type"`,
      schoolId, expectedIds,
    );
    const typeSet = new Set(typeRows.map((row) => row.type));
    for (const type of ["multiple_choice","multiple_select","true_false","ordering","numeric","fill_blank","long_answer"]) {
      if (!typeSet.has(type)) throw new Error(`Eugene Academy showcase is missing question type ${type}.`);
    }
    if (questionCount < 60) throw new Error(`Expected at least 60 showcase questions, created ${questionCount}.`);
    return { activities: definitions.length, questions: questionCount, answers: answerCount, modes: { auto: definitions.filter((d) => d.mode === "auto").length, review: definitions.filter((d) => d.mode === "review").length }, types: typeRows };
  });

  console.log("[eugene-academy] rich learner homework showcase ready:", JSON.stringify(summary));
}

main().catch((error) => {
  console.error("[eugene-academy] learning showcase failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
