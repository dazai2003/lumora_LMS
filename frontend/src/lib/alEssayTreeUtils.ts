/**
 * Lumora LMS — A/L Biology Essay Question Hierarchy & Auto-Numbering Engine.
 * 
 * Provides canonical tree manipulation, hierarchical subquestion indexing,
 * automatic Roman & Alphabetical labeling:
 *   - Level 1: (i), (ii), (iii), (iv), (v)...
 *   - Level 2: (a), (b), (c), (d), (e)...
 * Mark roll-up calculation with container-level aggregation and zero double-counting,
 * duplicate numbering elimination, and full question cloning.
 */

import { normalizeScientificSymbols } from "./scientificSymbolUtils";

export type EssayStructureFormat = "single_complete" | "multi_part" | "short_notes";

export interface EssayAnswerPoint {
  id: string; // Stable internal unique ID (e.g. "pt_...")
  item_number: number; // 1, 2, 3...
  description: string;
  marks: number;
  accepted_alternatives?: string;
}

export interface EssaySubpart {
  id: string; // Stable internal unique ID (e.g. "sub_...")
  parent_id?: string | null;
  label?: string; // Dynamically derived display label e.g. "(i)", "(a)"
  prompt: string; // Clean question prompt WITHOUT leading label prefix
  marks?: number; // Calculated or explicit marks
  answer_points?: EssayAnswerPoint[];
  marking_scheme?: string;
  children?: EssaySubpart[]; // Nested Level 2 subparts: (a), (b), (c)...
}

export interface EssayDiagramRequirement {
  requires_image?: boolean;
  image_description?: string;
  diagram_url?: string;
}

export interface EssayQuestionStructure {
  structure_format: EssayStructureFormat;
  structure_type?: EssayStructureFormat;
  instruction?: string;
  stem_text?: string;
  answer_points?: EssayAnswerPoint[];
  criteria?: EssayAnswerPoint[];
  marking_scheme?: string;
  subparts?: EssaySubpart[];
  examiner_notes?: string;
  diagram_requirement?: EssayDiagramRequirement;
}

const ROMAN_NUMERALS = [
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
  "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"
];

/**
 * Converts standard integer index to Roman numeral formatted string: (i), (ii), (iii), (iv)...
 */
export function getRomanLabel(index: number): string {
  const roman = ROMAN_NUMERALS[index] || `${index + 1}`;
  return `(${roman})`;
}

/**
 * Converts standard integer index to Alphabetical formatted string: (a), (b), (c), (d)...
 */
export function getAlphaLabel(index: number): string {
  const letter = String.fromCharCode(97 + (index % 26));
  return `(${letter})`;
}

/**
 * Returns dynamic hierarchical label based on nesting depth and sibling index.
 * Depth 0 (Level 1 Roman): (i), (ii), (iii)...
 * Depth 1 (Level 2 Alphabetical): (a), (b), (c)...
 * Depth 2+ (Level 3 Numeric): (1), (2), (3)...
 */
export function getEssayLabelForDepth(depth: number, index: number): string {
  if (depth === 0) {
    return getRomanLabel(index);
  } else if (depth === 1) {
    return getAlphaLabel(index);
  } else {
    return `(${index + 1})`;
  }
}

/**
 * CRITICAL NUMBERING RULE: Strips any leading numbering artifact from prompt strings.
 * Prevents double-numbering such as "(i) (i)" or "(a) (a)" when the renderer prepends
 * its dynamic label badge.
 */
export function stripLeadingNumberingPrefix(text: string | null | undefined): string {
  if (!text) return "";
  let s = text.trim();

  // 1. Matches: (i), (ii), (iii), (iv), (v), (vi), (a), (b), (c), (1), (2), etc.
  s = s.replace(/^\s*\(([a-zA-Z0-9ivxIVX]+)\)[\s:\.\-]*/i, "");

  // 2. Matches: i., ii., iii., a., b., c., 1., 2. etc. at the start
  s = s.replace(/^\s*([0-9]+|[a-zA-Z]|[ivxIVX]+)[\.\:\-]\s+/i, "");

  return s.trim();
}

