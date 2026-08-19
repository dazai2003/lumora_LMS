"use client";

import React, { useState } from "react";
import SvgIcon from "@/components/SvgIcon";
import {
  StructuredNode,
  reindexTreeLabels,
  calculateNodePoints,
  calculateTotalTreeRawPoints,
  isLeafNode,
  findNodeById,
  insertChildNode,
  insertSiblingNode,
  deleteNodeById,
  moveNode,
  duplicateNode,
  duplicateNodeOnly,
  collectLeafAnswerableNodes,
  createBlankNode,
  getStructureSummary,
} from "@/lib/alStructuredTreeUtils";

export const STRUCTURED_FORMAT_OPTIONS = [
  { value: "structured_direct_recall", label: "1. Direct Factual Recall & Naming", desc: "Short factual answers, terms, structures, cells, or reagents" },
  { value: "structured_conceptual", label: "2. Short Conceptual Explanations", desc: "Scientific explanations with structured marking criteria" },
  { value: "structured_sequential", label: "3. Sequential Pathways & Chronology", desc: "Ordered steps, transmission paths, and experimental chronology" },
  { value: "structured_comparison", label: "4. Side-by-Side Comparisons", desc: "Dual-condition comparison tables requiring both corresponding criteria" },
  { value: "structured_diagram", label: "5. Diagrammatic / Genetics Deductions", desc: "Provided biological diagram/pedigree interpretation" },
  { value: "structured_matrix", label: "6. Structured Matrix Tables", desc: "Tabular matching grids with custom column headings" },
  { value: "structured_drawing", label: "7. Labelled Biological Drawings", desc: "Student drawing canvas area with required structures checklist" },
];

