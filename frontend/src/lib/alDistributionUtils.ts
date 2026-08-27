/**
 * Lumora A/L Biology Assessment Assembly — Question & Difficulty Distribution Utilities
 * 
 * Provides:
 * 1. Proportional 100% distribution rebalancing across unlocked question formats & difficulty levels.
 * 2. Hamilton's Largest-Remainder Integer Allocation algorithm ensuring calculated question counts
 *    always sum precisely to the requested total question count (e.g. 50).
 */

export interface QuestionDistribution {
  generic_mcq: number;
  multi_response_grid: number;
  five_statement_truth: number;
  matching_column: number;
  combination_grid: number;
  sequential_diagnostic: number;
  incomplete_stem: number;
  [key: string]: number;
}

export interface DifficultyDistribution {
  easy: number;
  moderate: number;
  standard: number;
  challenging: number;
  advanced: number;
  [key: string]: number;
}

/** Official Sri Lankan A/L Biology Paper I Certified Weight Distribution (%) */
export const AL_CERTIFIED_PAPER_1_DISTRIBUTION: QuestionDistribution = {
  generic_mcq: 26,           // Direct Factual Recall
  multi_response_grid: 20,   // 1-to-5 Multi-Response Grid
  five_statement_truth: 16,  // Five-Statement Evaluation
  matching_column: 14,       // Matrix Matching / Profile Grid
  combination_grid: 12,      // Multi-Variable Selection
  sequential_diagnostic: 8,  // Sequential / Diagnostic Deduction
  incomplete_stem: 4,        // Incomplete Stem / Calculation
};

/** Official Sri Lankan G.C.E. A/L Biology 10-Unit Mathematical Weight Distribution (%) */
export const AL_OFFICIAL_10_UNIT_PAPER_1_DISTRIBUTION: Record<number, { name: string; pct: number; rangeSingle: string; rangeMulti: string }> = {
  1: { name: "Chemical Basis of Life", pct: 5.0, rangeSingle: "Q01 - Q02", rangeMulti: "Q41" },
  2: { name: "Cellular Basis of Life (Metabolism)", pct: 11.0, rangeSingle: "Q03 - Q07", rangeMulti: "Q41" },
  3: { name: "Evolution and Diversity of Organisms", pct: 9.0, rangeSingle: "Q08 - Q11", rangeMulti: "Q42" },
  4: { name: "Plant Form and Function", pct: 13.0, rangeSingle: "Q12 - Q17", rangeMulti: "Q43" },
  5: { name: "Animal Form and Function (Largest)", pct: 28.0, rangeSingle: "Q18 - Q30", rangeMulti: "Q44 - Q46" },
  6: { name: "Genetics", pct: 5.0, rangeSingle: "Q31 - Q32", rangeMulti: "Q47" },
  7: { name: "Molecular Biology & Biotechnology", pct: 5.0, rangeSingle: "Q33 - Q34", rangeMulti: "Q47" },
  8: { name: "Environmental Biology", pct: 5.0, rangeSingle: "Q35, Q38", rangeMulti: "Q49, Q50" },
  9: { name: "Microbiology", pct: 7.0, rangeSingle: "Q36, Q37, Q39", rangeMulti: "Q48" },
  10: { name: "Applied Biology & Human Health", pct: 3.0, rangeSingle: "Q40", rangeMulti: "Q49, Q50" },
};


/** Official A/L Biology Difficulty Distribution (%) */
export const AL_DEFAULT_DIFFICULTY_DISTRIBUTION: DifficultyDistribution = {
  easy: 15,
  moderate: 25,
  standard: 40,
  challenging: 15,
  advanced: 5,
};

/** Format display names for UI renderers */
export const FORMAT_DISPLAY_NAMES: Record<keyof QuestionDistribution, { title: string; desc: string }> = {
  generic_mcq: {
    title: "Direct Factual Recall",
    desc: "Tests direct recall of core biological facts, principles, and definitions."
  },
  multi_response_grid: {
    title: "Multi-Response Grid",
    desc: "Evaluates 5 independent statements (A-E) using the A/L 1-to-5 combination mapping."
  },
  five_statement_truth: {
    title: "Five-Statement Evaluation",
    desc: "Evaluates 5 standalone scientific assertions to identify the single true statement."
  },
  matching_column: {
    title: "Matrix / Matching Grid",
    desc: "Pairs structures, processes, or organelle features across Column I and Column II."
  },
  combination_grid: {
    title: "Multi-Variable Selection",
    desc: "Presents statements A-D and asks for valid subset combinations (1-5)."
  },
  sequential_diagnostic: {
    title: "Sequential / Diagnostic",
    desc: "Assesses process step ordering or clinical/physiological diagnostic deductions."
  },
  incomplete_stem: {
    title: "Incomplete Stem / Calculation",
    desc: "Calculations or incomplete sentence stems requiring precise numerical values/completions."
  }
};

/**
 * Proportionally redistributes percentage changes across other unlocked keys so total remains 100%.
 */
