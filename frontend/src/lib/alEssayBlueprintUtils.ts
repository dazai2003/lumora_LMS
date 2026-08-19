/**
 * Lumora LMS — Essay AI Blueprint Data Models, Calculations & Validation Engine.
 * 
 * Provides canonical types, auto-numbering, mark hierarchy validation,
 * persistence, and blueprint formatting for Phase 5 & Phase 6.
 */

import { getRomanLabel, getAlphaLabel } from "./alEssayTreeUtils";

export type EssayStructureType = "SINGLE_COMPLETE" | "MULTI_PART" | "SHORT_NOTES";

export interface EssayBlueprintSubpartNode {
  id: string; // Stable internal unique ID
  order: number;
  marks: number;
  label?: string; // (i), (ii), (a), (b)
  children?: EssayBlueprintSubpartNode[]; // Nested (a), (b) Level 2
}

export interface EssayQuestionBlueprint {
  id: string; // Stable internal unique ID
  order: number;
  question_number: number;
  structure_type: EssayStructureType;
  marks: number; // Question total marks e.g. 40
  has_parent_instruction?: boolean;
  children?: EssayBlueprintSubpartNode[]; // Subquestions for Multi-Part & Short Notes
}

export interface EssayPaperBlueprint {
  assessment_id?: string;
  paper_section: "PAPER_II_PART_B";
  target_question_count: number; // 1 to 5
  total_marks: number; // Sum of all questions
  questions: EssayQuestionBlueprint[];
  course_id?: number;
  unit_ids?: number[];
  difficulty_mode?: string;
  cognitive_mode?: string;
  custom_instruction?: string;
  updated_at?: string;
}

export interface BlueprintValidationResult {
  isValid: boolean;
  errors: string[];
  totalMarks: number;
  questionValidations: Array<{
    question_order: number;
    isValid: boolean;
    calculatedMarks: number;
    expectedMarks: number;
    error?: string;
  }>;
}

/**
 * Creates a unique stable ID for blueprint questions and subparts.
 */
