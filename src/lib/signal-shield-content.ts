import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

export type SignalShieldMission = "phishing" | "link" | "password" | "privacy" | "wifi" | "update" | "recovery" | "imposter";

export type SignalShieldScene = ArcadeWorldScene & {
  incidentType: SignalShieldMission;
  source: string;
  channel: string;
  asset: string;
  signalTags: string[];
  threatLevel: 1 | 2 | 3 | 4 | 5;
  packetId: string;
};

export type SignalShieldQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: SignalShieldScene;
};

type IncidentTemplate = {
  mission: SignalShieldMission;
  source: string;
  channel: string;
  asset: string;
  prompt: string;
  answer: string;
  wrong: [string, string, string];
  explanation: string;
  cue: string;
  signals: string[];
  minDifficulty: number;
};

const INCIDENTS: IncidentTemplate[] = [
  {
    mission: "phishing",
    source: "School Mail",
    channel: "Inbox",
    asset: "Learner account",
    prompt: "A message says your school account will close in 10 minutes unless you reply with your password. What is the safest response?",
    answer: "Do not reply; report the message through the school's trusted channel",
    wrong: ["Reply with the password before time runs out", "Forward it to classmates so they can check it", "Reply asking the sender to prove who they are"],
    explanation: "Trusted services should not ask you to send a password by message. Use a known school contact or reporting route instead.",
    cue: "Urgency plus a request for a secret is a strong warning sign.",
    signals: ["urgent demand", "asks for password", "unexpected message"],
    minDifficulty: 1,
  },
  {
    mission: "link",
    source: "Library Notice",
    channel: "Message",
    asset: "School portal",
    prompt: "A message claims to open the school library, but the button points to sukuunova-login.example instead of the school's usual address. What should you do?",
    answer: "Open the library from the saved school portal instead of the message link",
    wrong: ["Tap the link because the page name looks familiar", "Type your password first and check the address later", "Send the link to a friend and ask them to test it"],
    explanation: "A look-alike address can imitate a trusted service. Navigate from a known bookmark or official portal rather than testing the suspicious link.",
    cue: "Compare the destination with the address you normally use; never test a suspicious link on another person.",
    signals: ["look-alike address", "login request", "unexpected link"],
    minDifficulty: 1,
  },
  {
    mission: "password",
    source: "Account Centre",
    channel: "Security setup",
    asset: "Learning account",
    prompt: "Which choice makes the strongest everyday account protection?",
    answer: "Use a long unique passphrase and enable two-step verification when available",
    wrong: ["Reuse one short password so it is easy to remember", "Use your first name and birth year", "Share the password with a close friend as a backup"],
    explanation: "A long unique passphrase limits reuse risk, and a second verification step adds protection if the password is exposed.",
    cue: "Think length, uniqueness and a second verification step—not personal details or sharing.",
    signals: ["unique secret", "long passphrase", "two-step verification"],
    minDifficulty: 1,
  },
  {
    mission: "privacy",
    source: "Study App",
    channel: "Permission request",
    asset: "Personal data",
    prompt: "A basic flashcard app asks for contacts, precise location and microphone access even though none are needed for flashcards. What is the safest move?",
    answer: "Deny unnecessary permissions and use only what the learning task needs",
    wrong: ["Allow everything because the app asked", "Allow everything once, then forget about it", "Post the permission screen publicly and ask strangers"],
    explanation: "Good privacy practice gives apps only the access needed for their purpose and reviews permissions when something seems unnecessary.",
    cue: "Match every permission to a real feature the app needs.",
    signals: ["excess permissions", "personal data", "feature mismatch"],
    minDifficulty: 2,
  },
  {
    mission: "wifi",
    source: "Open Network",
    channel: "Wi-Fi",
    asset: "Account session",
    prompt: "You are on an unfamiliar open Wi-Fi network and need to check a school result. What is the safer choice?",
    answer: "Wait for a trusted connection or use an approved secure connection before signing in",
    wrong: ["Sign in because school accounts are always safe on any network", "Turn off the browser warning and continue", "Ask another learner to enter your password for you"],
    explanation: "Sensitive sign-ins deserve a trusted connection. Warnings and unknown networks should not be ignored just to finish quickly.",
    cue: "Treat account sign-ins as sensitive; the network matters as well as the website.",
    signals: ["open network", "sensitive sign-in", "unfamiliar connection"],
    minDifficulty: 2,
  },
  {
    mission: "update",
    source: "Device Centre",
    channel: "System alert",
    asset: "Learning device",
    prompt: "Your tablet shows an official system update from the device settings. Why is installing it at a suitable time important?",
    answer: "Updates can fix known security weaknesses as well as improve the system",
    wrong: ["Updates make passwords unnecessary", "Updates guarantee that every website is trustworthy", "Updates should always be downloaded from links in random messages"],
    explanation: "Legitimate updates often include security fixes. Use the device's trusted update mechanism rather than unknown message links.",
    cue: "The source of the update matters: prefer the device's own trusted settings or school-managed process.",
    signals: ["official settings", "security fixes", "trusted update source"],
    minDifficulty: 2,
  },
  {
    mission: "recovery",
    source: "Account Recovery",
    channel: "Sign-in alert",
    asset: "School account",
    prompt: "You receive a real sign-in alert for a device you do not recognise. What should you do first?",
    answer: "Use the official account page to secure the account and tell a trusted adult or school support if needed",
    wrong: ["Ignore it until another alert appears", "Reply to the alert with your current password", "Post your recovery codes in a class group for safekeeping"],
    explanation: "Unexpected sign-ins should be handled from the official account controls. Recovery codes and passwords must stay private.",
    cue: "Move through official controls, protect recovery secrets and involve trusted support when appropriate.",
    signals: ["unknown device", "account alert", "recovery secrets"],
    minDifficulty: 3,
  },
  {
    mission: "imposter",
    source: "Unknown Sender",
    channel: "Chat",
    asset: "Money and identity",
    prompt: "Someone using a teacher's name says they changed numbers and urgently need mobile money sent to a new account. What is the safest next step?",
    answer: "Verify the request using a separate trusted contact method before doing anything",
    wrong: ["Send a small amount first to see what happens", "Ask the sender for more personal details in the same chat", "Share the request widely so someone else can decide"],
    explanation: "Impersonation relies on urgency and trust. Verify unusual requests through a separate channel you already trust.",
    cue: "Urgent identity claims should be verified independently, not inside the suspicious conversation.",
    signals: ["changed number", "urgent money request", "identity claim"],
    minDifficulty: 3,
  },
  {
    mission: "phishing",
    source: "Prize Desk",
    channel: "Pop-up",
    asset: "Personal information",
    prompt: "A pop-up says you won a device and must enter your full name, home address and account password to claim it. What should you do?",
    answer: "Close it without entering information and tell a trusted adult if it keeps appearing",
    wrong: ["Enter only the password to check whether the prize is real", "Give a friend's details instead", "Take a screenshot that includes your password before closing it"],
    explanation: "Unexpected prize claims that demand sensitive data are unsafe. Do not provide secrets or someone else's data.",
    cue: "Unexpected reward plus sensitive-data demand is a high-risk combination.",
    signals: ["unexpected prize", "sensitive data", "pressure to claim"],
    minDifficulty: 1,
  },
  {
    mission: "privacy",
    source: "Class Group",
    channel: "Social post",
    asset: "Student privacy",
    prompt: "A classmate asks you to post a photo of another learner's ID card to prove their name. What is the safest response?",
    answer: "Do not post it; protect the learner's personal information and use an appropriate school process",
    wrong: ["Post it after covering only the photo", "Post it because the request came from a classmate", "Send it privately to several friends instead"],
    explanation: "Identity documents can contain sensitive information. Share only through authorised processes when there is a real need.",
    cue: "Ask whether the information is necessary, authorised and safe to share.",
    signals: ["identity document", "personal data", "public sharing"],
    minDifficulty: 2,
  },
  {
    mission: "link",
    source: "Shared Document",
    channel: "Collaboration invite",
    asset: "Cloud files",
    prompt: "An unexpected document invite asks you to sign in again, but the address differs by one letter from the service you normally use. What is safest?",
    answer: "Do not sign in there; open the real service directly and check shared files from inside it",
    wrong: ["Sign in because the document title mentions your school", "Try an old password first", "Ask the sender to resend the same link"],
    explanation: "Tiny address changes are a common warning sign. Enter credentials only after reaching the trusted service independently.",
    cue: "Inspect the address and navigate independently when a sign-in page arrives unexpectedly.",
    signals: ["one-letter mismatch", "unexpected invite", "credential request"],
    minDifficulty: 4,
  },
  {
    mission: "recovery",
    source: "Verification Centre",
    channel: "Code prompt",
    asset: "Two-step verification",
    prompt: "A caller says they are support staff and asks you to read out the one-time code that just arrived on your phone. What should you do?",
    answer: "Do not share the code; end the contact and use the official support route if you need help",
    wrong: ["Read the code because it expires quickly", "Share half the code as a compromise", "Forward the code message to the caller"],
    explanation: "One-time verification codes act like temporary keys. Legitimate support should not need you to hand over a code used to approve a sign-in.",
    cue: "Treat one-time codes as secrets even when someone sounds official or creates urgency.",
    signals: ["one-time code", "support impersonation", "urgent request"],
    minDifficulty: 4,
  },
];

