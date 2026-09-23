import type {TopicMasteryRecord} from "./learner-progress";
export function learningPathKey(lane:string,program:string,level:string){return [lane,program,level].join("/");}
export function scopedMasteryKey(path:string,subject:string,topic:string){return "["+path+"] "+subject+" · "+topic;}
export function masteryForPath(mastery:Record<string,TopicMasteryRecord>,path:string){const prefix="["+path+"] ";return Object.fromEntries(Object.entries(mastery).filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key.slice(prefix.length),value]));}
