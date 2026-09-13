import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./games-lab.module.css";

export const metadata: Metadata = {
  title: "Games Lab | Sukuunova",
  robots: { index: false, follow: false },
};

const PLAYABLES = [
  {
    href: "/labs/game-feel",
    title: "Movement Lab",
    category: "Core feel",
    summary: "Tune platforming and runner response on the shared fixed-step runtime.",
    mechanics: ["Coyote time", "Jump buffer", "Lane retargeting", "Collision forgiveness"],
  },
  {
    href: "/labs/nova-run",
    title: "Nova Run",
    category: "Runner",
    summary: "Generated routes, jump/slide gates, recoverable hits, pickups and uninterrupted score flow.",
    mechanics: ["Reflex movement", "Route reading", "Combo", "Procedural chunks"],
  },
  {
    href: "/labs/field-expedition",
    title: "Field Expedition",
    category: "Open-world exploration",
    summary: "Free movement through a connected field district with contextual tools and world interactions.",
    mechanics: ["Exploration", "Tool use", "Field evidence", "Contextual targets"],
  },
  {
    href: "/labs/failure-point",
    title: "Engineer: Failure Point",
    category: "Construction simulation",
    summary: "A real truss solver turns force, stress, deformation and failure into the learning surface.",
    mechanics: ["Build", "Load", "Simulate", "Inspect forces"],
  },
  {
    href: "/labs/the-archive",
    title: "The Archive",
    category: "Branching investigation",
    summary: "Collect conflicting sources in any order, build an interpretation, reach multiple endings and resume later.",
    mechanics: ["Evidence", "Source criticism", "Branching story", "Checkpoint resume"],
  },
] as const;

export default function GamesLabPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Sukuunova Games V2 · development only</p>
          <h1>Games Lab</h1>
          <p>
            Five playable slices deliberately exercise different game DNA. Use this page to compare whether movement, pacing, interaction and learning actually feel different—not whether the cards have different school-subject labels.
          </p>
        </header>

        <section className={styles.grid} aria-label="Playable game prototypes">
          {PLAYABLES.map((game, index) => (
            <Link href={game.href} className={styles.card} key={game.href}>
              <div className={styles.cardTop}>
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.category}>{game.category}</span>
              </div>
              <h2>{game.title}</h2>
              <p>{game.summary}</p>
              <div className={styles.tags}>
                {game.mechanics.map((mechanic) => <span key={mechanic}>{mechanic}</span>)}
              </div>
              <strong className={styles.launch}>Open prototype →</strong>
            </Link>
          ))}
        </section>

        <aside className={styles.note}>
          <strong>Prototype boundary:</strong> these routes intentionally return 404 in production. They are for hands-on game-feel testing before any replacement of the existing student arcade.
        </aside>
      </div>
    </main>
  );
}
