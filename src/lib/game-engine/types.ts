export type GameCategory =
  | "platformer"
  | "runner"
  | "open-world"
  | "simulation"
  | "construction"
  | "strategy"
  | "investigation"
  | "creative"
  | "debate"
  | "sports";

export type CameraMode = "follow" | "orbit" | "runner" | "top-down" | "first-person" | "static";

export type GamePacing = "relaxed" | "variable" | "steady" | "high";
export type FailureModel = "recoverable" | "partial" | "hard-fail" | "branching" | "score-only";
export type EndingModel = "single" | "multiple" | "endless" | "score-attack" | "seasonal";
export type SessionLength = "quick" | "medium" | "long" | "persistent";

/**
 * A renderer/input adapter maps keyboard, touch and controller input into this
 * shared intent shape. Gameplay code should consume intent, not device events.
 */
export type InputIntent = {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  sprint: boolean;
  crouch: boolean;
  interact: boolean;
  primaryAction: boolean;
  secondaryAction: boolean;
};

export type MovementProfile = {
  id: string;
  category: GameCategory;
  acceleration: number;
  deceleration: number;
  maxSpeed: number;
  sprintSpeed?: number;
  turnResponsiveness: number;
  gravity?: number;
  fallGravityMultiplier?: number;
  jumpVelocity?: number;
  coyoteTimeMs?: number;
  jumpBufferMs?: number;
  airControl?: number;
  laneCount?: number;
  laneChangeDurationMs?: number;
  autoForwardSpeed?: number;
  collisionForgiveness?: number;
  notes: string[];
};

export type CameraProfile = {
  id: string;
  mode: CameraMode;
  followLag: number;
  lookAhead: number;
  fieldOfView?: number;
  speedFovBoost?: number;
  collisionAvoidance?: boolean;
  notes: string[];
};

/**
 * Game DNA is intentionally broader than academic subject matter. It allows
 * Sukuunova to measure whether two games would actually FEEL different.
 */
export type GameDNA = {
  id: string;
  title: string;
  category: GameCategory;
  genre: string;
  setting: string;
  playerRole: string;
  primaryMechanic: string;
  secondaryMechanics: string[];
  interactionStyle: string;
  storyStructure: string;
  pacing: GamePacing;
  failureModel: FailureModel;
  endingModel: EndingModel;
  sessionLength: SessionLength;
  movementProfileId: string;
  cameraProfileId: string;
  academicDomains: string[];
};

export type GameplayTelemetry = {
  elapsedMs: number;
  successes: number;
  failures: number;
  retries: number;
  hintsUsed: number;
  optionalInteractions: number;
  skippedNarrative: number;
  repeatedActionCount: number;
  recentMechanics: string[];
  averageDecisionMs?: number;
};

export type MasterySignal = {
  conceptKey: string;
  mastery: number;
};

export type DirectorInput = {
  telemetry: GameplayTelemetry;
  mastery: MasterySignal[];
  currentMechanic: string;
  availableMechanics: string[];
};

export type DirectorAction =
  | { type: "keep-course"; reason: string }
  | { type: "add-support"; strength: 1 | 2; reason: string }
  | { type: "raise-challenge"; amount: "small" | "medium"; reason: string }
  | { type: "rotate-mechanic"; mechanic: string; reason: string }
  | { type: "contextual-remediation"; conceptKey: string; reason: string };

export type GameCatalogEntry = {
  dna: GameDNA;
  summary: string;
  coreLoop: string[];
  learningThroughAction: string[];
  replayDrivers: string[];
};
