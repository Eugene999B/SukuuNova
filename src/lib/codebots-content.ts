import { randomInt } from "node:crypto";
import type { ArcadeInteractionQuestion } from "./arcade-interaction-content";

type CodeBotsScene = {
  cue: string;
  meterLabels: string[];
};

export type CodeBotsQuestion = ArcadeInteractionQuestion & {
  conceptKey: string;
  scene: CodeBotsScene;
};

type CodeBotsRow = {
  level: number;
  key: string;
  prompt: string;
  steps: readonly string[];
  explanation: string;
  cue: string;
  tags: readonly string[];
};

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

const PROGRAMS: readonly CodeBotsRow[] = [
  { level: 1, key: "startup-check", prompt: "Program the service bot to start safely before its first delivery.", steps: ["Power on the bot", "Run the self-check", "Load the route", "Begin the delivery"], explanation: "A safe startup powers the bot, checks it, loads the task and only then begins movement.", cue: "BOT AX-1 · Startup bay · Build a safe launch sequence.", tags: ["sequence", "startup"] },
  { level: 1, key: "input-process-output", prompt: "Build a simple input-process-output program that totals two sensor readings.", steps: ["Read the first value", "Read the second value", "Add the values", "Store the total", "Display the total"], explanation: "The program gathers input before processing, stores the result and produces output.", cue: "BOT SUM-2 · Data cell · Route two inputs through one calculation.", tags: ["input", "process", "output"] },
  { level: 1, key: "save-project", prompt: "Arrange the commands that safely save a new robot project for the first time.", steps: ["Choose Save As", "Choose the project folder", "Enter a clear file name", "Confirm Save"], explanation: "A first save chooses the location and name before confirming the file write.", cue: "BOT FILE-3 · Archive dock · Preserve the new program.", tags: ["files", "sequence"] },
  { level: 1, key: "crate-delivery", prompt: "Program a crate bot to collect one package and place it at the dispatch point.", steps: ["Move to the crate", "Grip the crate", "Move to dispatch", "Release the crate"], explanation: "The bot must reach and grip the crate before carrying and releasing it.", cue: "BOT LIFT-4 · Assembly lane · Complete one physical task in order.", tags: ["commands", "sequence"] },
  { level: 1, key: "open-control-file", prompt: "Arrange the steps for loading a saved control file into the robot editor.", steps: ["Open the editor", "Choose Open", "Select the control file", "Confirm Open"], explanation: "The editor must be active before a saved file can be selected and loaded.", cue: "BOT DOC-5 · Control room · Load an existing program.", tags: ["files", "workflow"] },
  { level: 1, key: "one-to-three", prompt: "Build a basic counter program that reports the numbers 1, 2 and 3.", steps: ["Set counter to 1", "Display counter value 1", "Increase counter to 2", "Display counter value 2", "Increase counter to 3", "Display counter value 3"], explanation: "The counter starts at one and is increased before each later output.", cue: "BOT COUNT-6 · Training rail · Trace a changing value.", tags: ["variable", "trace"] },

  { level: 2, key: "counter-loop", prompt: "Assemble a counter loop that repeats a weld action five times.", steps: ["Set counter to 1", "Check counter is at most 5", "Run the weld action", "Increase the counter", "Check the condition again"], explanation: "A counter loop initializes, checks, acts, increments and returns to its condition.", cue: "BOT LOOP-7 · Weld line · Repeat safely with a counter.", tags: ["loop", "condition"] },
  { level: 2, key: "obstacle-condition", prompt: "Program the carrier bot to stop when its front sensor detects an obstacle.", steps: ["Read the front sensor", "Compare the reading with the safe distance", "If too close, stop the motors", "Otherwise continue forward"], explanation: "The sensor reading is tested before the program chooses the stop or continue branch.", cue: "BOT SAFE-8 · Transit lane · Use a condition to protect the route.", tags: ["condition", "sensor"] },
  { level: 2, key: "battery-condition", prompt: "Build the charging decision for a bot that must recharge below 20% battery.", steps: ["Read the battery level", "Compare it with 20%", "If below 20%, go to the charger", "Otherwise continue the task"], explanation: "A decision needs the battery reading before comparing it with the threshold.", cue: "BOT VOLT-9 · Power bay · Branch from a battery threshold.", tags: ["condition", "threshold"] },
  { level: 2, key: "validated-number", prompt: "Arrange a program that accepts a number only after checking the input is valid.", steps: ["Ask for a number", "Read the input", "Check that it is numeric", "If valid, store the number", "Otherwise ask again"], explanation: "Input should be checked before trusted data is stored.", cue: "BOT CHECK-10 · Input gate · Validate before using data.", tags: ["validation", "input"] },
  { level: 2, key: "running-total", prompt: "Build a running-total program for three package weights.", steps: ["Set total to 0", "Read a package weight", "Add the weight to total", "Repeat for the remaining packages", "Display total"], explanation: "An accumulator begins at zero, is updated for each item and is displayed after processing.", cue: "BOT MASS-11 · Weigh station · Accumulate repeated input.", tags: ["accumulator", "loop"] },
  { level: 2, key: "safe-retry", prompt: "Arrange a simple one-retry connection routine for a scanner bot.", steps: ["Try the connection", "Check whether it succeeded", "If it failed, try once more", "Report the final connection state"], explanation: "The retry happens only after the first result is checked, then the final state is reported.", cue: "BOT LINK-12 · Network dock · Recover from one failed attempt.", tags: ["condition", "retry"] },

  { level: 3, key: "debug-reproduce", prompt: "Put a disciplined debugging cycle in order after a robot arm stops at the wrong position.", steps: ["Describe the expected position", "Reproduce the fault", "Inspect the relevant values", "Change the suspected cause", "Run the test again"], explanation: "Debugging starts with a clear expectation and reproducible fault before changing and retesting code.", cue: "BOT FIX-13 · Debug bench · Find causes instead of guessing.", tags: ["debugging", "testing"] },
  { level: 3, key: "function-call", prompt: "Arrange the execution of a reusable function that checks a package label.", steps: ["Call checkLabel with the package ID", "Receive the package ID parameter", "Compare it with the allowed format", "Return the check result", "Use the returned result"], explanation: "A function call supplies input, the function processes it, returns a result and the caller uses that result.", cue: "BOT FUNC-14 · Module bay · Follow a function call and return.", tags: ["function", "parameter", "return"] },
  { level: 3, key: "test-case", prompt: "Build a test case before changing a delivery-time calculator.", steps: ["Choose a known input", "Write the expected output", "Run the calculator", "Compare actual and expected output", "Record the result"], explanation: "A useful test defines input and expected behaviour before execution and comparison.", cue: "BOT TEST-15 · Quality lab · Test against an expectation.", tags: ["testing", "expected-result"] },
  { level: 3, key: "temperature-alert", prompt: "Program an alert that turns on when motor temperature is above the safe limit.", steps: ["Read the temperature sensor", "Compare with the safe limit", "If above the limit, activate the alert", "Log the temperature", "Repeat the monitoring cycle"], explanation: "Monitoring reads and checks the sensor before acting and recording the state.", cue: "BOT HEAT-16 · Motor cell · Monitor a changing safety signal.", tags: ["sensor", "condition", "monitoring"] },
  { level: 3, key: "event-handler", prompt: "Arrange what happens when an emergency-stop button is pressed.", steps: ["Detect the button event", "Pause the active movement", "Set the machine state to stopped", "Show the stop message", "Wait for an authorised reset"], explanation: "The event is detected first, then movement and state are made safe before any reset is accepted.", cue: "BOT EVENT-17 · Safety rail · Respond to an event predictably.", tags: ["event", "state"] },
  { level: 3, key: "clean-sensor-data", prompt: "Build a small data-cleaning pipeline before averaging sensor readings.", steps: ["Read the sensor batch", "Reject missing readings", "Reject values outside the valid range", "Calculate the average of valid readings", "Store the average"], explanation: "Invalid data is removed before calculations are trusted and stored.", cue: "BOT DATA-18 · Analytics cell · Clean before calculating.", tags: ["data", "validation"] },

  { level: 4, key: "linear-search", prompt: "Arrange a linear search for a named spare part in an unsorted rack list.", steps: ["Start at the first rack entry", "Compare the entry with the target part", "If it matches, report the position", "Otherwise move to the next entry", "Stop after a match or the final entry"], explanation: "Linear search examines entries in order until it finds the target or exhausts the list.", cue: "BOT SEEK-19 · Inventory grid · Search an unsorted list.", tags: ["algorithm", "linear-search"] },
  { level: 4, key: "binary-search", prompt: "Arrange the core steps of binary search on a sorted part-number list.", steps: ["Set the current low and high positions", "Check the middle item", "Compare the target with the middle item", "Discard the impossible half", "Repeat until found or no range remains"], explanation: "Binary search repeatedly checks the middle of a sorted range and removes half of the remaining possibilities.", cue: "BOT SEEK-20 · Precision rack · Halve a sorted search space.", tags: ["algorithm", "binary-search"] },
  { level: 4, key: "insertion-step", prompt: "Order the high-level steps for inserting one new value into the sorted part of a list.", steps: ["Take the next unsorted value", "Compare it with sorted values to its left", "Shift larger values one position right", "Place the value in the open position", "Continue with the next unsorted value"], explanation: "Insertion sort grows a sorted region by shifting larger values and inserting the current item.", cue: "BOT SORT-21 · Packing grid · Grow a sorted region.", tags: ["algorithm", "sorting"] },
  { level: 4, key: "request-response", prompt: "Arrange a safe request-response flow when a factory tablet asks the server for a bot status.", steps: ["Build the status request", "Send the request", "Server validates the request", "Server returns the allowed status data", "Tablet checks and displays the response"], explanation: "The client requests data, the server validates and responds, and the client checks the response before display.", cue: "BOT API-22 · Control network · Follow a request across systems.", tags: ["network", "request", "validation"] },
  { level: 4, key: "state-machine", prompt: "Put a simple robot job state transition in a sensible order.", steps: ["Set state to waiting", "Receive an approved job", "Set state to working", "Complete the job", "Set state to finished", "Return to waiting"], explanation: "A state machine moves through defined states in response to events and completed work.", cue: "BOT STATE-23 · Dispatch core · Track system state explicitly.", tags: ["state-machine", "events"] },
  { level: 4, key: "backup-restore", prompt: "Arrange a safe configuration restore after a robot controller file becomes corrupted.", steps: ["Stop writes to the damaged configuration", "Choose a verified backup", "Restore the backup", "Validate the restored configuration", "Resume the controller"], explanation: "Writes stop before a trusted backup is restored and validated before normal service resumes.", cue: "BOT BACK-24 · Recovery vault · Restore trusted state safely.", tags: ["backup", "recovery", "validation"] },

  { level: 5, key: "version-control", prompt: "Arrange a disciplined version-control workflow for a small robot-control change.", steps: ["Create or choose the working branch", "Edit the control code", "Run the relevant tests", "Commit the reviewed change", "Merge the approved change"], explanation: "Changes belong on a working branch, should be tested before commit and merged only after review or approval.", cue: "BOT GIT-25 · Engineering desk · Move a change through version control.", tags: ["version-control", "testing"] },
  { level: 5, key: "release-pipeline", prompt: "Order a basic production release pipeline for factory-control software.", steps: ["Run automated checks", "Build the release artifact", "Deploy the release", "Run the health check", "Monitor the new version"], explanation: "A release is checked and built before deployment, then health and runtime behaviour are verified.", cue: "BOT SHIP-26 · Release gantry · Ship only after verification.", tags: ["deployment", "testing", "monitoring"] },
  { level: 5, key: "transaction", prompt: "Arrange a stock-transfer transaction so a failure does not leave half an update.", steps: ["Begin the transaction", "Check the source stock", "Reduce source stock", "Increase destination stock", "Commit if every step succeeds", "Roll back if any step fails"], explanation: "A transaction groups related changes so they either commit together or are rolled back on failure.", cue: "BOT TX-27 · Stock core · Protect a multi-step update.", tags: ["transaction", "data-integrity"] },
  { level: 5, key: "bounded-retry", prompt: "Build a bounded retry strategy for a temporary network failure.", steps: ["Set attempt count to 0", "Try the request", "If successful, stop retrying", "If temporary failure, increase attempt count", "Wait before the next attempt", "Stop after the maximum attempts"], explanation: "Retries must stop on success and remain bounded so a persistent fault cannot loop forever.", cue: "BOT RETRY-28 · Network core · Recover without infinite retries.", tags: ["retry", "loop", "reliability"] },
  { level: 5, key: "incident-response", prompt: "Arrange the first technical response to a suspicious controller login.", steps: ["Record the alert details", "Protect the affected account or session", "Preserve useful evidence", "Investigate the source and scope", "Restore normal access safely", "Document the outcome"], explanation: "Incident response preserves facts, contains risk, investigates scope and restores service carefully.", cue: "BOT SEC-29 · Security cell · Contain and investigate safely.", tags: ["security", "evidence", "recovery"] },
  { level: 5, key: "refactor-safely", prompt: "Order a safe refactor of working path-planning code.", steps: ["Capture the current behaviour with tests", "Make one structural change", "Run the tests", "Review readability and behaviour", "Commit the verified refactor"], explanation: "Tests capture behaviour before structural changes and are rerun before the refactor is accepted.", cue: "BOT CLEAN-30 · Engineering lab · Improve structure without changing behaviour.", tags: ["refactor", "testing"] },
];

