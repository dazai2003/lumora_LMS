import React from "react";

export function Skeleton({ className = "", style = {} }: { className?: string, style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function SkeletonText({ lines = 1, width = "100%", style = {} }: { lines?: number, width?: string, style?: React.CSSProperties }) {
  return (
    <div style={{ width, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i} 
          className={`skeleton ${i === lines - 1 && lines > 1 ? "skeleton-text-sm" : "skeleton-text"}`} 
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return <div className="skeleton skeleton-card" />;
}

export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in" style={{ opacity: 0.7 }}>
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <SkeletonText lines={1} width="200px" style={{ height: "1.75rem", marginBottom: "0.5rem" }} />
        <SkeletonText lines={1} width="300px" />
      </div>
      
      <div className="animate-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
        <div style={{ height: "400px" }} className="skeleton skeleton-card" />
        <div style={{ height: "400px" }} className="skeleton skeleton-card" />
      </div>
    </div>
  );
}
