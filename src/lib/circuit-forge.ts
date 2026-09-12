type SupportMode = "guided" | "supported" | "independent" | "challenge";
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function circuitForgeWindowMs(difficulty:number,speedScale:number,supportMode:SupportMode){const bonus=supportMode==="guided"?5200:supportMode==="supported"?2800:supportMode==="challenge"?-1800:0;return Math.round(clamp((21000-clamp(difficulty,1,5)*1200+bonus)/clamp(speedScale,.65,1.6),8500,26000));}
export function circuitForgeFaultDamage(pressure:number,hazardDensity:number,boss:boolean){if(pressure<58)return 0;return clamp(2+Math.floor((clamp(pressure,0,100)-58)/14)+Math.round(clamp(hazardDensity,0,2)*2)+(boss?2:0),2,11);}
export function circuitForgeScanRecovery(pressure:number,hintStrength:0|1|2){return clamp(Math.round(clamp(pressure,0,100)-(15+hintStrength*6)),0,100);}
export function circuitForgeStabilityGain(pressure:number,difficulty:number){return clamp((pressure<=34?6:pressure<=68?4:2)+Math.floor(clamp(difficulty,1,5)/2),2,9);}
export function circuitForgeChargeGain(faultLevel:number,pressure:number){return clamp(Math.round(clamp(faultLevel,1,5))+(pressure<=42?2:pressure<=72?1:0),1,7);}
export function circuitForgeComboGain(pressure:number){return pressure<=38?2:pressure<=72?1:0;}
export function circuitForgeFuseRecovery(stability:number){return clamp(Math.round(clamp(stability,0,100)+8),0,100);}