export const CODEBOTS_CONTROLLED_CONCEPT_COUNT = PROGRAMS.length;
export const CODEBOTS_MAX_CONTROLLED_DIFFICULTY = Math.max(...PROGRAMS.map((row) => row.level));

function dynamicRow(difficulty: number, slot: number): CodeBotsRow {
  const nonce = randomInt(100, 1000);
  if (difficulty <= 1) {
    const left = randomInt(2, 10), right = randomInt(2, 10);
    return { level: 1, key: `dynamic-total-${left}-${right}-${nonce}-${slot}`, prompt: `Program a training bot to add sensor values ${left} and ${right}, then report the total.`, steps: [`Read sensor A (${left})`, `Read sensor B (${right})`, "Add A and B", "Store the total", "Display the total"], explanation: "Both inputs are read before the calculation, then the result is stored and displayed.", cue: `BOT D-${nonce} · Training cell · Build an input-process-output path.`, tags: ["input", "process", "output"] };
  }
  if (difficulty === 2) {
    const repeats = randomInt(3, 9);
    return { level: 2, key: `dynamic-loop-${repeats}-${nonce}-${slot}`, prompt: `Program a packing bot to stamp exactly ${repeats} labels with a counter loop.`, steps: ["Set counter to 1", `Check counter is at most ${repeats}`, "Stamp one label", "Increase the counter", "Return to the condition"], explanation: "The loop initializes, checks its bound, performs one action, increments and checks again.", cue: `BOT D-${nonce} · Packing cell · Control a ${repeats}-cycle loop.`, tags: ["loop", "counter"] };
  }
  if (difficulty === 3) {
    const threshold = randomInt(45, 76);
    return { level: 3, key: `dynamic-threshold-${threshold}-${nonce}-${slot}`, prompt: `Program a cooling controller that reacts when the motor sensor rises above ${threshold}°C.`, steps: ["Read motor temperature", `Compare temperature with ${threshold}°C`, "If above the limit, start cooling", "Record the reading", "Repeat monitoring"], explanation: "The program observes the sensor, checks the threshold, acts when needed and continues monitoring.", cue: `BOT D-${nonce} · Cooling grid · Guard a ${threshold}°C threshold.`, tags: ["sensor", "condition", "monitoring"] };
  }
  if (difficulty === 4) {
    const target = randomInt(20, 90);
    return { level: 4, key: `dynamic-search-${target}-${nonce}-${slot}`, prompt: `Trace the high-level binary-search cycle for target part ${target} in an already sorted rack list.`, steps: ["Set the current search range", "Inspect the middle part number", `Compare ${target} with the middle value`, "Discard the impossible half", "Repeat on the remaining range"], explanation: "Binary search only works on ordered data and repeatedly removes half of the search range.", cue: `BOT D-${nonce} · Search rack · Narrow the range for part ${target}.`, tags: ["algorithm", "binary-search"] };
  }
  const release = randomInt(2, 10);
  return { level: 5, key: `dynamic-release-${release}-${nonce}-${slot}`, prompt: `Build the verified release path for robot-control version ${release}.0.`, steps: ["Run automated tests", `Build version ${release}.0`, "Deploy the release", "Check service health", "Monitor the release"], explanation: "Testing and building happen before deployment; health and monitoring verify the new version afterwards.", cue: `BOT D-${nonce} · Release rail · Ship version ${release}.0 safely.`, tags: ["deployment", "testing", "monitoring"] };
}

