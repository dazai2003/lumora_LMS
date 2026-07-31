"use client";

import React, { useMemo } from "react";
import BarChart from "./BarChart";
import { SvgIcon } from "@/components/SvgIcon";

export interface HeatmapFlag {
  id: number;
  context: string;
  comment: string;
}

interface MaterialHeatmapProps {
  materialType: "video" | "pdf" | "note" | "image" | string;
  flags: HeatmapFlag[];
}

export default function MaterialHeatmap({ materialType, flags }: MaterialHeatmapProps) {
  // ─── PDF Heatmap (Bar Chart) ────────────────
  const renderPdfHeatmap = () => {
    // Extract page numbers
    const pageCounts: Record<number, number> = {};
    let maxPage = 0;

    flags.forEach((f) => {
      const match = f.context.match(/Page (\d+)/i);
      if (match) {
        const page = parseInt(match[1], 10);
        pageCounts[page] = (pageCounts[page] || 0) + 1;
        if (page > maxPage) maxPage = page;
      }
    });

    if (Object.keys(pageCounts).length === 0) {
      return (
        <div className="empty-state" style={{ padding: "2rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
          <div className="empty-state-title" style={{ fontSize: "0.9rem" }}>No Page Data</div>
          <div className="empty-state-desc">Could not parse page numbers from flag contexts.</div>
        </div>
      );
    }

    const labels = [];
    const data = [];
    for (let i = 1; i <= maxPage; i++) {
      labels.push(`Page ${i}`);
      data.push(pageCounts[i] || 0);
    }

    return (
      <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
        <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-secondary)" }}>Confusion by Page</h3>
        <BarChart
          labels={labels}
          datasets={[
            {
              label: "Flags",
              data,
              backgroundColor: "rgba(239, 68, 68, 0.7)",
            },
          ]}
          height={200}
        />
      </div>
    );
  };

  // ─── Video Heatmap (Timeline) ───────────────
  const renderVideoHeatmap = () => {
    // Extract timestamps (MM:SS or HH:MM:SS)
    let maxSeconds = 0;
    const points: { seconds: number; count: number }[] = [];

    flags.forEach((f) => {
      // Matches "01:23" or "1:23:45"
      const match = f.context.match(/(?:Timestamp\s*)?(\d+):(\d{2})(?::(\d{2}))?/i);
      if (match) {
        let seconds = 0;
        if (match[3]) {
          // HH:MM:SS
          seconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
        } else {
          // MM:SS
          seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
        }
        points.push({ seconds, count: 1 });
        if (seconds > maxSeconds) maxSeconds = seconds;
      }
    });

    if (points.length === 0) {
      return (
        <div className="empty-state" style={{ padding: "2rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
          <div className="empty-state-title" style={{ fontSize: "0.9rem" }}>No Timestamp Data</div>
          <div className="empty-state-desc">Could not parse timestamps from flag contexts.</div>
        </div>
      );
    }

    // Estimate total video length by adding a 10% buffer to the max timestamp (since we don't have true length)
    const totalSeconds = Math.max(maxSeconds * 1.1, 60);

    // Group into 5% buckets for visualization
    const numBuckets = 20;
    const bucketSize = totalSeconds / numBuckets;
    const buckets = new Array(numBuckets).fill(0);
    
    let maxBucketCount = 0;
    points.forEach((p) => {
      const idx = Math.min(Math.floor(p.seconds / bucketSize), numBuckets - 1);
      buckets[idx]++;
      if (buckets[idx] > maxBucketCount) maxBucketCount = buckets[idx];
    });

    return (
      <div style={{ padding: "1rem 1.25rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>Confusion Hotspots (Timeline)</h3>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <SvgIcon name="info" size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
            Relative distribution
          </span>
        </div>
        
        {/* Heatmap Bar */}
        <div style={{ display: "flex", height: "32px", width: "100%", borderRadius: "4px", overflow: "hidden", gap: "1px", background: "var(--bg-body)" }}>
          {buckets.map((count, i) => {
            // Color intensity based on count relative to max Bucket count
            const intensity = maxBucketCount > 0 ? count / maxBucketCount : 0;
            let bgColor = "var(--bg-primary)";
            if (intensity > 0) {
              // Fade from a soft yellow/orange to bright red
              const r = 239;
              const g = Math.floor(68 + (1 - intensity) * 120); // 68 to ~188
              const b = 68;
              bgColor = `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.7})`;
            }

            return (
              <div 
                key={i} 
                style={{ flex: 1, background: bgColor, transition: "background 0.3s" }} 
                title={count > 0 ? `${count} flags in this segment` : ""}
              />
            );
          })}
        </div>
        
        {/* Simple axis */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>0:00</span>
          <span>End</span>
        </div>
      </div>
    );
  };

  // ─── Render based on type ───────────────────
  if (materialType === "video") return renderVideoHeatmap();
  if (materialType === "pdf") return renderPdfHeatmap();
  
  return null; // Don't render for notes/images
}
