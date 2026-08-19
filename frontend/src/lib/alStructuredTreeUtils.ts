/**
 * Lumora LMS — A/L Biology Structured Question Tree & Auto-Numbering Engine.
 * 
 * Provides canonical tree manipulation, arbitrary-depth recursive indexing,
 * standard G.C.E. A/L automatic labeling (A -> 1 -> (a) -> (i)), dynamic point roll-up (40-point raw cap),
 * metadata-only format management, and full question cloning.
 */

export interface StructuredMarkingPoint {
  criterion: string;
  points: number;
}

export interface StructuredMarkingRules {
  unit_required?: boolean;
  required_unit?: string;
  exact_spelling_required?: boolean;
  underline_required?: boolean;
  taxonomic_format_required?: boolean;
  all_or_nothing?: boolean;
  both_conditions_required?: boolean;
  sequence_order_required?: boolean;
  label_required?: boolean;
  custom_rules?: string[];
}

export interface StructuredDiagramInfo {
  requires_image?: boolean;
  image_url?: string;
  image_description?: string;
  expected_interpretation?: string;
  diagram_type?: "PRE_SUPPLIED" | "STUDENT_DRAWING";
}

export interface StructuredDrawingInfo {
  canvas_description?: string;
  required_structures?: string[];
  required_flow?: string;
}

export interface StructuredTableData {
  headers: string[];
  rows: string[][];
}

export interface StructuredSequenceData {
  expected_sequence: string[];
  sequence_order_required?: boolean;
  sequence_all_or_nothing?: boolean;
  separator_flexible?: boolean;
  alternative_separator_allowed?: string;
}

export interface StructuredComparisonPair {
  left: string;
  right: string;
  points: number;
}

export interface StructuredComparisonData {
  pairs: StructuredComparisonPair[];
  both_conditions_required?: boolean;
}

export interface StructuredNode {
  id: string; // Stable internal unique ID (never use display label as DB ID)
  parent_id?: string | null;
  label: string; // Dynamically derived display label e.g. "A", "1", "(a)", "(i)"
  format_type: string;
  prompt: string;
  points: number;
  model_answer?: string;
  marking_points?: StructuredMarkingPoint[];
  marking_rules?: StructuredMarkingRules;
  strict_marking_rules?: {
    require_correct_spelling?: boolean;
    require_units?: boolean;
    require_binomial_format?: boolean;
  };
  sequence_items?: string[];
  comparison_header_1?: string;
  comparison_header_2?: string;
  comparison_pairs?: Array<{ criterion: string; value_1: string; value_2: string }>;
  matrix_data?: {
    col_headers?: string[];
    rows?: Array<{ item: string; expected: string }>;
  };
  drawing_prompt?: string;
  required_labels?: string[];
  diagram_info?: StructuredDiagramInfo;
  drawing_info?: StructuredDrawingInfo;
  table_data?: StructuredTableData;
  sequence_data?: StructuredSequenceData;
  comparison_data?: StructuredComparisonData;
  difficulty?: string;
  cognitive_level?: string;
  children?: StructuredNode[];
}

export interface SectionSummaryItem {
  id: string;
  label: string;
  points: number;
  scaledMarks: number;
  leafCount: number;
}

export interface StructureSummary {
  sections: SectionSummaryItem[];
  formatCounts: Record<string, number>;
  totalRawPoints: number;
  scaledMarks: number;
  isOverAllocated: boolean;
  isComplete: boolean;
  pointsRemaining: number;
}

const ROMAN_NUMERALS = [
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
  "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"
];

/**
 * Generates official G.C.E. A/L standard display label from tree depth and sibling index.
 * Depth 0: (A), (B), (C), (D)... (Section Containers)
 * Depth 1: (i), (ii), (iii), (iv)... (Child Sub-questions)
 * Depth 2: (a), (b), (c)... (Sub-parts)
 * Depth 3: (i), (ii), (iii)... (Roman Numerals)
 * Depth 4+: (a), (b), (c)...
 */
