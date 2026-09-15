import type { BranchingStoryDefinition } from "./branching-story";

export type ArchiveEvidenceKind = "official-record" | "technical-note" | "photograph" | "press" | "oral-history" | "meeting-record";

export type ArchiveEvidence = {
  id: string;
  title: string;
  kind: ArchiveEvidenceKind;
  source: string;
  summary: string;
  sourceQuestions: string[];
  timelineOrder: number;
};

/**
 * A deliberately fictional training case. It teaches source criticism and
 * chronology without presenting invented details as real Ghanaian history.
 */
export const ARCHIVE_EVIDENCE: ArchiveEvidence[] = [
  {
    id: "engineer-memo",
    title: "District engineer's inspection memo",
    kind: "technical-note",
    source: "Bridge maintenance file · written three days before the closure",
    summary: "Records movement in one bearing and recommends temporary closure if the river reaches the painted warning marker.",
    sourceQuestions: ["Was the author qualified to assess the bridge?", "Is this a prediction, an observation, or both?", "What later source could confirm whether the threshold was reached?"],
    timelineOrder: 10,
  },
  {
    id: "river-photo",
    title: "Market photographer's contact sheet",
    kind: "photograph",
    source: "Four photographs stamped 17:18–17:24 on the evening of the closure",
    summary: "Shows water around the bridge warning marker and people gathering beyond the market road barrier.",
    sourceQuestions: ["What can the photograph establish directly?", "What can it not tell us about motive?", "Does the timestamp fit other records?"],
    timelineOrder: 20,
  },
  {
    id: "watch-ledger",
    title: "Town watch station ledger",
    kind: "official-record",
    source: "Duty ledger · entry marked 17:32",
    summary: "Notes: 'Bridge closed on engineer threshold. Divert market traffic east. Crowd unhappy.' The writer is not named.",
    sourceQuestions: ["How close in time is this record to the event?", "Does anonymity reduce confidence?", "Which phrase describes cause and which describes consequence?"],
    timelineOrder: 30,
  },
  {
    id: "editorial",
    title: "The Asempa Voice editorial",
    kind: "press",
    source: "Opinion column · published the following morning",
    summary: "Claims officials used the bridge closure to weaken a planned evening protest, but cites no named engineering source.",
    sourceQuestions: ["Is this reporting or opinion?", "What motive might the newspaper have?", "Which parts could still be useful even if its conclusion is disputed?"],
    timelineOrder: 40,
  },
  {
    id: "oral-history",
    title: "Trader Ama Serwaa's oral history",
    kind: "oral-history",
    source: "Interview recorded twenty-two years later",
    summary: "Remembers police arriving before sunset and says many traders believed the closure was political. She also remembers unusually high water that week.",
    sourceQuestions: ["How can memory change over two decades?", "Which details are personal observation and which are community belief?", "What can corroborate the weather detail?"],
    timelineOrder: 50,
  },
  {
    id: "council-minutes",
    title: "Council maintenance minutes",
    kind: "meeting-record",
    source: "Infrastructure committee · two weeks before the closure",
    summary: "Shows that a repair request was postponed because funds were redirected. One member warned that another major rain could force an emergency closure.",
    sourceQuestions: ["Does this explain the immediate decision or the conditions behind it?", "Who had an incentive to minimise the maintenance delay?", "How does it change a single-cause explanation?"],
    timelineOrder: 5,
  },
];

