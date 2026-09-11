import { Atom, BookOpen, Compass, Crown, Keyboard, Orbit, Rocket, Search, Shield, Sparkles, Zap } from "lucide-react";

export type ArcadeLogoGame = "math" | "keyboard-ninja" | "force-motion-lab" | "word" | "comprehension-quest";
type Props = { game: ArcadeLogoGame; size?: "hero" | "card" | "small" };

export default function ArcadeGameLogo({ game, size = "card" }: Props) {
  if (game === "keyboard-ninja") return <div className={`arcade-mark arcade-mark-${size} arcade-mark-turbotype`} aria-label="TurboType logo"><span className="arcade-mark-speed" aria-hidden="true"><Zap size={15}/></span><Keyboard className="arcade-mark-main" aria-hidden="true"/><strong>TT</strong></div>;
  if (game === "force-motion-lab") return <div className={`arcade-mark arcade-mark-${size} arcade-mark-astrolab`} aria-label="AstroLab Defender logo"><Orbit className="arcade-mark-orbit" aria-hidden="true"/><Shield className="arcade-mark-main" aria-hidden="true"/><Atom className="arcade-mark-core" aria-hidden="true"/></div>;
  if (game === "word") return <div className={`arcade-mark arcade-mark-${size} arcade-mark-word`} aria-label="Word Kingdom logo"><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={14}/></span><BookOpen className="arcade-mark-main" aria-hidden="true"/><Crown className="arcade-mark-core" aria-hidden="true"/></div>;
  if (game === "comprehension-quest") return <div className={`arcade-mark arcade-mark-${size} arcade-mark-word`} aria-label="Reading Quest logo"><Compass className="arcade-mark-main" aria-hidden="true"/><Search className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><BookOpen size={13}/></span></div>;
  return <div className={`arcade-mark arcade-mark-${size} arcade-mark-runner`} aria-label="Nova Runner logo"><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={14}/></span><Rocket className="arcade-mark-main" aria-hidden="true"/><span className="arcade-mark-trail" aria-hidden="true"/></div>;
}
