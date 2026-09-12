import { randomInt } from "node:crypto";
import type { ArcadeWorldQuestion, ArcadeWorldScene } from "./arcade-world-content";

export type StoryLabMission = "sequence" | "character" | "dialogue" | "cause-effect" | "transition" | "camera" | "revision";
export type StoryLabBackdrop = "school" | "market" | "forest" | "space" | "festival" | "studio";

export type StoryLabScene = ArcadeWorldScene & {
  storyMission: StoryLabMission;
  sceneTitle: string;
  directorBrief: string;
  constraint: string;
  backdrop: StoryLabBackdrop;
  cast: string[];
  beatStrip: string[];
  storyboardId: string;
};

export type StoryLabQuestion = ArcadeWorldQuestion & {
  conceptKey: string;
  scene: StoryLabScene;
};

type StoryTemplate = {
  id: string;
  mission: StoryLabMission;
  title: string;
  brief: string;
  constraint: string;
  backdrop: StoryLabBackdrop;
  cast: string[];
  beats: string[];
  prompt: string;
  answer: string;
  wrong: [string, string, string];
  explanation: string;
  cue: string;
  minDifficulty: number;
};

const STORIES: StoryTemplate[] = [
  {
    id: "beginning-middle-end",
    mission: "sequence",
    title: "The Missing Notebook",
    brief: "Build a three-beat scene with a clear beginning, middle and ending.",
    constraint: "The problem must appear before the solution.",
    backdrop: "school",
    cast: ["Ama", "Kojo"],
    beats: ["Ama notices her notebook is missing.", "She searches the classroom.", "Kojo returns the notebook he found."],
    prompt: "Which beat order makes the scene easiest to follow?",
    answer: "Problem → search → notebook returned",
    wrong: ["Notebook returned → problem → search", "Search → notebook returned → problem", "Problem → notebook returned → search begins"],
    explanation: "A clear sequence introduces the problem, shows an attempt to solve it, then gives the result.",
    cue: "Ask what the audience needs to understand first, next and last.",
    minDifficulty: 1,
  },
  {
    id: "goal-first",
    mission: "character",
    title: "Market Morning",
    brief: "Give the main character a clear goal before the action starts.",
    constraint: "The audience should know what the character wants.",
    backdrop: "market",
    cast: ["Nana", "Esi"],
    beats: ["Nana enters the market.", "A busy crowd moves around her.", "She must find ingredients for a family meal."],
    prompt: "Which opening line gives Nana the clearest story goal?",
    answer: "Nana needs to find the three ingredients on her list before the market closes.",
    wrong: ["Nana is wearing blue shoes today.", "The market has many colours and sounds.", "A bird lands on a nearby roof."],
    explanation: "A goal tells the audience what the character is trying to achieve, which gives later actions meaning.",
    cue: "Look for the line that tells us what the character is trying to accomplish.",
    minDifficulty: 1,
  },
  {
    id: "reaction-after-cause",
    mission: "cause-effect",
    title: "Rainy Rehearsal",
    brief: "Make one event clearly cause the next action.",
    constraint: "The reaction must happen after its cause.",
    backdrop: "festival",
    cast: ["Yaw", "Abena"],
    beats: ["Dark clouds gather.", "Rain starts suddenly.", "The dancers move under a shelter."],
    prompt: "Which connection best explains why the dancers change location?",
    answer: "Rain starts, so the dancers move under the shelter.",
    wrong: ["The dancers move first, so rain begins.", "The shelter appears because the music stops.", "The rain starts because the dancers move."],
    explanation: "Cause-and-effect writing makes the relationship between an event and the response clear.",
    cue: "Identify the event that happens first and the response it triggers.",
    minDifficulty: 1,
  },
  {
    id: "dialogue-purpose",
    mission: "dialogue",
    title: "Forest Clue",
    brief: "Use dialogue to move the story forward rather than repeat what the audience can already see.",
    constraint: "The line should reveal a useful clue or decision.",
    backdrop: "forest",
    cast: ["Kofi", "Mansa"],
    beats: ["The friends reach a fork in the trail.", "A red ribbon is tied to one branch.", "They need to choose a route."],
    prompt: "Which line of dialogue moves the scene forward most clearly?",
    answer: "Mansa says, “The map mentions a red ribbon, so this must be the marked trail.”",
    wrong: ["Kofi says, “There are trees here.”", "Mansa says, “We are standing on the ground.”", "Kofi says, “The sky is above us.”"],
    explanation: "Useful dialogue can reveal evidence, intention or a decision instead of repeating obvious visual information.",
    cue: "Choose the line that adds information the audience needs for the next action.",
    minDifficulty: 2,
  },
  {
    id: "transition-next",
    mission: "transition",
    title: "Robot Workshop",
    brief: "Connect two actions with a transition that shows their order.",
    constraint: "The transition must make the timeline easy to follow.",
    backdrop: "studio",
    cast: ["Zuri"],
    beats: ["Zuri tightens the loose wheel.", "She tests the robot on the floor.", "The robot rolls straight."],
    prompt: "Which transition best introduces the testing beat after the repair?",
    answer: "Next, Zuri tests the robot on the floor.",
    wrong: ["Yesterday, Zuri tests the robot on the floor.", "However, before any repair, the robot rolls straight.", "Meanwhile, the repair has not happened yet."],
    explanation: "A sequencing transition such as “Next” helps the audience follow the order of events.",
    cue: "Pick the transition that matches what happens immediately after the repair.",
    minDifficulty: 2,
  },
  {
    id: "wide-establishing",
    mission: "camera",
    title: "Festival Arrival",
    brief: "Choose a camera view that establishes where the new scene takes place.",
    constraint: "The audience needs to see the setting before close details matter.",
    backdrop: "festival",
    cast: ["Efua", "Kwame"],
    beats: ["The scene changes to a festival ground.", "Drummers and families fill the space.", "Efua enters from the gate."],
    prompt: "Which first shot best establishes the new location?",
    answer: "A wide shot showing the festival ground, crowd and entrance gate.",
    wrong: ["An extreme close-up of one shoe with no setting visible.", "A close-up of a drumstick before the location is shown.", "A blank frame with only the dialogue caption."],
    explanation: "An establishing wide shot gives the audience spatial context before the story moves to closer details.",
    cue: "Ask which view helps the audience understand where everyone is.",
    minDifficulty: 2,
  },
  {
    id: "close-emotion",
    mission: "camera",
    title: "Launch Decision",
    brief: "Use camera distance to emphasise a character’s reaction.",
    constraint: "The audience should notice the character’s face and emotion.",
    backdrop: "space",
    cast: ["Nova"],
    beats: ["A warning light appears.", "Nova reads the message.", "Nova realises the route must change."],
    prompt: "Which shot best highlights Nova’s reaction to the warning?",
    answer: "A close-up of Nova’s face as the warning is understood.",
    wrong: ["A distant shot where Nova is too small to read the expression.", "A shot of an empty corridor while Nova reacts off-screen.", "A map-only shot that hides the character completely."],
    explanation: "Close-ups are useful when facial reaction is the most important information in the moment.",
    cue: "Choose the camera distance that makes the character’s expression easiest to notice.",
    minDifficulty: 3,
  },
  {
    id: "remove-repeat",
    mission: "revision",
    title: "The Fast Bicycle",
    brief: "Tighten a scene by removing unnecessary repetition.",
    constraint: "Keep the meaning while making the narration cleaner.",
    backdrop: "school",
    cast: ["Adwoa"],
    beats: ["Adwoa pedals quickly.", "The bicycle speeds toward the gate.", "She reaches the gate before it closes."],
    prompt: "Which revision is the clearest and least repetitive?",
    answer: "Adwoa pedals quickly and reaches the gate before it closes.",
    wrong: ["Adwoa pedals quickly fast and speeds speedily toward the gate quickly.", "Adwoa pedals. Adwoa pedals. Adwoa pedals quickly quickly.", "Quickly fast, Adwoa rapidly speeds in a fast way toward the gate."],
    explanation: "Revision can remove repeated ideas and keep the strongest wording without changing the event.",
    cue: "Look for the version that keeps the important action without saying the same idea several times.",
    minDifficulty: 3,
  },
  {
    id: "because-link",
    mission: "cause-effect",
    title: "Power Cut",
    brief: "Explain why a character changes plans.",
    constraint: "The sentence must connect the reason and the decision logically.",
    backdrop: "studio",
    cast: ["Sena", "Malik"],
    beats: ["The lights go out.", "The room becomes too dark to film safely.", "The team moves the shoot outdoors."],
    prompt: "Which sentence gives the clearest cause-and-effect link?",
    answer: "Because the room is too dark to film safely, the team moves the shoot outdoors.",
    wrong: ["The team moves outdoors because the outdoor scene caused the power cut.", "The lights go out after the team has already finished every outdoor shot.", "The room is dark, although that means the lights are working normally."],
    explanation: "The reason comes first in the logic: the power cut makes the room too dark, so the plan changes.",
    cue: "Check that the reason actually explains the decision rather than reversing it.",
    minDifficulty: 3,
  },
  {
    id: "conflict-resolution",
    mission: "sequence",
    title: "One Last Ticket",
    brief: "Arrange the conflict and resolution so the ending feels earned.",
    constraint: "The characters should face the problem before solving it.",
    backdrop: "festival",
    cast: ["Amina", "Jojo"],
    beats: ["Only one ticket remains.", "Both friends want to attend.", "They discover a volunteer pass is available for the second person."],
    prompt: "Which sequence creates the clearest conflict-to-resolution arc?",
    answer: "One ticket remains → both friends want it → they find a fair second option",
    wrong: ["They find a second option → one ticket remains → both friends want it", "Both friends celebrate → no problem appears → one ticket remains", "The solution appears → the story ends → the conflict starts"],
    explanation: "A satisfying short arc introduces the obstacle before the characters discover or create a resolution.",
    cue: "Find the order where the audience first understands the problem and later sees it resolved.",
    minDifficulty: 3,
  },
  {
    id: "speaker-clarity",
    mission: "dialogue",
    title: "Two Voices",
    brief: "Make it obvious who is speaking during a fast exchange.",
    constraint: "The audience should not have to guess the speaker.",
    backdrop: "market",
    cast: ["Akosua", "Baffour"],
    beats: ["Akosua checks the list.", "Baffour points to another stall.", "They decide where to go next."],
    prompt: "Which script line keeps the speaker and action clearest?",
    answer: "Baffour points across the lane and says, “The rice stall is beside the blue umbrella.”",
    wrong: ["“Over there,” it says, without showing who speaks.", "They say something while someone points somewhere.", "The voice says the line, but neither character is identified."],
    explanation: "Clear speaker attribution helps the audience connect dialogue to the correct character and action.",
    cue: "Choose the line where the speaker and the accompanying action are both easy to identify.",
    minDifficulty: 3,
  },
  {
    id: "pacing-focus",
    mission: "revision",
    title: "Doorway Surprise",
    brief: "Slow down the most important moment instead of spending equal time on every detail.",
    constraint: "The surprise should receive the strongest story emphasis.",
    backdrop: "school",
    cast: ["Nii"],
    beats: ["Nii walks down the corridor.", "He opens the classroom door.", "His classmates shout, “Surprise!”"],
    prompt: "Which edit gives the surprise moment the strongest pacing?",
    answer: "Keep the walk brief, pause at the door, then hold on the classmates’ surprise reveal.",
    wrong: ["Spend most of the scene listing every floor tile before the door opens.", "Cut away from the classroom exactly when the surprise happens.", "Repeat the corridor walk three times and rush the reveal in one instant."],
    explanation: "Pacing gives more screen time or attention to moments that matter most to the story.",
    cue: "Ask which beat deserves the audience’s attention and which setup can stay brief.",
    minDifficulty: 4,
  },
  {
    id: "continuity-prop",
    mission: "revision",
    title: "The Red Backpack",
    brief: "Protect visual continuity across two connected shots.",
    constraint: "A key prop should not change without a story reason.",
    backdrop: "school",
    cast: ["Lena"],
    beats: ["Lena carries a red backpack into class.", "The camera cuts closer.", "She places the same backpack beside her desk."],
    prompt: "Which edit preserves continuity between the shots?",
    answer: "Keep the backpack red in both shots unless the story shows why it changes.",
    wrong: ["Change the backpack to green during the cut with no explanation.", "Remove the backpack from the close shot although Lena never put it down.", "Replace it with a suitcase between frames without showing any change."],
    explanation: "Continuity keeps persistent details consistent so the audience is not distracted by accidental changes.",
    cue: "Track the object from one shot to the next and ask whether anything in the story explains a change.",
    minDifficulty: 4,
  },
  {
    id: "show-action",
    mission: "character",
    title: "Brave Choice",
    brief: "Reveal a character trait through action instead of only naming it.",
    constraint: "The scene should let the audience infer courage from what the character does.",
    backdrop: "forest",
    cast: ["Kojo"],
    beats: ["A younger child is nervous about crossing a small bridge.", "Kojo notices.", "Kojo chooses how to respond."],
    prompt: "Which action best shows Kojo being brave and supportive?",
    answer: "Kojo checks the bridge, crosses first calmly, then guides the younger child across.",
    wrong: ["A caption says “Kojo is brave” while Kojo does nothing.", "Kojo walks away without noticing the younger child.", "Kojo hides the bridge sign and tells everyone to guess what to do."],
    explanation: "Character traits become more convincing when the audience can infer them from meaningful actions.",
    cue: "Look for behaviour that demonstrates the trait instead of merely naming it.",
    minDifficulty: 4,
  },
  {
    id: "parallel-action",
    mission: "transition",
    title: "Two-Part Rescue",
    brief: "Show two actions happening at the same time without confusing the timeline.",
    constraint: "The transition should signal simultaneity.",
    backdrop: "space",
    cast: ["Nova", "Imani"],
    beats: ["Nova repairs the antenna outside.", "Imani checks the signal console inside.", "Both tasks happen during the same communication blackout."],
    prompt: "Which transition best connects the simultaneous actions?",
    answer: "Meanwhile, Imani checks the signal console as Nova repairs the antenna outside.",
    wrong: ["Years later, Imani checks the console during the same minute.", "Before Nova begins, Imani finishes after the repair is complete.", "Finally, the two actions happen at different times but are described as simultaneous."],
    explanation: "“Meanwhile” signals that two actions are taking place during the same period.",
    cue: "Choose the transition that tells the audience the actions overlap in time.",
    minDifficulty: 4,
  },
  {
    id: "ending-payoff",
    mission: "sequence",
    title: "Signal Home",
    brief: "End the scene by paying off the goal introduced at the beginning.",
    constraint: "The final beat should resolve the mission the audience has been following.",
    backdrop: "space",
    cast: ["Nova", "Control"],
    beats: ["The crew needs to send one message home.", "They repair the transmitter.", "The signal is ready."],
    prompt: "Which final beat gives the clearest payoff to the story goal?",
    answer: "The transmitter connects and Control receives the crew’s message.",
    wrong: ["A new unrelated character begins a different story before the message is sent.", "The crew forgets the transmitter and discusses lunch instead.", "The scene cuts to black before showing whether the message can be sent."],
    explanation: "A strong ending connects back to the central goal so the audience can see the outcome of the story’s main effort.",
    cue: "Return to the goal established earlier and choose the beat that shows its outcome.",
    minDifficulty: 5,
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

function safeDifficulty(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.trunc(value))) as 1 | 2 | 3 | 4 | 5;
}

