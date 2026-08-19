"use client";

import React, { useState, useEffect } from "react";
import { resolveDiagramImageUrl } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";

export interface DiagramItem {
  url: string;
  label?: string;
  description?: string;
}

interface QuestionDiagramImageProps {
  diagramUrl?: string | null;
  diagrams?: (DiagramItem | string)[] | null;
  requiresImage?: boolean;
  imageDescription?: string;
  questionNumber?: number;
  isEditing?: boolean;
  onUploadImage?: (file: File) => void;
  onRemoveImage?: () => void;
  showDescription?: boolean;
}

export default function QuestionDiagramImage({
  diagramUrl,
  diagrams,
  requiresImage,
  imageDescription,
  questionNumber,
  isEditing = false,
  onUploadImage,
  onRemoveImage,
  showDescription = true,
}: QuestionDiagramImageProps) {
  const [imgStatus, setImgStatus] = useState<"loading" | "success" | "error">("loading");
  const [activeZoomUrl, setActiveZoomUrl] = useState<string | null>(null);
  const [activeZoomLabel, setActiveZoomLabel] = useState<string | null>(null);

  // Normalize diagrams list (handles single diagramUrl, comma-separated URLs, or array of DiagramItems)
  const resolvedDiagrams: DiagramItem[] = React.useMemo(() => {
    if (Array.isArray(diagrams) && diagrams.length > 0) {
      return diagrams.map((item, idx) => {
        if (typeof item === "string") {
          return {
            url: resolveDiagramImageUrl(item),
            label: `Figure ${String.fromCharCode(65 + idx)}`,
          };
        }
        return {
          url: resolveDiagramImageUrl(item.url),
          label: item.label || `Figure ${String.fromCharCode(65 + idx)}`,
          description: item.description,
        };
      });
    }

    if (diagramUrl) {
      const parts = diagramUrl.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map((partUrl, idx) => ({
          url: resolveDiagramImageUrl(partUrl),
          label: `Figure ${String.fromCharCode(65 + idx)}`,
        }));
      }
      return [
        {
          url: resolveDiagramImageUrl(diagramUrl),
          label: "",
          description: imageDescription,
        },
      ];
    }

    return [];
  }, [diagramUrl, diagrams, imageDescription]);

  const hasImages = resolvedDiagrams.length > 0;

  useEffect(() => {
    setImgStatus("loading");
  }, [diagramUrl, diagrams]);

  // CASE 1: No image required and no images provided
  if (!requiresImage && !hasImages) {
    return null;
  }

  // CASE 2: Image required but not yet attached
  if (requiresImage && !hasImages) {
    // In student exam view: Quiet, non-disruptive fallback
    if (!isEditing) {
      return null;
    }

    // In teacher editing view: Actionable upload box
    return (
      <div
        style={{
          margin: "0.6rem 0",
          padding: "0.85rem",
          borderRadius: "var(--radius-sm)",
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "var(--warning)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <SvgIcon name="alert-triangle" size={15} /> VISUAL REQUIREMENT: IMAGE REQUIRED
        </div>
        {imageDescription && (
          <div style={{ fontSize: "0.8rem", color: "var(--text-primary)" }}>
            <strong>Suggested visual description:</strong> {imageDescription}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem" }}>
          {onUploadImage && (
            <label
              className="btn btn-primary"
              style={{ fontSize: "0.78rem", padding: "0.35rem 0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <SvgIcon name="upload" size={14} /> Upload Diagram Image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) onUploadImage(e.target.files[0]);
                }}
              />
            </label>
          )}
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
            No image attached yet. Required for student exam view.
          </span>
        </div>
      </div>
    );
  }

  // CASE 3: Images available -> Render responsive container with Lightbox support
  return (
    <>
      <div
        style={{
          margin: "0.75rem 0 1.25rem",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: resolvedDiagrams.length > 1 ? "repeat(auto-fit, minmax(220px, 1fr))" : "1fr",
            gap: "1rem",
            width: "100%",
            maxWidth: resolvedDiagrams.length > 1 ? "680px" : "480px",
          }}
        >
          {resolvedDiagrams.map((diag, idx) => (
            <div
              key={idx}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "130px",
                position: "relative",
                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.04)",
              }}
            >
              {/* Optional Figure Label */}
              {diag.label && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "var(--accent-primary)",
                    marginBottom: "0.4rem",
                    textAlign: "center",
                  }}
                >
                  {diag.label}
                </div>
              )}

              {/* Loading Indicator */}
              {imgStatus === "loading" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", padding: "1.5rem" }}>
                  <div className="spinner" style={{ width: "20px", height: "20px" }} />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Loading diagram...</span>
                </div>
              )}

              {/* Error Fallback */}
              {imgStatus === "error" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "1rem",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <SvgIcon name="image" size={16} /> Question diagram unavailable
                  </div>
                  {isEditing && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", marginTop: "0.3rem" }}
                      onClick={() => setImgStatus("loading")}
                    >
                      Try Again
                    </button>
                  )}
                </div>
              )}

              {/* Actual Image Element with Click-to-Zoom */}
              <div
                style={{
                  position: "relative",
                  cursor: "pointer",
                  display: imgStatus === "error" ? "none" : "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "100%",
                }}
                onClick={() => {
                  setActiveZoomUrl(diag.url);
                  setActiveZoomLabel(diag.label || `Question ${questionNumber || ""}`);
                }}
                title="Click to zoom and view full resolution"
              >
                <img
                  src={diag.url}
                  alt={diag.label || `Diagram for Question ${questionNumber || ""}`}
                  onLoad={() => setImgStatus("success")}
                  onError={(e) => {
                    console.warn(`Failed to load diagram image from ${diag.url}`);
                    setImgStatus("error");
                  }}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "260px",
                    objectFit: "contain",
                    borderRadius: "var(--radius-sm)",
                    transition: "transform 0.15s ease",
                  }}
                />

                {/* Subtle Zoom Hint Overlay */}
                {imgStatus === "success" && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "4px",
                      right: "4px",
                      background: "rgba(0, 0, 0, 0.6)",
                      color: "#fff",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "0.7rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <SvgIcon name="maximize" size={11} /> Zoom
                  </div>
                )}
              </div>

              {/* Description Caption */}
              {showDescription && diag.description && imgStatus === "success" && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.4rem", textAlign: "center", fontStyle: "italic" }}>
                  {diag.description}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Teacher Editing / Management Controls */}
        {isEditing && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.25rem" }}>
            {onUploadImage && (
              <label
                className="btn btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
              >
                <SvgIcon name="image" size={13} /> Replace Image
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) onUploadImage(e.target.files[0]);
                  }}
                />
              </label>
            )}

            {onRemoveImage && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", color: "var(--danger)" }}
                onClick={onRemoveImage}
              >
                <SvgIcon name="trash" size={13} /> Remove Image
              </button>
            )}
          </div>
        )}
      </div>

      {/* LIGHTBOX / ZOOM MODAL */}
      {activeZoomUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.82)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
          }}
          onClick={() => setActiveZoomUrl(null)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "var(--bg-card)",
              borderRadius: "var(--radius-md)",
              padding: "1rem",
              boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
                paddingBottom: "0.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                {activeZoomLabel || "Diagram Zoom Preview"}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                onClick={() => setActiveZoomUrl(null)}
              >
                <SvgIcon name="x" size={14} /> Close
              </button>
            </div>

            <img
              src={activeZoomUrl}
              alt={activeZoomLabel || "Enlarged Biological Diagram"}
              style={{
                maxWidth: "85vw",
                maxHeight: "75vh",
                objectFit: "contain",
                borderRadius: "var(--radius-sm)",
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
