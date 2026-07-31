import React from "react";

// ─── Skeleton Primitive ───────────────────────
// A shimmer loading placeholder that matches the container's shape.

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  borderRadius = "var(--radius-sm, 8px)",
  style,
  className,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${className || ""}`}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// ─── Prebuilt Skeleton Composites ─────────────

/** A stat card skeleton for dashboard metric widgets */
export function SkeletonStatCard() {
  return (
    <div
      className="card"
      style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <Skeleton width="40%" height="0.8rem" />
      <Skeleton width="60%" height="2rem" />
      <Skeleton width="30%" height="0.7rem" />
    </div>
  );
}

/** A table row skeleton for data tables */
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} style={{ padding: "1rem" }}>
          <Skeleton width={i === 0 ? "70%" : "50%"} height="0.9rem" />
        </td>
      ))}
    </tr>
  );
}

/** A content card skeleton for course/lesson cards */
export function SkeletonContentCard() {
  return (
    <div
      className="card"
      style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}
    >
      <Skeleton width="75%" height="1.1rem" />
      <Skeleton width="100%" height="0.8rem" />
      <Skeleton width="90%" height="0.8rem" />
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <Skeleton width="80px" height="1.5rem" borderRadius="12px" />
        <Skeleton width="60px" height="1.5rem" borderRadius="12px" />
      </div>
    </div>
  );
}
