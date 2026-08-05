import React from "react";

// ─── Skeleton Primitive ───────────────────────
// A shimmer loading placeholder that strictly matches component geometry.

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
        ...style,
      }}
    />
  );
}

// ─── Basic Prebuilt Composites ────────────────

/** A stat card skeleton for metric widgets */
export function SkeletonStatCard() {
  return (
    <div
      className="card"
      style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <Skeleton width="45%" height="0.85rem" />
      <Skeleton width="65%" height="2rem" />
      <Skeleton width="35%" height="0.75rem" />
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

// ─── Teacher Page Wireframe Composites ────────

/** Wireframe skeleton for Teacher Main Dashboard (/dashboard/teacher) */
export function SkeletonDashboardOverview() {
  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Skeleton width="220px" height="1.75rem" style={{ marginBottom: "6px" }} />
          <Skeleton width="340px" height="0.9rem" />
        </div>
        <Skeleton width="140px" height="2.25rem" borderRadius="var(--radius-md)" />
      </div>

      {/* 4 Stat Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Charts Split Row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Skeleton width="40%" height="1.2rem" />
          <Skeleton width="100%" height="260px" borderRadius="var(--radius-md)" />
        </div>
        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Skeleton width="50%" height="1.2rem" />
          <Skeleton width="100%" height="50px" borderRadius="var(--radius-sm)" />
          <Skeleton width="100%" height="50px" borderRadius="var(--radius-sm)" />
          <Skeleton width="100%" height="50px" borderRadius="var(--radius-sm)" />
        </div>
      </div>
    </div>
  );
}

/** Wireframe skeleton for Material Stats & Hotspot Radar (/dashboard/teacher/insights) */
export function SkeletonMaterialHub() {
  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div>
        <Skeleton width="300px" height="1.75rem" style={{ marginBottom: "6px" }} />
        <Skeleton width="450px" height="0.9rem" />
      </div>

      {/* 4 Overview Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Directory Filter Bar */}
      <div className="card" style={{ padding: "1.25rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Skeleton width="180px" height="2.25rem" />
        <Skeleton width="180px" height="2.25rem" />
        <Skeleton width="180px" height="2.25rem" />
      </div>

      {/* Material Workspace Card */}
      <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Skeleton width="30%" height="1.25rem" />
          <Skeleton width="100px" height="1.5rem" borderRadius="12px" />
        </div>
        <Skeleton width="100%" height="80px" borderRadius="var(--radius-md)" />
        <Skeleton width="100%" height="180px" borderRadius="var(--radius-md)" />
      </div>
    </div>
  );
}

/** Wireframe skeleton for Grading Queue (/dashboard/teacher/grading) */
export function SkeletonGradingQueue() {
  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <Skeleton width="220px" height="1.75rem" style={{ marginBottom: "6px" }} />
        <Skeleton width="380px" height="0.9rem" />
      </div>

      {/* 3 Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Status Category Tabs */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Skeleton width="140px" height="2rem" borderRadius="20px" />
        <Skeleton width="180px" height="2rem" borderRadius="20px" />
        <Skeleton width="130px" height="2rem" borderRadius="20px" />
      </div>

      {/* Table Wireframe Card */}
      <div className="card" style={{ padding: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <SkeletonTableRow columns={5} />
            <SkeletonTableRow columns={5} />
            <SkeletonTableRow columns={5} />
            <SkeletonTableRow columns={5} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Wireframe skeleton for Q&A Moderation (/dashboard/teacher/qa) */
export function SkeletonQAModeration() {
  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <Skeleton width="240px" height="1.75rem" style={{ marginBottom: "6px" }} />
        <Skeleton width="320px" height="0.9rem" />
      </div>

      {/* 4 Stat Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Search Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <Skeleton width="340px" height="2.25rem" />
        <Skeleton width="200px" height="2.25rem" />
      </div>

      {/* Question Cards List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton width="60%" height="1.1rem" />
          <Skeleton width="100%" height="0.85rem" />
          <Skeleton width="40%" height="0.8rem" />
        </div>
        <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton width="50%" height="1.1rem" />
          <Skeleton width="90%" height="0.85rem" />
          <Skeleton width="35%" height="0.8rem" />
        </div>
      </div>
    </div>
  );
}