export function redistributeProportionally<T extends Record<string, number>>(
  currentDist: T,
  changedKey: keyof T,
  newRawValue: number
): T {
  const keys = Object.keys(currentDist) as Array<keyof T>;
  const newValue = Math.min(100, Math.max(0, Math.round(newRawValue)));
  const oldValue = currentDist[changedKey];
  const delta = newValue - oldValue;

  if (delta === 0) return { ...currentDist };

  const otherKeys = keys.filter(k => k !== changedKey);
  const otherSum = otherKeys.reduce((acc, k) => acc + currentDist[k], 0);

  const updated: any = { ...currentDist, [changedKey]: newValue };

  if (otherSum === 0) {
    // If all other keys were 0, distribute remainder equally
    const equalShare = (100 - newValue) / otherKeys.length;
    otherKeys.forEach(k => {
      updated[k] = Math.round(equalShare);
    });
  } else {
    // Proportionally scale other keys based on their current weights
    let runningSum = newValue;
    otherKeys.forEach((k, idx) => {
      if (idx === otherKeys.length - 1) {
        // Last key absorbs rounding difference to guarantee exact 100% sum
        updated[k] = Math.max(0, 100 - runningSum);
      } else {
        const propShare = (currentDist[k] / otherSum) * (100 - newValue);
        const rounded = Math.max(0, Math.round(propShare));
        updated[k] = rounded;
        runningSum += rounded;
      }
    });
  }

  return updated as T;
}

/**
 * Redistributes percentage change (delta) EQUALLY across all remaining active keys
 * with controlled remainder handling so the sum ALWAYS equals 100% exactly.
 */
export function redistributeEqualDelta<T extends Record<string, number>>(
  currentDist: T,
  changedKey: keyof T,
  newRawValue: number
): T {
  const keys = Object.keys(currentDist) as Array<keyof T>;
  const newValue = Math.min(100, Math.max(0, Math.round(newRawValue)));
  const oldValue = currentDist[changedKey] || 0;
  const delta = newValue - oldValue;

  if (delta === 0) return { ...currentDist };

  const otherKeys = keys.filter(k => k !== changedKey);
  if (otherKeys.length === 0) return { [changedKey]: 100 } as T;

  const targetOtherSum = 100 - newValue;
  const updated: any = { ...currentDist, [changedKey]: newValue };

  // Calculate float targets for each other key by subtracting/adding delta / N equally
  const floatTargets: { key: keyof T; floatVal: number; floorVal: number; remainder: number }[] = [];
  let floorSum = 0;

  otherKeys.forEach(k => {
    const floatVal = Math.max(0, currentDist[k] - (delta / otherKeys.length));
    const floorVal = Math.floor(floatVal);
    const remainder = floatVal - floorVal;
    floatTargets.push({ key: k, floatVal, floorVal, remainder });
    floorSum += floorVal;
  });

  // Assign floor values
  floatTargets.forEach(item => {
    updated[item.key] = item.floorVal;
  });

  // Distribute surplus = targetOtherSum - floorSum
  let surplus = targetOtherSum - floorSum;
  if (surplus > 0) {
    floatTargets.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < surplus; i++) {
      const k = floatTargets[i % floatTargets.length].key;
      updated[k] = (updated[k] || 0) + 1;
    }
  } else if (surplus < 0) {
    floatTargets.sort((a, b) => a.remainder - b.remainder);
    for (let i = 0; i < Math.abs(surplus); i++) {
      const k = floatTargets[i % floatTargets.length].key;
      updated[k] = Math.max(0, (updated[k] || 0) - 1);
    }
  }

  return updated as T;
}

export function redistributeBalanced<T extends Record<string, number>>(
  currentDist: T,
  changedKey: keyof T,
  newRawValue: number
): T {
  return redistributeEqualDelta(currentDist, changedKey, newRawValue);
}

/**
 * Hamilton's Largest-Remainder Integer Allocation Algorithm
 * 
 * Converts float percentages to exact integer question counts such that
 * sum(calculated_counts) ALWAYS EQUALS totalQuestionCount exactly.
 */
export function calculateExactQuestionCounts<T extends Record<string, number>>(
  totalQuestionCount: number,
  percentageDist: T
): Record<keyof T, number> {
  const keys = Object.keys(percentageDist) as Array<keyof T>;
  const floatCounts: { key: keyof T; floatVal: number; floorVal: number; remainder: number }[] = [];

  let totalFloorSum = 0;

  keys.forEach(key => {
    const pct = percentageDist[key] || 0;
    const floatVal = (pct / 100) * totalQuestionCount;
    const floorVal = Math.floor(floatVal);
    const remainder = floatVal - floorVal;

    floatCounts.push({ key, floatVal, floorVal, remainder });
    totalFloorSum += floorVal;
  });

  const exactCounts: any = {};
  floatCounts.forEach(item => {
    exactCounts[item.key] = item.floorVal;
  });

  // Distribute remaining integer units (totalQuestionCount - totalFloorSum) to keys with largest remainders
  let surplus = totalQuestionCount - totalFloorSum;
  if (surplus > 0) {
    // Sort descending by remainder
    floatCounts.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < surplus; i++) {
      const targetKey = floatCounts[i % floatCounts.length].key;
      exactCounts[targetKey] = (exactCounts[targetKey] || 0) + 1;
    }
  }

  return exactCounts as Record<keyof T, number>;
}