export function createAnimationStoryLabQuestions(difficulty: number, length = 5): StoryLabQuestion[] {
  const level = safeDifficulty(difficulty);
  const count = Math.max(1, Math.min(50, Math.trunc(length)));
  const ceiling = level <= 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : level === 4 ? 4 : 5;
  const pool = STORIES.filter((story) => story.minDifficulty <= ceiling);
  let deck = shuffle(pool);
  const selected: StoryTemplate[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!deck.length) deck = shuffle(pool);
    selected.push(deck.pop()!);
  }

  return selected.map((story, index) => ({
    id: String(index),
    kind: "simulation",
    prompt: story.prompt,
    answer: story.answer,
    options: shuffle([story.answer, ...story.wrong]),
    explanation: story.explanation,
    conceptKey: `animation-story-lab:${story.mission}:${story.id}`,
    scene: {
      boardTitle: "Animation Story Lab",
      storyMission: story.mission,
      sceneTitle: story.title,
      directorBrief: story.brief,
      constraint: story.constraint,
      backdrop: story.backdrop,
      cast: story.cast,
      beatStrip: story.beats,
      storyboardId: `ASL-${String(index + 1).padStart(2, "0")}-${randomInt(100, 999)}`,
      cue: story.cue,
      meterLabels: [story.mission, story.backdrop, `${story.cast.length} cast`],
    },
  }));
}