export function getLabelForIndex(depth: number, index: number): string {
  if (depth === 0) {
    // Root level section containers: (A), (B), (C), (D)...
    return `(${String.fromCharCode(65 + (index % 26))})`;
  } else if (depth === 1) {
    // Child sub-questions: (i), (ii), (iii)...
    const num = ROMAN_NUMERALS[index] || `${index + 1}`;
    return `(${num})`;
  } else if (depth === 2) {
    // Grandchildren sub-parts: (a), (b), (c)...
    const letter = String.fromCharCode(97 + (index % 26));
    return `(${letter})`;
  } else if (depth === 3) {
    // Great-grandchildren: (i), (ii), (iii)...
    const num = ROMAN_NUMERALS[index] || `${index + 1}`;
    return `(${num})`;
  } else {
    // Deeper depths: (a), (b), (c)...
    const letter = String.fromCharCode(97 + (index % 26));
    return `(${letter})`;
  }
}

/**
 * Formats any raw label to a clean, canonical A/L label without leading dots or trailing artifacts.
 */
export function formatDisplayLabel(rawLabel: string | undefined | null, depth = 0, index = 0): string {
  let lbl = (rawLabel || "").trim();
  if (!lbl) {
    return getLabelForIndex(depth, index);
  }
  // Strip trailing dot if present
  lbl = lbl.replace(/\.+$/, "").trim();

  // If already enclosed in parentheses like (A), (i), (a), return as is
  if (lbl.startsWith("(") && lbl.endsWith(")")) {
    return lbl;
  }
  // If single letter at depth 0 e.g. "A", format as "(A)"
  if (depth === 0 && /^[A-Z]$/i.test(lbl)) {
    return `(${lbl.toUpperCase()})`;
  }
  // If number at depth 1 e.g. "1", format as "(i)" or "(1)"
  if (depth === 1 && /^\d+$/.test(lbl)) {
    const numIdx = parseInt(lbl, 10) - 1;
    const roman = ROMAN_NUMERALS[numIdx];
    return roman ? `(${roman})` : `(${lbl})`;
  }
  // If letter e.g. "a", format as "(a)"
  if (/^[a-z]$/i.test(lbl)) {
    return `(${lbl.toLowerCase()})`;
  }
  return `(${lbl})`;
}

/**
 * Recursively re-indexes all nodes in the tree so that sibling labels and parent_ids
 * are completely consistent, regardless of deletions, additions, or moves.
 */
export function reindexTreeLabels(
  nodes: StructuredNode[],
  depth = 0,
  parentId: string | null = null
): StructuredNode[] {
  return nodes.map((node, index) => {
    const computedLabel = getLabelForIndex(depth, index);
    const updatedChildren = node.children && node.children.length > 0
      ? reindexTreeLabels(node.children, depth + 1, node.id)
      : [];

    return {
      ...node,
      parent_id: parentId,
      label: computedLabel,
      children: updatedChildren,
    };
  });
}

/**
 * Computes points for a node.
 * If the node has children, its points are strictly the sum of all descendant leaf points.
 * If it is a leaf, its own points value is returned.
 */
export function calculateNodePoints(node: StructuredNode): number {
  if (node.children && node.children.length > 0) {
    return node.children.reduce((sum, child) => sum + calculateNodePoints(child), 0);
  }
  return Number(node.points) || 0;
}

/**
 * Computes total raw points for the entire question (sum of root parts).
 */
export function calculateTotalTreeRawPoints(nodes: StructuredNode[]): number {
  return nodes.reduce((sum, rootNode) => sum + calculateNodePoints(rootNode), 0);
}

export const calculateTotalRawPoints = calculateTotalTreeRawPoints;

/**
 * Returns true if a node is an answerable leaf node (has no children).
 */
export function isLeafNode(node: StructuredNode): boolean {
  return !node.children || node.children.length === 0;
}

/**
 * Recursively searches for a node by stable internal ID.
 */
export function findNodeById(nodes: StructuredNode[], targetId: string): StructuredNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Finds the parent of a node by child ID.
 */
