"use client";

import React, { useState } from "react";
import BarChart from "./BarChart";
import { SvgIcon } from "@/components/SvgIcon";

export interface HeatmapFlag {
  id: number;
  context: string;
  comment: string;
  student_name?: string;
}

interface MaterialHeatmapProps {
  materialType: "video" | "pdf" | "note" | "image" | string;
  flags: HeatmapFlag[];
  onSeekTimestamp?: (seconds: number, formattedTime: string) => void;
  onSelectPage?: (page: number) => void;
}

export default function MaterialHeatmap({
  materialType,
  flags,
  onSeekTimestamp,
  onSelectPage,
}: MaterialHeatmapProps) {
  const [hoveredBucket, setHoveredBucket] = useState<{
    timeLabel: string;
    count: number;
    comments: string[];
    startSec: number;
  } | null>(null);

  const [activePageFilter, setActivePageFilter] = useState<number | null>(null);

  // Helper: Format seconds -> MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // ─── PDF Page Density Radar Grid ──────────────
  const renderPdfHeatmap = () => {
    const pageCounts: Record<number, { count: number; comments: string[] }> = {};
    let maxPage = 0;

    flags.forEach((f) => {
      const match = f.context.match(/Page (\d+)/i);
      if (match) {
        const page = parseInt(match[1], 10);
        if (!pageCounts[page]) pageCounts[page] = { count: 0, comments: [] };
        pageCounts[page].count += 1;
        if (f.comment) pageCounts[page].comments.push(f.comment);
        if (page > maxPage) maxPage = page;
      }
    });

    if (Object.keys(pageCounts).length === 0) {
      return (
        <div className="empty-state" style={{ padding: "1.5rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
          <div className="empty-state-title" style={{ fontSize: "0.85rem" }}>No Page Location Data</div>
          <div className="empty-state-desc">Flags logged without specific page annotations.</div>
        </div>
      );
    }

    const labels = [];
    const data = [];
    for (let i = 1; i <= maxPage; i++) {
      labels.push(`Page ${i}`);
      data.push(pageCounts[i]?.count || 0);
    }

    return (
      <div style={{ padding: "1.25rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <SvgIcon name="file-text" size={16} style={{ color: "#EF4444" }} />
              PDF Page Density Radar & Hotspots
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
              Visual breakdown of page-level confusion flags across document
            </p>
          </div>
          <span className="badge badge-error" style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
            {flags.length} Page Flags
          </span>
        </div>

        {/* Page Tile Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "8px", marginBottom: "1.25rem" }}>
          {Array.from({ length: maxPage }, (_, idx) => {
            const pageNum = idx + 1;
            const pData = pageCounts[pageNum] || { count: 0, comments: [] };
            const isSelected = activePageFilter === pageNum;

            let bgColor = "var(--bg-primary)";
            let borderColor = "var(--border-color)";
            let textColor = "var(--text-secondary)";

            if (pData.count >= 3) {
              bgColor = "rgba(239, 68, 68, 0.15)";
              borderColor = "#EF4444";
              textColor = "#EF4444";
            } else if (pData.count > 0) {
              bgColor = "rgba(245, 158, 11, 0.15)";
              borderColor = "#F59E0B";
              textColor = "#D97706";
            }

            return (
              <div
                key={pageNum}
                onClick={() => {
                  setActivePageFilter(isSelected ? null : pageNum);
                  if (onSelectPage) onSelectPage(pageNum);
                }}
                style={{
                  padding: "0.5rem",
                  borderRadius: "var(--radius-sm)",
                  background: isSelected ? "var(--primary-light)" : bgColor,
                  border: `1px solid ${isSelected ? "var(--primary)" : borderColor}`,
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: isSelected ? "var(--primary)" : textColor }}>
                  Page {pageNum}
                </div>
                <div style={{ fontSize: "0.7rem", color: pData.count > 0 ? textColor : "var(--text-muted)", marginTop: "2px" }}>
                  {pData.count > 0 ? `${pData.count} flags` : "Clear"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar Chart Visualization */}
        <BarChart
          labels={labels}
          datasets={[
            {
              label: "Page Flags",
              data,
              backgroundColor: "rgba(239, 68, 68, 0.75)",
            },
          ]}
          height={160}
        />
      </div>
    );
  };

  // ─── Video Interactive Spectrum & Timeline Heatmap ────────
  const renderVideoHeatmap = () => {
    let maxSeconds = 0;
    const points: { seconds: number; comment: string; student?: string }[] = [];

    flags.forEach((f) => {
      const match = f.context.match(/(?:Timestamp\s*)?(\d+):(\d{2})(?::(\d{2}))?/i);
      if (match) {
        let seconds = 0;
        if (match[3]) {
          seconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
        } else {
          seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
        }
        points.push({ seconds, comment: f.comment, student: f.student_name });
        if (seconds > maxSeconds) maxSeconds = seconds;
      }
    });

    if (points.length === 0) {
      return (
        <div className="empty-state" style={{ padding: "1.5rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
          <div className="empty-state-title" style={{ fontSize: "0.85rem" }}>No Video Timestamps Logged</div>
          <div className="empty-state-desc">Flags logged without specific video timecodes.</div>
        </div>
      );
    }

    const totalSeconds = Math.max(maxSeconds * 1.15, 120);
    const numBuckets = 40; // 40 precision timeline segments
    const bucketSize = totalSeconds / numBuckets;
    const buckets = Array.from({ length: numBuckets }, () => ({
      count: 0,
      comments: [] as string[],
    }));

    let maxBucketCount = 0;
    points.forEach((p) => {
      const idx = Math.min(Math.floor(p.seconds / bucketSize), numBuckets - 1);
      buckets[idx].count += 1;
      if (p.comment) buckets[idx].comments.push(p.comment);
      if (buckets[idx].count > maxBucketCount) maxBucketCount = buckets[idx].count;
    });

    return (
      <div style={{ padding: "1.25rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <SvgIcon name="video" size={16} style={{ color: "#6366F1" }} />
              Video Confusion Spectrum & Hotspot Radar
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
              Click any timeline hotspot bar to jump straight to that timestamp
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", fontSize: "0.7rem", color: "var(--text-muted)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} /> Clear
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} /> Moderate
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} /> Critical Hotspot
            </span>
          </div>
        </div>

        {/* Dynamic Spectrum Bar */}
        <div
          style={{
            display: "flex",
            height: "42px",
            width: "100%",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            gap: "2px",
            background: "var(--bg-body)",
            padding: "3px",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          {buckets.map((b, i) => {
            const startSec = i * bucketSize;
            const endSec = startSec + bucketSize;
            const timeLabel = `${formatTime(startSec)} - ${formatTime(endSec)}`;
            const intensity = maxBucketCount > 0 ? b.count / maxBucketCount : 0;

            let bgColor = "rgba(16, 185, 129, 0.15)";
            if (b.count >= 3) {
              bgColor = "rgba(239, 68, 68, 0.85)";
            } else if (b.count > 0) {
              bgColor = `rgba(245, 158, 11, ${0.4 + intensity * 0.5})`;
            }

            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredBucket({ timeLabel, count: b.count, comments: b.comments, startSec })}
                onMouseLeave={() => setHoveredBucket(null)}
                onClick={() => {
                  if (onSeekTimestamp) onSeekTimestamp(startSec, formatTime(startSec));
                }}
                style={{
                  flex: 1,
                  background: bgColor,
                  borderRadius: "2px",
                  cursor: b.count > 0 ? "pointer" : "default",
                  transition: "transform 0.15s ease, background 0.2s ease",
                  transform: hoveredBucket?.startSec === startSec ? "scaleY(1.15)" : "scaleY(1)",
                }}
              />
            );
          })}
        </div>

        {/* Timeline Axis Labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.725rem", color: "var(--text-muted)", fontWeight: 500 }}>
          <span>0:00</span>
          <span>{formatTime(totalSeconds / 2)}</span>
          <span>{formatTime(totalSeconds)}</span>
        </div>

        {/* Hover Hotspot Card Preview */}
        {hoveredBucket && (
          <div
            style={{
              marginTop: "0.85rem",
              padding: "0.75rem 1rem",
              background: "var(--bg-primary)",
              borderRadius: "var(--radius-sm)",
              borderLeft: `4px solid ${hoveredBucket.count >= 3 ? "#EF4444" : hoveredBucket.count > 0 ? "#F59E0B" : "#10B981"}`,
              fontSize: "0.8rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
              <span>Timestamp: {hoveredBucket.timeLabel}</span>
              <span className={hoveredBucket.count >= 3 ? "badge badge-error" : hoveredBucket.count > 0 ? "badge badge-warning" : "badge"}>
                {hoveredBucket.count} Student Flags
              </span>
            </div>
            {hoveredBucket.comments.length > 0 ? (
              <ul style={{ margin: "4px 0 0 1rem", padding: 0, color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                {hoveredBucket.comments.slice(0, 3).map((c, idx) => (
                  <li key={idx}>"{c}"</li>
                ))}
              </ul>
            ) : (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No specific comment attached</span>
            )}
          </div>
        )}
      </div>
    );
  };

  if (materialType === "video") return renderVideoHeatmap();
  if (materialType === "pdf") return renderPdfHeatmap();

  return null;
}
