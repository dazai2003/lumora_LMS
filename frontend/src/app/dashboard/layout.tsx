"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, ReactNode, useMemo, useState } from "react";
import NotificationBell from "@/components/NotificationBell";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";
import lumoraLogo from "@/components/ico/Black_background_Logo.png";
import StudentAccountModal from "@/components/StudentAccountModal";
import TeacherAccountModal from "@/components/TeacherAccountModal";
import api from "@/lib/api";

const navConfig: Record<string, { label: string; items: { href: string; label: string; icon: string }[] }[]> = {
  teacher: [
    {
      label: "Overview",
      items: [
        { href: "/dashboard/teacher", label: "Dashboard", icon: "grid" },
      ],
    },
    {
      label: "Content",
      items: [
        { href: "/dashboard/teacher/courses", label: "My Courses", icon: "book" },
        { href: "/dashboard/teacher/question-bank", label: "Question Bank", icon: "file-text" },
      ],
    },
    {
      label: "Assessments",
      items: [
        { href: "/dashboard/teacher/al-exams", label: "Exam Engine", icon: "award" },
        { href: "/dashboard/teacher/al-exams/marking", label: "Marking Studio", icon: "check-circle" },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: "/dashboard/teacher/analytics", label: "Analytics", icon: "chart" },
        { href: "/dashboard/teacher/insights", label: "Material Stats", icon: "flag" },
        { href: "/dashboard/teacher/qa", label: "Q&A Moderation", icon: "scale" },
        { href: "/dashboard/teacher/inbox", label: "Messages & Support", icon: "mail" },
      ],
    },
  ],
  student: [
    {
      label: "Overview",
      items: [
        { href: "/dashboard/student", label: "Dashboard", icon: "grid" },
        { href: "/dashboard/student/analytics", label: "My Analytics", icon: "chart" },
      ],
    },
    {
      label: "Learning",
      items: [
        { href: "/dashboard/student/courses", label: "My Courses", icon: "book" },
      ],
    },
    {
      label: "Assessments",
      items: [
        { href: "/dashboard/student/al-exams", label: "Exam Studio", icon: "award" },
      ],
    },
    {
      label: "Help",
      items: [
        { href: "/dashboard/student/ask", label: "Ask AI", icon: "sparkle" },
        { href: "/dashboard/student/ask-teacher", label: "Ask Teacher", icon: "mail" },
      ],
    },
  ],
};

