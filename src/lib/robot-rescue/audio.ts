export class RescueAudio {
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private musicTimer:ReturnType<typeof setInterval>|null=null;
 private voices=new Set<OscillatorNode>();
 private musicVoices=new Set<OscillatorNode>();
 private enabled=true;
 private volume=.35;
 private music=false;
 private chord=0;
 async unlock(){
  try{
   if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.enabled?this.volume:0;this.master.connect(this.context.destination);}
   if(this.context.state==="suspended")await this.context.resume();
   this.startMusic();
   return this.context.state==="running";
  }catch{return false;}
 }
 setEnabled(value:boolean){this.enabled=value;this.applyVolume();}
 setVolume(value:number){this.volume=Math.max(0,Math.min(.7,value));this.applyVolume();}
 private applyVolume(){if(this.context&&this.master)this.master.gain.setTargetAtTime(this.enabled?this.volume:0,this.context.currentTime,.03);}
 setMusic(value:boolean){this.music=value;if(value)this.startMusic();else this.stopMusic();}
 private tone(frequency:number,duration:number,delay=0,volume=.15,endFrequency=frequency,type:OscillatorType="sine",ambient=false){
  const c=this.context;if(!c||!this.master||c.state!=="running"||!this.enabled)return;
  const o=c.createOscillator(),g=c.createGain(),start=c.currentTime+delay;
  o.type=type;o.frequency.setValueAtTime(frequency,start);o.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),start+duration);
  g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(volume,start+Math.min(.025,duration*.1));g.gain.exponentialRampToValueAtTime(.001,start+duration);
  o.connect(g);g.connect(this.master);o.start(start);o.stop(start+duration+.03);this.voices.add(o);if(ambient)this.musicVoices.add(o);
  o.onended=()=>{o.disconnect();g.disconnect();this.voices.delete(o);this.musicVoices.delete(o);};
 }
 cue(name:"launch"|"pickup"|"success"|"retry"|"select"){
  if(name==="launch"){this.tone(110,.45,0,.3,580,"triangle");this.tone(65,.5,0,.2,42);}
  if(name==="pickup"){this.tone(660,.22,0,.12);this.tone(990,.3,.1,.1);}
  if(name==="success"){[392,494,587,784].forEach((f,i)=>this.tone(f,.65,i*.12,.17));}
  if(name==="retry"){this.tone(220,.25,0,.11,165);this.tone(165,.3,.15,.07);}
  if(name==="select")this.tone(440,.08,0,.08,550);
 }
 private startMusic(){
  if(!this.music||this.musicTimer||this.context?.state!=="running")return;
  const play=()=>{const chords=[[130.81,196,261.63],[110,164.81,220],[146.83,220,293.66],[98,146.83,196]];chords[this.chord++%chords.length].forEach((f,i)=>this.tone(f,7,i*.12,.035,f,"sine",true));};
  play();this.musicTimer=setInterval(play,7500);
 }
 private stopMusic(){if(this.musicTimer)clearInterval(this.musicTimer);this.musicTimer=null;for(const o of this.musicVoices){try{o.stop();}catch{}}this.musicVoices.clear();}
 pause(){this.stopMusic();void this.context?.suspend().catch(()=>{});}
 destroy(){this.stopMusic();for(const o of this.voices){try{o.stop();}catch{}}this.voices.clear();void this.context?.close().catch(()=>{});this.context=null;this.master=null;}
}
