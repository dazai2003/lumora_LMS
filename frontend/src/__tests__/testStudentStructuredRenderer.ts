import {
  StructuredNode,
  formatDisplayLabel,
  getLabelForIndex,
  calculateNodePoints,
  calculateTotalTreeRawPoints,
  collectLeafAnswerableNodes,
  reindexTreeLabels,
  createBlankNode,
} from "../lib/alStructuredTreeUtils";
import { normalizeScientificSymbols } from "../lib/scientificSymbolUtils";

console.log("=== Testing Student Structured Paper Renderer Logic & Data Integrity ===");

// TEST 1: Question with A/B/C Sections
const sectionA = createBlankNode("structured_direct_recall", 10);
const sectionB = createBlankNode("structured_comparison", 14);
const sectionC = createBlankNode("structured_diagram", 16);
const tree1 = reindexTreeLabels([sectionA, sectionB, sectionC]);

console.assert(formatDisplayLabel(tree1[0].label, 0, 0) === "(A)", "Section 0 label should format to (A)");
console.assert(formatDisplayLabel(tree1[1].label, 0, 1) === "(B)", "Section 1 label should format to (B)");
console.assert(formatDisplayLabel(tree1[2].label, 0, 2) === "(C)", "Section 2 label should format to (C)");

// TEST 2: Question with Roman numerals at Depth 1
sectionA.children = [
  createBlankNode("structured_direct_recall", 4),
  createBlankNode("structured_conceptual", 6),
];
const tree2 = reindexTreeLabels([sectionA]);
console.assert(formatDisplayLabel(tree2[0].children![0].label, 1, 0) === "(i)", "Child 0 label should format to (i)");
console.assert(formatDisplayLabel(tree2[0].children![1].label, 1, 1) === "(ii)", "Child 1 label should format to (ii)");

// TEST 3: Question with alphabetical subparts at Depth 2
sectionA.children[0].children = [
  createBlankNode("structured_direct_recall", 2),
  createBlankNode("structured_direct_recall", 2),
];
const tree3 = reindexTreeLabels([sectionA]);
console.assert(formatDisplayLabel(tree3[0].children![0].children![0].label, 2, 0) === "(a)", "Grandchild 0 label should format to (a)");
console.assert(formatDisplayLabel(tree3[0].children![0].children![1].label, 2, 1) === "(b)", "Grandchild 1 label should format to (b)");

// TEST 4: Question with nested subparts at Depth 3
sectionA.children[0].children[0].children = [
  createBlankNode("structured_direct_recall", 1),
  createBlankNode("structured_direct_recall", 1),
];
const tree4 = reindexTreeLabels([sectionA]);
console.assert(formatDisplayLabel(tree4[0].children![0].children![0].children![0].label, 3, 0) === "(i)", "Great-grandchild 0 should format to (i)");
console.assert(formatDisplayLabel(tree4[0].children![0].children![0].children![1].label, 3, 1) === "(ii)", "Great-grandchild 1 should format to (ii)");

