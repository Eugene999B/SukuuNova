import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Section = { heading: string; paragraphs: string[] };
type DemoDocument = { title: string; subtitle: string; sections: Section[] };

const DOCUMENTS: Record<string, DemoDocument> = {
  "eugene-academy-handbook.pdf": {
    title: "Eugene Academy Family Handbook",
    subtitle: "2026/2027 academic year · synthetic SukuuNova trial resource",
    sections: [
      {
        heading: "Our shared purpose",
        paragraphs: [
          "Eugene Academy is represented in this trial as a Ghana-based school community focused on safe attendance, strong teaching, responsible communication and clear family partnership. This handbook is synthetic test content created only to exercise SukuuNova's digital library and family workflows.",
          "Families should keep learner and guardian contact details current, read school messages promptly and use the school office for any matter that requires a formal record or safeguarding response.",
        ],
      },
      {
        heading: "Daily school rhythm",
        paragraphs: [
          "Learners are expected to arrive before the first lesson, prepared with the materials required for the day. Attendance is recorded through the school's approved register or configured attendance devices. Late arrival and absence remain visible for follow-up rather than being silently changed.",
          "The trial timetable uses eight teaching periods from Monday to Friday. Teachers, class leads and administrators should consult the live SukuuNova timetable because approved substitutions or venue changes may replace the printed plan.",
        ],
      },
      {
        heading: "Attendance, absence and wellbeing",
        paragraphs: [
          "A parent or guardian should inform the school when a learner will be absent, especially for illness, family emergency or another approved reason. Repeated lateness or absence may be reviewed by the school's pastoral or leadership team so support can be arranged early.",
          "SukuuNova may show attendance alerts, exceptions and risk indicators to authorized staff. These indicators are prompts for human review; they are not disciplinary decisions by themselves.",
        ],
      },
      {
        heading: "Learning, homework and assessment",
        paragraphs: [
          "Teachers may publish lesson resources, notes, homework, exercises and assessments through SukuuNova. Families should pay attention to due dates and teacher feedback. Marks released through the gradebook are governed by the active term and school approval workflow.",
          "Where an activity allows more than one attempt, the work itself states the attempt limit and whether the highest or latest score is retained. Learners should submit their own work and ask a teacher when instructions are unclear.",
        ],
      },
      {
        heading: "Fees and receipts",
        paragraphs: [
          "School charges should appear against the correct learner and academic term. Families should retain official receipts and raise any discrepancy with the accounts office. A payment record should never be edited merely to make a balance look correct; corrections follow the school's approved reconciliation or reversal process.",
        ],
      },
      {
        heading: "Transport and pickup safety",
        paragraphs: [
          "Learners using school transport should follow the assigned route, stop and vehicle instructions. Boarding or alighting events may be recorded for safety. Pickup authorization must be confirmed before a learner is released to a person who is not already approved.",
          "Live location or device information is operational support data. Families should contact the school when a transport situation needs human confirmation rather than relying only on a map or automated alert.",
        ],
      },
      {
        heading: "Communication and digital conduct",
        paragraphs: [
          "Use school messaging respectfully and keep account credentials private. Do not forward confidential learner information, screenshots, passwords or identity documents outside an approved school process. Report suspicious messages or unexpected login prompts to the school.",
          "Urgent safeguarding, medical or security matters should be escalated through the school's emergency process and not left only as an in-app message.",
        ],
      },
    ],
  },
  "ict-lab-safety.pdf": {
    title: "ICT Laboratory Safety Guide",
    subtitle: "Academic Department · Computing · synthetic SukuuNova trial resource",
    sections: [
      {
        heading: "Before using a workstation",
        paragraphs: [
          "Enter the laboratory calmly, use the seat or device assigned by the teacher and check for damaged cables, loose plugs, liquid, unusual heat or other hazards before switching equipment on. Tell the teacher about a problem instead of attempting an electrical repair.",
          "Keep bags, food and drinks away from computers, power strips and network equipment. Walkways and emergency exits must remain clear.",
        ],
      },
      {
        heading: "Account and password safety",
        paragraphs: [
          "Use only your own authorized account. Never share a password, verification code or recovery link. Sign out when leaving a shared computer and do not save credentials in a browser unless the school has explicitly configured that device for personal use.",
          "A teacher or administrator may help reset access, but legitimate support should not ask a learner to reveal an existing password.",
        ],
      },
      {
        heading: "Files, downloads and removable media",
        paragraphs: [
          "Open files only from approved school locations. Scan or avoid unknown USB storage, do not install unapproved software and do not disable security controls. If a file or website behaves unexpectedly, stop using it and inform the teacher.",
          "School library resources may be read online or downloaded only when the resource policy allows it. A visible download button is permission for that item; the absence of one means the resource should remain in the protected reader.",
        ],
      },
      {
        heading: "Online conduct and privacy",
        paragraphs: [
          "Do not publish another learner's photo, phone number, home address, school record or private message without authorization. Treat unknown links, prizes, login pages and urgent payment requests with caution. Ask a teacher before entering personal information into an unfamiliar site.",
        ],
      },
      {
        heading: "Health and ergonomics",
        paragraphs: [
          "Sit with the screen at a comfortable height, keep wrists relaxed, use appropriate lighting and take short visual or movement breaks during long sessions. Tell a teacher about eye strain, pain, dizziness or discomfort rather than continuing through it.",
        ],
      },
      {
        heading: "Incident response",
        paragraphs: [
          "For smoke, sparks, burning smell, exposed wiring or electric shock risk, stop work, move away from the equipment and alert an adult immediately. For a suspected cyber incident, preserve the evidence, disconnect only if instructed and report what happened without trying to hide or erase it.",
        ],
      },
    ],
  },
  "jhs-mathematics-revision.pdf": {
    title: "JHS Mathematics Revision Pack",
    subtitle: "Mathematics Department · practice set · synthetic SukuuNova trial resource",
    sections: [
      {
        heading: "How to use this pack",
        paragraphs: [
          "Work each question without a calculator unless your teacher allows one. Show your method clearly. After completing a section, compare your reasoning with class notes and record topics that need another explanation.",
          "This revision pack is not a real examination paper. It exists to make the Eugene Academy trial library contain realistic subject material for reading, assignment and download testing.",
        ],
      },
      {
        heading: "Number and operations",
        paragraphs: [
          "1. Evaluate 3/4 + 5/8 and give the answer in its simplest form.\n2. A school buys 36 exercise books at GH¢7.50 each. Find the total cost.\n3. Express 0.375 as a fraction in its simplest form.\n4. Find 15% of 480.",
        ],
      },
      {
        heading: "Algebra",
        paragraphs: [
          "5. Simplify 4x + 3y - 2x + 5y.\n6. Solve 3x - 7 = 20.\n7. If y = 2x + 1, find y when x = 6.\n8. Factorize 6a + 12.",
        ],
      },
      {
        heading: "Geometry and measurement",
        paragraphs: [
          "9. A rectangle has length 12 cm and width 7 cm. Find its perimeter and area.\n10. Two angles of a triangle are 58° and 67°. Find the third angle.\n11. A circular garden has radius 7 m. Using π = 22/7, find its circumference.\n12. Convert 2.4 metres to centimetres.",
        ],
      },
      {
        heading: "Data and probability",
        paragraphs: [
          "13. The scores 6, 8, 7, 10, 9 have been recorded. Find the mean score.\n14. In a bag there are 5 red, 3 blue and 2 green counters. Find the probability of choosing a blue counter at random.\n15. Explain one reason why a graph should include a title and labelled axes.",
        ],
      },
      {
        heading: "Self-check guide",
        paragraphs: [
          "Check that fractions are simplified, units are included, algebra steps preserve equality and geometry answers distinguish perimeter from area. For probability, compare the favourable outcomes with the total number of equally likely outcomes.",
          "If your answer is different from a worked example, identify the first step where your method changes. Bring that step to your teacher rather than copying only the final answer.",
        ],
      },
    ],
  },
  "pta-family-guide.pdf": {
    title: "PTA Family Partnership Guide",
    subtitle: "School Leadership · Family Partnership · synthetic SukuuNova trial resource",
    sections: [
      {
        heading: "Partnership principles",
        paragraphs: [
          "Families and school staff share responsibility for learner safety, attendance, communication and encouragement. Questions should be raised early, respectfully and through the channel most likely to resolve them. Sensitive learner matters should not be debated in public group chats.",
        ],
      },
      {
        heading: "Keeping family information current",
        paragraphs: [
          "Tell the school when a guardian phone number, email address, pickup authorization or emergency contact changes. Accurate records help attendance alerts, fee receipts, transport notices and safeguarding communication reach the correct person.",
        ],
      },
      {
        heading: "Supporting learning at home",
        paragraphs: [
          "Check the learner's timetable and published academic work, provide a regular place for study and ask the learner to explain what they learned rather than completing work for them. Contact the teacher when repeated difficulty, missing work or unusual stress becomes visible.",
        ],
      },
      {
        heading: "Meetings and school events",
        paragraphs: [
          "Use published event information and appointment instructions. Arrive through the approved visitor process and sign out when required. Volunteers should follow the same safeguarding, privacy and conduct expectations as other adults on school premises.",
        ],
      },
      {
        heading: "Finance questions",
        paragraphs: [
          "Use the learner's fee statement and official receipt as the starting point for any accounts query. Share transaction references only with authorized staff. If a payment appears missing, ask the accounts team to reconcile it rather than making a second payment without clarification.",
        ],
      },
      {
        heading: "Safeguarding and escalation",
        paragraphs: [
          "Concerns about a learner's immediate safety should be reported through the school's safeguarding or emergency process without delay. Routine questions can use SukuuNova messaging, but an unread message should never be treated as sufficient escalation for an urgent safety matter.",
          "When reporting a concern, provide factual details: who was involved, what happened, when and where it happened, and what immediate action has already been taken. Avoid circulating allegations beyond the people responsible for handling them.",
        ],
      },
    ],
  },
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${line} ${words[index]}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = words[index];
      }
    }
    lines.push(line);
  }
  return lines;
}

