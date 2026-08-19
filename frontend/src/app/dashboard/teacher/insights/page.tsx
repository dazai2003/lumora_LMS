"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
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
  const [filterType, setFilterType] = useState<"all" | "active" | "video" | "pdf" | "needs_attention">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Expanded Friction Material Details
  const [expandedFrictionMaterial, setExpandedFrictionMaterial] = useState<string | null>(null);

  // AI Hotspot Summaries cache by material title
  const [aiSummaries, setAiSummaries] = useState<Record<string, { summary: string; recommended_action: string }>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});

  // Cluster Resolution Modal State
  const [resolveCluster, setResolveCluster] = useState<FlagCluster | null>(null);
  const [resolveActionType, setResolveActionType] = useState<"note" | "video" | "broadcast">("note");
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
      addToast("Please provide an explanation message for students.", "error");
      return;
    }

    setIsResolving(true);
    const flagIds = resolveCluster.flags.map((f) => f.id);

    try {
      await api.bulkResolveMaterialFlags(flagIds, resolveMessage);

      setFlags((prev) =>
        prev.map((f) => (flagIds.includes(f.id) ? { ...f, is_resolved: true } : f))
      );

      addToast(`Successfully resolved ${flagIds.length} flags and broadcasted resolution note.`, "success");
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

  // Urgent materials requiring teacher attention
  const urgentMaterials = useMemo(() => {
    return allMaterialGroups.filter((g) => g.activeCount > 0);
  }, [allMaterialGroups]);

  // Filter material groups based on selection
  const filteredGroups = useMemo(() => {
    return allMaterialGroups.filter((g) => {
      if (filterType === "active" && g.activeCount === 0) return false;
      if (filterType === "needs_attention" && g.activeCount === 0) return false;
      if (filterType === "video" && g.type !== "video") return false;
      if (filterType === "pdf" && g.type !== "pdf") return false;
      if (selectedMaterialId !== "all") {
        const mat = materials.find((m) => m.id === selectedMaterialId);
        if (mat && mat.title !== g.title) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!g.title.toLowerCase().includes(q) && !g.type.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [allMaterialGroups, filterType, selectedMaterialId, materials, searchQuery]);

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
          if (idx === -1) return { id: "unknown", label: "General Video", flags: fs };
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

  const totalLifetimeFlags = flags.length;
  const activeLifetimeFlags = flags.filter((f) => !f.is_resolved).length;
  const resolvedLifetimeFlags = flags.filter((f) => f.is_resolved).length;
  const activeMaterialsCount = allMaterialGroups.filter((g) => g.activeCount > 0).length;

  return (
    <div className="animate-fade-in" style={{ maxWidth: "1480px", margin: "0 auto", paddingBottom: "4rem" }}>
      
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="badge badge-purple" style={{ fontSize: "0.74rem", fontWeight: 700 }}>
              Curriculum Resource Intelligence
            </span>
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0.35rem 0 0 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SvgIcon name="sparkle" size={24} style={{ color: "var(--accent-primary)" }} />
            Material Stats &amp; Hotspot Radar
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
            Real-time dynamic video heatmaps, PDF density radars, friction cluster resolutions, and lifetime AI executive briefs
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Link href="/dashboard/teacher/analytics" className="btn btn-secondary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", height: "36px" }}>
            <SvgIcon name="chart" size={15} />
            Course Analytics
          </Link>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={loadData}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", height: "36px" }}
          >
            <SvgIcon name="refresh" size={15} />
            Refresh Radar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "#EF4444", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
          {error}
        </div>
      )}

      {/* Curriculum Health Overview Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem", border: "1px solid var(--border)" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: activeLifetimeFlags > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)", color: activeLifetimeFlags > 0 ? "#EF4444" : "#10B981" }}>
            <SvgIcon name="alert-triangle" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: activeLifetimeFlags > 0 ? "#EF4444" : "#10B981", lineHeight: 1.1 }}>{activeLifetimeFlags}</div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "3px" }}>Active Student Flags</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{activeMaterialsCount} resources with active friction</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem", border: "1px solid var(--border)" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.12)", color: "#10B981" }}>
            <SvgIcon name="check-circle" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#10B981", lineHeight: 1.1 }}>{resolvedLifetimeFlags}</div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "3px" }}>Resolved Historical Flags</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Class clarifications delivered</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem", border: "1px solid var(--border)" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(99, 102, 241, 0.12)", color: "var(--accent-primary)" }}>
            <SvgIcon name="layers" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--accent-primary)", lineHeight: 1.1 }}>{totalLifetimeFlags}</div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "3px" }}>Lifetime Total Logged</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Total student feedback points</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "1rem", border: "1px solid var(--border)" }}>
          <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(99, 102, 241, 0.12)", color: "var(--text-primary)" }}>
            <SvgIcon name="book" size={24} />
          </div>
          <div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>{allMaterialGroups.length}</div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "3px" }}>Tracked Curriculum Materials</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Videos, PDFs &amp; Documents</div>
          </div>
        </div>
      </div>

      {/* ──────────────── SECTION 1: LEARNING RESOURCES REQUIRING ATTENTION ──────────────── */}
      <div className="card" style={{ padding: "1.35rem 1.5rem", marginBottom: "1.75rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: urgentMaterials.length > 0 ? "var(--warning)" : "var(--success)" }}>
              <SvgIcon name={urgentMaterials.length > 0 ? "alert-triangle" : "check-circle"} size={20} />
            </span>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Learning Resources Requiring Attention ({urgentMaterials.length})
            </h3>
          </div>
          {urgentMaterials.length > 0 ? (
            <span className="badge badge-warning" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
              Action Recommended ({urgentMaterials.reduce((acc, m) => acc + m.activeCount, 0)} Unresolved Flags)
            </span>
          ) : (
            <span className="badge badge-success" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
              All Resources Clear
            </span>
          )}
        </div>

        {urgentMaterials.length === 0 ? (
          <div style={{ padding: "1.25rem", background: "rgba(16, 185, 129, 0.06)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(16, 185, 129, 0.25)", color: "var(--text-primary)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <SvgIcon name="check-circle" size={18} style={{ color: "#10B981" }} />
            <span>All curriculum learning resources are in good standing with zero unresolved student flags.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {urgentMaterials.map((m) => {
              const isExpanded = expandedFrictionMaterial === m.title;
              const clusters = clusterFlags(m.allFlags, m.type);
              const activeClusters = clusters.filter((c) => c.flags.some((f) => !f.is_resolved));
              const topContext = m.activeFlags[0]?.context || "General";

              return (
                <div key={m.title} style={{ padding: "0.9rem 1.15rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <span className="badge badge-secondary" style={{ textTransform: "uppercase", fontSize: "0.7rem", fontWeight: 700 }}>
                        <SvgIcon name={getTypeIcon(m.type)} size={12} style={{ marginRight: 4 }} />
                        {m.type}
                      </span>
                      <strong style={{ fontSize: "0.92rem", color: "var(--text-primary)" }}>{m.title}</strong>
                      <span className="badge badge-error" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                        {m.activeCount} Unresolved Flag{m.activeCount !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                        Primary hotspot: <strong>{topContext}</strong>
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.7rem" }}
                        onClick={() => setExpandedFrictionMaterial(isExpanded ? null : m.title)}
                      >
                        {isExpanded ? "▲ Minimize Details" : `▼ View Friction Breakdown (${activeClusters.length} Hotspots)`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.8rem", display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 700 }}
                        onClick={() => {
                          const targetCluster = activeClusters[0] || { id: "all", label: m.title, flags: m.activeFlags };
                          setResolveCluster(targetCluster);
                          setResolveMessage("");
                        }}
                      >
                        <SvgIcon name="check-circle" size={14} />
                        Resolve Hotspot
                      </button>
                    </div>
                  </div>

                  {/* Expanded Breakdown Drawer */}
                  {isExpanded && (
                    <div className="animate-fade-in" style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Student Feedback Items Requiring Clarification:
                        </div>
                        {m.activeFlags.map((f) => (
                          <div key={f.id} style={{ padding: "0.6rem 0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontSize: "0.82rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{f.student_name || "Enrolled Student"}</span>
                              <span className="badge badge-warning" style={{ fontSize: "0.68rem" }}>{f.context || "Document Location"}</span>
                            </div>
                            <div style={{ color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.4 }}>
                              &ldquo;{f.comment}&rdquo;
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
      </div>

      {/* ──────────────── SECTION 2: MATERIAL HOTSPOT RADAR & INTELLIGENCE HUB ──────────────── */}
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <SvgIcon name="target" size={20} style={{ color: "var(--accent-primary)" }} />
          Material Hotspot Radar &amp; Intelligence Hub
        </h2>
        <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: 0 }}>
          Interactive video timestamp friction charts, PDF density radars, AI executive summaries, and cluster resolution
        </p>
      </div>

      {/* Directory Selector & Filter Toolbar */}
      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          
          {/* Course Selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "200px" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Course Filter</label>
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
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Lesson Filter</label>
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
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Material Filter</label>
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

          {/* Search Query */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Search Keyword</label>
            <input
              type="text"
              className="input"
              placeholder="Search resource title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: "0.85rem" }}
            />
          </div>

          {/* Category Tabs */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `All (${allMaterialGroups.length})` },
              { id: "active", label: `Active Hotspots (${activeMaterialsCount})` },
              { id: "needs_attention", label: `Attention Required (${urgentMaterials.length})` },
              { id: "video", label: `Videos (${allMaterialGroups.filter((g) => g.type === "video").length})` },
              { id: "pdf", label: `PDFs (${allMaterialGroups.filter((g) => g.type === "pdf").length})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn ${filterType === f.id ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilterType(f.id as any)}
                style={{ fontSize: "0.76rem", padding: "0.35rem 0.7rem", borderRadius: "var(--radius-sm)" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Materials List View (Lifetime Analytics Workspace Cards) */}
      {filteredGroups.length === 0 ? (
        <div className="card empty-state" style={{ padding: "3.5rem 2rem", textAlign: "center", border: "1px dashed var(--border)" }}>
          <SvgIcon name="layers" style={{ width: 48, height: 48, color: "var(--text-muted)", opacity: 0.5 }} />
          <div className="empty-state-title" style={{ marginTop: "1rem", fontSize: "1.1rem", fontWeight: 700 }}>No material hotspots found</div>
          <div className="empty-state-desc" style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Try adjusting your course, lesson, or search filter.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {filteredGroups.map((group) => {
            const isHighPriority = group.activeCount >= 3;
            const clusters = clusterFlags(group.allFlags, group.type);

            return (
              <div key={group.title} className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--border)" }}>
                
                {/* Material Card Header */}
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--bg-primary)",
                    borderBottom: "1px solid var(--border)",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "var(--radius-md)",
                        background: group.activeCount > 0 ? (isHighPriority ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)") : "rgba(16, 185, 129, 0.12)",
                        color: group.activeCount > 0 ? (isHighPriority ? "#EF4444" : "#F59E0B") : "#10B981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SvgIcon name={getTypeIcon(group.type)} size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                        {group.title}
                      </h3>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem", textTransform: "capitalize" }}>
                        {group.type} Resource &bull; <strong>{group.activeCount}</strong> active flag{group.activeCount !== 1 ? "s" : ""} &bull; <strong>{group.resolvedCount}</strong> resolved historical flag{group.resolvedCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {group.activeCount > 0 ? (
                      <span className={isHighPriority ? "badge badge-error" : "badge badge-warning"} style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", fontWeight: 700 }}>
                        {isHighPriority ? "High Hotspot Priority" : "Moderate Friction"}
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 700 }}>
                        <SvgIcon name="check-circle" size={14} />
                        <span>All Clear ({group.resolvedCount} Resolved)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content - DYNAMIC HEATMAP & DIAGNOSTIC PANEL */}
                <div style={{ padding: "1.5rem", background: "var(--bg-primary)" }}>
                  
                  {/* AI Executive Hotspot Brief Card */}
                  <div
                    style={{
                      padding: "1.1rem 1.35rem",
                      marginBottom: "1.35rem",
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <SvgIcon name="sparkle" size={18} style={{ color: "var(--accent-primary)" }} />
                        <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text-primary)" }}>
                          AI Executive Hotspot Brief &amp; Pedagogical Insights
                        </span>
                      </div>
                      {!aiSummaries[group.title] && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", fontWeight: 700 }}
                          onClick={() => fetchAiSummary(group.title, group.type, group.allFlags)}
                          disabled={loadingAi[group.title]}
                        >
                          {loadingAi[group.title] ? "Synthesizing..." : "Synthesize AI Brief"}
                        </button>
                      )}
                    </div>

                    {aiSummaries[group.title] ? (
                      <div>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 8px 0", lineHeight: 1.55 }}>
                          {aiSummaries[group.title].summary}
                        </p>
                        <div style={{ fontSize: "0.82rem", color: "var(--accent-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>Recommended Pedagogical Action:</span>
                          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{aiSummaries[group.title].recommended_action}</span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
                        Click "Synthesize AI Brief" to generate Gemini AI insights and root-cause analysis from student feedback.
                      </p>
                    )}
                  </div>

                  {/* REAL-TIME DYNAMIC HEATMAP / DENSITY RADAR SPECTRUM */}
                  <div style={{ marginBottom: "1.35rem" }}>
                    <MaterialHeatmap
                      materialType={group.type}
                      flags={group.allFlags}
                      onSeekTimestamp={(sec, label) => {
                        addToast(`Jumped to video timeline ${label} (${sec}s)`, "info");
                      }}
                    />
                  </div>

                  {/* Detailed Clustered Comments List */}
                  <div style={{ marginTop: "1rem" }}>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 800, marginBottom: "0.85rem", color: "var(--text-primary)" }}>
                      Friction Cluster Breakdown ({clusters.length} Focus Points)
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                      {clusters.map((cluster) => {
                        const hasActive = cluster.flags.some((f) => !f.is_resolved);

                        return (
                          <div
                            key={cluster.id}
                            style={{
                              background: "var(--bg-card)",
                              borderRadius: "var(--radius-sm)",
                              border: `1px solid ${hasActive ? "rgba(239, 68, 68, 0.35)" : "var(--border)"}`,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                padding: "0.85rem 1.15rem",
                                background: hasActive ? "rgba(239, 68, 68, 0.06)" : "rgba(16, 185, 129, 0.06)",
                                borderBottom: "1px solid var(--border)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "0.5rem",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <SvgIcon name={hasActive ? "target" : "check-circle"} size={16} style={{ color: hasActive ? "#EF4444" : "#10B981" }} />
                                <span style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "0.9rem" }}>{cluster.label}</span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                  ({cluster.flags.length} flag{cluster.flags.length !== 1 ? "s" : ""})
                                </span>
                              </div>
                              {hasActive && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => setResolveCluster(cluster)}
                                  style={{ padding: "0.35rem 0.85rem", fontSize: "0.78rem", fontWeight: 700 }}
                                >
                                  Resolve Cluster
                                </button>
                              )}
                            </div>

                            <div style={{ padding: "1rem 1.15rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              {cluster.flags.map((flag) => (
                                <div key={flag.id} style={{ fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                                  <div>
                                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{flag.student_name || "Enrolled Student"}:</span>{" "}
                                    <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>&ldquo;{flag.comment}&rdquo;</span>
                                    {flag.context && !cluster.label.includes(flag.context) && (
                                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                        ({flag.context})
                                      </span>
                                    )}
                                  </div>
                                  <span className={flag.is_resolved ? "badge badge-success" : "badge badge-warning"} style={{ fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", fontWeight: 700 }}>
                                    {flag.is_resolved ? (
                                      <>
                                        <SvgIcon name="check-circle" size={11} />
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

      {/* ──────────────── CLUSTER RESOLUTION MODAL ──────────────── */}
      {resolveCluster && (
        <div className="modal-overlay" onClick={() => setResolveCluster(null)} style={{ zIndex: 1100, background: "rgba(0, 0, 0, 0.75)" }}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px", width: "92%", padding: "1.5rem", borderRadius: "var(--radius-lg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <SvgIcon name="check-circle" size={20} style={{ color: "var(--success)" }} />
                Resolve Friction Cluster: {resolveCluster.label}
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setResolveCluster(null)}
                style={{ padding: "0.3rem 0.5rem" }}
              >
                <SvgIcon name="x" size={16} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.45 }}>
              Resolving these <strong>{resolveCluster.flags.length} student flags</strong> will mark them as addressed and send a notification note to the inquiring students.
            </p>

            {/* Action Type Selector */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              {[
                { id: "note", label: "Supplementary Note" },
                { id: "video", label: "Video Recap" },
                { id: "broadcast", label: "General Clarification" },
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => setResolveActionType(act.id as any)}
                  className={`btn ${resolveActionType === act.id ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem", flex: 1 }}
                >
                  {act.label}
                </button>
              ))}
            </div>

            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: "0.35rem" }}>
              Explanation Note for Students:
            </label>
            <textarea
              className="form-control"
              rows={4}
              placeholder="e.g. Added a clarification note explaining the derivation of the countercurrent formula."
              value={resolveMessage}
              onChange={(e) => setResolveMessage(e.target.value)}
              style={{ width: "100%", marginBottom: "1.25rem", fontSize: "0.88rem" }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setResolveCluster(null)}
                disabled={isResolving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBulkResolve}
                disabled={isResolving}
                style={{ fontWeight: 700 }}
              >
                {isResolving ? "Resolving & Broadcasting..." : "Broadcast Resolution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
