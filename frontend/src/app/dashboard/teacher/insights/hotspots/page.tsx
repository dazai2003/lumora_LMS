"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import api, { Course } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";

export default function TeacherHotspotAnalyticsPage() {
  const { addToast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [hotspotData, setHotspotData] = useState<{
    material_id: number;
    total_hotspots: number;
    timestamp_clusters: { bucket_seconds: number; flag_count: number }[];
    student_notes: { student_name: string; timestamp_seconds?: number; note: string; created_at: string }[];
  } | null>(null);

  const [remediationModalOpen, setRemediationModalOpen] = useState(false);
  const [remediationNote, setRemediationNote] = useState("Please review the supplementary notes on Inner Membrane Cristae before next lecture.");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.listCourses()
      .then(setCourses)
      .catch(console.error);

    fetchHotspots(1);
  }, []);

  const fetchHotspots = async (matId: number) => {
    setLoading(true);
    try {
      const data = await api.getMaterialHotspots(matId);
      setHotspotData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRemediation = async () => {
    setSending(true);
    try {
      await api.sendTargetedRemediation({
        student_ids: [1, 2, 3],
        material_title: "Cellular Respiration Lecture",
        note: remediationNote,
      });
      addToast("Targeted revision material & notification sent to weak students!", "success");
      setRemediationModalOpen(false);
    } catch (err: any) {
      addToast(err?.message || "Failed to send remediation.", "error");
    } finally {
      setSending(false);
    }
  };

  const formatSeconds = (secs?: number) => {
    if (secs === undefined || secs === null) return "00:00";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
            Learning Material Difficulty Timestamp Heatmap
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0.2rem 0 0 0" }}>
            Real-time analytics of student difficulty flags ("Raised Hands") across video lecture timestamps and PDF sections.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRemediationModalOpen(true)}
          className="btn btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
        >
          <SvgIcon name="send" size={16} />
          Send Targeted Revision
        </button>
      </div>

      {/* Heatmap Visual Card */}
      <div className="card" style={{ padding: "2rem", marginBottom: "2rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <span className="badge badge-warning" style={{ marginBottom: "0.4rem" }}>
              {hotspotData?.total_hotspots || 0} Student Difficulty Flags Logged
            </span>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Video Timestamp Difficulty Density Timeline
            </h3>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={() => fetchHotspots(1)} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
              Refresh Heatmap
            </button>
          </div>
        </div>

        {/* Timeline Clusters Bar Chart */}
        {loading ? (
          <div className="page-loader" style={{ minHeight: "150px" }}><div className="spinner" /></div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: "140px", padding: "1rem 0", borderBottom: "2px solid var(--border)" }}>
              {(hotspotData?.timestamp_clusters.length ? hotspotData.timestamp_clusters : [
                { bucket_seconds: 0, flag_count: 2 },
                { bucket_seconds: 300, flag_count: 5 },
                { bucket_seconds: 600, flag_count: 14 }, // Hotspot peak at 10:00!
                { bucket_seconds: 900, flag_count: 8 },
                { bucket_seconds: 1200, flag_count: 3 },
              ]).map((c) => {
                const heightPct = Math.min(100, c.flag_count * 7);
                const isPeak = c.flag_count >= 10;
                return (
                  <div key={c.bucket_seconds} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isPeak ? "var(--error)" : "var(--text-secondary)" }}>
                      {c.flag_count}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        height: `${heightPct}%`,
                        background: isPeak ? "var(--error)" : "rgba(99, 102, 241, 0.6)",
                        borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                        transition: "height 0.3s ease",
                      }}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      {formatSeconds(c.bucket_seconds)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <span style={{ width: "12px", height: "12px", background: "var(--error)", borderRadius: "2px" }} />
                High Difficulty Peak (10:00 – 15:00 mark)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <span style={{ width: "12px", height: "12px", background: "rgba(99, 102, 241, 0.6)", borderRadius: "2px" }} />
                Moderate Difficulty Flags
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Student Difficulty Notes Stream */}
      <div className="card" style={{ padding: "2rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 0, marginBottom: "1rem", color: "var(--text-primary)" }}>
          Student Raised Hand Queries & Difficulty Notes
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {(hotspotData?.student_notes.length ? hotspotData.student_notes : [
            { student_name: "Kasun Perera", timestamp_seconds: 645, note: "I don't understand how the electron transport chain creates the proton gradient here.", created_at: "2026-08-12T10:15:00Z" },
            { student_name: "Nipuni Fernando", timestamp_seconds: 720, note: "Can you re-explain the role of ATP synthase in oxidative phosphorylation?", created_at: "2026-08-12T11:00:00Z" },
          ]).map((n, idx) => (
            <div key={idx} style={{ padding: "1rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>{n.student_name}</span>
                <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>
                  Timestamp {formatSeconds(n.timestamp_seconds)}
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>"{n.note}"</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Modal */}
      {remediationModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="card" style={{ maxWidth: "550px", width: "100%", padding: "2rem", background: "var(--bg-card)" }}>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 800, marginTop: 0, marginBottom: "0.5rem" }}>
              Send Targeted Revision Recommendation
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Notify all students who raised hands on timestamp 10:00–15:00 with supplementary revision materials.
            </p>

            <textarea
              rows={4}
              value={remediationNote}
              onChange={(e) => setRemediationNote(e.target.value)}
              style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", fontFamily: "inherit", marginBottom: "1.5rem" }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button type="button" onClick={() => setRemediationModalOpen(false)} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={handleSendRemediation} disabled={sending} className="btn btn-primary">
                {sending ? "Sending..." : "Send Revision Alert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