export function generateBlueprintId(prefix = "ess_node"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Creates a clean default single complete question blueprint.
 */
export function createDefaultSingleCompleteBlueprint(order: number, qNum: number, marks = 40): EssayQuestionBlueprint {
  return {
    id: generateBlueprintId("q_single"),
    order,
    question_number: qNum,
    structure_type: "SINGLE_COMPLETE",
    marks,
    children: [],
  };
}

/**
 * Creates a clean default multi-part question blueprint with 3 subparts (10, 15, 15 marks).
 */
export function createDefaultMultiPartBlueprint(order: number, qNum: number, marks = 40): EssayQuestionBlueprint {
  const sub1: EssayBlueprintSubpartNode = {
    id: generateBlueprintId("sub_roman"),
    order: 1,
    marks: 10,
    label: "(i)",
  };
  const sub2: EssayBlueprintSubpartNode = {
    id: generateBlueprintId("sub_roman"),
    order: 2,
    marks: 15,
    label: "(ii)",
  };
  const sub3: EssayBlueprintSubpartNode = {
    id: generateBlueprintId("sub_roman"),
    order: 3,
    marks: 15,
    label: "(iii)",
  };

  return {
    id: generateBlueprintId("q_multi"),
    order,
    question_number: qNum,
    structure_type: "MULTI_PART",
    marks,
    children: [sub1, sub2, sub3],
  };
}

/**
 * Creates a clean default short notes question blueprint with 3 topics (10, 10, 20 marks).
 */
export function createDefaultShortNotesBlueprint(order: number, qNum: number, marks = 40): EssayQuestionBlueprint {
  const topic1: EssayBlueprintSubpartNode = {
    id: generateBlueprintId("sub_topic"),
    order: 1,
    marks: 10,
    label: "(i)",
  };
  const topic2: EssayBlueprintSubpartNode = {
    id: generateBlueprintId("sub_topic"),
    order: 2,
    marks: 10,
    label: "(ii)",
  };
  const topic3: EssayBlueprintSubpartNode = {
    id: generateBlueprintId("sub_topic"),
    order: 3,
    marks: 20,
    label: "(iii)",
  };

  return {
    id: generateBlueprintId("q_notes"),
    order,
    question_number: qNum,
    structure_type: "SHORT_NOTES",
    marks,
    has_parent_instruction: true,
    children: [topic1, topic2, topic3],
  };
}

/**
 * Re-indexes all questions and subparts so that ordering and labels (i, ii, a, b)
 * are consistent.
 */
export function reindexPaperBlueprint(
  questions: EssayQuestionBlueprint[],
  startingQNum = 5
): EssayQuestionBlueprint[] {
  return questions.map((q, qIdx) => {
    const question_number = startingQNum + qIdx;
    const order = qIdx + 1;

    let reindexedChildren: EssayBlueprintSubpartNode[] | undefined = undefined;

    if (q.children && q.children.length > 0) {
      reindexedChildren = q.children.map((sub, sIdx) => {
        let nestedChildren: EssayBlueprintSubpartNode[] | undefined = undefined;
        if (sub.children && sub.children.length > 0) {
          nestedChildren = sub.children.map((nested, nIdx) => ({
            ...nested,
            order: nIdx + 1,
            label: getAlphaLabel(nIdx),
            marks: Math.max(1, Number(nested.marks) || 5),
          }));
        }

        const subMarks = nestedChildren && nestedChildren.length > 0
          ? nestedChildren.reduce((sum, c) => sum + c.marks, 0)
          : Math.max(1, Number(sub.marks) || 5);

        return {
          ...sub,
          order: sIdx + 1,
          label: getRomanLabel(sIdx),
          marks: subMarks,
          children: nestedChildren,
        };
      });
    }

    return {
      ...q,
      order,
      question_number,
      children: reindexedChildren,
      marks: Math.max(1, Number(q.marks) || 40),
    };
  });
}

/**
 * Generates an initial default paper blueprint for the requested target question count (1 to 5).
 */
export function createDefaultPaperBlueprint(
  targetCount = 3,
  startingQNum = 5,
  assessmentId?: string
): EssayPaperBlueprint {
  const count = Math.min(5, Math.max(1, targetCount));
  const questions: EssayQuestionBlueprint[] = [];

  for (let i = 0; i < count; i++) {
    const qNum = startingQNum + i;
    const order = i + 1;
    if (i % 3 === 0) {
      questions.push(createDefaultSingleCompleteBlueprint(order, qNum, 40));
    } else if (i % 3 === 1) {
      questions.push(createDefaultMultiPartBlueprint(order, qNum, 40));
    } else {
      questions.push(createDefaultShortNotesBlueprint(order, qNum, 40));
    }
  }

  const reindexed = reindexPaperBlueprint(questions, startingQNum);
  const total_marks = reindexed.reduce((sum, q) => sum + q.marks, 0);

  return {
    assessment_id: assessmentId,
    paper_section: "PAPER_II_PART_B",
    target_question_count: count,
    total_marks,
    questions: reindexed,
    difficulty_mode: "balanced",
    cognitive_mode: "recommended",
  };
}

/**
 * Calculates total marks for a question blueprint node.
 * For Multi-Part & Short-Notes, sums subpart leaves without double-counting containers.
 */
export function calculateBlueprintQuestionMarks(q: EssayQuestionBlueprint): number {
  if (q.structure_type === "SINGLE_COMPLETE") {
    return Number(q.marks) || 0;
  }

  if (!q.children || q.children.length === 0) {
    return Number(q.marks) || 0;
  }

  return q.children.reduce((sum, sub) => {
    if (sub.children && sub.children.length > 0) {
      return sum + sub.children.reduce((childSum, c) => childSum + (Number(c.marks) || 0), 0);
    }
    return sum + (Number(sub.marks) || 0);
  }, 0);
}

/**
 * Validates an EssayPaperBlueprint thoroughly before finalization.
 */
export function validateEssayPaperBlueprint(blueprint: EssayPaperBlueprint): BlueprintValidationResult {
  const errors: string[] = [];
  const questionValidations: BlueprintValidationResult["questionValidations"] = [];

  if (!blueprint) {
    return { isValid: false, errors: ["No blueprint provided."], totalMarks: 0, questionValidations: [] };
  }

  if (!blueprint.questions || blueprint.questions.length === 0) {
    errors.push("At least 1 essay question blueprint is required.");
  }

  if (blueprint.questions && (blueprint.questions.length < 1 || blueprint.questions.length > 5)) {
    errors.push("Target essay questions must be between 1 and 5.");
  }

  // Validate stable ID uniqueness
  const seenIds = new Set<string>();

  blueprint.questions.forEach((q) => {
    let qValid = true;
    let qError: string | undefined = undefined;

    if (!q.id || seenIds.has(q.id)) {
      errors.push(`Duplicate or missing stable ID detected for Question ${q.question_number}.`);
      qValid = false;
    }
    seenIds.add(q.id);

    if (q.marks <= 0) {
      const err = `Question ${q.question_number} must have maximum marks greater than 0.`;
      errors.push(err);
      qError = err;
      qValid = false;
    }

    if (q.structure_type === "MULTI_PART" || q.structure_type === "SHORT_NOTES") {
      if (!q.children || q.children.length === 0) {
        const err = `Question ${q.question_number} (${q.structure_type === "MULTI_PART" ? "Multi-Part" : "Short Notes"}) requires at least one subpart.`;
        errors.push(err);
        qError = err;
        qValid = false;
      } else {
        const calculated = calculateBlueprintQuestionMarks(q);
        if (calculated !== q.marks) {
          const err = `Question ${q.question_number}: Subquestion marks total ${calculated}, but question maximum is ${q.marks}.`;
          errors.push(err);
          qError = err;
          qValid = false;
        }

        q.children.forEach((sub) => {
          if (!sub.id || seenIds.has(sub.id)) {
            errors.push(`Duplicate or missing subpart ID in Question ${q.question_number}.`);
            qValid = false;
          }
          seenIds.add(sub.id);

          if (sub.children && sub.children.length > 0) {
            sub.children.forEach((c) => {
              if (!c.id || seenIds.has(c.id)) {
                errors.push(`Duplicate or missing nested part ID in Question ${q.question_number}.`);
                qValid = false;
              }
              seenIds.add(c.id);
            });
          }
        });
      }
    }

    questionValidations.push({
      question_order: q.order,
      isValid: qValid,
      calculatedMarks: calculateBlueprintQuestionMarks(q),
      expectedMarks: q.marks,
      error: qError,
    });
  });

  const totalMarks = blueprint.questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  return {
    isValid: errors.length === 0,
    errors,
    totalMarks,
    questionValidations,
  };
}

/**
 * Storage key helper for persistence across modal closing, navigation, and page refresh.
 */
export function getBlueprintStorageKey(assessmentId?: string | number): string {
  return `lumora_essay_blueprint_${assessmentId || "active"}`;
}

/**
 * Persists the validated blueprint to localStorage.
 */
export function saveBlueprintToStorage(blueprint: EssayPaperBlueprint): void {
  if (typeof window === "undefined") return;
  try {
    const key = getBlueprintStorageKey(blueprint.assessment_id);
    localStorage.setItem(
      key,
      JSON.stringify({
        ...blueprint,
        updated_at: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.error("Failed to save essay blueprint to localStorage", err);
  }
}

/**
 * Loads a persisted blueprint from localStorage.
 */
export function loadBlueprintFromStorage(assessmentId?: string | number): EssayPaperBlueprint | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getBlueprintStorageKey(assessmentId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.questions)) {
      return parsed;
    }
  } catch (err) {
    console.error("Failed to load essay blueprint from localStorage", err);
  }
  return null;
}

/**
 * Authentic G.C.E. A/L Biology Paper II Part B Word, Sentence & Mark Budget Configuration.
 */
export interface EssayBudgetConfig {
  targetPointsMin: number;
  targetPointsMax: number;
  targetWordsMin: number;
  targetWordsMax: number;
  softCharLimit: number;
  hardCharLimit: number;
  typicalSentenceCount: string;
  expectedHandwrittenPages: string;
  recommendedMinutes: number;
  description: string;
}

/**
 * Returns the exact budget constraints and guidance for an essay segment based on allocated marks.
 */
export function getEssayBudgetConfig(marks?: number): EssayBudgetConfig {
  const m = Number(marks) || 150;

  if (m <= 55) {
    // 50-Mark Short Note (e.g., Question 10 Triplet)
    return {
      targetPointsMin: 12,
      targetPointsMax: 14,
      targetWordsMin: 120,
      targetWordsMax: 180,
      softCharLimit: 1200,
      hardCharLimit: 1500,
      typicalSentenceCount: "12 – 14 concise factual sentences",
      expectedHandwrittenPages: "~0.5 handwritten page",
      recommendedMinutes: 8,
      description: "Short Note (50 Marks): Target 12–14 factual checkmark points (~120–180 words)",
    };
  }

  if (m <= 85) {
    // 75 / 80-Mark Process or Structure Segment (e.g., Q5, Q7, Q8, Q9 Part (a) or (b))
    return {
      targetPointsMin: 18,
      targetPointsMax: 20,
      targetWordsMin: 180,
      targetWordsMax: 250,
      softCharLimit: 1800,
      hardCharLimit: 2200,
      typicalSentenceCount: "18 – 20 precise sentences (4 marks/point)",
      expectedHandwrittenPages: "~1 – 1.2 handwritten pages",
      recommendedMinutes: 13,
      description: "Dual-Segment (75/80 Marks): Target 18–20 factual checkmark points (~180–250 words)",
    };
  }

  // 150-Mark Monolithic Single-Prompt Essay (e.g., Q6)
  return {
    targetPointsMin: 37,
    targetPointsMax: 40,
    targetWordsMin: 400,
    targetWordsMax: 600,
    softCharLimit: 3600,
    hardCharLimit: 4000,
    typicalSentenceCount: "37 – 40 dense biological statements",
    expectedHandwrittenPages: "~2 – 2.5 handwritten pages",
    recommendedMinutes: 26,
    description: "Monolithic Complete Essay (150 Marks): Target 37–40 dense biological points (~400–600 words)",
  };
}

