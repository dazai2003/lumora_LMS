"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, ReactNode, useMemo } from "react";
import NotificationBell from "@/components/NotificationBell";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";
import lumoraLogo from "@/components/ico/Black_background_Logo.png";

const navConfig: Record<string, { label: string; items: { href: string; label: string; icon: string }[] }[]> = {
  admin: [
    {
      label: "Overview",
      items: [
        { href: "/dashboard/admin", label: "Dashboard", icon: "grid" },
        { href: "/dashboard/admin/payments", label: "Payments", icon: "dollar-sign" },
      ],
    },
    {
      label: "Management",
      items: [
        { href: "/dashboard/admin/teachers", label: "Teachers", icon: "users" },
        { href: "/dashboard/admin/students", label: "Students", icon: "graduation" },
        { href: "/dashboard/admin/courses", label: "Courses", icon: "book" },
        { href: "/dashboard/admin/password-resets", label: "Password Resets", icon: "lock" },
      ],
    },
    {
      label: "Communication",
      items: [
        { href: "/dashboard/admin/messages", label: "Teacher Messages", icon: "mail" },
      ],
    },
  ],
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
        { href: "/dashboard/teacher/quizzes", label: "Quizzes", icon: "clipboard" },
        { href: "/dashboard/teacher/assignments", label: "Coursework", icon: "folder" },
        { href: "/dashboard/teacher/question-bank", label: "Question Bank", icon: "file-text" },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: "/dashboard/teacher/analytics", label: "Analytics", icon: "chart" },
        { href: "/dashboard/teacher/insights", label: "Material Stats", icon: "flag" },
        { href: "/dashboard/teacher/qa", label: "Q&A Moderation", icon: "scale" },
        { href: "/dashboard/teacher/grading", label: "Grading Queue", icon: "check-circle" },
        { href: "/dashboard/teacher/inbox", label: "Messages & Support", icon: "mail" },
      ],
    },
  ],
  student: [
    {
      label: "Overview",
      items: [
        { href: "/dashboard/student", label: "Dashboard", icon: "grid" },
      ],
    },
    {
      label: "Learning",
      items: [
        { href: "/dashboard/student/courses", label: "My Courses", icon: "book" },
        { href: "/dashboard/student/browse", label: "Browse Courses", icon: "search" },
        { href: "/dashboard/student/assignments", label: "Coursework", icon: "folder" },
        { href: "/dashboard/student/quizzes", label: "Quizzes", icon: "clipboard" },
      ],
    },
    {
      label: "Help",
      items: [
        { href: "/dashboard/student/ask", label: "Ask AI", icon: "sparkle" },
        { href: "/dashboard/student/ask-teacher", label: "Ask Teacher", icon: "mail" },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/dashboard/student/billing", label: "Billing & Subscriptions", icon: "credit-card" },
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
  quizzes: "Quizzes",
  assignments: "Coursework Assignments",
  analytics: "Analytics",
  insights: "Material Flags",
  qa: "Q&A Moderation",
  grading: "Grading Queue",
  "question-bank": "Question Bank",
  questions: "Student Questions",
  browse: "Browse Courses",
  ask: "Ask AI",
  "ask-teacher": "Ask Teacher",
  teachers: "Teachers",
  students: "Students",
  lessons: "Lessons",
  inbox: "Student Inbox",
  create: "Create",
  billing: "Billing & Subscriptions",
  payments: "Payments",
  "password-resets": "Password Resets",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

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
    admin: "var(--error)",
    teacher: "var(--accent-primary)",
    student: "var(--accent-secondary)",
  };

  const roleLabel: Record<string, string> = {
    admin: "Administrator",
    teacher: "Teacher",
    student: "Student",
  };

  const isNavActive = (href: string) => {
    if (href === "/dashboard/admin" || href === "/dashboard/teacher" || href === "/dashboard/student") {
      return pathname === href;
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
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isNavActive(item.href) ? "active" : ""}`}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <SvgIcon name={item.icon as IconName} size={18} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* User Section at bottom */}
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
      </aside>

      {/* Main Area with Top Header */}
      <div style={{ flex: 1, marginLeft: "260px", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <NotificationBell />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                padding: "0.375rem 0.5rem",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "var(--bg-primary)",
                  border: "2px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  flexShrink: 0,
                }}
              >
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user.full_name}
                </div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 500,
                    color: roleBadgeColor[user.role],
                    textTransform: "capitalize",
                  }}
                >
                  {roleLabel[user.role] || user.role}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main id="main-content" className="animate-fade-in" role="main" style={{ padding: "2rem", flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
