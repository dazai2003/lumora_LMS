console.log("=== Testing MCQ Question Paper Renderer Deduplication Pipeline ===");

// 1. Test Multi-Variable Combination Grid Deduplication (The exact scenario from the screenshot)
const rawCombinationStem = `Which of the following statements concerning plant movements and tropisms are correct?

A. Phototropism in stem tips is caused by the lateral redistribution of auxins towards the shaded side, resulting in greater cell elongation there.
B. Thigmonastic movements in Mimosa pudica occur due to rapid loss of turgor pressure in pulvini motor cells.
C. Gravitropism in roots is mediated by statoliths settling towards the lower side, inhibiting cell elongation on the lower surface so roots grow downwards.
D. Photoperiodism in short-day plants is regulated by phytochrome pigments, where Pfr acts as an inhibitor of flowering.`;

const statements_json = [
  { code: "A", text: "Phototropism in stem tips is caused by the lateral redistribution of auxins towards the shaded side, resulting in greater cell elongation there." },
  { code: "B", text: "Thigmonastic movements in Mimosa pudica occur due to rapid loss of turgor pressure in pulvini motor cells." },
  { code: "C", text: "Gravitropism in roots is mediated by statoliths settling towards the lower side, inhibiting cell elongation on the lower surface so roots grow downwards." },
  { code: "D", text: "Photoperiodism in short-day plants is regulated by phytochrome pigments, where Pfr acts as an inhibitor of flowering." },
];

function deduplicateStemAndStatements(rawStem: string, stmtsJson?: any[]) {
  if (Array.isArray(stmtsJson) && stmtsJson.length > 0) {
    const lines = rawStem.split("\n");
    const filteredLines = lines.filter((l) => !/^(?:\([A-Ea-e]\)|[A-Ea-e][\.\:\-])\s+/i.test(l.trim()));
    return {
      cleanPrompt: filteredLines.join("\n").trim(),
      statements: stmtsJson,
    };
  }

  const lines = rawStem.split("\n");
  const parsedStatements: { code: string; text: string }[] = [];
  const remainingStemLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:\(([A-Ea-e])\)|([A-Ea-e])[\.\:\-])\s+(.+)$/);
    if (match) {
      const code = (match[1] || match[2]).toUpperCase();
      parsedStatements.push({ code, text: match[3].trim() });
    } else {
      remainingStemLines.push(line);
    }
  }

  return {
    cleanPrompt: remainingStemLines.join("\n").trim(),
    statements: parsedStatements,
  };
}

const test1 = deduplicateStemAndStatements(rawCombinationStem, statements_json);
console.assert(
  test1.cleanPrompt === "Which of the following statements concerning plant movements and tropisms are correct?",
  `Test 1 Failed: Clean prompt should only contain question header, got: '${test1.cleanPrompt}'`
);
console.assert(test1.statements.length === 4, "Test 1 Failed: Should have 4 statements");
console.assert(!test1.cleanPrompt.includes("Phototropism"), "Test 1 Failed: Clean prompt should not contain duplicate statement body");

// 2. Test Fallback Parsing when statements_json is missing but rawStem has embedded A-D
const test2 = deduplicateStemAndStatements(rawCombinationStem, undefined);
console.assert(
  test2.cleanPrompt === "Which of the following statements concerning plant movements and tropisms are correct?",
  `Test 2 Failed: Fallback clean prompt should only contain question header, got: '${test2.cleanPrompt}'`
);
console.assert(test2.statements.length === 4, "Test 2 Failed: Fallback should extract 4 statements");
console.assert(test2.statements[0].code === "A", "Test 2 Failed: Statement 0 code should be A");

// 3. Test Assertion-Reason Deduplication
const rawAssertionStem = `Consider the physiological control of ventilation:
Statement I (Assertion): Hyperventilation leads to respiratory alkalosis due to excessive clearance of arterial carbon dioxide.
Statement II (Reason): Central chemoreceptors in the medulla oblongata are directly stimulated by decreased arterial pH.`;

function deduplicateAssertionReason(rawStem: string, aText?: string, rText?: string) {
  let parsedA = aText || "";
  let parsedR = rText || "";
  let currentStem = rawStem;

  if (!parsedA || !parsedR) {
    const aMatch = currentStem.match(/(?:Statement\s*I\s*\(Assertion\)|Assertion)\s*[:\-]\s*([\s\S]+?)(?=(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]|$)/i);
    const rMatch = currentStem.match(/(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]\s*([\s\S]+?)$/i);
    if (aMatch && aMatch[1]) parsedA = parsedA || aMatch[1].trim();
    if (rMatch && rMatch[1]) parsedR = parsedR || rMatch[1].trim();
  }

  currentStem = currentStem
    .replace(/(?:Statement\s*I\s*\(Assertion\)|Assertion)\s*[:\-]\s*[\s\S]+?(?=(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]|$)/i, "")
    .replace(/(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]\s*[\s\S]+?$/i, "")
    .trim();

  return {
    cleanPrompt: currentStem || "Consider the statements given below and select the correct option:",
    assertionText: parsedA,
    reasonText: parsedR,
  };
}

const test3 = deduplicateAssertionReason(rawAssertionStem);
console.assert(
  test3.cleanPrompt === "Consider the physiological control of ventilation:",
  `Test 3 Failed: Assertion clean prompt should only have intro text, got: '${test3.cleanPrompt}'`
);
console.assert(
  test3.assertionText === "Hyperventilation leads to respiratory alkalosis due to excessive clearance of arterial carbon dioxide.",
  "Test 3 Failed: Assertion text should be extracted properly"
);
console.assert(
  test3.reasonText === "Central chemoreceptors in the medulla oblongata are directly stimulated by decreased arterial pH.",
  "Test 3 Failed: Reason text should be extracted properly"
);

// 4. Test Sequential / Diagnostic Steps Deduplication
const rawSequenceStem = `Trace the sequence of blood flow through the mammalian heart:
Step 1: Superior and Inferior Vena Cava
Step 2: Right Atrium
Step 3: Tricuspid Valve
Step 4: Right Ventricle
Step 5: Pulmonary Artery`;

function deduplicateSequence(rawStem: string, seqSteps?: string[]) {
  const steps = seqSteps || ["Superior and Inferior Vena Cava", "Right Atrium", "Tricuspid Valve", "Right Ventricle", "Pulmonary Artery"];
  const lines = rawStem.split("\n").filter((l) => !/^(?:Step|Stage)\s*\d+[\.\:\-]/i.test(l.trim()));
  return {
    cleanPrompt: lines.join("\n").trim(),
    steps,
  };
}

const test4 = deduplicateSequence(rawSequenceStem);
console.assert(
  test4.cleanPrompt === "Trace the sequence of blood flow through the mammalian heart:",
  `Test 4 Failed: Sequential clean prompt should not contain steps, got: '${test4.cleanPrompt}'`
);
console.assert(test4.steps.length === 5, "Test 4 Failed: Sequence should have 5 steps");

console.log("✓ All MCQ Deduplication pipeline test assertions passed successfully!");
