import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import styles from "./launch-bar.module.css";

export function LearnLaunchBar() {
  return (
    <Link href="/learn/practice" className={styles.launchBar}>
      <span className={styles.icon}><ShieldCheck size={18} /></span>
      <span className={styles.copy}><small>NEW PRACTICE ENGINE</small><strong>Build a no-repeat, exposure-aware session</strong></span>
      <ArrowRight size={18} />
    </Link>
  );
}
