type SupportMode = "guided" | "supported" | "independent" | "challenge";
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** Ambient grid pulse only; engineering time never damages the circuit or reduces rewards. */
export function circuitForgeWindowMs(difficulty:number,speedScale:number,supportMode:SupportMode){const bonus=supportMode==="guided"?5200:supportMode==="supported"?2800:supportMode==="challenge"?-1800:0;return Math.round(clamp((21000-clamp(difficulty,1,5)*1200+bonus)/clamp(speedScale,.65,1.6),8500,26000));}
export function circuitForgeFaultDamage(_pressure:number,_hazardDensity:number,_boss:boolean){return 0;}
export function circuitForgeScanRecovery(pressure:number,hintStrength:0|1|2){return clamp(Math.round(clamp(pressure,0,100)-(15+hintStrength*6)),0,100);}
export function circuitForgeStabilityGain(_pressure:number,difficulty:number){return clamp(4+Math.floor(clamp(difficulty,1,5)/2),4,6);}
export function circuitForgeChargeGain(faultLevel:number,_pressure:number){return clamp(Math.round(clamp(faultLevel,1,5))+1,2,6);}
export function circuitForgeComboGain(_pressure:number){return 1;}
export function circuitForgeFuseRecovery(stability:number){return clamp(Math.round(clamp(stability,0,100)+8),0,100);}