function toQuestion(row: CodeBotsRow, index: number): CodeBotsQuestion {
  return {
    id: String(index),
    kind: "sort",
    prompt: row.prompt,
    options: shuffle(row.steps),
    answer: JSON.stringify(row.steps),
    explanation: row.explanation,
    conceptKey: row.key,
    scene: { cue: row.cue, meterLabels: [...row.tags] },
  };
}

export function createCodeBotsQuestions(difficulty: number, length = 5): CodeBotsQuestion[] {
  const safeDifficulty = Math.max(1, Math.min(5, Math.trunc(difficulty)));
  const safeLength = Math.max(1, Math.min(50, Math.trunc(length)));
  const controlled = PROGRAMS.filter((row) => row.level <= safeDifficulty);
  const dynamic = Array.from({ length: Math.max(10, safeLength * 2) }, (_, index) => dynamicRow(safeDifficulty, index));
  const pool = shuffle([...controlled, ...dynamic]);
  const selected: CodeBotsRow[] = [];
  const seen = new Set<string>();
  for (const row of pool) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    selected.push(row);
    if (selected.length >= safeLength) break;
  }
  while (selected.length < safeLength) selected.push(dynamicRow(safeDifficulty, selected.length));
  return selected.slice(0, safeLength).map(toQuestion);
}
