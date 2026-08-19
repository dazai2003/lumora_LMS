"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { SvgIcon } from "@/components/SvgIcon";

export interface SymbolItem {
  text: string;
  label: string;
  category: "ions_chem" | "math_genetics" | "arrows_greek" | "sub_super";
  tags: string[];
}

export const ALL_SCIENTIFIC_SYMBOLS: SymbolItem[] = [
  // ─── IONS & CHEMISTRY ───
  { text: "CO₂", label: "Carbon Dioxide", category: "ions_chem", tags: ["co2", "carbon", "dioxide", "gas", "photosynthesis", "respiration"] },
  { text: "H₂O", label: "Water", category: "ions_chem", tags: ["h2o", "water", "hydrogen", "oxygen"] },
  { text: "O₂", label: "Oxygen Gas", category: "ions_chem", tags: ["o2", "oxygen", "gas"] },
  { text: "N₂", label: "Nitrogen Gas", category: "ions_chem", tags: ["n2", "nitrogen", "gas"] },
  { text: "ATP", label: "Adenosine Triphosphate", category: "ions_chem", tags: ["atp", "energy", "adenosine"] },
  { text: "ADP", label: "Adenosine Diphosphate", category: "ions_chem", tags: ["adp", "phosphate"] },
  { text: "RuBisCO", label: "RuBisCO Enzyme", category: "ions_chem", tags: ["rubisco", "enzyme", "calvin", "cycle", "c3"] },
  { text: "NAD⁺", label: "Nicotinamide Adenine Dinucleotide", category: "ions_chem", tags: ["nad+", "nad", "coenzyme"] },
  { text: "NADH", label: "Reduced NAD", category: "ions_chem", tags: ["nadh", "reduced", "respiration"] },
  { text: "NADP⁺", label: "NADP Positive", category: "ions_chem", tags: ["nadp+", "nadp", "photosynthesis"] },
  { text: "NADPH", label: "Reduced NADP", category: "ions_chem", tags: ["nadph", "light", "reactions"] },
  { text: "FAD", label: "Flavin Adenine Dinucleotide", category: "ions_chem", tags: ["fad", "krebs"] },
  { text: "FADH₂", label: "Reduced FAD", category: "ions_chem", tags: ["fadh2", "fadh", "krebs"] },
  { text: "Ca²⁺", label: "Calcium Ion", category: "ions_chem", tags: ["ca2+", "calcium", "ion", "muscle"] },
  { text: "Mg²⁺", label: "Magnesium Ion", category: "ions_chem", tags: ["mg2+", "magnesium", "chlorophyll"] },
  { text: "Na⁺", label: "Sodium Ion", category: "ions_chem", tags: ["na+", "sodium", "nerve", "action", "potential"] },
  { text: "K⁺", label: "Potassium Ion", category: "ions_chem", tags: ["k+", "potassium", "stomata", "nerve"] },
  { text: "Fe²⁺", label: "Ferrous Iron (II)", category: "ions_chem", tags: ["fe2+", "iron", "haemoglobin"] },
  { text: "Fe³⁺", label: "Ferric Iron (III)", category: "ions_chem", tags: ["fe3+", "iron"] },
  { text: "Cl⁻", label: "Chloride Ion", category: "ions_chem", tags: ["cl-", "chloride", "ion"] },
  { text: "H⁺", label: "Hydrogen Ion / Proton", category: "ions_chem", tags: ["h+", "proton", "acid", "ph"] },
  { text: "OH⁻", label: "Hydroxide Ion", category: "ions_chem", tags: ["oh-", "hydroxide", "base"] },
  { text: "HCO₃⁻", label: "Bicarbonate Ion", category: "ions_chem", tags: ["hco3-", "bicarbonate", "blood", "buffer"] },
  { text: "PO₄³⁻", label: "Phosphate Ion", category: "ions_chem", tags: ["po43-", "phosphate", "dna", "rna"] },
  { text: "SO₄²⁻", label: "Sulfate Ion", category: "ions_chem", tags: ["so42-", "sulfate", "ion"] },
  { text: "NH₄⁺", label: "Ammonium Ion", category: "ions_chem", tags: ["nh4+", "ammonium", "nitrogen", "excretion"] },
  { text: "NO₃⁻", label: "Nitrate Ion", category: "ions_chem", tags: ["no3-", "nitrate", "plants"] },
  { text: "NO₂⁻", label: "Nitrite Ion", category: "ions_chem", tags: ["no2-", "nitrite"] },
  { text: "P680", label: "Photosystem II Reaction Center", category: "ions_chem", tags: ["p680", "psii", "photosystem"] },
  { text: "P700", label: "Photosystem I Reaction Center", category: "ions_chem", tags: ["p700", "psi", "photosystem"] },

  // ─── MATH & GENETICS ───
  { text: "×", label: "Multiplication / Genetic Cross", category: "math_genetics", tags: ["*", "times", "cross", "multiply", "genetics"] },
  { text: "÷", label: "Division", category: "math_genetics", tags: ["/", "divide", "division"] },
  { text: "±", label: "Plus-Minus", category: "math_genetics", tags: ["+-", "plus minus", "tolerance"] },
  { text: "≈", label: "Approximately Equal", category: "math_genetics", tags: ["~", "approx", "almost", "estimate"] },
  { text: "≤", label: "Less than or equal", category: "math_genetics", tags: ["<=", "le", "less"] },
  { text: "≥", label: "Greater than or equal", category: "math_genetics", tags: [">=", "ge", "greater"] },
  { text: "≠", label: "Not equal", category: "math_genetics", tags: ["!=", "neq", "not equal"] },
  { text: "∝", label: "Proportional To", category: "math_genetics", tags: ["prop", "proportional"] },
  { text: "∞", label: "Infinity", category: "math_genetics", tags: ["inf", "infinity"] },
  { text: "%", label: "Percent", category: "math_genetics", tags: ["percent", "percentage"] },
  { text: "√", label: "Square Root", category: "math_genetics", tags: ["sqrt", "root"] },
  { text: "♀", label: "Female Symbol", category: "math_genetics", tags: ["female", "woman", "maternal", "egg"] },
  { text: "♂", label: "Male Symbol", category: "math_genetics", tags: ["male", "man", "paternal", "sperm"] },
  { text: "F₁", label: "First Filial Generation", category: "math_genetics", tags: ["f1", "filial", "generation", "mendel"] },
  { text: "F₂", label: "Second Filial Generation", category: "math_genetics", tags: ["f2", "filial", "generation"] },
  { text: "P₁", label: "Parental Generation", category: "math_genetics", tags: ["p1", "parental", "generation"] },
  { text: "1:2:1", label: "Genotypic Ratio (Monohybrid)", category: "math_genetics", tags: ["1:2:1", "ratio", "genotype"] },
  { text: "3:1", label: "Phenotypic Ratio (Monohybrid)", category: "math_genetics", tags: ["3:1", "ratio", "phenotype"] },
  { text: "9:3:3:1", label: "Dihybrid Phenotypic Ratio", category: "math_genetics", tags: ["9:3:3:1", "dihybrid", "ratio"] },
  { text: "1:1:1:1", label: "Test Cross Ratio", category: "math_genetics", tags: ["1:1:1:1", "testcross"] },
  { text: "2n", label: "Diploid Chromosome Number", category: "math_genetics", tags: ["2n", "diploid", "somatic"] },
  { text: "n", label: "Haploid Chromosome Number", category: "math_genetics", tags: ["n", "haploid", "gamete"] },

  // ─── ARROWS & GREEK ───
  { text: "→", label: "Right Arrow / Yields", category: "arrows_greek", tags: ["arrow", "right", "reaction", "yields", "to", "produces"] },
  { text: "←", label: "Left Arrow", category: "arrows_greek", tags: ["arrow", "left"] },
  { text: "↔", label: "Bidirectional Arrow", category: "arrows_greek", tags: ["arrow", "both", "resonance"] },
  { text: "⇌", label: "Equilibrium Reaction", category: "arrows_greek", tags: ["equilibrium", "reversible", "reaction"] },
  { text: "↑", label: "Up Arrow / Gas Evolved", category: "arrows_greek", tags: ["arrow", "up", "gas"] },
  { text: "↓", label: "Down Arrow / Precipitate", category: "arrows_greek", tags: ["arrow", "down", "precipitate"] },
  { text: "α", label: "Alpha (Lowercase)", category: "arrows_greek", tags: ["alpha", "greek", "glucose", "helix"] },
  { text: "β", label: "Beta (Lowercase)", category: "arrows_greek", tags: ["beta", "greek", "pleated", "sheet"] },
  { text: "γ", label: "Gamma", category: "arrows_greek", tags: ["gamma", "greek"] },
  { text: "Δ", label: "Delta (Capital / Change)", category: "arrows_greek", tags: ["delta", "change", "difference"] },
  { text: "δ", label: "Delta (Lowercase)", category: "arrows_greek", tags: ["delta", "partial", "charge"] },
  { text: "θ", label: "Theta", category: "arrows_greek", tags: ["theta", "angle"] },
  { text: "λ", label: "Lambda (Wavelength)", category: "arrows_greek", tags: ["lambda", "wavelength", "light"] },
  { text: "μ", label: "Micro Prefix", category: "arrows_greek", tags: ["mu", "micro", "prefix"] },
  { text: "π", label: "Pi", category: "arrows_greek", tags: ["pi", "math"] },
  { text: "σ", label: "Sigma (Lowercase)", category: "arrows_greek", tags: ["sigma", "bond"] },
  { text: "Ω", label: "Omega (Capital)", category: "arrows_greek", tags: ["omega", "ohm", "resistance"] },
  { text: "ω", label: "Omega (Lowercase)", category: "arrows_greek", tags: ["omega"] },
  { text: "ψ", label: "Psi (General Water Potential)", category: "arrows_greek", tags: ["psi", "water", "potential"] },
  { text: "ψw", label: "Water Potential (ψw)", category: "arrows_greek", tags: ["psi_w", "psiw", "water", "potential", "osmosis"] },
  { text: "ψs", label: "Solute Potential (ψs)", category: "arrows_greek", tags: ["psi_s", "psis", "solute", "osmotic"] },
  { text: "ψp", label: "Pressure Potential (ψp)", category: "arrows_greek", tags: ["psi_p", "psip", "pressure", "turgor"] },
  { text: "°C", label: "Degrees Celsius", category: "arrows_greek", tags: ["celsius", "temperature", "deg c"] },
  { text: "°", label: "Degree Symbol", category: "arrows_greek", tags: ["deg", "degree"] },
  { text: "μm", label: "Micrometer / Micron", category: "arrows_greek", tags: ["um", "micrometer", "micron", "cell", "size"] },
  { text: "nm", label: "Nanometer", category: "arrows_greek", tags: ["nm", "nanometer", "organelle"] },
  { text: "μL", label: "Microliter", category: "arrows_greek", tags: ["ul", "microliter"] },
  { text: "μg", label: "Microgram", category: "arrows_greek", tags: ["ug", "microgram"] },

  // ─── SUB & SUPERSCRIPTS ───
  { text: "₂", label: "Subscript 2", category: "sub_super", tags: ["subscript 2", "sub 2", "2"] },
  { text: "₃", label: "Subscript 3", category: "sub_super", tags: ["subscript 3", "sub 3", "3"] },
  { text: "₄", label: "Subscript 4", category: "sub_super", tags: ["subscript 4", "sub 4", "4"] },
  { text: "₁", label: "Subscript 1", category: "sub_super", tags: ["subscript 1", "sub 1", "1"] },
  { text: "₀", label: "Subscript 0", category: "sub_super", tags: ["subscript 0", "sub 0", "0"] },
  { text: "₅", label: "Subscript 5", category: "sub_super", tags: ["subscript 5", "sub 5", "5"] },
  { text: "₆", label: "Subscript 6", category: "sub_super", tags: ["subscript 6", "sub 6", "6"] },
  { text: "₇", label: "Subscript 7", category: "sub_super", tags: ["subscript 7", "sub 7", "7"] },
  { text: "₈", label: "Subscript 8", category: "sub_super", tags: ["subscript 8", "sub 8", "8"] },
  { text: "₉", label: "Subscript 9", category: "sub_super", tags: ["subscript 9", "sub 9", "9"] },
  { text: "⁺", label: "Superscript Plus (+)", category: "sub_super", tags: ["superscript plus", "plus", "ion", "+"] },
  { text: "⁻", label: "Superscript Minus (-)", category: "sub_super", tags: ["superscript minus", "minus", "ion", "-"] },
  { text: "²", label: "Superscript 2 (Squared)", category: "sub_super", tags: ["superscript 2", "squared", "^2"] },
  { text: "³", label: "Superscript 3 (Cubed)", category: "sub_super", tags: ["superscript 3", "cubed", "^3"] },
  { text: "¹", label: "Superscript 1", category: "sub_super", tags: ["superscript 1", "^1"] },
  { text: "⁰", label: "Superscript 0", category: "sub_super", tags: ["superscript 0", "^0"] },
  { text: "⁴", label: "Superscript 4", category: "sub_super", tags: ["superscript 4", "^4"] },
  { text: "⁻¹", label: "Per Unit (⁻¹)", category: "sub_super", tags: ["per", "inverse", "-1", "s-1"] },
  { text: "⁻²", label: "Inverse Squared (⁻²)", category: "sub_super", tags: ["-2", "m-2"] },
  { text: "⁻³", label: "Inverse Cubed (⁻³)", category: "sub_super", tags: ["-3", "dm-3"] },
];

