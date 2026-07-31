"use client";

import { useEffect, useState, useMemo } from "react";
import api, { TeacherMaterialFlag } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon, IconName } from "@/components/SvgIcon";
import MaterialHeatmap from "@/components/charts/MaterialHeatmap";

interface FlagCluster {
  id: string;
  label: string;
  flags: TeacherMaterialFlag[];
}

export default function TeacherInsightsPage() {
  const { addToast } = useToast();
  const [flags, setFlags] = useState<TeacherMaterialFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  // Expanded material accordion
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  // Modal state
  const [resolveCluster, setResolveCluster] = useState<FlagCluster | null>(null);
  const [resolveMessage, setResolveMessage] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = () => {
    setLoading(true);
    api.getTeacherMaterialFlags()
      .then(setFlags)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  // Bulk resolve handler
  const handleBulkResolve = async () => {
    if (!resolveCluster) return;
    if (!resolveMessage.trim()) {
      addToast("Please provide an explanation message.", "error");
      return;
    }

    setIsResolving(true);
    const flagIds = resolveCluster.flags.map(f => f.id);
    
    try {
      await api.bulkResolveMaterialFlags(flagIds, resolveMessage);
      
      // Update local state
      setFlags(prev => prev.map(f => 
        flagIds.includes(f.id) ? { ...f, is_resolved: true } : f
      ));
      
      addToast(`Resolved ${flagIds.length} flags and notified students.`, "success");
      setResolveCluster(null);
      setResolveMessage("");
    } catch (err: any) {
      addToast(err.message || "Failed to resolve flags.", "error");
    } finally {
      setIsResolving(false);
    }
  };

  // Helper to get icon by material type
  const getTypeIcon = (type: string): IconName => {
    switch (type) {
      case "video": return "video";
      case "pdf": return "file-text";
      case "image": return "image";
      default: return "book";
    }
  };

  // ─── Group & Cluster Data ───────────────────
  const { materialsMap, resolvedFlags } = useMemo(() => {
    const map = new Map<string, { type: string, flags: TeacherMaterialFlag[] }>();
    const resolved: TeacherMaterialFlag[] = [];

    flags.forEach(f => {
      if (f.is_resolved) {
        resolved.push(f);
        return;
      }
      
      const key = f.material_title;
      if (!map.has(key)) {
        map.set(key, { type: f.material_type, flags: [] });
      }
      map.get(key)!.flags.push(f);
    });

    return { materialsMap: Array.from(map.entries()), resolvedFlags: resolved };
  }, [flags]);

  const clusterFlags = (materialFlags: TeacherMaterialFlag[], type: string): FlagCluster[] => {
    if (type === "pdf") {
      const map: Record<string, TeacherMaterialFlag[]> = {};
      materialFlags.forEach(f => {
        const match = f.context.match(/Page (\d+)/i);
        const page = match ? match[1] : "Unknown";
        const key = `page-${page}`;
        if (!map[key]) map[key] = [];
        map[key].push(f);
      });
      return Object.entries(map)
        .sort((a, b) => {
          if (a[0].includes("Unknown")) return 1;
          if (b[0].includes("Unknown")) return -1;
          return parseInt(a[0].replace('page-','')) - parseInt(b[0].replace('page-',''));
        })
        .map(([id, fs]) => ({ id, label: id.includes("Unknown") ? "Unknown Page" : `Page ${id.replace('page-','')}`, flags: fs }));
    } 
    else if (type === "video") {
      const map: Record<number, TeacherMaterialFlag[]> = {};
      materialFlags.forEach(f => {
        const match = f.context.match(/(?:Timestamp\s*)?(\d+):(\d{2})(?::(\d{2}))?/i);
        if (match) {
          let secs = 0;
          if (match[3]) {
            secs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
          } else {
            secs = parseInt(match[1]) * 60 + parseInt(match[2]);
          }
          const windowIdx = Math.floor(secs / 300); // 5 min windows
          if (!map[windowIdx]) map[windowIdx] = [];
          map[windowIdx].push(f);
        } else {
           if (!map[-1]) map[-1] = [];
           map[-1].push(f);
        }
      });
      return Object.entries(map)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(([idxStr, fs]) => {
          const idx = parseInt(idxStr);
          if (idx === -1) return { id: "unknown", label: "Unknown Timestamp", flags: fs };
          const startMin = idx * 5;
          const endMin = startMin + 5;
          return { id: `time-${idx}`, label: `${startMin}:00 - ${endMin}:00`, flags: fs };
      });
    } 
    else {
      return [{ id: "all", label: "All Flags", flags: materialFlags }];
    }
  };

  // ─── Render ──────────────────────────────────
  if (loading) {
    return <div className="page-loader"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Material Insights</h1>
          <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Analyze clustered confusion hotspots and communicate with struggling students</p>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "#EF4444", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Pending Materials List */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Pending Materials ({materialsMap.length})</h2>
        {resolvedFlags.length > 0 && (
          <button 
            className="btn-secondary btn-sm" 
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? "Hide Resolved" : `Show Resolved (${resolvedFlags.length})`}
          </button>
        )}
      </div>

      {materialsMap.length === 0 ? (
        <div className="card empty-state" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <SvgIcon name="check-circle" style={{ width: 48, height: 48, color: "#10B981", opacity: 0.5 }} />
          <div className="empty-state-title" style={{ marginTop: "1rem" }}>No pending flags!</div>
          <div className="empty-state-desc">Your students seem to understand all the materials perfectly.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
          {materialsMap.map(([title, data]) => {
            const isExpanded = expandedMaterial === title;
            const clusters = clusterFlags(data.flags, data.type);

            return (
              <div key={title} className="card" style={{ padding: 0, overflow: "hidden", border: isExpanded ? "1px solid var(--primary)" : "" }}>
                {/* Accordion Header */}
                <div 
                  onClick={() => setExpandedMaterial(isExpanded ? null : title)}
                  style={{ 
                    padding: "1.25rem", 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    cursor: "pointer",
                    background: isExpanded ? "var(--bg-primary)" : "transparent",
                    transition: "background 0.2s"
                  }}
                  onMouseEnter={(e) => !isExpanded && ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-primary)")}
                  onMouseLeave={(e) => !isExpanded && ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div style={{ 
                      width: 40, height: 40, borderRadius: "var(--radius-sm)", 
                      background: "rgba(99, 102, 241, 0.1)", color: "#6366f1",
                      display: "flex", alignItems: "center", justifyContent: "center" 
                    }}>
                      <SvgIcon name={getTypeIcon(data.type)} size={20} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>{title}</h3>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem", textTransform: "capitalize" }}>
                        {data.type} · {data.flags.length} pending flags
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span className="badge badge-error" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}>
                      {data.flags.length} Flags
                    </span>
                    <SvgIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={18} style={{ color: "var(--text-muted)" }} />
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="animate-fade-in" style={{ padding: "1.25rem", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-primary)" }}>
                    
                    {/* Heatmap Visualization */}
                    <div style={{ marginBottom: "2rem" }}>
                      <MaterialHeatmap materialType={data.type} flags={data.flags} />
                    </div>

                    {/* Clustered Flags */}
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)" }}>
                      Clustered Insights
                    </h3>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {clusters.map(cluster => (
                        <div key={cluster.id} style={{ 
                          background: "var(--bg-body)", 
                          borderRadius: "var(--radius-sm)", 
                          border: "1px solid var(--border-subtle)",
                          overflow: "hidden"
                        }}>
                          {/* Cluster Header */}
                          <div style={{ 
                            padding: "0.75rem 1rem", 
                            background: "rgba(239, 68, 68, 0.05)", 
                            borderBottom: "1px solid var(--border-subtle)",
                            display: "flex", justifyContent: "space-between", alignItems: "center"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <SvgIcon name="target" size={16} style={{ color: "#EF4444" }} />
                              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                {cluster.label}
                              </span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                ({cluster.flags.length} student{cluster.flags.length !== 1 ? 's' : ''})
                              </span>
                            </div>
                            <button 
                              className="btn-primary btn-sm" 
                              onClick={() => setResolveCluster(cluster)}
                              style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
                            >
                              Resolve & Notify
                            </button>
                          </div>

                          {/* Individual Comments */}
                          <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {cluster.flags.map(flag => (
                              <div key={flag.id} style={{ fontSize: "0.85rem" }}>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{flag.student_name}:</span>{" "}
                                <span style={{ color: "var(--text-secondary)" }}>"{flag.comment}"</span>
                                {flag.context && !cluster.label.includes(flag.context) && (
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                    ({flag.context})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolved Flags Section */}
      {showResolved && resolvedFlags.length > 0 && (
        <div className="card animate-fade-in">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-muted)" }}>Resolved Flags</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", opacity: 0.8 }}>
            {resolvedFlags.map(flag => (
              <div key={flag.id} style={{ padding: "1rem", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-body)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div style={{ fontWeight: 500 }}>
                    {flag.material_title} <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: "normal" }}>({flag.context})</span>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: "0.7rem" }}>Resolved</span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <strong>{flag.student_name}:</strong> {flag.comment}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Resolve Modal */}
      {resolveCluster && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, 
          background: "rgba(0,0,0,0.5)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1rem"
        }}>
          <div className="card animate-fade-in" style={{ width: "100%", maxWidth: "500px", padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Resolve & Notify</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              You are resolving <strong>{resolveCluster.flags.length}</strong> flags for <strong>{resolveCluster.label}</strong>. 
              The students will receive your message as a notification.
            </p>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Explanation Message
              </label>
              <textarea 
                className="input"
                rows={4}
                placeholder="E.g., I've added a new note to this lesson explaining this concept in more detail..."
                value={resolveMessage}
                onChange={e => setResolveMessage(e.target.value)}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button 
                className="btn-secondary" 
                onClick={() => { setResolveCluster(null); setResolveMessage(""); }}
                disabled={isResolving}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handleBulkResolve}
                disabled={isResolving || !resolveMessage.trim()}
              >
                {isResolving ? "Resolving..." : "Send & Resolve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