export interface StructuredSkeletonBuilderProps {
  initialNodes?: StructuredNode[];
  questionNumber?: number;
  onSaveStructure: (data: { nodes: StructuredNode[]; total_points: number }) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

export default function StructuredSkeletonBuilder({
  initialNodes,
  questionNumber = 1,
  onSaveStructure,
  onCancel,
  readOnly = false,
}: StructuredSkeletonBuilderProps) {
  // Tree Nodes State
  const [nodes, setNodes] = useState<StructuredNode[]>(() => {
    if (initialNodes && initialNodes.length > 0) {
      return reindexTreeLabels(initialNodes);
    }
    // Clean default skeleton: Section A (1, 2), Section B (1, 2), Section C (1)
    const nodeA = createBlankNode("structured_direct_recall", 10);
    nodeA.children = [
      createBlankNode("structured_direct_recall", 4),
      createBlankNode("structured_conceptual", 6),
    ];
    const nodeB = createBlankNode("structured_comparison", 14);
    nodeB.children = [
      createBlankNode("structured_comparison", 6),
      createBlankNode("structured_matrix", 8),
    ];
    const nodeC = createBlankNode("structured_diagram", 16);
    nodeC.children = [
      createBlankNode("structured_diagram", 16),
    ];
    return reindexTreeLabels([nodeA, nodeB, nodeC]);
  });

  // Selected Node in Tree Inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => {
    const leaves = collectLeafAnswerableNodes(nodes);
    return leaves[0]?.id || nodes[0]?.id || "";
  });

  // Metrics and Summary
  const summary = getStructureSummary(nodes);
  const totalRawPoints = summary.totalRawPoints;
  const scaledMarks = summary.scaledMarks;
  const isOverAllocated = summary.isOverAllocated;
  const isComplete = summary.isComplete;
  const pointsRemaining = summary.pointsRemaining;

  const selectedNode = findNodeById(nodes, selectedNodeId) || nodes[0];
  const leafNodes = collectLeafAnswerableNodes(nodes);

  // Helper to update a node in the tree
  const updateNode = (id: string, updater: (n: StructuredNode) => StructuredNode) => {
    function updateRecursive(list: StructuredNode[]): StructuredNode[] {
      return list.map((node) => {
        if (node.id === id) {
          return updater(node);
        }
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: updateRecursive(node.children),
          };
        }
        return node;
      });
    }
    const updated = updateRecursive(nodes);
    setNodes(reindexTreeLabels(updated));
  };

  // Node Point Input Handler for leaf nodes
  const handleLeafPointChange = (id: string, newPoints: number) => {
    const safePoints = Math.max(0.5, Math.round(newPoints * 2) / 2);
    updateNode(id, (n) => ({ ...n, points: safePoints }));
  };

  // Step Points by Delta (+/- 0.5 or 1.0)
  const handleStepLeafPoints = (id: string, delta: number) => {
    const target = findNodeById(nodes, id);
    if (!target) return;
    const cur = target.points || 2;
    handleLeafPointChange(id, Math.max(0.5, cur + delta));
  };

  // Add Root Section (e.g. D, E)
  const handleAddRootSection = () => {
    const newSection = createBlankNode("structured_direct_recall", 10);
    newSection.children = [createBlankNode("structured_direct_recall", 10)];
    const updated = [...nodes, newSection];
    const reindexed = reindexTreeLabels(updated);
    setNodes(reindexed);
    setSelectedNodeId(newSection.children[0].id);
  };

  // Handle Save Structure
  const handleSave = () => {
    if (isOverAllocated) {
      alert(`Cannot save: Total raw points (${totalRawPoints}) exceeds the 40-point maximum.`);
      return;
    }
    onSaveStructure({
      nodes,
      total_points: totalRawPoints,
    });
  };

  // Render Tree Hierarchy Nodes
  const renderTreeNodes = (list: StructuredNode[], depth = 0) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", paddingLeft: depth > 0 ? "1.25rem" : 0 }}>
        {list.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const isLeaf = isLeafNode(node);
          const points = calculateNodePoints(node);
          const formatInfo = STRUCTURED_FORMAT_OPTIONS.find((f) => f.value === node.format_type);

          return (
            <div key={node.id} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: depth === 0 ? "0.65rem 0.9rem" : "0.5rem 0.8rem",
                  borderRadius: "var(--radius-sm)",
                  background: isSelected
                    ? "var(--accent-subtle, rgba(99, 102, 241, 0.14))"
                    : depth === 0
                    ? "var(--bg-card)"
                    : "rgba(255, 255, 255, 0.03)",
                  border: isSelected
                    ? "2px solid var(--accent-primary)"
                    : depth === 0
                    ? "1px solid var(--border)"
                    : "1px dashed var(--border)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onClick={() => setSelectedNodeId(node.id)}
              >
                {/* Node Identity: Label + Level Tag + Format */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: depth === 0 ? "1.05rem" : "0.92rem",
                      color: depth === 0 ? "var(--accent-primary)" : "var(--text-primary)",
                      minWidth: "1.8rem",
                    }}
                  >
                    {node.label}
                  </span>

                  {depth === 0 && (
                    <span className="badge badge-secondary" style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                      Section Container
                    </span>
                  )}

                  {isLeaf && (
                    <span
                      className="badge badge-primary"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {formatInfo?.label.split(" ")[1] || node.format_type}
                    </span>
                  )}

                  {/* Leaf Points Indicator / Inline Stepper */}
                  {isLeaf ? (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ width: "22px", height: "22px", fontSize: "0.8rem", padding: 0 }}
                        disabled={readOnly || (node.points || 0) <= 0.5}
                        onClick={() => handleStepLeafPoints(node.id, -0.5)}
                        title="Decrease raw points"
                      >
                        -
                      </button>
                      <span
                        className="badge badge-info"
                        style={{ fontSize: "0.75rem", fontWeight: 700, padding: "0.2rem 0.45rem", minWidth: "46px", textAlign: "center" }}
                      >
                        {node.points} pts
                      </span>
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ width: "22px", height: "22px", fontSize: "0.8rem", padding: 0 }}
                        disabled={readOnly}
                        onClick={() => handleStepLeafPoints(node.id, 0.5)}
                        title="Increase raw points"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="badge badge-secondary" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                      {points} pts (sum)
                    </span>
                  )}
                </div>

                {/* Node Structure Action Buttons */}
                {!readOnly && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    {/* Add Child Node */}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "0.725rem", padding: "0.2rem 0.45rem" }}
                      title={depth === 0 ? "Add subquestion under this section" : "Add deeper subpart under this node"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = insertChildNode(nodes, node.id, "structured_direct_recall", 2);
                        setNodes(updated);
                      }}
                    >
                      <SvgIcon name="plus" size={12} /> {depth === 0 ? "Add Subquestion" : "Add Subpart"}
                    </button>

                    {/* Duplicate Node */}
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ padding: "0.25rem" }}
                      title="Duplicate node"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNodes(duplicateNode(nodes, node.id, true));
                      }}
                    >
                      <SvgIcon name="copy" size={13} />
                    </button>

                    {/* Move Up */}
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ padding: "0.25rem" }}
                      title="Move Up"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNodes(moveNode(nodes, node.id, "up"));
                      }}
                    >
                      <SvgIcon name="chevron-up" size={13} />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ padding: "0.25rem" }}
                      title="Move Down"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNodes(moveNode(nodes, node.id, "down"));
                      }}
                    >
                      <SvgIcon name="chevron-down" size={13} />
                    </button>

                    {/* Delete Node */}
                    {nodes.length > 1 && (
                      <button
                        type="button"
                        className="btn-icon btn-icon-danger"
                        style={{ padding: "0.25rem" }}
                        title="Delete node"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (node.children && node.children.length > 0) {
                            if (!window.confirm(`Delete part ${node.label} and all its ${node.children.length} subparts?`)) return;
                          }
                          const updated = deleteNodeById(nodes, node.id);
                          setNodes(updated);
                          if (selectedNodeId === node.id && updated.length > 0) {
                            setSelectedNodeId(updated[0].id);
                          }
                        }}
                      >
                        <SvgIcon name="trash" size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Render Child Hierarchy Recursively */}
              {node.children && node.children.length > 0 && renderTreeNodes(node.children, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      {/* Header Info & Real-Time 40-Point Cap Status Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: isOverAllocated
            ? "rgba(239, 68, 68, 0.12)"
            : isComplete
            ? "rgba(16, 185, 129, 0.12)"
            : "rgba(99, 102, 241, 0.08)",
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius-md)",
          border: isOverAllocated
            ? "1px solid var(--danger)"
            : isComplete
            ? "1px solid var(--success)"
            : "1px solid var(--border)",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>Question {questionNumber} Structure Blueprint</span>
            <span
              className={`badge ${isOverAllocated ? "badge-danger" : isComplete ? "badge-success" : "badge-info"}`}
              style={{ fontSize: "0.78rem" }}
            >
              {totalRawPoints} / 40 Raw Points ({scaledMarks} / 100 Final Marks)
            </span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            {isOverAllocated
              ? `OVER-ALLOCATED by ${totalRawPoints - 40} raw points. Reduce leaf marks to proceed.`
              : isComplete
              ? "Perfect 40/40 allocation achieved (100 scaled marks)."
              : `${pointsRemaining} raw points remaining to reach full 40-point allocation.`}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!readOnly && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
              onClick={handleAddRootSection}
            >
              <SvgIcon name="plus" size={14} /> Add Section (e.g. Section D)
            </button>
          )}
        </div>
      </div>

      {/* Two-Column Structure Builder Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "1.1rem" }}>
        
        {/* LEFT COLUMN: VISUAL HIERARCHY TREE */}
        <div
          className="card"
          style={{
            padding: "1rem",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            maxHeight: "560px",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Visual Hierarchy Tree ({summary.sections.length} Sections &middot; {leafNodes.length} Subparts)
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Click any node to configure
            </span>
          </div>

          {renderTreeNodes(nodes, 0)}
        </div>

        {/* RIGHT COLUMN: NODE INSPECTOR & STRUCTURE SUMMARY */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          
          {/* Node Inspector Panel */}
          {selectedNode && (
            <div
              className="card"
              style={{
                padding: "1rem",
                background: "var(--bg-secondary)",
                border: "1.5px solid var(--accent-primary)",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <span className="badge badge-primary" style={{ fontSize: "0.82rem", fontWeight: 800 }}>
                    Node {selectedNode.label}
                  </span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {isLeafNode(selectedNode) ? "Subpart Question" : "Structural Section"}
                  </span>
                </div>
              </div>

              {/* Format Metadata Selector (For Leaf Nodes) */}
              {isLeafNode(selectedNode) && (
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                    Question Format Pattern (Metadata Only) *
                  </label>
                  <select
                    className="select"
                    disabled={readOnly}
                    value={selectedNode.format_type}
                    onChange={(e) => updateNode(selectedNode.id, (n) => ({ ...n, format_type: e.target.value }))}
                  >
                    {STRUCTURED_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: "0.73rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
                    Sets structural metadata blueprint. Content will be authored in the Paper 2A form.
                  </p>
                </div>
              )}

              {/* Point Allocation Stepper */}
              {isLeafNode(selectedNode) && (
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                    Raw Points Allocation (Max 40 Raw Points per Question)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem", fontWeight: 700 }}
                      disabled={readOnly || (selectedNode.points || 0) <= 0.5}
                      onClick={() => handleStepLeafPoints(selectedNode.id, -0.5)}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      className="input"
                      disabled={readOnly}
                      style={{ width: "65px", textAlign: "center", fontWeight: 700, fontSize: "0.85rem" }}
                      value={selectedNode.points}
                      onChange={(e) => handleLeafPointChange(selectedNode.id, parseFloat(e.target.value) || 0.5)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem", fontWeight: 700 }}
                      disabled={readOnly}
                      onClick={() => handleStepLeafPoints(selectedNode.id, 0.5)}
                    >
                      +
                    </button>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700, marginLeft: "0.2rem" }}>
                      pts ({selectedNode.points * 2.5} marks)
                    </span>
                  </div>

                  {!readOnly && (
                    <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.4rem" }}>
                      {[1, 2, 4, 6].map((pVal) => (
                        <button
                          key={pVal}
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            fontSize: "0.725rem",
                            padding: "0.2rem 0.45rem",
                            background: selectedNode.points === pVal ? "var(--accent-primary)" : undefined,
                            color: selectedNode.points === pVal ? "#fff" : undefined,
                          }}
                          onClick={() => handleLeafPointChange(selectedNode.id, pVal)}
                        >
                          {pVal}pt
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Node Quick Duplication Options */}
              {!readOnly && (
                <div style={{ display: "flex", gap: "0.4rem", paddingTop: "0.4rem", borderTop: "1px dashed var(--border)" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", flex: 1 }}
                    onClick={() => setNodes(duplicateNode(nodes, selectedNode.id, true))}
                  >
                    <SvgIcon name="copy" size={12} /> Duplicate + Children
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", flex: 1 }}
                    onClick={() => setNodes(duplicateNodeOnly(nodes, selectedNode.id))}
                  >
                    <SvgIcon name="copy" size={12} /> Duplicate Node Only
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Structure Summary Live Breakdown */}
          <div
            className="card"
            style={{
              padding: "0.9rem",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Sections Marks Breakdown
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {summary.sections.map((sec) => (
                <div
                  key={sec.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.8rem",
                    padding: "0.3rem 0.5rem",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span style={{ fontWeight: 700, color: "var(--accent-primary)" }}>
                    Section {sec.label} ({sec.leafCount} parts)
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {sec.points} pts <span style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>({sec.scaledMarks} marks)</span>
                  </span>
                </div>
              ))}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.84rem",
                  fontWeight: 800,
                  padding: "0.35rem 0.5rem",
                  borderTop: "1px solid var(--border)",
                  marginTop: "0.2rem",
                }}
              >
                <span>TOTAL ALLOCATION</span>
                <span style={{ color: isComplete ? "var(--success)" : isOverAllocated ? "var(--danger)" : "var(--accent-primary)" }}>
                  {totalRawPoints} / 40 pts ({scaledMarks} / 100)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Actions Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "0.75rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          {summary.sections.map(s => `Section ${s.label}: ${s.points} pts`).join("  \u00B7  ")}
          <span style={{ marginLeft: "0.5rem", fontWeight: 800, color: isOverAllocated ? "var(--danger)" : "var(--accent-primary)" }}>
            [TOTAL: {totalRawPoints}/40]
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: "0.88rem", padding: "0.5rem 1.3rem" }}
            disabled={isOverAllocated}
            onClick={handleSave}
          >
            Save Structure
          </button>
        </div>
      </div>
    </div>
  );
}
