import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, Compass, Medal, Puzzle } from "lucide-react";
import styles from "./launch-bar.module.css";

export function LearnLaunchBar() {
  return (
    <aside className={styles.launchDock} aria-label="SukuuNova Learn shortcuts">
      <Link href="/learn/practice" className={styles.primaryAction}>
        <span className={styles.icon}><Compass size={18} /></span>
        <span className={styles.copy}><small>HARDENED PRACTICE</small><strong>Start an intelligent session</strong></span>
        <ArrowRight size={18} />
      </Link>
      <Link href="/learn/today" className={styles.secondaryAction}>
        <span className={styles.secondaryIcon}><CalendarDays size={17} /></span>
        <span className={styles.copy}><small>TODAY&apos;S 10</small><strong>Take today&apos;s free ten-question challenge</strong></span>
        <ArrowRight size={18} />
      </Link>
      <Link href="/learn/progress" className={styles.secondaryAction}>
        <span className={styles.secondaryIcon}><BarChart3 size={17} /></span>
        <span className={styles.copy}><small>PROGRESS & MASTERY</small><strong>See evidence, weak areas and what to practise next</strong></span>
        <ArrowRight size={18} />
      </Link>
      <Link href="/learn/exams" className={styles.secondaryAction}>
        <span className={styles.secondaryIcon}><Medal size={17} /></span>
        <span className={styles.copy}><small>2026 EXAM CENTRE</small><strong>Open versioned BECE & WASSCE blueprints</strong></span>
        <ArrowRight size={18} />
      </Link>
      <Link href="/learn/interactions" className={styles.secondaryAction}>
        <span className={styles.secondaryIcon}><Puzzle size={17} /></span>
        <span className={styles.copy}><small>INTERACTION LAB</small><strong>Practice matching and ordering</strong></span>
        <ArrowRight size={18} />
      </Link>
    </aside>
  );
}
