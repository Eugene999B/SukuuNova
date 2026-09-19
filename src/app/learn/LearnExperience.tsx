import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Medal, Sparkles, Compass, CalendarDays, BarChart3 } from "lucide-react";
import styles from "./hub.module.css";

const paths = [
  { title:"School", detail:"KG · Primary · JHS practice · SHS mapped", copy:"Pick your class and SukuuNova will clearly separate practice-ready topics from coverage still being built.", lane:"school", icon:BookOpen, tone:"violet" },
  { title:"Exam preparation", detail:"BECE topic practice · WASSCE & IELTS mapped", copy:"Practise only where reviewed coverage exists. Full mocks stay unavailable until exam-specific structure and marking are validated.", lane:"exam", icon:Medal, tone:"blue" },
  { title:"University", detail:"Discipline · Course · Topic maps", copy:"Explore mapped university routes. Reviewed course-level question packs are still expanding and are not presented as complete.", lane:"university", icon:GraduationCap, tone:"orange" },
  { title:"Skills & careers", detail:"Digital skills · Business · Aptitude", copy:"Make room for a new skill with a short, focused practice session.", lane:"skills", icon:Compass, tone:"green" },
];
export function LearnExperience(){
 return <main className={styles.hub}>
  <section className={styles.hero}>
   <div><span className={styles.eyebrow}><Sparkles size={16}/> A little practice. A clearer mind.</span>
    <h1>Your next<br/><em>“I get it”</em><br/>starts here.</h1>
    <p>From your first numbers to your next big exam. Choose what you want to learn, answer at your pace, and understand the why.</p>
    <div className={styles.actions}><Link className={styles.primary} href="/learn/explore">Start practice <ArrowRight size={18}/></Link><Link href="/learn/today">Try today’s challenge <ArrowRight size={16}/></Link></div>
    <div className={styles.trust}><span>No sign-in needed</span><span>Explanations included</span><span>Your pace</span></div>
   </div>
   <div className={styles.preview} aria-label="Your learning journey">
    <div className={styles.previewHead}><span className={styles.spark}>✦</span><span>SMALL STEPS. REAL UNDERSTANDING.</span></div>
    <div className={styles.route}><span>01</span><div><small>FIND YOUR START</small><strong>A class, course or exam</strong></div><BookOpen size={21}/></div>
    <div className={styles.route}><span>02</span><div><small>MAKE IT YOURS</small><strong>One topic or a mixed set</strong></div><Compass size={21}/></div>
    <div className={styles.route}><span>03</span><div><small>BUILD YOUR CONFIDENCE</small><strong>Answer. Understand. Try again.</strong></div><Sparkles size={21}/></div>
    <div className={styles.previewFooter}><span>5 minutes is a good start.</span><span>Let’s learn ↗</span></div>
   </div>
  </section>
  <section className={styles.discover} aria-labelledby="learn-paths"><div className={styles.sectionHead}><div><span className={styles.eyebrow}>YOUR LEARNING, YOUR WAY</span><h2 id="learn-paths">Where would you like to begin?</h2></div><p>Choose a path. You can change it any time.</p></div>
   <div className={styles.cards}>{paths.map(({title,detail,copy,lane,icon:Icon,tone})=><Link key={lane} href={"/learn/explore?lane="+lane} className={styles.card} data-tone={tone}><span className={styles.cardIcon}><Icon size={25}/></span><small>{detail}</small><h3>{title}</h3><p>{copy}</p><span className={styles.cardLink}>Explore subjects <ArrowRight size={17}/></span></Link>)}</div>
  </section>
  <section className={styles.continue}><div><CalendarDays size={24}/><h3>Build a small daily habit</h3><p>A short challenge helps you return, even on a busy day.</p><Link href="/learn/today">Today’s challenge <ArrowRight size={16}/></Link></div><div><BarChart3 size={24}/><h3>See what is getting stronger</h3><p>Your answers build a topic-by-topic picture of your progress on this browser.</p><Link href="/learn/progress">See my progress <ArrowRight size={16}/></Link></div></section>
  <footer className={styles.footer}><p>Practice availability varies by subject and topic. Paths without published questions are marked “Coming soon”. Exam practice is independent preparation, not an official exam or score prediction.</p><Link href="/for-schools">Looking for school management? <ArrowRight size={15}/></Link></footer>
 </main>;
}
