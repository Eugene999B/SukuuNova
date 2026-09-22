"use client";

import { useEffect, useMemo, useState } from "react";
import { ARCHIVE_CASE, ARCHIVE_EVIDENCE, archiveEvidenceById } from "@/lib/game-engine/archive-case";
import {
  availableStoryChoices,
  chooseStoryOption,
  continueStory,
  createBranchingStoryState,
  currentStoryNode,
  restoreStoryCheckpoint,
  serializeStoryCheckpoint,
  type BranchingStoryState,
} from "@/lib/game-engine/branching-story";
import styles from "./archive-prototype.module.css";

const CHECKPOINT_KEY = "sukuunova:lab:archive:bridge-case:v1";

export function ArchivePrototype() {
  const [story, setStory] = useState<BranchingStoryState>(() => createBranchingStoryState(ARCHIVE_CASE));
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [resumeStatus, setResumeStatus] = useState<"fresh" | "restored" | "invalid">("fresh");

  useEffect(() => {
    const restored = restoreStoryCheckpoint(ARCHIVE_CASE, window.localStorage.getItem(CHECKPOINT_KEY));
    setStory(restored.state);
    setResumeStatus(restored.restored ? "restored" : restored.reason === "invalid" ? "invalid" : "fresh");
    setCheckpointReady(true);
  }, []);

  useEffect(() => {
    if (!checkpointReady) return;
    window.localStorage.setItem(CHECKPOINT_KEY, serializeStoryCheckpoint(story));
  }, [checkpointReady, story]);

  const node = currentStoryNode(ARCHIVE_CASE, story);
  const choices = availableStoryChoices(ARCHIVE_CASE, story);
  const evidence = useMemo(
    () => story.evidenceIds.map((id) => archiveEvidenceById(id)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [story.evidenceIds],
  );

  const choose = (choiceId: string) => setStory((current) => chooseStoryOption(ARCHIVE_CASE, current, choiceId).state);
  const advance = () => setStory((current) => continueStory(ARCHIVE_CASE, current).state);
  const reset = () => {
    window.localStorage.removeItem(CHECKPOINT_KEY);
    setStory(createBranchingStoryState(ARCHIVE_CASE));
    setResumeStatus("fresh");
  };

  const checkpointLabel = !checkpointReady
    ? "Checking checkpoint…"
    : resumeStatus === "restored"
      ? "Resumed saved case"
      : resumeStatus === "invalid"
        ? "Old checkpoint replaced safely"
        : "New case · auto-save on";

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Branching investigation prototype</p>
            <h1 className={styles.title}>The Archive: The Bridge at 17:32</h1>
            <p className={styles.subtitle}>
              A fictional historical investigation where source order, evidence quality and interpretation change the path. No repeated opening screen: every decision is checkpointed locally and the case resumes where the learner stopped.
            </p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.badge}>{checkpointLabel}</span>
            <button type="button" className={styles.button} onClick={reset}>Start a new investigation</button>
          </div>
        </header>

        <div className={styles.grid}>
          <section className={styles.storyCard} aria-live="polite">
            <div className={styles.storyBody}>
              <div className={styles.statusRow}>
                <span className={styles.badge}>{story.endingId ? "Case concluded" : "Investigation active"}</span>
                <span className={styles.meta}>Fictional training case · choices persist</span>
              </div>
              {node.speaker ? <p className={styles.speaker}>{node.speaker}</p> : null}
              <h2>{node.title}</h2>
              <p>{node.body}</p>
              {story.endingId ? (
                <div className={styles.ending}>
                  <strong>Ending recorded: </strong>{story.endingId.replaceAll("-", " ")}. Start a new investigation to deliberately take a different evidence route.
                </div>
              ) : null}
            </div>

            {!story.endingId ? (
              node.nextNodeId ? (
                <div className={styles.choices}>
                  <button type="button" className={styles.choice} onClick={advance}>Continue investigation</button>
                </div>
              ) : (
                <div className={styles.choices}>
                  {choices.map((choice) => (
                    <button type="button" className={styles.choice} key={choice.id} onClick={() => choose(choice.id)}>
                      <span>{choice.label}</span>
                      {choice.consequenceHint ? <span className={styles.consequence}>{choice.consequenceHint}</span> : null}
                    </button>
                  ))}
                </div>
              )
            ) : null}
          </section>

          <aside className={styles.panel}>
            <h3>Case board</h3>
            <div className={styles.metrics}>
              <div className={styles.metric}><span>Sources found</span><strong>{story.evidenceIds.length}/{ARCHIVE_EVIDENCE.length}</strong></div>
              <div className={styles.metric}><span>Scenes visited</span><strong>{story.visitedNodeIds.length}</strong></div>
              <div className={styles.metric}><span>Decisions made</span><strong>{story.choiceHistory.length}</strong></div>
              <div className={styles.metric}><span>Ending</span><strong>{story.endingId ? "1" : "—"}</strong></div>
            </div>
            <p className={styles.note}>
              The board does not label a source “correct” or “wrong.” Each item asks what it can establish, what it cannot establish, who produced it and what could corroborate it.
            </p>
            <p className={styles.note}>
              Available interpretation choices change with the evidence actually collected. Returning to the archive is always allowed before committing.
            </p>
          </aside>
        </div>

        <section className={styles.evidenceSection}>
          <h2 className={styles.sectionTitle}>Collected evidence</h2>
          {evidence.length === 0 ? (
            <div className={styles.empty}>No sources collected yet. Open the case and choose your first investigative trail.</div>
          ) : (
            <div className={styles.evidenceGrid}>
              {evidence.map((item) => (
                <article className={styles.evidenceCard} key={item.id}>
                  <span className={styles.evidenceMeta}>{item.kind.replaceAll("-", " ")}</span>
                  <h3>{item.title}</h3>
                  <p><strong>{item.source}</strong></p>
                  <p>{item.summary}</p>
                  <ul className={styles.questions}>
                    {item.sourceQuestions.map((question) => <li key={question}>{question}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