/**
 * Creates a clean default answer point with a stable internal ID.
 */
export function createEmptyEssayAnswerPoint(itemNumber: number, defaultMarks = 5): EssayAnswerPoint {
  return {
    id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    item_number: itemNumber,
    description: "",
    marks: defaultMarks,
    accepted_alternatives: "",
  };
}

/**
 * Creates a clean default subpart with a stable internal ID.
 */
export function createEmptyEssaySubpart(index: number, defaultPrompt = "", depth = 0): EssaySubpart {
  return {
    id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    parent_id: null,
    label: getEssayLabelForDepth(depth, index),
    prompt: defaultPrompt,
    marks: 10,
    answer_points: [
      createEmptyEssayAnswerPoint(1, 5),
      createEmptyEssayAnswerPoint(2, 5),
    ],
    marking_scheme: "",
    children: [],
  };
}

/**
 * Recursively re-indexes all subparts in the tree so that sibling labels, parent_ids,
 * and answer points are consistent across additions, deletions, or moves.
 */
export function reindexEssaySubparts(
  subparts: EssaySubpart[],
  depth = 0,
  parentId: string | null = null
): EssaySubpart[] {
  if (!subparts || !Array.isArray(subparts)) return [];

  return subparts.map((sub, idx) => {
    const cleanPrompt = stripLeadingNumberingPrefix(sub.prompt);
    const resolvedLabel = getEssayLabelForDepth(depth, idx);
    const resolvedChildren = sub.children && sub.children.length > 0
      ? reindexEssaySubparts(sub.children, depth + 1, sub.id)
      : [];

    const reindexedAnswerPoints = (sub.answer_points || []).map((pt, pIdx) => ({
      ...pt,
      item_number: pIdx + 1,
      marks: Number(pt.marks) || 0,
    }));

    return {
      ...sub,
      parent_id: parentId,
      label: resolvedLabel,
      prompt: cleanPrompt,
      answer_points: reindexedAnswerPoints,
      children: resolvedChildren,
    };
  });
}

/**
 * Calculates total marks for a specific subpart node.
 * ANTI-DOUBLE COUNTING: If a node has children (e.g. (ii) has (a) and (b)),
 * the container's mark is derived purely from the sum of its children.
 */
export function calculateSubpartMarks(subpart: EssaySubpart): number {
  if (!subpart) return 0;

  if (subpart.children && subpart.children.length > 0) {
    return subpart.children.reduce((sum, child) => sum + calculateSubpartMarks(child), 0);
  }

  if (subpart.answer_points && subpart.answer_points.length > 0) {
    return subpart.answer_points.reduce((sum, p) => sum + (Number(p.marks) || 0), 0);
  }

  return Number(subpart.marks) || 0;
}

/**
 * Calculates total question marks across any of the 3 Essay structures.
 * Strictly avoids double-counting container nodes.
 */
export function calculateEssayTotalMarks(structure: {
  structure_format?: EssayStructureFormat;
  answer_points?: EssayAnswerPoint[];
  subparts?: EssaySubpart[];
}): number {
  if (!structure) return 0;
  const format = structure.structure_format || "single_complete";

  if (format === "single_complete") {
    return (structure.answer_points || []).reduce((sum, p) => sum + (Number(p.marks) || 0), 0);
  }

  return (structure.subparts || []).reduce((sum, sub) => sum + calculateSubpartMarks(sub), 0);
}

/**
 * Adds a new subpart to the tree. If parentId is provided, adds a nested child under that parent.
 */
