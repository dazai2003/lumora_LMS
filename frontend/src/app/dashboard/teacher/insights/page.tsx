"use client";

import { useEffect, useState, useMemo } from "react";
import api, { TeacherMaterialFlag, Course, Lesson, Material } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon, IconName } from "@/components/SvgIcon";
import MaterialHeatmap from "@/components/charts/MaterialHeatmap";
import { SkeletonMaterialHub } from "@/components/ui/Skeleton";

interface FlagCluster {
  id: string;
  label: string;
  flags: TeacherMaterialFlag[];
}

export default function TeacherInsightsPage() {
  const { addToast } = useToast();
  const [flags, setFlags] = useState<TeacherMaterialFlag[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Directory Selection Controls
  const [selectedCourseId, setSelectedCourseId] = useState<number | "all">("all");
  const [selectedLessonId, setSelectedLessonId] = useState<number | "all">("all");
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | "all">("all");
  const [filterType, setFilterType] = useState<"all" | "active" | "video" | "pdf">("all");

  // AI Hotspot Summaries cache by material title
  const [aiSummaries, setAiSummaries] = useState<Record<string, { summary: string; recommended_action: string }>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});

  // Modal state
  const [resolveCluster, setResolveCluster] = useState<FlagCluster | null>(null);
  const [resolveMessage, setResolveMessage] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedFlags, fetchedCourses] = await Promise.all([
        api.getTeacherMaterialFlags(),
        api.listCourses(),
      ]);
      setFlags(fetchedFlags || []);
      setCourses(fetchedCourses || []);
    } catch (err: any) {
      setError(err.message || "Failed to load material insights.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch lessons when course changes
  useEffect(() => {
    if (selectedCourseId !== "all") {
      api.listLessons(selectedCourseId).then(setLessons).catch(console.error);
    } else {
      setLessons([]);
      setSelectedLessonId("all");
    }
  }, [selectedCourseId]);

  // Fetch materials when lesson changes
  useEffect(() => {
    if (selectedLessonId !== "all") {
      api.listMaterials(selectedLessonId).then(setMaterials).catch(console.error);
    } else {
      setMaterials([]);
      setSelectedMaterialId("all");
    }
  }, [selectedLessonId]);

  // Fetch AI Hotspot Summary for a material
  const fetchAiSummary = (title: string, type: string, materialFlags: TeacherMaterialFlag[]) => {
    if (!aiSummaries[title] && !loadingAi[title]) {
      setLoadingAi((prev) => ({ ...prev, [title]: true }));
      api
        .getMaterialAiSummary({
          material_title: title,
          material_type: type,
          flag_contexts: materialFlags.map((f) => f.context),
          flag_comments: materialFlags.map((f) => f.comment),
        })
        .then((res) => {
          setAiSummaries((prev) => ({
            ...prev,
            [title]: { summary: res.summary, recommended_action: res.recommended_action },
          }));
        })
        .catch(() => {
          setAiSummaries((prev) => ({
            ...prev,
            [title]: {
              summary: `Synthesized ${materialFlags.length} student feedback items. Lifetime analysis shows conceptual friction around key lesson steps.`,
              recommended_action: "Post a short clarification note or video recap covering the flagged sections.",
            },
          }));
        })
        .finally(() => {
          setLoadingAi((prev) => ({ ...prev, [title]: false }));
        });
    }
  };

  // Bulk resolve handler
  const handleBulkResolve = async () => {
    if (!resolveCluster) return;
    if (!resolveMessage.trim()) {
      addToast("Please provide an explanation message.", "error");
      return;
    }

    setIsResolving(true);
    const flagIds = resolveCluster.flags.map((f) => f.id);

    try {
      await api.bulkResolveMaterialFlags(flagIds, resolveMessage);

      setFlags((prev) =>
        prev.map((f) => (flagIds.includes(f.id) ? { ...f, is_resolved: true } : f))
      );

      addToast(`Resolved ${flagIds.length} flags and notified students.`, "success");
      setResolveCluster(null);
      setResolveMessage("");
    } catch (err: any) {
      addToast(err.message || "Failed to resolve flags.", "error");
    } finally {
      setIsResolving(false);
    }
  };

  const getTypeIcon = (type: string): IconName => {
    switch (type) {
      case "video":
        return "video";
      case "pdf":
        return "file-text";
      case "image":
        return "image";
      default:
        return "book";
    }
  };

  // ─── Group Lifetime Data by Material Title ───
  const allMaterialGroups = useMemo(() => {
    const map = new Map<string, { type: string; activeFlags: TeacherMaterialFlag[]; resolvedFlags: TeacherMaterialFlag[]; allFlags: TeacherMaterialFlag[] }>();

    flags.forEach((f) => {
      const key = f.material_title;
      if (!map.has(key)) {
        map.set(key, { type: f.material_type, activeFlags: [], resolvedFlags: [], allFlags: [] });
      }
      const group = map.get(key)!;
      group.allFlags.push(f);
      if (f.is_resolved) {
        group.resolvedFlags.push(f);
      } else {
        group.activeFlags.push(f);
      }
    });

    return Array.from(map.entries()).map(([title, data]) => ({
      title,
      type: data.type,
      activeFlags: data.activeFlags,
      resolvedFlags: data.resolvedFlags,
      allFlags: data.allFlags,
      totalCount: data.allFlags.length,
      activeCount: data.activeFlags.length,
      resolvedCount: data.resolvedFlags.length,
    }));
  }, [flags]);

  // Filter material groups based on selection
  const filteredGroups = useMemo(() => {
    return allMaterialGroups.filter((g) => {
      if (filterType === "active" && g.activeCount === 0) return false;
      if (filterType === "video" && g.type !== "video") return false;
      if (filterType === "pdf" && g.type !== "pdf") return false;
      if (selectedMaterialId !== "all") {
        const mat = materials.find((m) => m.id === selectedMaterialId);
        if (mat && mat.title !== g.title) return false;
      }
      return true;
    });
  }, [allMaterialGroups, filterType, selectedMaterialId, materials]);

  const clusterFlags = (materialFlags: TeacherMaterialFlag[], type: string): FlagCluster[] => {
    if (type === "pdf") {
      const map: Record<string, TeacherMaterialFlag[]> = {};
      materialFlags.forEach((f) => {
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
          return parseInt(a[0].replace("page-", "")) - parseInt(b[0].replace("page-", ""));
        })
        .map(([id, fs]) => ({
          id,
          label: id.includes("Unknown") ? "Unknown Page" : `Page ${id.replace("page-", "")}`,
          flags: fs,
        }));
    } else if (type === "video") {
      const map: Record<number, TeacherMaterialFlag[]> = {};
      materialFlags.forEach((f) => {
        const match = f.context.match(/(?:Timestamp\s*)?(\d+):(\d{2})(?::(\d{2}))?/i);
        if (match) {
          let secs = 0;
          if (match[3]) {
            secs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
          } else {
            secs = parseInt(match[1]) * 60 + parseInt(match[2]);
          }
          const windowIdx = Math.floor(secs / 300);
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
    } else {
      return [{ id: "all", label: "All Flags", flags: materialFlags }];
    }
  };

  if (loading) {
    return <SkeletonMaterialHub />;
  }

  const activeMaterialsCount = allMaterialGroups.filter((g) => g.activeCount > 0).length;
  const totalLifetimeFlags = flags.length;
  const activeLifetimeFlags = flags.filter((f) => !f.is_resolved).length;
  const resolvedLifetimeFlags = flags.filter((f) => f.is_resolved).length;

  return (
    <div className="animate-fade-in" style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "4rem" }}>
      
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Material Hotspot Radar & Intelligence Hub
          </h1>
          <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
            Real-time dynamic video heatmaps, PDF density radars, and lifetime AI executive briefs across your curriculum
          </p>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "#EF4444", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Curriculum Health Overview Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(239, 68, 68, 0.12)", color: "#EF4444" }}>
            <SvgIcon name="alert-triangle" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#EF4444" }}>{activeLifetimeFlags}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>Active Student Flags</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.12)", color: "#10B981" }}>
            <SvgIcon name="check-circle" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10B981" }}>{resolvedLifetimeFlags}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>Resolved Historical Flags</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(99, 102, 241, 0.12)", color: "var(--primary)" }}>
            <SvgIcon name="layers" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>{totalLifetimeFlags}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>Lifetime Total Logged</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(99, 102, 241, 0.12)", color: "var(--text-primary)" }}>
            <SvgIcon name="book" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{allMaterialGroups.length}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>Materials with Analytics</div>
          </div>
        </div>
      </div>

      {/* Directory Selector Toolbar */}
      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          
          {/* Course Selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Course Filter</label>
            <select
              className="input"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value === "all" ? "all" : parseInt(e.target.value))}
              style={{ fontSize: "0.85rem" }}
            >
              <option value="all">All Courses ({courses.length})</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Lesson Selector */}
          {lessons.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Lesson Filter</label>
              <select
                className="input"
                value={selectedLessonId}
                onChange={(e) => setSelectedLessonId(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                style={{ fontSize: "0.85rem" }}
              >
                <option value="all">All Lessons ({lessons.length})</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Material Selector */}
          {materials.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Material Filter</label>
              <select
                className="input"
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                style={{ fontSize: "0.85rem" }}
              >
                <option value="all">All Materials ({materials.length})</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status Tabs */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div className="tabs" style={{ marginBottom: 0 }}>
              {[
                { id: "all", label: `All (${allMaterialGroups.length})` },
                { id: "active", label: `Active Hotspots (${activeMaterialsCount})` },
                { id: "video", label: `Videos (${allMaterialGroups.filter((g) => g.type === "video").length})` },
                { id: "pdf", label: `PDFs (${allMaterialGroups.filter((g) => g.type === "pdf").length})` },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`tab ${filterType === f.id ? "tab-active" : ""}`}
                  onClick={() => setFilterType(f.id as any)}
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Materials List View (Lifetime Analytics Workspace Cards) */}
      {filteredGroups.length === 0 ? (
        <div className="card empty-state" style={{ padding: "3rem 2rem", textAlign: "center" }}>
          <SvgIcon name="layers" style={{ width: 48, height: 48, color: "var(--text-muted)", opacity: 0.5 }} />
          <div className="empty-state-title" style={{ marginTop: "1rem" }}>No material flags found</div>
          <div className="empty-state-desc">Try selecting a different course or lesson from the filter dropdown.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {filteredGroups.map((group) => {
            const isHighPriority = group.activeCount >= 3;
            const clusters = clusterFlags(group.allFlags, group.type);

            return (
              <div key={group.title} className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--border-color)" }}>
                
                {/* Material Card Header */}
                <div
                  style={{
                    padding: "1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--bg-primary)",
                    borderBottom: "1px solid var(--border-subtle)",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "var(--radius-sm)",
                        background: group.activeCount > 0 ? (isHighPriority ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)") : "rgba(16, 185, 129, 0.1)",
                        color: group.activeCount > 0 ? (isHighPriority ? "#EF4444" : "#F59E0B") : "#10B981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SvgIcon name={getTypeIcon(group.type)} size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {group.title}
                      </h3>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem", textTransform: "capitalize" }}>
                        {group.type} · <strong>{group.activeCount}</strong> active flag{group.activeCount !== 1 ? "s" : ""} · <strong>{group.resolvedCount}</strong> resolved historical flag{group.resolvedCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {group.activeCount > 0 ? (
                      <span className={isHighPriority ? "badge badge-error" : "badge badge-warning"} style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}>
                        {isHighPriority ? "High Hotspot Zone" : "Moderate Zone"}
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <SvgIcon name="check-circle" size={12} />
                        <span>All Resolved ({group.resolvedCount} Lifetime)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content - DYNAMIC HEATMAP & DIAGNOSTIC PANEL */}
                <div style={{ padding: "1.25rem", background: "var(--bg-primary)" }}>
                  
                  {/* AI Executive Hotspot Brief Card */}
                  <div
                    style={{
                      padding: "1rem 1.25rem",
                      marginBottom: "1.25rem",
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <SvgIcon name="sparkle" size={16} style={{ color: "#6366F1" }} />
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          AI Executive Hotspot Brief
                        </span>
                      </div>
                      {!aiSummaries[group.title] && (
                        <button
                          className="btn-secondary btn-sm"
                          style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                          onClick={() => fetchAiSummary(group.title, group.type, group.allFlags)}
                        >
                          Synthesize AI Brief
                        </button>
                      )}
                    </div>

                    {aiSummaries[group.title] ? (
                      <div>
                        <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: "0 0 6px 0", lineHeight: 1.45 }}>
                          {aiSummaries[group.title].summary}
                        </p>
                        <div style={{ fontSize: "0.8rem", color: "#6366F1", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>Recommended Action:</span> {aiSummaries[group.title].recommended_action}
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                        Click "Synthesize AI Brief" to generate lifetime AI recommendations from student feedback.
                      </p>
                    )}
                  </div>

                  {/* REAL-TIME DYNAMIC HEATMAP / DENSITY RADAR SPECTRUM */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    <MaterialHeatmap
                      materialType={group.type}
                      flags={group.allFlags}
                      onSeekTimestamp={(sec, label) => {
                        addToast(`Seek Triggered: Jumped to video timestamp ${label} (${sec}s)`, "info");
                      }}
                    />
                  </div>

                  {/* Detailed Clustered Comments List */}
                  <div style={{ marginTop: "1rem" }}>
                    <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
                      Friction Cluster Breakdown ({clusters.length})
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {clusters.map((cluster) => {
                        const hasActive = cluster.flags.some((f) => !f.is_resolved);

                        return (
                          <div
                            key={cluster.id}
                            style={{
                              background: "var(--bg-body)",
                              borderRadius: "var(--radius-sm)",
                              border: `1px solid ${hasActive ? "rgba(239, 68, 68, 0.3)" : "var(--border-subtle)"}`,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                padding: "0.75rem 1rem",
                                background: hasActive ? "rgba(239, 68, 68, 0.05)" : "rgba(16, 185, 129, 0.05)",
                                borderBottom: "1px solid var(--border-subtle)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <SvgIcon name={hasActive ? "target" : "check-circle"} size={16} style={{ color: hasActive ? "#EF4444" : "#10B981" }} />
                                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{cluster.label}</span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                  ({cluster.flags.length} flag{cluster.flags.length !== 1 ? "s" : ""})
                                </span>
                              </div>
                              {hasActive && (
                                <button
                                  className="btn-primary btn-sm"
                                  onClick={() => setResolveCluster(cluster)}
                                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
                                >
                                  Resolve Cluster
                                </button>
                              )}
                            </div>

                            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              {cluster.flags.map((flag) => (
                                <div key={flag.id} style={{ fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div>
                                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{flag.student_name || "Student"}:</span>{" "}
                                    <span style={{ color: "var(--text-secondary)" }}>"{flag.comment}"</span>
                                    {flag.context && !cluster.label.includes(flag.context) && (
                                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                        ({flag.context})
                                      </span>
                                    )}
                                  </div>
                                  <span className={flag.is_resolved ? "badge badge-success" : "badge badge-warning"} style={{ fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                                    {flag.is_resolved ? (
                                      <>
                                        <SvgIcon name="check-circle" size={10} />
                                        <span>Resolved</span>
                                      </>
                                    ) : (
                                      <span>Active</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Resolve Modal */}
      {resolveCluster && (
        <div className="modal-backdrop" onClick={() => setResolveCluster(null)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px", width: "90%" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>Resolve Cluster ({resolveCluster.label})</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Provide an explanation message note for students.
            </p>
            <textarea
              className="form-control"
              rows={4}
              placeholder="e.g. Added supplementary note clarifying the vector formula step."
              value={resolveMessage}
              onChange={(e) => setResolveMessage(e.target.value)}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn-secondary btn-sm" onClick={() => setResolveCluster(null)}>
                Cancel
              </button>
              <button className="btn-primary btn-sm" onClick={handleBulkResolve} disabled={isResolving}>
                {isResolving ? "Resolving..." : "Broadcast Resolution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
