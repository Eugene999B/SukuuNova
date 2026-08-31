import { Skeleton, SkeletonCard, SkeletonText } from "./Skeleton";
import styles from "./WorkspaceSkeleton.module.css";

export function WorkspaceSkeleton({ cards = 4, rows = 6 }: { cards?: number; rows?: number }) {
  return (
    <main className={styles.shell} aria-label="Loading SukuuNova workspace">
      <section className={styles.header}>
        <Skeleton width="90px" height="9px" />
        <Skeleton width="240px" height="30px" />
        <Skeleton width="440px" height="12px" />
      </section>
      <section className={styles.metrics}>
        {Array.from({ length: cards }).map((_, index) => <SkeletonCard key={index} lines={2} />)}
      </section>
      <section className={styles.content}>
        <div className={styles.panel}>
          <Skeleton width="190px" height="20px" />
          <SkeletonText lines={2} />
          <div className={styles.rows}>
            {Array.from({ length: rows }).map((_, index) => (
              <div className={styles.row} key={index}>
                <Skeleton width="34%" height="12px" />
                <Skeleton width="22%" height="12px" />
                <Skeleton width="13%" height="12px" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
