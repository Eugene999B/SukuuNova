"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Flame,
  GraduationCap,
  Headphones,
  Lightbulb,
  Medal,
  Mic2,
  School,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./learn.module.css";

type SoundKind = "tap" | "correct" | "wrong" | "complete";
type LaneId = "school" | "exams" | "university" | "skills";
type PracticeMode = "topic" | "adaptive" | "random" | "timed";

type DemoQuestion = {
  id: string;
  subject: string;
  topic: string;
  difficulty: string;
  prompt: string;
  choices: { id: string; label: string }[];
  answer: string;
  explanation: string;
  skill: string;
};

const lanes = [
  {
    id: "school" as const,
    title: "School",
    range: "KG → SHS",
    copy: "Curriculum-aware practice that follows level, subject, topic and learning objective.",
    icon: School,
    tone: "violet",
  },
  {
    id: "exams" as const,
    title: "Exam Centre",
    range: "BECE • WASSCE • IELTS",
    copy: "Practice by subject, run timed sessions and prepare for full exam simulations.",
    icon: Medal,
    tone: "cyan",
  },
  {
    id: "university" as const,
    title: "University",
    range: "Course → Module → Topic",
    copy: "Build mastery across courses with reasoning, calculation, case study and coding questions.",
    icon: GraduationCap,
    tone: "amber",
  },
  {
    id: "skills" as const,
    title: "Professional & Skills",
    range: "Career • Tech • Aptitude",
    copy: "Focused practice for certifications, professional learning and practical skills.",
    icon: Code2,
    tone: "green",
  },
];

const subjectsByLane: Record<LaneId, string[]> = {
  school: ["Mathematics", "English", "Science", "Social Studies", "Computing"],
  exams: ["BECE", "WASSCE", "IELTS", "Aptitude"],
  university: ["Computer Science", "Nursing", "Business", "Engineering"],
  skills: ["Digital Skills", "Coding", "Accounting", "Reasoning"],
};

const levelByLane: Record<LaneId, string> = {
  school: "JHS 3",
  exams: "BECE Practice",
  university: "Foundation",
  skills: "Core Skills",
};

const modes: { id: PracticeMode; label: string; copy: string; icon: typeof Target }[] = [
  { id: "topic", label: "Topic focus", copy: "Stay inside one learning target.", icon: Target },
  { id: "adaptive", label: "Adaptive", copy: "Difficulty responds to your answers.", icon: Brain },
  { id: "random", label: "Smart random", copy: "Balanced coverage, not pure randomness.", icon: Sparkles },
  { id: "timed", label: "Timed", copy: "Train accuracy under time pressure.", icon: Clock3 },
];