async function renderDocument(document: DemoDocument) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);
  pdf.setAuthor("Eugene Academy · SukuuNova synthetic trial fixture");
  pdf.setSubject("Synthetic test document for SukuuNova protected library-reader validation");
  pdf.setKeywords(["SukuuNova", "Eugene Academy", "synthetic", "trial"]);
  pdf.setProducer("SukuuNova Eugene Academy trial fixture");
  pdf.setCreator("SukuuNova");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let pageNumber = 0;
  let page: PDFPage;
  let y = 0;

  const startPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNumber += 1;
    y = PAGE_HEIGHT - 54;
    page.drawText("EUGENE ACADEMY", { x: MARGIN_X, y, size: 9, font: bold, color: rgb(0.04, 0.42, 0.39) });
    page.drawText("SYNTHETIC TRIAL RESOURCE", { x: PAGE_WIDTH - MARGIN_X - 151, y, size: 8, font: bold, color: rgb(0.38, 0.42, 0.48) });
    page.drawLine({ start: { x: MARGIN_X, y: y - 10 }, end: { x: PAGE_WIDTH - MARGIN_X, y: y - 10 }, thickness: 0.7, color: rgb(0.83, 0.86, 0.89) });
    y -= 38;
  };

  const ensureSpace = (height: number) => {
    if (y - height < 64) startPage();
  };

  const drawParagraph = (text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10.2;
    const leading = size * 1.48;
    const color = options.color ?? rgb(0.16, 0.2, 0.26);
    const lines = wrapText(text, font, size, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(leading);
      if (line) page.drawText(line, { x: MARGIN_X, y, size, font, color });
      y -= leading;
    }
    y -= options.gap ?? 6;
  };

  startPage();
  drawParagraph(document.title, { size: 22, font: bold, color: rgb(0.07, 0.12, 0.2), gap: 5 });
  drawParagraph(document.subtitle, { size: 10, font: regular, color: rgb(0.38, 0.42, 0.48), gap: 14 });
  drawParagraph("DEMO NOTICE — This PDF contains invented school material and no real learner, guardian, staff or financial information. It exists only to test SukuuNova's library reader, assignment and download-permission workflows.", { size: 9.2, font: bold, color: rgb(0.55, 0.22, 0.08), gap: 18 });

  for (const section of document.sections) {
    ensureSpace(48);
    drawParagraph(section.heading, { size: 13, font: bold, color: rgb(0.04, 0.42, 0.39), gap: 6 });
    for (const paragraph of section.paragraphs) drawParagraph(paragraph);
    y -= 4;
  }

  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    const current = pages[index];
    current.drawLine({ start: { x: MARGIN_X, y: 46 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 46 }, thickness: 0.5, color: rgb(0.86, 0.88, 0.91) });
    current.drawText("Eugene Academy · SukuuNova trial fixture · not an official school publication", { x: MARGIN_X, y: 29, size: 7.5, font: regular, color: rgb(0.48, 0.52, 0.58) });
    current.drawText(`${index + 1} / ${pages.length}`, { x: PAGE_WIDTH - MARGIN_X - 28, y: 29, size: 7.5, font: regular, color: rgb(0.48, 0.52, 0.58) });
  }

  return pdf.save();
}

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const document = DOCUMENTS[filename];
  if (!document) {
    return new Response("Synthetic library resource not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const bytes = await renderDocument(document);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
