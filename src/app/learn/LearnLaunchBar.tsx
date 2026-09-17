import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import styles from "./launch-bar.module.css";

export function LearnLaunchBar() {
  return (
    <Link href="/learn/explore" className={styles.launchBar}>
      <span className={styles.icon}><Compass size={18} /></span>
      <span className={styles.copy}><small>NEW LEARNING EXPLORER</small><strong>Choose curriculum, level, subject and topic</strong></span>
      <ArrowRight size={18} />
    </Link>
  );
}