const demoQuestions: DemoQuestion[] = [
  {
    id: "math-linear-1",
    subject: "Mathematics",
    topic: "Linear equations",
    difficulty: "Developing",
    prompt: "Solve for x: 4x − 7 = 21",
    choices: [
      { id: "a", label: "x = 5" },
      { id: "b", label: "x = 6" },
      { id: "c", label: "x = 7" },
      { id: "d", label: "x = 8" },
    ],
    answer: "c",
    explanation: "Add 7 to both sides to get 4x = 28, then divide both sides by 4. Therefore x = 7.",
    skill: "Solving one-variable equations",
  },
  {
    id: "science-transpiration-1",
    subject: "Science",
    topic: "Plant processes",
    difficulty: "Core",
    prompt: "Which process describes the loss of water vapour from the aerial parts of a plant, mainly through the stomata?",
    choices: [
      { id: "a", label: "Respiration" },
      { id: "b", label: "Transpiration" },
      { id: "c", label: "Germination" },
      { id: "d", label: "Pollination" },
    ],
    answer: "b",
    explanation: "Transpiration is the loss of water vapour from a plant, especially through stomata in the leaves.",
    skill: "Identifying plant life processes",
  },
  {
    id: "english-concord-1",
    subject: "English",
    topic: "Grammar & concord",
    difficulty: "Stretch",
    prompt: "Choose the best word to complete the sentence: “Neither Ama nor her friends ___ late for the lesson.”",
    choices: [
      { id: "a", label: "is" },
      { id: "b", label: "are" },
      { id: "c", label: "was" },
      { id: "d", label: "has" },
    ],
    answer: "b",
    explanation: "With “neither … nor”, the verb normally agrees with the nearer subject. “Friends” is plural, so “are” fits the sentence.",
    skill: "Subject–verb agreement",
  },
  {
    id: "computing-security-1",
    subject: "Computing",
    topic: "Digital safety",
    difficulty: "Core",
    prompt: "Which password practice gives the strongest protection for an online account?",
    choices: [
      { id: "a", label: "Reuse one password everywhere" },
      { id: "b", label: "Use your first name and birth year" },
      { id: "c", label: "Use a long, unique passphrase for the account" },
      { id: "d", label: "Share the password with a trusted classmate" },
    ],
    answer: "c",
    explanation: "A long, unique passphrase limits the damage if another service is compromised and is harder to guess than personal information.",
    skill: "Applying safe authentication practices",
  },
  {
    id: "social-constitution-1",
    subject: "Social Studies",
    topic: "Governance",
    difficulty: "Developing",
    prompt: "What is a central purpose of a national constitution?",
    choices: [
      { id: "a", label: "To list every job available in the country" },
      { id: "b", label: "To set fundamental rules for governing the state" },
      { id: "c", label: "To replace all decisions made by courts" },
      { id: "d", label: "To decide the price of all goods" },
    ],
    answer: "b",
    explanation: "A constitution establishes fundamental principles, institutions, powers, rights and rules under which a state is governed.",
    skill: "Understanding constitutional government",
  },
];

