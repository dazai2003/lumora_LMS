"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import lumoraLogo from "@/components/ico/Black_background_Logo.png";
import { SvgIcon } from "@/components/SvgIcon";

export default function NotFound() {
  const { user } = useAuth();

  const getDashboardHref = () => {
    if (!user) return "/login";
    switch (user.role) {
      case "admin":
        return "/dashboard/admin";
      case "teacher":
        return "/dashboard/teacher";
      case "student":
        return "/dashboard/student";
      default:
        return "/login";
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        background: "var(--bg-primary, #0f172a)",
        color: "var(--text-primary, #f8fafc)",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background ambient glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(15, 23, 42, 0) 70%)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      {/* Lumora Logo */}
      <div style={{ marginBottom: "2rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Image
          src={lumoraLogo}
          alt="Lumora LMS"
          width={40}
          height={40}
          style={{ borderRadius: "8px", objectFit: "contain" }}
          priority
        />
        <span style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          LUMORA <span style={{ color: "var(--accent-primary, #6366f1)" }}>LMS</span>
        </span>
      </div>

      {/* Card Container */}
      <div
        className="card"
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "2.5rem 2rem",
          background: "var(--bg-card, #1e293b)",
          border: "1px solid var(--border, #334155)",
          borderRadius: "var(--radius-lg, 16px)",
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.5)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: "4.5rem",
            fontWeight: 900,
            lineHeight: 1,
            background: "linear-gradient(135deg, var(--accent-primary, #6366f1) 0%, #a855f7 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "0.5rem",
          }}
        >
          404
        </div>

        <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--text-primary, #f8fafc)" }}>
          Page Not Found
        </h1>

        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #94a3b8)", lineHeight: 1.6, margin: "0 0 2rem" }}>
          The page or resource you are looking for does not exist, may have moved, or your session may need to be refreshed.
        </p>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Link
            href={getDashboardHref()}
            className="btn btn-primary"
            style={{
              padding: "0.85rem 1.5rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              textDecoration: "none",
              borderRadius: "var(--radius-md, 8px)",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
            }}
          >
            <SvgIcon name="grid" size={18} />
            {user ? "Return to Dashboard" : "Go to Login Page"}
          </Link>

          {user && (
            <Link
              href="/login"
              className="btn btn-secondary"
              style={{
                padding: "0.75rem 1.5rem",
                fontSize: "0.88rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                textDecoration: "none",
                borderRadius: "var(--radius-md, 8px)",
              }}
            >
              <SvgIcon name="log-out" size={16} />
              Switch Account / Re-login
            </Link>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-ghost"
            style={{
              padding: "0.6rem 1rem",
              fontSize: "0.82rem",
              color: "var(--text-muted, #64748b)",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
            }}
          >
            <SvgIcon name="refresh" size={14} />
            Reload Current Page
          </button>
        </div>
      </div>

      {/* Footer support text */}
      <div style={{ marginTop: "2rem", fontSize: "0.8rem", color: "var(--text-muted, #64748b)" }}>
        Lumora Advanced Level Learning Management System
      </div>
    </div>
  );
}
