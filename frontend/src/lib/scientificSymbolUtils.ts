/**
 * Lumora A/L Biology Assessment Assembly — Scientific & Mathematical Symbol Normalization Utility
 * 
 * Normalizes raw AI string representations (e.g. \alpha, alpha, &alpha;, CO2, H2O, Ca2+, 10^-3)
 * into canonical, clean Unicode scientific & mathematical notation for assessment display and editing.
 */

export function normalizeScientificSymbols(input: string | null | undefined): string {
  if (!input) return "";

  let text = String(input);

  // 1. Escaped LaTeX & HTML entity normalization for Greek letters
  text = text.replace(/\\alpha\b|&alpha;|&#945;/gi, "α");
  text = text.replace(/\\beta\b|&beta;|&#946;/gi, "β");
  text = text.replace(/\\gamma\b|&gamma;|&#947;/gi, "γ");
  text = text.replace(/\\delta\b|&delta;|&#948;/gi, "δ");
  text = text.replace(/\\Delta\b|&Delta;|&#916;/g, "Δ");
  text = text.replace(/\\epsilon\b|&epsilon;|&#949;/gi, "ε");
  text = text.replace(/\\theta\b|&theta;|&#952;/gi, "θ");
  text = text.replace(/\\lambda\b|&lambda;|&#955;/gi, "λ");
  text = text.replace(/\\mu\b|&mu;|&#956;/gi, "μ");
  text = text.replace(/\\pi\b|&pi;|&#960;/gi, "π");
  text = text.replace(/\\sigma\b|&sigma;|&#963;/gi, "σ");
  text = text.replace(/\\phi\b|&phi;|&#966;/gi, "φ");
  text = text.replace(/\\omega\b|&omega;|&#969;/gi, "ω");
  text = text.replace(/\\Omega\b|&Omega;|&#937;/g, "Ω");
  text = text.replace(/\\psi_w\b|\bpsi_w\b|\bpsi w\b/gi, "ψw");
  text = text.replace(/\\psi_s\b|\bpsi_s\b|\bpsi s\b/gi, "ψs");
  text = text.replace(/\\psi_p\b|\bpsi_p\b|\bpsi p\b/gi, "ψp");
  text = text.replace(/\\psi\b|\bpsi\b|&psi;|&#968;/gi, "ψ");

  // 2. Mathematical operators & relations
  text = text.replace(/\\times\b|&times;/gi, "×");
  text = text.replace(/\\pm\b|&pm;|\+\/-/gi, "±");
  text = text.replace(/\\ge\b|\\geq\b|&ge;|>=/gi, "≥");
  text = text.replace(/\\le\b|\\leq\b|&le;|<=/gi, "≤");
  text = text.replace(/\\neq\b|&ne;|!=/gi, "≠");
  text = text.replace(/\\rightarrow\b|\\to\b|->|&rarr;/gi, "→");
  text = text.replace(/\\leftarrow\b|<-|&larr;/gi, "←");
  text = text.replace(/\\degree\b|\\deg\b|&deg;/gi, "°");

  // 3. Common Biological & Chemical Formulas & Coenzymes
  text = text.replace(/\bCO2\b/g, "CO₂");
  text = text.replace(/\bH2O\b/g, "H₂O");
  text = text.replace(/\bO2\b/g, "O₂");
  text = text.replace(/\bN2\b/g, "N₂");
  text = text.replace(/\bNAD\+/g, "NAD⁺");
  text = text.replace(/\bNADP\+/g, "NADP⁺");
  text = text.replace(/\bFADH2\b/g, "FADH₂");
  text = text.replace(/\bCa2\+\b/g, "Ca²⁺");
  text = text.replace(/\bNa\+\b/g, "Na⁺");
  text = text.replace(/\bK\+\b/g, "K⁺");
  text = text.replace(/\bCl-\b/g, "Cl⁻");
  text = text.replace(/\bMg2\+\b/g, "Mg²⁺");
  text = text.replace(/\bFe2\+\b/g, "Fe²⁺");
  text = text.replace(/\bFe3\+\b/g, "Fe³⁺");
  text = text.replace(/\bH\+\b/g, "H⁺");
  text = text.replace(/\bOH-\b/g, "OH⁻");
  text = text.replace(/\bHCO3-\b/g, "HCO₃⁻");
  text = text.replace(/\bNH4\+\b/g, "NH₄⁺");
  text = text.replace(/\bPO43-\b|\bPO4 3-\b/g, "PO₄³⁻");
  text = text.replace(/\bSO42-\b|\bSO4 2-\b/g, "SO₄²⁻");

  // 4. Photosystems
  text = text.replace(/\bP\s*700\b/g, "P700");
  text = text.replace(/\bP\s*680\b/g, "P680");

  // 4. Scientific Notation exponents (e.g. 10^-3 -> 10⁻³)
  text = text.replace(/10\^-1\b/g, "10⁻¹");
  text = text.replace(/10\^-2\b/g, "10⁻²");
  text = text.replace(/10\^-3\b/g, "10⁻³");
  text = text.replace(/10\^-4\b/g, "10⁻⁴");
  text = text.replace(/10\^-5\b/g, "10⁻⁵");
  text = text.replace(/10\^-6\b/g, "10⁻⁶");
  text = text.replace(/10\^3\b/g, "10³");
  text = text.replace(/10\^6\b/g, "10⁶");

  // 5. Cell Cycle Phases
  text = text.replace(/\bG0\b|\bG_0\b/g, "G₀");
  text = text.replace(/\bG1\b|\bG_1\b/g, "G₁");
  text = text.replace(/\bG2\b|\bG_2\b/g, "G₂");

  // 6. Micrometers / Units
  text = text.replace(/\bum\b/g, "μm");
  text = text.replace(/\bug\b/g, "μg");
  text = text.replace(/\buL\b/g, "μL");

  return text;
}
