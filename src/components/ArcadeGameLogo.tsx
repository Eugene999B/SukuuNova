import { Activity, Atom, BookOpen, Bot, Compass, Cpu, Crown, Heart, Keyboard, Leaf, Lock, MapPin, Orbit, Receipt, Recycle, Rocket, Search, Shield, Sparkles, Store, Zap } from "lucide-react";

export type ArcadeLogoGame = "math" | "keyboard-ninja" | "force-motion-lab" | "word" | "comprehension-quest" | "coding-sequence" | "ghana-map-master" | "money-math-market" | "cyber-safety" | "environment-guardian" | "body-explorer";

type Props = {
  game: ArcadeLogoGame;
  size?: "hero" | "card" | "small";
};

export default function ArcadeGameLogo({ game, size = "card" }: Props) {
  if (game === "keyboard-ninja") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-turbotype`} aria-label="TurboType logo">
      <span className="arcade-mark-speed" aria-hidden="true"><Zap size={15}/></span>
      <Keyboard className="arcade-mark-main" aria-hidden="true"/>
      <strong>TT</strong>
    </div>;
  }
  if (game === "force-motion-lab") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-astrolab`} aria-label="AstroLab Defender logo">
      <Orbit className="arcade-mark-orbit" aria-hidden="true"/>
      <Shield className="arcade-mark-main" aria-hidden="true"/>
      <Atom className="arcade-mark-core" aria-hidden="true"/>
    </div>;
  }
  if (game === "word") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-word`} aria-label="Word Kingdom logo">
      <span className="arcade-mark-star" aria-hidden="true"><Sparkles size={14}/></span>
      <BookOpen className="arcade-mark-main" aria-hidden="true"/>
      <Crown className="arcade-mark-core" aria-hidden="true"/>
    </div>;
  }
  if (game === "comprehension-quest") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-word`} aria-label="Reading Quest logo">
      <Compass className="arcade-mark-main" aria-hidden="true"/>
      <Search className="arcade-mark-core" aria-hidden="true"/>
      <span className="arcade-mark-star" aria-hidden="true"><BookOpen size={13}/></span>
    </div>;
  }
  if (game === "coding-sequence") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-codebots`} aria-label="CodeBots Logic Factory logo">
      <Bot className="arcade-mark-main" aria-hidden="true"/>
      <Cpu className="arcade-mark-core" aria-hidden="true"/>
      <span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span>
    </div>;
  }
  if (game === "ghana-map-master") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-geoquest`} aria-label="GeoQuest Ghana Expedition logo">
      <Compass className="arcade-mark-main" aria-hidden="true"/>
      <MapPin className="arcade-mark-core" aria-hidden="true"/>
      <span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span>
    </div>;
  }
  if (game === "money-math-market") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-market`} aria-label="Cedi City Market logo">
      <Store className="arcade-mark-main" aria-hidden="true"/>
      <Receipt className="arcade-mark-core" aria-hidden="true"/>
      <span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span>
    </div>;
  }
  if (game === "cyber-safety") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-signal`} aria-label="Signal Shield logo">
      <Shield className="arcade-mark-main" aria-hidden="true"/>
      <Lock className="arcade-mark-core" aria-hidden="true"/>
      <span className="arcade-mark-star" aria-hidden="true"><Zap size={13}/></span>
    </div>;
  }
  if (game === "environment-guardian") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-eco`} aria-label="EcoGrid Ghana logo">
      <Leaf className="arcade-mark-main" aria-hidden="true"/>
      <Recycle className="arcade-mark-core" aria-hidden="true"/>
      <span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span>
    </div>;
  }
  if (game === "body-explorer") {
    return <div className={`arcade-mark arcade-mark-${size} arcade-mark-bio`} aria-label="BioQuest Human Systems logo">
      <Heart className="arcade-mark-main" aria-hidden="true"/>
      <Activity className="arcade-mark-core" aria-hidden="true"/>
      <span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span>
    </div>;
  }
  return <div className={`arcade-mark arcade-mark-${size} arcade-mark-runner`} aria-label="Nova Runner logo">
    <span className="arcade-mark-star" aria-hidden="true"><Sparkles size={14}/></span>
    <Rocket className="arcade-mark-main" aria-hidden="true"/>
    <span className="arcade-mark-trail" aria-hidden="true"/>
  </div>;
}