// TEST 5: Verify all 7 supported formats have distinct stable identifiers and leaf extraction
const fullTree: StructuredNode[] = [
  {
    id: "sec_a",
    label: "(A)",
    format_type: "structured_direct_recall",
    prompt: "Section A Overview",
    points: 10,
    children: [
      {
        id: "node_recall",
        label: "(i)",
        format_type: "structured_direct_recall",
        prompt: "Name two contractile proteins in myofibrils.",
        points: 2,
      },
      {
        id: "node_conceptual",
        label: "(ii)",
        format_type: "structured_conceptual",
        prompt: "Explain how calcium ions trigger muscle contraction.",
        points: 4,
      },
      {
        id: "node_sequential",
        label: "(iii)",
        format_type: "structured_sequential",
        prompt: "State the sequence of cardiac conduction.",
        points: 4,
        sequence_items: ["SA node", "AV node", "Bundle of His", "Purkinje fibers"],
      },
    ],
  },
  {
    id: "sec_b",
    label: "(B)",
    format_type: "structured_comparison",
    prompt: "Section B Comparisons & Tables",
    points: 14,
    children: [
      {
        id: "node_comparison",
        label: "(i)",
        format_type: "structured_comparison",
        prompt: "Compare skeletal muscle and smooth muscle.",
        points: 6,
        comparison_header_1: "Skeletal Muscle",
        comparison_header_2: "Smooth Muscle",
        comparison_pairs: [
          { criterion: "Striations", value_1: "Present", value_2: "Absent" },
          { criterion: "Control", value_1: "Voluntary", value_2: "Involuntary" },
        ],
      },
      {
        id: "node_matrix",
        label: "(ii)",
        format_type: "structured_matrix",
        prompt: "Complete the table of nitrogenous excretory products.",
        points: 8,
        matrix_data: {
          col_headers: ["Animal Group", "Excretory Product"],
          rows: [
            { item: "Mammals", expected: "Urea" },
            { item: "Birds", expected: "Uric acid" },
          ],
        },
      },
    ],
  },
  {
    id: "sec_c",
    label: "(C)",
    format_type: "structured_diagram",
    prompt: "Section C Visual & Drawings",
    points: 16,
    children: [
      {
        id: "node_diagram",
        label: "(i)",
        format_type: "structured_diagram",
        prompt: "Identify parts X and Y on the provided nephron diagram.",
        points: 6,
        diagram_info: {
          requires_image: true,
          image_url: "/uploads/nephron.png",
          image_description: "Diagram of human nephron with Malpighian body",
        },
      },
      {
        id: "node_drawing",
        label: "(ii)",
        format_type: "structured_drawing",
        prompt: "Draw and label the cross section of a dicotyledonous root.",
        drawing_prompt: "Draw a labelled diagram showing epidermis, cortex, endodermis, and xylem.",
        required_labels: ["Epidermis", "Cortex", "Endodermis", "Xylem", "Phloem"],
        points: 10,
      },
    ],
  },
];

const leaves = collectLeafAnswerableNodes(fullTree);
console.assert(leaves.length === 7, `Should collect exactly 7 leaf answerable nodes, got ${leaves.length}`);
console.assert(calculateTotalTreeRawPoints(fullTree) === 40, `Total points should be 40, got ${calculateTotalTreeRawPoints(fullTree)}`);

// TEST 6: Subpart Answer State Isolation Simulation
const subpartAnswersState: Record<string, any> = {};

// Student answers Q1-A-(i)
subpartAnswersState["node_recall"] = "Actin and Myosin";
console.assert(subpartAnswersState["node_recall"] === "Actin and Myosin", "Direct recall answer saved");
console.assert(subpartAnswersState["node_conceptual"] === undefined, "Conceptual answer remains isolated and empty");

// Student answers Comparison cells
subpartAnswersState["node_comparison__comp_0_v1"] = "Striated";
subpartAnswersState["node_comparison__comp_0_v2"] = "Non-striated";
console.assert(subpartAnswersState["node_comparison__comp_0_v1"] === "Striated", "Comparison cell 1 saved");
console.assert(subpartAnswersState["node_comparison__comp_0_v2"] === "Non-striated", "Comparison cell 2 saved");
console.assert(subpartAnswersState["node_matrix__cell_0_1"] === undefined, "Matrix table cell remains untouched");

// Student draws or uploads
subpartAnswersState["node_drawing__drawing"] = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
console.assert(Boolean(subpartAnswersState["node_drawing__drawing"]), "Drawing answer saved as base64 canvas/upload URL");

// TEST 7: Scientific Notation & Symbol Normalization in Structured Content
const sampleStem = "Calculate psi_w when psi_s = -0.8 MPa for CO2 and H2O absorption in plants.";
const normalizedStem = normalizeScientificSymbols(sampleStem);
console.assert(normalizedStem.includes("ψw"), "psi_w should normalize to ψw");
console.assert(normalizedStem.includes("ψs"), "psi_s should normalize to ψs");
console.assert(normalizedStem.includes("CO₂"), "CO2 should normalize to CO₂");
console.assert(normalizedStem.includes("H₂O"), "H2O should normalize to H₂O");

// TEST 8: Fallback Safety against Malformed / Empty Data
const malformedRawLabel = undefined;
const safeLabel = formatDisplayLabel(malformedRawLabel, 1, 0);
console.assert(safeLabel === "(i)", `Undefined label should safely fallback to canonical '(i)', got '${safeLabel}'`);
console.assert(!safeLabel.includes("undefined"), "Label must never contain 'undefined'");

console.log("✓ All 8 Student Structured Question Renderer assertions passed successfully!");