export const ARCHIVE_CASE: BranchingStoryDefinition = {
  id: "archive-bridge-case",
  version: 1,
  title: "The Archive: The Bridge at 17:32",
  startNodeId: "opening",
  nodes: [
    {
      id: "opening",
      title: "The box nobody catalogued",
      speaker: "Archivist Mensah",
      body: "A fictional training case: in the town of Asempa, an old market bridge was closed at 17:32 during a week of heavy rain. By dawn, part of the approach had failed. Years later, people still disagree about why officials closed it. Your job is not to guess the intended answer. Build the strongest interpretation the surviving sources can support.",
      choices: [
        { id: "enter", label: "Open the case box", nextNodeId: "hub", effects: [{ type: "set-flag", flag: "case-open", value: true }] },
      ],
    },
    {
      id: "hub",
      title: "Archive workroom",
      body: "The archive is open-ended. Choose which trail to follow. Sources disappear from this list once collected, so your investigation order can change between playthroughs.",
      choices: [
        {
          id: "engineering-file",
          label: "Inspect the engineering file",
          nextNodeId: "engineering-file",
          conditions: [{ type: "missing-evidence", evidenceId: "engineer-memo" }],
        },
        {
          id: "photo-drawer",
          label: "Develop the photographer's contact sheet",
          nextNodeId: "photo-drawer",
          conditions: [{ type: "missing-evidence", evidenceId: "river-photo" }],
        },
        {
          id: "watch-station",
          label: "Request the town watch ledger",
          nextNodeId: "watch-station",
          conditions: [{ type: "missing-evidence", evidenceId: "watch-ledger" }],
        },
        {
          id: "newspaper-room",
          label: "Read the newspaper archive",
          nextNodeId: "newspaper-room",
          conditions: [{ type: "missing-evidence", evidenceId: "editorial" }],
        },
        {
          id: "interview-room",
          label: "Listen to the trader's oral history",
          nextNodeId: "interview-room",
          conditions: [{ type: "missing-evidence", evidenceId: "oral-history" }],
        },
        {
          id: "council-shelf",
          label: "Search the council maintenance shelf",
          nextNodeId: "council-shelf",
          conditions: [{ type: "missing-evidence", evidenceId: "council-minutes" }],
        },
        { id: "interpret", label: "Move to the evidence board", nextNodeId: "interpretation" },
      ],
    },
    {
      id: "engineering-file",
      title: "A conditional warning",
      body: "The engineer did not order an immediate closure. The memo describes a damaged bearing and sets a condition: if the river reaches the warning marker, close the bridge temporarily. That distinction matters.",
      grantEvidenceIds: ["engineer-memo"],
      nextNodeId: "hub",
    },
    {
      id: "photo-drawer",
      title: "What the camera can—and cannot—say",
      body: "The photographs put water at the warning marker before the official ledger entry. They also show a crowd. The image establishes conditions and timing more clearly than motive.",
      grantEvidenceIds: ["river-photo"],
      nextNodeId: "hub",
    },
    {
      id: "watch-station",
      title: "One sentence, two facts",
      body: "The ledger links the closure to an engineering threshold and separately records an unhappy crowd. A careful historian should resist turning sequence into motive without corroboration.",
      grantEvidenceIds: ["watch-ledger"],
      nextNodeId: "hub",
    },
    {
      id: "newspaper-room",
      title: "A forceful claim",
      body: "The editorial is valuable because it preserves a contemporary political interpretation. But it is an argument, not a neutral transcript, and it gives no named technical source for its central claim.",
      grantEvidenceIds: ["editorial"],
      nextNodeId: "hub",
    },
    {
      id: "interview-room",
      title: "Memory and community belief",
      body: "Ama Serwaa remembers both police activity and high water. Her interview reveals what people believed, while the twenty-two-year gap means specific timing needs support from contemporary records.",
      grantEvidenceIds: ["oral-history"],
      nextNodeId: "hub",
    },
    {
      id: "council-shelf",
      title: "The decision before the decision",
      body: "The maintenance minutes reveal a longer chain: repairs were delayed and officials already knew heavy rain could force closure. This source may explain vulnerability even if it does not prove the immediate trigger by itself.",
      grantEvidenceIds: ["council-minutes"],
      nextNodeId: "hub",
    },
    {
      id: "interpretation",
      title: "Build an interpretation",
      body: "A strong interpretation distinguishes immediate trigger, background conditions, public reaction and possible political incentives. You can return for more evidence or commit to a theory now.",
      choices: [
        {
          id: "return",
          label: "Return to the archive for more sources",
          nextNodeId: "hub",
        },
        {
          id: "threshold",
          label: "Argue that the recorded engineering threshold best explains the immediate closure",
          nextNodeId: "ending-threshold",
          conditions: [
            { type: "has-evidence", evidenceId: "engineer-memo" },
            { type: "has-evidence", evidenceId: "river-photo" },
            { type: "has-evidence", evidenceId: "watch-ledger" },
          ],
          effects: [{ type: "set-flag", flag: "interpretation", value: "threshold" }],
          consequenceHint: "Strong on immediate cause; may leave wider responsibility unresolved.",
        },
        {
          id: "political",
          label: "Argue that crowd control was the main reason for closure",
          nextNodeId: "ending-political",
          conditions: [
            { type: "has-evidence", evidenceId: "editorial" },
            { type: "has-evidence", evidenceId: "oral-history" },
          ],
          effects: [{ type: "set-flag", flag: "interpretation", value: "political" }],
          consequenceHint: "Explains contemporary suspicion, but must survive conflicting records.",
        },
        {
          id: "systemic",
          label: "Argue a layered explanation: safety trigger, deferred maintenance and political mistrust",
          nextNodeId: "ending-systemic",
          conditions: [
            { type: "has-evidence", evidenceId: "engineer-memo" },
            { type: "has-evidence", evidenceId: "river-photo" },
            { type: "has-evidence", evidenceId: "watch-ledger" },
            { type: "has-evidence", evidenceId: "council-minutes" },
            { type: "has-evidence", evidenceId: "editorial" },
          ],
          effects: [{ type: "set-flag", flag: "interpretation", value: "systemic" }],
          consequenceHint: "Separates immediate cause from background responsibility and public interpretation.",
        },
        {
          id: "insufficient",
          label: "Publish cautiously: the collected evidence is not enough yet",
          nextNodeId: "ending-cautious",
          effects: [{ type: "set-flag", flag: "interpretation", value: "cautious" }],
          consequenceHint: "A defensible outcome when the archive is incomplete.",
        },
      ],
    },
    {
      id: "ending-threshold",
      title: "Ending: Immediate cause established",
      body: "Your report argues that the best-supported immediate trigger was the engineering threshold. You explicitly separate that conclusion from the political controversy surrounding the closure. The archive accepts the report but leaves a second question open: who bears responsibility for the bridge becoming so vulnerable?",
      endingId: "threshold-supported",
    },
    {
      id: "ending-political",
      title: "Ending: A contested interpretation",
      body: "Your report foregrounds contemporary claims of crowd control. The archive preserves it as a possible interpretation, but reviewers flag that the strongest contemporary technical records point toward a safety trigger. Your conclusion changes the public exhibit, but remains disputed.",
      endingId: "political-contested",
    },
    {
      id: "ending-systemic",
      title: "Ending: The single-cause story breaks apart",
      body: "Your report distinguishes three layers: a documented safety trigger, earlier maintenance decisions that created vulnerability, and a political atmosphere that shaped how people interpreted the closure. Instead of forcing every source into one story, you explain why apparently conflicting sources can all reveal different parts of the event.",
      endingId: "layered-interpretation",
    },
    {
      id: "ending-cautious",
      title: "Ending: The honest gap",
      body: "You refuse to claim more than your evidence can support. The archive records your report as provisional and reopens the collection request. Historical reasoning sometimes ends with a bounded uncertainty rather than a dramatic reveal.",
      endingId: "cautious-provisional",
    },
  ],
};

export function archiveEvidenceById(id: string) {
  return ARCHIVE_EVIDENCE.find((evidence) => evidence.id === id) ?? null;
}