export const COMMONLY_USED_SYMBOLS: SymbolItem[] = [
  { text: "→", label: "Yields", category: "arrows_greek", tags: ["arrow"] },
  { text: "×", label: "Cross", category: "math_genetics", tags: ["cross"] },
  { text: "₂", label: "Subscript 2", category: "sub_super", tags: ["2"] },
  { text: "⁺", label: "Ion (+)", category: "sub_super", tags: ["+"] },
  { text: "²", label: "Squared", category: "sub_super", tags: ["2"] },
  { text: "μ", label: "Micro", category: "arrows_greek", tags: ["mu"] },
  { text: "α", label: "Alpha", category: "arrows_greek", tags: ["alpha"] },
  { text: "β", label: "Beta", category: "arrows_greek", tags: ["beta"] },
  { text: "°C", label: "°C", category: "arrows_greek", tags: ["celsius"] },
  { text: "CO₂", label: "CO₂", category: "ions_chem", tags: ["co2"] },
  { text: "ATP", label: "ATP", category: "ions_chem", tags: ["atp"] },
  { text: "ψw", label: "ψw", category: "arrows_greek", tags: ["psiw"] },
];

interface ScientificSymbolPickerProps {
  onInsert: (symbol: string) => void;
  disabled?: boolean;
  buttonLabel?: string;
  compact?: boolean;
}