export function findParentNode(nodes: StructuredNode[], childId: string): StructuredNode | null {
  for (const node of nodes) {
    if (node.children && node.children.some((c) => c.id === childId)) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findParentNode(node.children, childId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Collects all leaf (answerable) nodes in depth-first traversal order.
 */
export function collectLeafAnswerableNodes(nodes: StructuredNode[]): StructuredNode[] {
  const leaves: StructuredNode[] = [];
  function traverse(list: StructuredNode[]) {
    for (const node of list) {
      if (isLeafNode(node)) {
        leaves.push(node);
      } else if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }
  traverse(nodes);
  return leaves;
}

/**
 * Generates comprehensive structure summary breakdown (Sections roll-up, 40-pt gauge, format counts).
 */
export function getStructureSummary(nodes: StructuredNode[]): StructureSummary {
  const sections: SectionSummaryItem[] = nodes.map((sec) => {
    const pts = calculateNodePoints(sec);
    const leaves = collectLeafAnswerableNodes([sec]);
    return {
      id: sec.id,
      label: sec.label,
      points: pts,
      scaledMarks: Math.round(pts * 2.5 * 10) / 10,
      leafCount: leaves.length,
    };
  });

  const leaves = collectLeafAnswerableNodes(nodes);
  const formatCounts: Record<string, number> = {};
  for (const leaf of leaves) {
    const fmt = leaf.format_type || "structured_direct_recall";
    formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
  }

  const totalRawPoints = calculateTotalTreeRawPoints(nodes);
  const scaledMarks = Math.round(totalRawPoints * 2.5 * 10) / 10;
  const isOverAllocated = totalRawPoints > 40.0;
  const isComplete = totalRawPoints === 40.0;
  const pointsRemaining = Math.max(0, Math.round((40.0 - totalRawPoints) * 10) / 10);

  return {
    sections,
    formatCounts,
    totalRawPoints,
    scaledMarks,
    isOverAllocated,
    isComplete,
    pointsRemaining,
  };
}

/**
 * Creates a brand new blank StructuredNode with unique stable ID.
 * Does NOT generate fake question text or mock answers.
 */
export function createBlankNode(formatType = "structured_direct_recall", initialPoints = 2): StructuredNode {
  return {
    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    format_type: formatType,
    prompt: "",
    points: initialPoints,
    model_answer: "",
    marking_points: [],
    marking_rules: {
      unit_required: false,
      exact_spelling_required: false,
      underline_required: false,
    },
    children: [],
  };
}

export function insertChildNode(
  nodes: StructuredNode[],
  parentId: string,
  formatType: string = "structured_direct_recall",
  points: number = 2
): StructuredNode[] {
  const newNode = createBlankNode(formatType, points);

  function insertRecursive(list: StructuredNode[]): StructuredNode[] {
    return list.map((node) => {
      if (node.id === parentId) {
        return {
          ...node,
          children: [...(node.children || []), newNode],
        };
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: insertRecursive(node.children),
        };
      }
      return node;
    });
  }

  const updated = insertRecursive(nodes);
  return reindexTreeLabels(updated);
}

/**
 * Inserts a sibling part (either at top-level or under the same parent).
 */
export function insertSiblingNode(nodes: StructuredNode[], targetId?: string): StructuredNode[] {
  const newNode = createBlankNode("structured_direct_recall", 4);

  if (!targetId) {
    // Add top-level section container
    return reindexTreeLabels([...nodes, newNode]);
  }

  const parent = findParentNode(nodes, targetId);
  if (!parent) {
    // Target is top-level
    const targetIdx = nodes.findIndex((n) => n.id === targetId);
    const updated = [...nodes];
    updated.splice(targetIdx + 1, 0, newNode);
    return reindexTreeLabels(updated);
  }

  function insertInParent(list: StructuredNode[]): StructuredNode[] {
    return list.map((node) => {
      if (node.id === parent?.id) {
        const cIdx = (node.children || []).findIndex((c) => c.id === targetId);
        const newChildren = [...(node.children || [])];
        newChildren.splice(cIdx + 1, 0, newNode);
        return { ...node, children: newChildren };
      }
      if (node.children && node.children.length > 0) {
        return { ...node, children: insertInParent(node.children) };
      }
      return node;
    });
  }

  return reindexTreeLabels(insertInParent(nodes));
}

/**
 * Deletes a node by ID and automatically re-indexes all remaining descendant and sibling labels.
 */
export function deleteNodeById(nodes: StructuredNode[], targetId: string): StructuredNode[] {
  function deleteRecursive(list: StructuredNode[]): StructuredNode[] {
    return list
      .filter((node) => node.id !== targetId)
      .map((node) => ({
        ...node,
        children: node.children ? deleteRecursive(node.children) : [],
      }));
  }

  const filtered = deleteRecursive(nodes);
  return reindexTreeLabels(filtered);
}

/**
 * Moves a node up or down among its immediate siblings.
 */
export function moveNode(
  nodes: StructuredNode[],
  targetId: string,
  direction: "up" | "down"
): StructuredNode[] {
  const parent = findParentNode(nodes, targetId);

  if (!parent) {
    // Top-level reordering
    const idx = nodes.findIndex((n) => n.id === targetId);
    if (idx === -1) return nodes;
    if (direction === "up" && idx === 0) return nodes;
    if (direction === "down" && idx === nodes.length - 1) return nodes;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const copy = [...nodes];
    const temp = copy[idx];
    copy[idx] = copy[swapIdx];
    copy[swapIdx] = temp;
    return reindexTreeLabels(copy);
  }

  function reorderChildren(list: StructuredNode[]): StructuredNode[] {
    return list.map((node) => {
      if (node.id === parent?.id && node.children) {
        const idx = node.children.findIndex((c) => c.id === targetId);
        if (idx === -1) return node;
        if (direction === "up" && idx === 0) return node;
        if (direction === "down" && idx === node.children.length - 1) return node;

        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        const copy = [...node.children];
        const temp = copy[idx];
        copy[idx] = copy[swapIdx];
        copy[swapIdx] = temp;
        return { ...node, children: copy };
      }
      if (node.children && node.children.length > 0) {
        return { ...node, children: reorderChildren(node.children) };
      }
      return node;
    });
  }

  return reindexTreeLabels(reorderChildren(nodes));
}

/**
 * Clones a node (with or without descendants) with fresh stable IDs and inserts it right after the source.
 */
export function duplicateNode(
  nodes: StructuredNode[],
  targetId: string,
  includeChildren = true
): StructuredNode[] {
  const targetNode = findNodeById(nodes, targetId);
  if (!targetNode) return nodes;

  function cloneWithNewIds(node: StructuredNode): StructuredNode {
    return {
      ...node,
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      children: (includeChildren && node.children && node.children.length > 0)
        ? node.children.map(cloneWithNewIds)
        : [],
    };
  }

  const cloned = cloneWithNewIds(targetNode);
  const parent = findParentNode(nodes, targetId);

  if (!parent) {
    const idx = nodes.findIndex((n) => n.id === targetId);
    const updated = [...nodes];
    updated.splice(idx + 1, 0, cloned);
    return reindexTreeLabels(updated);
  }

  function insertClone(list: StructuredNode[]): StructuredNode[] {
    return list.map((node) => {
      if (node.id === parent?.id && node.children) {
        const idx = node.children.findIndex((c) => c.id === targetId);
        const newChildren = [...node.children];
        newChildren.splice(idx + 1, 0, cloned);
        return { ...node, children: newChildren };
      }
      if (node.children && node.children.length > 0) {
        return { ...node, children: insertClone(node.children) };
      }
      return node;
    });
  }

  return reindexTreeLabels(insertClone(nodes));
}

/**
 * Duplicates only the target node without any children.
 */
export function duplicateNodeOnly(nodes: StructuredNode[], targetId: string): StructuredNode[] {
  return duplicateNode(nodes, targetId, false);
}

/**
 * Deep-clones an entire question tree with fresh unique IDs for every node.
 * Used for complete structured question duplication on the canvas.
 */
export function cloneStructuredTree(nodes: StructuredNode[]): StructuredNode[] {
  function cloneNode(node: StructuredNode): StructuredNode {
    return {
      ...node,
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      children: node.children ? node.children.map(cloneNode) : [],
    };
  }

  const cloned = nodes.map(cloneNode);
  return reindexTreeLabels(cloned);
}