/* ─── Breadcrumb label map ─── */
const labelMap: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  courses: "Courses",
  "al-exams": "Exam Engine",
  marking: "Marking Studio",
  "pdf-import": "PDF Past Paper Import",
  analytics: "Analytics",
  insights: "Material Stats",
  qa: "Q&A Moderation",
  grading: "Marking Studio",
  "question-bank": "Question Bank",
  questions: "Student Questions",
  browse: "Browse & Enroll Classes",
  guide: "Platform User Guide",
  ask: "Ask AI",
  "ask-teacher": "Ask Teacher",
  teachers: "Teachers",
  students: "Students",
  lessons: "Lessons",
  inbox: "Student Inbox",
  create: "Create Exam",
  payments: "Payments",
  "password-resets": "Password Resets",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [accountModalTab, setAccountModalTab] = useState<"profile" | "billing" | "guide" | null>(null);
  const [teacherModalTab, setTeacherModalTab] = useState<"profile" | "guide" | null>(null);
  const [sidebarBadges, setSidebarBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      api.getSidebarBadges()
        .then((data) => setSidebarBadges(data || {}))
        .catch(() => {});
    }
  }, [user, pathname]);

  /* Build breadcrumbs from pathname */
  const breadcrumbs = useMemo(() => {
    if (!pathname) return [];
    const segments = pathname.split("/").filter(Boolean);
    // Skip "dashboard" and role segment for cleaner breadcrumbs
    const crumbs: { label: string; href: string }[] = [];
    let path = "";
    for (let i = 0; i < segments.length; i++) {
      path += "/" + segments[i];
      const segment = segments[i];
      // Skip numeric IDs in breadcrumbs
      if (/^\d+$/.test(segment)) continue;
      // Skip "dashboard" prefix — start from role
      if (segment === "dashboard") continue;
      const label = labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
      crumbs.push({ label, href: path });
    }
    return crumbs;
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="page-loader">
        <div className="spinner" />
      </div>
    );
  }

  const sections = navConfig[user.role] || [];

  const roleBadgeColor: Record<string, string> = {
    teacher: "var(--accent-primary)",
    student: "var(--accent-secondary)",
  };

  const roleLabel: Record<string, string> = {
    teacher: "Teacher",
    student: "Student",
  };

  const isNavActive = (href: string) => {
    if (href === "/dashboard/teacher" || href === "/dashboard/student") {
      return pathname === href;
    }
    if (href === "/dashboard/teacher/al-exams") {
      return pathname === href || (pathname.startsWith(href + "/") && !pathname.startsWith("/dashboard/teacher/al-exams/marking") && !pathname.startsWith("/dashboard/teacher/al-exams/grading") && !pathname.startsWith("/dashboard/teacher/al-exams/grade"));
    }
    if (href === "/dashboard/teacher/al-exams/marking") {
      return pathname === href || pathname.startsWith("/dashboard/teacher/al-exams/marking") || pathname.startsWith("/dashboard/teacher/al-exams/grading") || pathname.startsWith("/dashboard/teacher/al-exams/grade");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Skip to Content (a11y) */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Sidebar */}
      <aside className="sidebar" aria-label="Main navigation sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Image
                  src={lumoraLogo}
                  alt="Lumora"
                  width={32}
                  height={32}
                  priority
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    lineHeight: 1.2,
                  }}
                >
                  Lumora
                </div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: "var(--text-muted)",
                    marginTop: "1px",
                  }}
                >
                  Learning Platform
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="sidebar-section">{section.label}</div>
              {section.items.map((item) => {
                const count = sidebarBadges[item.href] || 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${isNavActive(item.href) ? "active" : ""}`}
                  >
                    <span style={{ display: "flex", alignItems: "center" }}>
                      <SvgIcon name={item.icon as IconName} size={18} />
                    </span>
                    <span>{item.label}</span>
                    {count > 0 && (
                      <span className="sidebar-link-indicator">
                        <span className="sidebar-indicator-dot" />
                        <span className="sidebar-indicator-count">{count > 99 ? "99+" : count}</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Section at bottom (Only for roles without top menu logout) */}
        {user?.role !== "teacher" && user?.role !== "student" && (
          <div
            style={{
              padding: "0.875rem 1.25rem",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="btn-secondary"
              style={{
                width: "100%",
                padding: "0.5rem",
                fontSize: "0.8rem",
                gap: "0.5rem",
              }}
            >
              <SvgIcon name="log-out" size={15} />
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* Main Area with Top Header */}
      <div style={{ flex: 1, marginLeft: "260px", display: "flex", flexDirection: "column", minHeight: "100vh", minWidth: 0, maxWidth: "calc(100vw - 260px)" }}>
        {/* Top Header Bar */}
        <header className="top-header">
          {/* Left: Breadcrumbs */}
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.href} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                {i > 0 && <span className="separator">/</span>}
                {i === breadcrumbs.length - 1 ? (
                  <span className="current">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href}>{crumb.label}</Link>
                )}
              </span>
            ))}
          </nav>

          {/* Right: User info + Notifications */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", position: "relative" }}>
            <NotificationBell />
            
            <button
              type="button"
              onClick={() => setShowProfileMenu(prev => !prev)}
              aria-expanded={showProfileMenu}
              aria-label="Account menu"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                padding: "0.375rem 0.65rem",
                borderRadius: "100px",
                border: "1px solid var(--border-subtle)",
                background: showProfileMenu ? "var(--bg-card-hover)" : "var(--bg-card)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: "var(--accent-primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ lineHeight: 1.2, textAlign: "left" }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user.full_name}
                </div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: roleBadgeColor[user.role],
                    textTransform: "capitalize",
                  }}
                >
                  {roleLabel[user.role] || user.role}
                </div>
              </div>
              <SvgIcon name="chevron-down" size={14} style={{ color: "var(--text-muted)", marginLeft: "2px" }} />
            </button>

            {/* Google-Style Dropdown Menu */}
            {showProfileMenu && (
              <div
                className="animate-scale-in shadow-lg"
                style={{
                  position: "absolute",
                  top: "calc(100% + 0.5rem)",
                  right: 0,
                  width: "250px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  zIndex: 999,
                  overflow: "hidden",
                  padding: "0.4rem 0",
                }}
              >
                {/* Header Profile Summary */}
                <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-subtle)", marginBottom: "0.25rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)" }}>{user.full_name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                </div>

                {user.role === "student" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setAccountModalTab("profile");
                      }}
                      style={{
                        width: "100%", padding: "0.55rem 1rem", border: "none", background: "none",
                        display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.825rem",
                        color: "var(--text-primary)", cursor: "pointer", textAlign: "left"
                      }}
                    >
                      <SvgIcon name="user" size={16} style={{ color: "var(--accent-primary)" }} />
                      <span>Profile & Security</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        router.push("/dashboard/student/browse");
                      }}
                      style={{
                        width: "100%", padding: "0.55rem 1rem", border: "none", background: "none",
                        display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.825rem",
                        color: "var(--text-primary)", cursor: "pointer", textAlign: "left"
                      }}
                    >
                      <SvgIcon name="search" size={16} style={{ color: "var(--accent-primary)" }} />
                      <span>Browse & Enroll Classes</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        router.push("/dashboard/student/guide");
                      }}
                      style={{
                        width: "100%", padding: "0.55rem 1rem", border: "none", background: "none",
                        display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.825rem",
                        color: "var(--text-primary)", cursor: "pointer", textAlign: "left"
                      }}
                    >
                      <SvgIcon name="help-circle" size={16} style={{ color: "#10B981" }} />
                      <span>Platform User Guide</span>
                    </button>

                    <div style={{ height: "1px", background: "var(--border-subtle)", margin: "0.25rem 0" }} />
                  </>
                )}

                {user.role === "teacher" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setTeacherModalTab("profile");
                      }}
                      style={{
                        width: "100%", padding: "0.55rem 1rem", border: "none", background: "none",
                        display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.825rem",
                        color: "var(--text-primary)", cursor: "pointer", textAlign: "left"
                      }}
                    >
                      <SvgIcon name="user" size={16} style={{ color: "var(--accent-primary)" }} />
                      <span>Profile & Security</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setTeacherModalTab("guide");
                      }}
                      style={{
                        width: "100%", padding: "0.55rem 1rem", border: "none", background: "none",
                        display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.825rem",
                        color: "var(--text-primary)", cursor: "pointer", textAlign: "left"
                      }}
                    >
                      <SvgIcon name="help-circle" size={16} style={{ color: "#10B981" }} />
                      <span>Teacher Platform Guide</span>
                    </button>

                    <div style={{ height: "1px", background: "var(--border-subtle)", margin: "0.25rem 0" }} />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                    router.push("/login");
                  }}
                  style={{
                    width: "100%", padding: "0.55rem 1rem", border: "none", background: "none",
                    display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.825rem",
                    color: "var(--error)", cursor: "pointer", textAlign: "left"
                  }}
                >
                  <SvgIcon name="log-out" size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main id="main-content" className="animate-fade-in" role="main" style={{ padding: "2rem", flex: 1, minWidth: 0, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
          {children}
        </main>
      </div>

      {/* Student Account & Settings Modal */}
      {accountModalTab && user && (
        <StudentAccountModal
          modalType={accountModalTab}
          user={user}
          onClose={() => setAccountModalTab(null)}
        />
      )}

      {/* Teacher Account & Settings Modal */}
      {teacherModalTab && user && (
        <TeacherAccountModal
          modalType={teacherModalTab}
          user={user}
          onClose={() => setTeacherModalTab(null)}
        />
      )}
    </div>
  );
}