export function addSubpartToTree(subparts: EssaySubpart[], parentId?: string | null): EssaySubpart[] {
  if (!parentId) {
    const nextIdx = (subparts || []).length;
    const newSub = createEmptyEssaySubpart(nextIdx, "", 0);
    return reindexEssaySubparts([...(subparts || []), newSub]);
  }

  function addRecursive(list: EssaySubpart[]): EssaySubpart[] {
    return list.map((item) => {
      if (item.id === parentId) {
        const nextChildIdx = (item.children || []).length;
        const newChild = createEmptyEssaySubpart(nextChildIdx, "", 1);
        return {
          ...item,
          children: [...(item.children || []), newChild],
        };
      }
      if (item.children && item.children.length > 0) {
        return {
          ...item,
          children: addRecursive(item.children),
        };
      }
      return item;
    });
  }

  return reindexEssaySubparts(addRecursive(subparts));
}

/**
 * Deletes a subpart from the tree by ID (and any nested children), then reindexes siblings.
 */
export function deleteSubpartFromTree(subparts: EssaySubpart[], targetId: string): EssaySubpart[] {
  function deleteRecursive(list: EssaySubpart[]): EssaySubpart[] {
    return list
      .filter((item) => item.id !== targetId)
      .map((item) => {
        if (item.children && item.children.length > 0) {
          return {
            ...item,
            children: deleteRecursive(item.children),
          };
        }
        return item;
      });
  }

  return reindexEssaySubparts(deleteRecursive(subparts));
}

/**
 * Duplicates a subpart in the tree with fresh stable IDs, inserting right after the source.
 */