export default function ScientificSymbolPickerModal({
  onInsert,
  disabled = false,
  buttonLabel = "Insert Symbol (Ω)",
  compact = false,
}: ScientificSymbolPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "ions_chem" | "math_genetics" | "arrows_greek" | "sub_super">("all");
  const [justInserted, setJustInserted] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape or outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
      setJustInserted(null);
    }
  }, [isOpen]);

  const filteredSymbols = useMemo(() => {
    let list = ALL_SCIENTIFIC_SYMBOLS;
    if (activeCategory !== "all") {
      list = list.filter((item) => item.category === activeCategory);
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter((item) => {
      if (item.text.toLowerCase().includes(query)) return true;
      if (item.label.toLowerCase().includes(query)) return true;
      return item.tags.some((tag) => tag.toLowerCase().includes(query));
    });
  }, [activeCategory, searchQuery]);

  const handlePickSymbol = (text: string) => {
    if (disabled) return;
    onInsert(text);
    setJustInserted(text);
    setTimeout(() => {
      setJustInserted((prev) => (prev === text ? null : prev));
    }, 1200);
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="btn btn-secondary"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: compact ? "0.2rem 0.55rem" : "0.35rem 0.85rem",
          fontSize: compact ? "0.75rem" : "0.82rem",
          fontWeight: 600,
          background: isOpen ? "var(--accent-primary-light, rgba(99, 102, 241, 0.15))" : "var(--bg-card)",
          border: isOpen ? "1.5px solid var(--accent-primary)" : "1px solid var(--border)",
          borderRadius: "var(--radius-sm, 6px)",
          color: isOpen ? "var(--accent-primary)" : "var(--text-primary)",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.15s ease",
          boxShadow: isOpen ? "0 0 0 2px rgba(99, 102, 241, 0.2)" : "none",
        }}
        title="Open Scientific & Mathematical Symbols Picker"
      >
        <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--accent-primary)" }}>Ω</span>
        <span>{buttonLabel}</span>
        <SvgIcon name="chevron-down" size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
      </button>

      {/* Popover Modal Container */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 1000,
            width: "min(460px, 92vw)",
            background: "var(--bg-card, #ffffff)",
            border: "1px solid var(--border, #e2e8f0)",
            borderRadius: "var(--radius-md, 10px)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            padding: "0",
            overflow: "hidden",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 1rem",
              background: "var(--bg-secondary, #f8fafc)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px",
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "var(--accent-primary)",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              >
                Ω
              </span>
              <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Insert Symbol (Ω)
              </h4>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {justInserted && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "var(--success, #10b981)",
                    background: "rgba(16, 185, 129, 0.12)",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "4px",
                    animation: "fadeIn 0.2s ease",
                  }}
                >
                  Inserted &quot;{justInserted}&quot;
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn-icon"
                style={{ width: "26px", height: "26px", borderRadius: "4px" }}
                title="Close"
              >
                <SvgIcon name="x" size={14} />
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div style={{ padding: "0.75rem 1rem 0.4rem 1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--bg-secondary, #f8fafc)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm, 6px)",
                padding: "0.35rem 0.65rem",
                gap: "0.5rem",
              }}
            >
              <SvgIcon name="search" size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbol (e.g. arrow, CO2, alpha, plus, root)..."
                style={{
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  width: "100%",
                  fontSize: "0.82rem",
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: "0",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <SvgIcon name="x" size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div
            style={{
              display: "flex",
              gap: "0.35rem",
              padding: "0.4rem 1rem 0.6rem 1rem",
              borderBottom: "1px solid var(--border)",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {[
              { id: "all", label: "All" },
              { id: "ions_chem", label: "Ions & Chem" },
              { id: "math_genetics", label: "Math & Genetics" },
              { id: "arrows_greek", label: "Arrows & Greek" },
              { id: "sub_super", label: "Sub / Super" },
            ].map((tab) => {
              const active = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id as any)}
                  style={{
                    whiteSpace: "nowrap",
                    padding: "0.2rem 0.55rem",
                    fontSize: "0.72rem",
                    fontWeight: active ? 700 : 500,
                    borderRadius: "12px",
                    border: active ? "1px solid var(--accent-primary)" : "1px solid var(--border)",
                    background: active ? "var(--accent-primary)" : "var(--bg-secondary)",
                    color: active ? "#ffffff" : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Commonly Used Quick Bar (Shown when not actively searching) */}
          {!searchQuery && activeCategory === "all" && (
            <div style={{ padding: "0.6rem 1rem 0.3rem 1rem", background: "rgba(99, 102, 241, 0.03)" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.35rem" }}>
                Commonly Used:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {COMMONLY_USED_SYMBOLS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handlePickSymbol(s.text)}
                    style={{
                      minWidth: "32px",
                      height: "30px",
                      padding: "0 0.4rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "5px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      transition: "all 0.1s ease",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent-primary)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.transform = "none";
                    }}
                    title={`Insert ${s.label} (${s.text})`}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filtered Symbols Grid */}
          <div
            style={{
              maxHeight: "220px",
              overflowY: "auto",
              padding: "0.65rem 1rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))",
              gap: "0.35rem",
            }}
          >
            {filteredSymbols.length > 0 ? (
              filteredSymbols.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePickSymbol(item.text)}
                  style={{
                    height: "36px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg-secondary, #f8fafc)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                    padding: "0.1rem",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-primary)";
                    e.currentTarget.style.background = "var(--bg-card)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 3px 6px rgba(0,0,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--bg-secondary, #f8fafc)";
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  title={`${item.label} (${item.text})`}
                >
                  <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                    {item.text}
                  </span>
                </button>
              ))
            ) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "1.5rem 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                No symbols found for &quot;{searchQuery}&quot;
              </div>
            )}
          </div>

          {/* Footer Guide / Quick Done */}
          <div
            style={{
              padding: "0.5rem 1rem",
              background: "var(--bg-secondary)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.72rem",
              color: "var(--text-muted)",
            }}
          >
            <span>Tip: Click any symbol to insert into your answer.</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="btn btn-primary"
              style={{ padding: "0.2rem 0.75rem", fontSize: "0.72rem" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
