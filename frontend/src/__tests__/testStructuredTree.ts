import {
  getLabelForIndex,
  reindexTreeLabels,
  calculateNodePoints,
  calculateTotalTreeRawPoints,
  duplicateNode,
  duplicateNodeOnly,
  cloneStructuredTree,
  getStructureSummary,
  createBlankNode,
  insertChildNode,
  insertSiblingNode,
  deleteNodeById,
  StructuredNode,
} from "../lib/alStructuredTreeUtils";

console.log("Testing alStructuredTreeUtils...");

// 1. Test getLabelForIndex depths
console.assert(getLabelForIndex(0, 0) === "A", "Depth 0 index 0 should be A");
console.assert(getLabelForIndex(0, 1) === "B", "Depth 0 index 1 should be B");
console.assert(getLabelForIndex(0, 2) === "C", "Depth 0 index 2 should be C");
console.assert(getLabelForIndex(1, 0) === "1", "Depth 1 index 0 should be 1");
console.assert(getLabelForIndex(1, 1) === "2", "Depth 1 index 1 should be 2");
console.assert(getLabelForIndex(2, 0) === "(a)", "Depth 2 index 0 should be (a)");
console.assert(getLabelForIndex(2, 1) === "(b)", "Depth 2 index 1 should be (b)");
console.assert(getLabelForIndex(3, 0) === "(i)", "Depth 3 index 0 should be (i)");
console.assert(getLabelForIndex(3, 1) === "(ii)", "Depth 3 index 1 should be (ii)");
console.assert(getLabelForIndex(3, 2) === "(iii)", "Depth 3 index 2 should be (iii)");

// 2. Test Tree re-indexing
const rootA = createBlankNode("structured_direct_recall", 10);
rootA.children = [
  createBlankNode("structured_direct_recall", 4),
  createBlankNode("structured_conceptual", 6),
];
const rootB = createBlankNode("structured_comparison", 14);
rootB.children = [
  createBlankNode("structured_comparison", 6),
  createBlankNode("structured_matrix", 8),
];
const rootC = createBlankNode("structured_diagram", 16);
rootC.children = [
  createBlankNode("structured_diagram", 16),
];

const tree = reindexTreeLabels([rootA, rootB, rootC]);
console.assert(tree[0].label === "A", "Root 0 should be A");
console.assert(tree[1].label === "B", "Root 1 should be B");
console.assert(tree[2].label === "C", "Root 2 should be C");
console.assert(tree[0].children![0].label === "1", "A.0 should be 1");
console.assert(tree[0].children![1].label === "2", "A.1 should be 2");
console.assert(tree[1].children![0].label === "1", "B.0 should be 1");
console.assert(tree[1].children![1].label === "2", "B.1 should be 2");

// 3. Test Points Calculation & 40-Point Cap
const totalPoints = calculateTotalTreeRawPoints(tree);
console.assert(totalPoints === 40, `Total points should be 40, got ${totalPoints}`);

const summary = getStructureSummary(tree);
console.assert(summary.isComplete === true, "Should be complete (40 pts)");
console.assert(summary.isOverAllocated === false, "Should not be over-allocated");
console.assert(summary.scaledMarks === 100, "Scaled marks should be 100");
console.assert(summary.sections.length === 3, "Should have 3 sections");
console.assert(summary.sections[0].points === 10, "Section A should have 10 points");
console.assert(summary.sections[1].points === 14, "Section B should have 14 points");
console.assert(summary.sections[2].points === 16, "Section C should have 16 points");

// 4. Test Deletion & Auto-Reindexing
const treeAfterDelete = deleteNodeById(tree, tree[0].children![0].id);
console.assert(treeAfterDelete[0].children!.length === 1, "Section A should now have 1 child");
console.assert(treeAfterDelete[0].children![0].label === "1", "Remaining child in Section A should reindex to 1");

// 5. Test Cloning Whole Tree
const clonedTree = cloneStructuredTree(tree);
console.assert(clonedTree.length === tree.length, "Cloned tree should have same length");
console.assert(clonedTree[0].id !== tree[0].id, "Cloned tree root should have a new ID");
console.assert(clonedTree[0].children![0].id !== tree[0].children![0].id, "Cloned child should have a new ID");
console.assert(calculateTotalTreeRawPoints(clonedTree) === 40, "Cloned tree should have 40 points");

console.log("All alStructuredTreeUtils assertions passed successfully!");