function shuffle<T>(values: readonly T[]): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function levelForDifficulty(difficulty: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.trunc(difficulty))) as 1 | 2 | 3 | 4 | 5;
}

function eligibleTemplates(difficulty: number) {
  const safeDifficulty = levelForDifficulty(difficulty);
  const ceiling = safeDifficulty <= 1 ? 1 : safeDifficulty === 2 ? 2 : safeDifficulty === 3 ? 3 : 4;
  const eligible = INCIDENTS.filter((incident) => incident.minDifficulty <= ceiling);
  return eligible.length ? eligible : INCIDENTS.slice(0, 3);
}

export function createSignalShieldQuestions(difficulty: number, length = 5): SignalShieldQuestion[] {
  const safeDifficulty = levelForDifficulty(difficulty);
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  const pool = eligibleTemplates(safeDifficulty);
  const sequence: IncidentTemplate[] = [];
  let deck = shuffle(pool);
  for (let index = 0; index < safeLength; index += 1) {
    if (!deck.length) deck = shuffle(pool);
    sequence.push(deck.pop()!);
  }

  return sequence.map((incident, index) => {
    const threatLevel = Math.max(1, Math.min(5, Math.ceil((safeDifficulty + incident.minDifficulty) / 2))) as 1 | 2 | 3 | 4 | 5;
    const packetId = `N-${String(index + 1).padStart(2, "0")}-${randomInt(100, 999)}`;
    return {
      id: String(index),
      kind: "simulation",
      prompt: incident.prompt,
      answer: incident.answer,
      options: shuffle([incident.answer, ...incident.wrong]),
      explanation: incident.explanation,
      conceptKey: `signal-shield:${incident.mission}:${incident.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      scene: {
        boardTitle: "Signal Shield CyberOps",
        incidentType: incident.mission,
        source: incident.source,
        channel: incident.channel,
        asset: incident.asset,
        signalTags: incident.signals,
        threatLevel,
        packetId,
        cue: incident.cue,
        meterLabels: [incident.mission, `threat ${threatLevel}/5`, incident.asset],
      },
    };
  });
}
