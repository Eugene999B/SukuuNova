import type { CSSProperties, ReactNode } from "react";
import { Activity, Atom, BatteryCharging, BookMarked, BookOpen, Bot, CircuitBoard, Compass, Cpu, Crown, Heart, Hourglass, Keyboard, Landmark, Leaf, Lock, MapPin, Orbit, Palette, Receipt, Recycle, Rocket, Scissors, Search, Shield, Shirt, Sparkles, Store, Zap } from "lucide-react";
import { arcadeV5Identity, type ArcadeV5GameKey } from "@/lib/arcade-v5-design";

export type ArcadeLogoGame = ArcadeV5GameKey;
type Props = { game: ArcadeLogoGame; size?: "hero" | "card" | "small" };

export default function ArcadeGameLogo({ game, size = "card" }: Props) {
  const identity = arcadeV5Identity(game);
  const style: CSSProperties = {
    background: `linear-gradient(135deg, ${identity.accent}, ${identity.accent2})`,
    color: identity.canvas,
    boxShadow: `0 14px 34px ${identity.glow}`,
    borderColor: identity.accent2,
  };
  const root = (label: string, children: ReactNode, className = "") => <div className={`arcade-mark arcade-mark-${size} ${className}`} style={style} aria-label={label}>{children}</div>;
  if (game === "keyboard-ninja") return root("TurboType logo", <><span className="arcade-mark-speed" aria-hidden="true"><Zap size={15}/></span><Keyboard className="arcade-mark-main" aria-hidden="true"/><strong>TT</strong></>, "arcade-mark-turbotype");
  if (game === "force-motion-lab") return root("AstroLab Defender logo", <><Orbit className="arcade-mark-orbit" aria-hidden="true"/><Shield className="arcade-mark-main" aria-hidden="true"/><Atom className="arcade-mark-core" aria-hidden="true"/></>, "arcade-mark-astrolab");
  if (game === "word") return root("Word Kingdom logo", <><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={14}/></span><BookOpen className="arcade-mark-main" aria-hidden="true"/><Crown className="arcade-mark-core" aria-hidden="true"/></>, "arcade-mark-word");
  if (game === "comprehension-quest") return root("Reading Quest logo", <><Compass className="arcade-mark-main" aria-hidden="true"/><Search className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><BookOpen size={13}/></span></>, "arcade-mark-reading");
  if (game === "coding-sequence") return root("CodeBots Logic Factory logo", <><Bot className="arcade-mark-main" aria-hidden="true"/><Cpu className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span></>, "arcade-mark-codebots");
  if (game === "ghana-map-master") return root("GeoQuest Ghana Expedition logo", <><Compass className="arcade-mark-main" aria-hidden="true"/><MapPin className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span></>, "arcade-mark-geoquest");
  if (game === "money-math-market") return root("Cedi City Market logo", <><Store className="arcade-mark-main" aria-hidden="true"/><Receipt className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span></>, "arcade-mark-market");
  if (game === "cyber-safety") return root("Signal Shield logo", <><Shield className="arcade-mark-main" aria-hidden="true"/><Lock className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Zap size={13}/></span></>, "arcade-mark-signal");
  if (game === "environment-guardian") return root("EcoGrid Ghana logo", <><Leaf className="arcade-mark-main" aria-hidden="true"/><Recycle className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span></>, "arcade-mark-eco");
  if (game === "body-explorer") return root("BioQuest Human Systems logo", <><Heart className="arcade-mark-main" aria-hidden="true"/><Activity className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={13}/></span></>, "arcade-mark-bio");
  if (game === "history-timeline") return root("Chronicle Vault logo", <><Hourglass className="arcade-mark-main" aria-hidden="true"/><Landmark className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><BookMarked size={13}/></span></>, "arcade-mark-chronicle");
  if (game === "circuit-logic") return root("Circuit Forge logo", <><CircuitBoard className="arcade-mark-main" aria-hidden="true"/><BatteryCharging className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Zap size={13}/></span></>, "arcade-mark-circuit");
  if (game === "culture-heritage") return root("Style Studio Ghana logo", <><Shirt className="arcade-mark-main" aria-hidden="true"/><Palette className="arcade-mark-core" aria-hidden="true"/><span className="arcade-mark-star" aria-hidden="true"><Scissors size={13}/></span></>, "arcade-mark-style");
  return root("Nova Runner logo", <><span className="arcade-mark-star" aria-hidden="true"><Sparkles size={14}/></span><Rocket className="arcade-mark-main" aria-hidden="true"/><span className="arcade-mark-trail" aria-hidden="true"/></>, "arcade-mark-runner");
}