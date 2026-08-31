import type { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  width?: string | number;
  height?: string | number;
};

export function Skeleton({ width = "100%", height = 16, className = "", style, ...props }: SkeletonProps) {
  return <span aria-hidden="true" className={`sn-skeleton ${className}`.trim()} style={{ width, height, ...style }} {...props} />;
}

export function SkeletonText({ lines = 3, lastWidth = "70%" }: { lines?: number; lastWidth?: string }) {
  return (
    <div className="sn-skeleton-stack" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} height={12} width={index === lines - 1 ? lastWidth : "100%"} />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="sn-skeleton-card" aria-hidden="true">
      <Skeleton width={44} height={44} className="sn-skeleton-round" />
      <div className="sn-skeleton-stack sn-skeleton-card-copy">
        <Skeleton height={14} width="48%" />
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}