export function duplicateSubpartInTree(subparts: EssaySubpart[], targetId: string): EssaySubpart[] {
  function duplicateNode(node: EssaySubpart): EssaySubpart {
    const newId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const duplicatedAnswerPoints = (node.answer_points || []).map((pt, idx) => ({
      ...pt,
      id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`,
      item_number: idx + 1,
    }));
    const duplicatedChildren = (node.children || []).map((c) => duplicateNode(c));

    return {
      ...node,
      id: newId,
      prompt: node.prompt ? `${node.prompt} (Copy)` : "",
      answer_points: duplicatedAnswerPoints,
      children: duplicatedChildren,
    };
  }

  function duplicateRecursive(list: EssaySubpart[]): EssaySubpart[] {
    const result: EssaySubpart[] = [];
    for (const item of list) {
      result.push(item);
      if (item.id === targetId) {
        result.push(duplicateNode(item));
      } else if (item.children && item.children.length > 0) {
        item.children = duplicateRecursive(item.children);
      }
    }
    return result;
  }

  return reindexEssaySubparts(duplicateRecursive(subparts));
}

/**
 * Moves a subpart up or down among its direct siblings.
 */
export function moveSubpartInTree(
  subparts: EssaySubpart[],
  targetId: string,
  direction: "up" | "down"
): EssaySubpart[] {
  function moveInList(list: EssaySubpart[]): { updatedList: EssaySubpart[]; moved: boolean } {
    const index = list.findIndex((item) => item.id === targetId);
    if (index !== -1) {
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx >= 0 && targetIdx < list.length) {
        const copy = [...list];
        const temp = copy[index];
        copy[index] = copy[targetIdx];
        copy[targetIdx] = temp;
        return { updatedList: copy, moved: true };
      }
      return { updatedList: list, moved: true };
    }

    let anyMoved = false;
    const updated = list.map((item) => {
      if (item.children && item.children.length > 0 && !anyMoved) {
        const res = moveInList(item.children);
        if (res.moved) {
          anyMoved = true;
          return { ...item, children: res.updatedList };
        }
      }
      return item;
    });

    return { updatedList: updated, moved: anyMoved };
  }

  const { updatedList } = moveInList(subparts);
  return reindexEssaySubparts(updatedList);
}

/**
 * Normalizes legacy essay checklist JSON payloads to ensure backwards compatibility
 * without breaking existing question records.
 */
export function normalizeLegacyEssayData(
  rawChecklist: any,
  stemText = "",
  points = 40
): EssayQuestionStructure {
  if (!rawChecklist || typeof rawChecklist !== "object") {
    return {
      structure_format: "single_complete",
      stem_text: stemText || "Essay Question",
      answer_points: [createEmptyEssayAnswerPoint(1, Math.max(1, points))],
      marking_scheme: "",
      subparts: [],
    };
  }

  const isArray = Array.isArray(rawChecklist);
  const data = isArray ? { criteria: rawChecklist } : rawChecklist;

  const rawFormat = data.structure_format || data.structure_type || "single_complete";
  const structure_format: EssayStructureFormat =
    rawFormat === "multi_part" || rawFormat === "subparts"
      ? "multi_part"
      : rawFormat === "short_notes"
      ? "short_notes"
      : "single_complete";

  // Normalize Answer Points
  const rawPoints = data.answer_points || data.criteria || [];
  const normalizedAnswerPoints: EssayAnswerPoint[] = Array.isArray(rawPoints)
    ? rawPoints.map((p: any, idx: number) => ({
        id: p.id || `pt_legacy_${idx}_${Math.random().toString(36).substring(2, 5)}`,
        item_number: p.item_number || idx + 1,
        description: p.description || p.criterion || (typeof p === "string" ? p : ""),
        marks: Number(p.marks ?? p.points ?? 5) || 5,
        accepted_alternatives: p.accepted_alternatives || "",
      }))
    : [];

  // Normalize Subparts
  const rawSubparts = data.subparts || [];
  const normalizedSubparts: EssaySubpart[] = Array.isArray(rawSubparts)
    ? rawSubparts.map((s: any, idx: number) => {
        const rawSubPts = s.answer_points || s.criteria || [];
        const subPts: EssayAnswerPoint[] = Array.isArray(rawSubPts)
          ? rawSubPts.map((pt: any, pIdx: number) => ({
              id: pt.id || `pt_sub_${idx}_${pIdx}_${Math.random().toString(36).substring(2, 5)}`,
              item_number: pt.item_number || pIdx + 1,
              description: pt.description || pt.criterion || (typeof pt === "string" ? pt : ""),
              marks: Number(pt.marks ?? pt.points ?? 5) || 5,
              accepted_alternatives: pt.accepted_alternatives || "",
            }))
          : [];

        const subChildren: EssaySubpart[] = Array.isArray(s.children)
          ? s.children.map((c: any, cIdx: number) => ({
              id: c.id || `sub_child_${idx}_${cIdx}_${Math.random().toString(36).substring(2, 5)}`,
              parent_id: s.id || null,
              label: getAlphaLabel(cIdx),
              prompt: stripLeadingNumberingPrefix(c.prompt || c.question || ""),
              marks: Number(c.marks ?? c.points ?? 5) || 5,
              answer_points: Array.isArray(c.answer_points)
                ? c.answer_points.map((cPt: any, cpIdx: number) => ({
                    id: cPt.id || `pt_child_${idx}_${cIdx}_${cpIdx}`,
                    item_number: cpIdx + 1,
                    description: cPt.description || cPt.criterion || "",
                    marks: Number(cPt.marks ?? cPt.points ?? 5) || 5,
                    accepted_alternatives: cPt.accepted_alternatives || "",
                  }))
                : [],
              marking_scheme: c.marking_scheme || "",
            }))
          : [];

        return {
          id: s.id || `sub_legacy_${idx}_${Math.random().toString(36).substring(2, 5)}`,
          label: getRomanLabel(idx),
          prompt: stripLeadingNumberingPrefix(s.prompt || s.question || s.title || ""),
          marks: Number(s.marks ?? s.max_marks ?? s.points ?? 10) || 10,
          answer_points: subPts,
          marking_scheme: s.marking_scheme || "",
          children: subChildren,
        };
      })
    : [];

  return {
    structure_format,
    instruction: data.instruction || "Write short notes on the following:",
    stem_text: stemText || data.stem_text || "",
    answer_points: normalizedAnswerPoints,
    marking_scheme: data.marking_scheme || "",
    subparts: reindexEssaySubparts(normalizedSubparts),
    examiner_notes: data.examiner_notes || "",
    diagram_requirement: data.diagram_requirement || {
      requires_image: Boolean(data.diagram_url),
      image_description: data.image_description || "",
      diagram_url: data.diagram_url || "",
    },
  };
}
