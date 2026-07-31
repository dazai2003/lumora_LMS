"use client";

import React, { useState } from "react";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";

interface MaterialViewerProps {
  source: {
    material_id?: number;
    title: string;
    material_type: string;
    file_url?: string;
    content?: string;
    extracted_text?: string;
    relevance?: number;
  };
  onClose: () => void;
}

export default function MaterialViewer({ source, onClose }: MaterialViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getBackendUrl = (path?: string) => {
    if (!path) return "";
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    // Remove /api from the base URL to point to the root where /uploads is mounted
    const rootUrl = baseUrl.replace("/api", "");
    return `${rootUrl}${path}`;
  };

  const renderContent = () => {
    switch (source.material_type) {
      case "pdf":
        if (source.file_url) {
          return (
            <iframe
              src={`${getBackendUrl(source.file_url)}#toolbar=0`}
              style={{ width: "100%", height: "100%", border: "none", borderRadius: "8px" }}
              title={source.title}
            />
          );
        }
        break;
      case "video":
        if (source.file_url) {
          return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", borderRadius: "8px", minHeight: "300px" }}>
                <video
                  src={getBackendUrl(source.file_url)}
                  controls
                  style={{ maxWidth: "100%", maxHeight: "100%" }}
                />
              </div>
              {source.extracted_text && (
                <div style={{ 
                  flex: "0 0 35%", 
                  display: "flex", 
                  flexDirection: "column",
                  background: "var(--bg-body)", 
                  border: "1px solid var(--border)", 
                  borderRadius: "8px", 
                  overflow: "hidden" 
                }}>
                  <div style={{ padding: "0.75rem 1rem", background: "rgba(0,0,0,0.1)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <SvgIcon name="edit" size={18} />
                    <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>Video Transcript (AI Generated)</h4>
                  </div>
                  <div style={{ padding: "1rem", overflowY: "auto", color: "var(--text-primary)", fontSize: "0.95rem", lineHeight: 1.7, flex: 1 }}>
                    {source.extracted_text}
                  </div>
                </div>
              )}
            </div>
          );
        }
        break;
      case "image":
        if (source.file_url) {
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "rgba(0,0,0,0.2)", borderRadius: "8px", overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getBackendUrl(source.file_url)}
                alt={source.title}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
          );
        }
        break;
      case "note":
      default:
        const textContent = source.content || source.extracted_text;
        if (textContent) {
          return (
            <div style={{ padding: "1.5rem", height: "100%", overflowY: "auto", background: "rgba(255,255,255,0.03)", borderRadius: "8px", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.9rem" }}>
              {textContent}
            </div>
          );
        }
        break;
    }
    
    // Fallback if no specific content can be rendered
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", padding: "2rem", textAlign: "center" }}>
        <SvgIcon name="file-text" size={48} style={{ marginBottom: "1rem", opacity: 0.4 }} />
        <h3>Preview Not Available</h3>
        <p style={{ marginTop: "0.5rem" }}>
          We could not load a preview for this {source.material_type}. 
          {source.extracted_text && " However, we do have the text content below:"}
        </p>
        {source.extracted_text && (
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", textAlign: "left", width: "100%", maxHeight: "300px", overflowY: "auto", whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
            {source.extracted_text}
          </div>
        )}
      </div>
    );
  };

  const getIconName = (): IconName => {
    switch (source.material_type) {
      case "pdf": return "file-text";
      case "video": return "video";
      case "image": return "image";
      case "note": return "edit";
      default: return "file-text";
    }
  };

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      height: "100%", 
      background: "var(--surface)", 
      borderLeft: "1px solid rgba(255,255,255,0.1)",
      position: isFullscreen ? "fixed" : "relative",
      top: isFullscreen ? 0 : "auto",
      left: isFullscreen ? 0 : "auto",
      right: isFullscreen ? 0 : "auto",
      bottom: isFullscreen ? 0 : "auto",
      zIndex: isFullscreen ? 9999 : 1,
      width: isFullscreen ? "100vw" : "100%",
    }}>
      {/* Header */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        padding: "1rem 1.5rem",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(0,0,0,0.2)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", overflow: "hidden" }}>
          <span style={{ fontSize: "1.25rem" }}><SvgIcon name={getIconName()} size={20} /></span>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {source.title}
          </h3>
          {source.relevance && (
            <span style={{ 
              fontSize: "0.7rem", 
              background: "rgba(99, 102, 241, 0.2)", 
              color: "#818cf8",
              padding: "2px 6px",
              borderRadius: "10px",
              fontWeight: 600
            }}>
              {Math.round(source.relevance * 100)}% Match
            </span>
          )}
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {source.file_url && (
            <a 
              href={getBackendUrl(source.file_url)} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center", textDecoration: "none" }}
              title="Open in new tab"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          )}
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center" }}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
            )}
          </button>
          <button 
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center" }}
            title="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, padding: "1rem", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {renderContent()}
      </div>
    </div>
  );
}