const statCards = [
  { value: "5", label: "learning lanes", detail: "One front door for different goals" },
  { value: "20+", label: "interaction designs", detail: "Beyond ordinary multiple choice" },
  { value: "∞", label: "question potential", detail: "Verified templates + controlled generation" },
];

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function LearnExperience() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lane, setLane] = useState<LaneId>("school");
  const [subject, setSubject] = useState(subjectsByLane.school[0]);
  const [mode, setMode] = useState<PracticeMode>("adaptive");
  const [questionCount, setQuestionCount] = useState(20);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<{ id: string; correct: boolean; topic: string; skill: string }[]>([]);
  const [challengeStarted, setChallengeStarted] = useState(false);
  const [complete, setComplete] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("sukuunova-learn-sound");
    if (saved === "off") setSoundEnabled(false);
  }, []);

  const playSound = useCallback(
    (kind: SoundKind, force = false) => {
      if (!soundEnabled && !force) return;
      const AudioContextCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      try {
        const context = audioContextRef.current ?? new AudioContextCtor();
        audioContextRef.current = context;
        const now = context.currentTime;
        const sequences: Record<SoundKind, number[]> = {
          tap: [330],
          correct: [440, 554, 659],
          wrong: [220, 174],
          complete: [392, 494, 587, 784],
        };
        sequences[kind].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = now + index * 0.07;
          const duration = kind === "tap" ? 0.055 : 0.12;
          oscillator.type = kind === "wrong" ? "triangle" : "sine";
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(kind === "tap" ? 0.025 : 0.045, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + duration + 0.02);
        });
      } catch {
        // Sound is enhancement-only. The learning flow must continue if audio is unavailable.
      }
    },
    [soundEnabled],
  );

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const chooseLane = (nextLane: LaneId) => {
    setLane(nextLane);
    setSubject(subjectsByLane[nextLane][0]);
    playSound("tap");
    window.setTimeout(() => scrollTo("practice-builder"), 90);
  };

  const currentQuestion = demoQuestions[activeQuestion];
  const score = attempts.filter((attempt) => attempt.correct).length;
  const accuracy = percentage(score, attempts.length);

  const weakSignals = useMemo(() => {
    return attempts.filter((attempt) => !attempt.correct).map((attempt) => attempt.topic);
  }, [attempts]);

  const startChallenge = () => {
    setActiveQuestion(0);
    setSelectedAnswer(null);
    setAttempts([]);
    setComplete(false);
    setChallengeStarted(true);
    playSound("tap");
    window.setTimeout(() => scrollTo("live-challenge"), 100);
  };

  const answerQuestion = (choiceId: string) => {
    if (selectedAnswer || complete) return;
    const correct = choiceId === currentQuestion.answer;
    setSelectedAnswer(choiceId);
    setAttempts((current) => [
      ...current,
      { id: currentQuestion.id, correct, topic: currentQuestion.topic, skill: currentQuestion.skill },
    ]);
    playSound(correct ? "correct" : "wrong");
  };

  const nextQuestion = () => {
    if (!selectedAnswer) return;
    if (activeQuestion === demoQuestions.length - 1) {
      setComplete(true);
      playSound("complete");
      return;
    }
    setActiveQuestion((current) => current + 1);
    setSelectedAnswer(null);
    playSound("tap");
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    window.localStorage.setItem("sukuunova-learn-sound", next ? "on" : "off");
    if (next) playSound("tap", true);
  };

  const openExamLane = () => {
    setLane("exams");
    setSubject(subjectsByLane.exams[0]);
    playSound("tap");
    scrollTo("practice-builder");
  };

  return (
    <main className={styles.shell}>
      <div className={styles.auroraOne} aria-hidden="true" />
      <div className={styles.auroraTwo} aria-hidden="true" />
      <div className={styles.gridGlow} aria-hidden="true" />

      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="SukuuNova home">
          <span className={styles.brandMark}>S</span>
          <span className={styles.brandCopy}>
            <strong>SukuuNova</strong>
            <span>LEARN</span>
          </span>
        </Link>

        <nav className={styles.desktopNav} aria-label="SukuuNova Learn navigation">
          <button onClick={() => scrollTo("discover")}>Discover</button>
          <button onClick={() => scrollTo("practice-builder")}>Practice</button>
          <button onClick={openExamLane}>Exam Centre</button>
          <button onClick={() => scrollTo("progress")}>Progress</button>
        </nav>

        <div className={styles.headerActions}>
          <button
            className={styles.soundButton}
            onClick={toggleSound}
            aria-label={soundEnabled ? "Turn learning sounds off" : "Turn learning sounds on"}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            <span>{soundEnabled ? "Sound on" : "Sound off"}</span>
          </button>
          <button className={styles.headerCta} onClick={startChallenge}>
            Quick challenge <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <section className={styles.hero} id="discover">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <Sparkles size={14} /> The learning side of SukuuNova
          </div>
          <h1>
            Don&apos;t just practise.
            <span> Know what to master next.</span>
          </h1>
          <p>
            One free learning home for school, major exams, university and practical skills. SukuuNova Learn is being built around mastery — not endless question lists.
          </p>
          <div className={styles.heroActions}>
            <button className={styles.primaryAction} onClick={() => scrollTo("learning-lanes")}>
              Start learning free <ArrowRight size={18} />
            </button>
            <button className={styles.secondaryAction} onClick={startChallenge}>
              Try the live engine <Brain size={18} />
            </button>
          </div>
          <div className={styles.trustLine}>
            <span><Check size={14} /> No payment wall for core practice</span>
            <span><ShieldCheck size={14} /> Original learning content</span>
            <span><Volume2 size={14} /> Optional interaction sounds</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="SukuuNova Learning Intelligence Engine preview">
          <div className={styles.orbitRingOne} />
          <div className={styles.orbitRingTwo} />
          <div className={styles.brainCore}>
            <span className={styles.coreIcon}><Brain size={34} /></span>
            <small>SUKUUNOVA BRAIN</small>
            <strong>Learning intelligence</strong>
            <p>Curriculum + mastery + question history</p>
          </div>
          <div className={`${styles.floatNode} ${styles.nodeMath}`}><span>∑</span> Mathematics</div>
          <div className={`${styles.floatNode} ${styles.nodeLanguage}`}><BookOpen size={16} /> Languages</div>
          <div className={`${styles.floatNode} ${styles.nodeCode}`}><Code2 size={16} /> Computing</div>
          <div className={`${styles.floatNode} ${styles.nodeAudio}`}><Headphones size={16} /> Listening</div>
          <div className={styles.livePulse}><span /> Engine online</div>
        </div>
      </section>

      <section className={styles.statStrip} aria-label="SukuuNova Learn foundations">
        {statCards.map((stat) => (
          <article key={stat.label}>
            <strong>{stat.value}</strong>
            <div><span>{stat.label}</span><small>{stat.detail}</small></div>
          </article>
        ))}
      </section>

      <section className={styles.lanesSection} id="learning-lanes">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>ONE FRONT DOOR</span>
            <h2>What are you learning for?</h2>
          </div>
          <p>Choose a lane. The experience changes around the learner instead of forcing every age, course and exam into the same interface.</p>
        </div>

        <div className={styles.laneGrid}>
          {lanes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`${styles.laneCard} ${styles[`tone${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}
                onClick={() => chooseLane(item.id)}
              >
                <span className={styles.laneTop}>
                  <span className={styles.laneIcon}><Icon size={22} /></span>
                  <ChevronRight size={19} />
                </span>
                <strong>{item.title}</strong>
                <small>{item.range}</small>
                <p>{item.copy}</p>
                <span className={styles.cardAction}>Enter lane <ArrowRight size={15} /></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.builderSection} id="practice-builder">
        <div className={styles.builderPanel}>
          <div className={styles.builderIntro}>
            <span className={styles.kicker}>SMART SESSION BUILDER</span>
            <h2>Build a session around the goal, not around a giant question list.</h2>
            <p>The full engine will use curriculum position, mastery, difficulty and exposure history. This foundation already establishes the exact learner flow.</p>
            <div className={styles.signalCard}>
              <span className={styles.signalIcon}><Brain size={20} /></span>
              <div><small>SESSION INTELLIGENCE</small><strong>{levelByLane[lane]} · {subject}</strong><span>{modes.find((item) => item.id === mode)?.label} · {questionCount} questions</span></div>
              <span className={styles.signalPulse} />
            </div>
          </div>

          <div className={styles.builderControls}>
            <div className={styles.controlBlock}>
              <div className={styles.controlLabel}><span>01</span><div><strong>Choose focus</strong><small>{lanes.find((item) => item.id === lane)?.title}</small></div></div>
              <div className={styles.subjectChips}>
                {subjectsByLane[lane].map((item) => (
                  <button
                    key={item}
                    className={subject === item ? styles.chipActive : styles.chip}
                    onClick={() => { setSubject(item); playSound("tap"); }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlBlock}>
              <div className={styles.controlLabel}><span>02</span><div><strong>Choose practice style</strong><small>How SukuuNova should challenge you</small></div></div>
              <div className={styles.modeGrid}>
                {modes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={mode === item.id ? styles.modeActive : styles.modeButton}
                      onClick={() => { setMode(item.id); playSound("tap"); }}
                    >
                      <Icon size={18} />
                      <span><strong>{item.label}</strong><small>{item.copy}</small></span>
                      {mode === item.id && <Check size={17} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.controlBlock}>
              <div className={styles.controlLabel}><span>03</span><div><strong>Session size</strong><small>Full engine target</small></div></div>
              <div className={styles.countRow}>
                {[10, 20, 30, 50, 75, 100].map((count) => (
                  <button
                    key={count}
                    className={questionCount === count ? styles.countActive : styles.countButton}
                    onClick={() => { setQuestionCount(count); playSound("tap"); }}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <button className={styles.launchButton} onClick={startChallenge}>
                <Sparkles size={18} /> Run 5-question live engine preview <ArrowRight size={18} />
              </button>
              <small className={styles.previewNote}>The production question generator will honour the selected 10–100 session size. This first safe slice uses five verified original demo questions.</small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.challengeSection} id="live-challenge">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>LIVE ENGINE PREVIEW</span>
            <h2>Answer. Understand. Improve.</h2>
          </div>
          <p>This is a working interaction slice: answer feedback, explanation, sound, progress tracking and post-session learning signals are already wired.</p>
        </div>

        {!challengeStarted ? (
          <div className={styles.challengeEmpty}>
            <div className={styles.emptyOrb}><Brain size={34} /></div>
            <span>5-question diagnostic preview</span>
            <h3>See how a SukuuNova session feels.</h3>
            <p>No account. No payment. Your first interaction starts the sound system only if sound is enabled.</p>
            <button onClick={startChallenge}>Start now <ArrowRight size={17} /></button>
          </div>
        ) : complete ? (
          <div className={styles.resultsCard} id="progress">
            <div className={styles.resultsBurst} aria-hidden="true">✦</div>
            <div className={styles.resultTop}>
              <div>
                <span className={styles.kicker}>SESSION COMPLETE</span>
                <h3>{accuracy >= 80 ? "Strong finish." : accuracy >= 60 ? "Good signal. Now we know where to focus." : "This is useful data — now we repair the gaps."}</h3>
                <p>SukuuNova turns the score into the next learning action instead of stopping at a percentage.</p>
              </div>
              <div className={styles.scoreOrb}>
                <strong>{accuracy}%</strong>
                <span>{score}/{demoQuestions.length} correct</span>
              </div>
            </div>

            <div className={styles.resultGrid}>
              <article><Target size={20} /><span>Accuracy</span><strong>{accuracy}%</strong><small>this preview session</small></article>
              <article><Brain size={20} /><span>Signals found</span><strong>{weakSignals.length}</strong><small>areas worth revisiting</small></article>
              <article><Flame size={20} /><span>Momentum</span><strong>+1</strong><small>learning session completed</small></article>
            </div>

            <div className={styles.nextMove}>
              <div className={styles.nextMoveIcon}><Lightbulb size={21} /></div>
              <div>
                <small>SUKUUNOVA RECOMMENDS</small>
                <strong>{weakSignals.length ? `Repair ${weakSignals[0]} first.` : "Increase the difficulty on your next session."}</strong>
                <p>{weakSignals.length ? "Your incorrect answer becomes a learning signal. The full mastery engine will use it to choose targeted follow-up questions." : "You cleared the preview. A mastery engine should now test whether that knowledge holds at a higher level and over time."}</p>
              </div>
              <button onClick={startChallenge}>{weakSignals.length ? "Fix my weaknesses" : "Challenge me again"} <ArrowRight size={16} /></button>
            </div>
          </div>
        ) : (
          <div className={styles.questionStage}>
            <div className={styles.questionRail}>
              <div className={styles.questionProgressMeta}>
                <span>Question {activeQuestion + 1} of {demoQuestions.length}</span>
                <strong>{percentage(activeQuestion, demoQuestions.length)}% journey</strong>
              </div>
              <div className={styles.progressTrack}><span style={{ width: `${percentage(activeQuestion + (selectedAnswer ? 1 : 0), demoQuestions.length)}%` }} /></div>
              <div className={styles.questionTags}>
                <span>{currentQuestion.subject}</span>
                <span>{currentQuestion.topic}</span>
                <span>{currentQuestion.difficulty}</span>
              </div>
            </div>

            <div className={styles.questionCard}>
              <div className={styles.questionNumber}>{String(activeQuestion + 1).padStart(2, "0")}</div>
              <p className={styles.questionPrompt}>{currentQuestion.prompt}</p>
              <div className={styles.choiceGrid}>
                {currentQuestion.choices.map((choice, index) => {
                  const isSelected = selectedAnswer === choice.id;
                  const isCorrect = selectedAnswer !== null && choice.id === currentQuestion.answer;
                  const isWrongSelection = isSelected && choice.id !== currentQuestion.answer;
                  return (
                    <button
                      key={choice.id}
                      className={`${styles.choice} ${isCorrect ? styles.choiceCorrect : ""} ${isWrongSelection ? styles.choiceWrong : ""}`}
                      onClick={() => answerQuestion(choice.id)}
                      disabled={selectedAnswer !== null}
                    >
                      <span className={styles.choiceKey}>{String.fromCharCode(65 + index)}</span>
                      <strong>{choice.label}</strong>
                      <span className={styles.choiceState}>{isCorrect ? <Check size={17} /> : isWrongSelection ? <X size={17} /> : null}</span>
                    </button>
                  );
                })}
              </div>

              {selectedAnswer && (
                <div className={`${styles.feedback} ${selectedAnswer === currentQuestion.answer ? styles.feedbackCorrect : styles.feedbackWrong}`} aria-live="polite">
                  <div className={styles.feedbackIcon}>{selectedAnswer === currentQuestion.answer ? <Check size={21} /> : <X size={21} />}</div>
                  <div>
                    <strong>{selectedAnswer === currentQuestion.answer ? "Correct — lock that idea in." : "Not quite — use the mistake."}</strong>
                    <p>{currentQuestion.explanation}</p>
                    <span><Brain size={14} /> Skill signal: {currentQuestion.skill}</span>
                  </div>
                  <button onClick={nextQuestion}>{activeQuestion === demoQuestions.length - 1 ? "See my results" : "Next question"} <ArrowRight size={16} /></button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className={styles.intelligenceSection}>
        <div className={styles.intelligenceCopy}>
          <span className={styles.kicker}>BUILT DIFFERENTLY</span>
          <h2>The question is only the beginning.</h2>
          <p>Every future question can carry curriculum position, skill, difficulty, answer logic, explanation, misconception signals, source status and exposure history. That is how SukuuNova can eventually know what a learner needs next.</p>
          <div className={styles.intelligencePills}>
            <span><Check size={14} /> Curriculum graph</span>
            <span><Check size={14} /> Question DNA</span>
            <span><Check size={14} /> Mastery model</span>
            <span><Check size={14} /> Adaptive difficulty</span>
            <span><Check size={14} /> Quality checks</span>
            <span><Check size={14} /> Weak-area repair</span>
          </div>
        </div>

        <div className={styles.dnaCard}>
          <div className={styles.dnaHead}><span><Brain size={18} /> Question DNA</span><small>VERIFIED</small></div>
          <div className={styles.dnaRows}>
            <div><span>Curriculum</span><strong>Ghana · JHS</strong></div>
            <div><span>Subject</span><strong>Mathematics</strong></div>
            <div><span>Topic</span><strong>Linear equations</strong></div>
            <div><span>Skill</span><strong>Application</strong></div>
            <div><span>Difficulty</span><strong>4 / 10</strong></div>
            <div><span>Exposure</span><strong>New to learner</strong></div>
          </div>
          <div className={styles.dnaFooter}><span className={styles.dnaDot} /> Ready for intelligent selection</div>
        </div>
      </section>

      <section className={styles.futureSection}>
        <article>
          <div><Mic2 size={22} /></div>
          <span>Speaking</span>
          <h3>Answer with your voice.</h3>
          <p>Language practice can evolve beyond tapping choices into spoken responses and structured feedback.</p>
        </article>
        <article>
          <div><Search size={22} /></div>
          <span>Why was I wrong?</span>
          <h3>Diagnose the misconception.</h3>
          <p>Wrong options can point to a specific reasoning error, turning mistakes into useful signals.</p>
        </article>
        <article>
          <div><Trophy size={22} /></div>
          <span>SukuuNova Arena</span>
          <h3>Compete without copying.</h3>
          <p>Friends, classes and schools can share objectives while receiving different verified variants.</p>
        </article>
      </section>

      <section className={styles.closingSection}>
        <div>
          <span className={styles.kicker}>ANY LEARNER. ANY LEVEL. ANY EXAM.</span>
          <h2>Open SukuuNova and learn.</h2>
          <p>Free at the core. Fast on mobile. Designed to grow from Ghana to far beyond it without turning learning into a paywall.</p>
        </div>
        <button onClick={startChallenge}>Start the challenge <ArrowRight size={18} /></button>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.footerBrand} href="/"><span className={styles.brandMark}>S</span><strong>SukuuNova Learn</strong></Link>
        <span>Learn. Practice. Master.</span>
        <span>© 2026 SukuuNova</span>
      </footer>

      <nav className={styles.mobileNav} aria-label="Mobile learning navigation">
        <button onClick={() => scrollTo("discover")}><Sparkles size={19} /><span>Discover</span></button>
        <button onClick={() => scrollTo("practice-builder")}><Target size={19} /><span>Practice</span></button>
        <button className={styles.mobilePrimary} onClick={startChallenge}><Brain size={22} /><span>Challenge</span></button>
        <button onClick={openExamLane}><Medal size={19} /><span>Exams</span></button>
        <button onClick={() => scrollTo("progress")}><Trophy size={19} /><span>Progress</span></button>
      </nav>
    </main>
  );
}
