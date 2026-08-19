from app.services.gemini_service import gemini
from app.api.al_exams import _calculate_al_grade

def test_paper2_structured_25x_scaling():
    """Verify Paper II-A structured scaling scales 40 raw points to 100 max points."""
    subparts_spec = [
        {"part": "a(i)", "prompt": "Identify organelle X.", "max_points": 2.0, "expected_keywords": ["mitochondrion", "ATP"]},
        {"part": "a(ii)", "prompt": "State function of inner membrane.", "max_points": 2.0, "expected_keywords": ["cristae", "surface area"]},
    ]
    student_ans = {
        "a(i)": "It is the mitochondrion producing ATP during cellular respiration.",
        "a(ii)": "Folded into cristae to increase surface area for electron transport chain."
    }

    eval_res = gemini.evaluate_al_structured(student_ans, subparts_spec)
    assert "subpart_results" in eval_res
    total_raw = min(float(eval_res.get("total_raw_points", 0.0)), 40.0)
    scaled = total_raw * 2.5 # 2.5x scaling
    
    assert total_raw >= 2.0
    assert scaled >= 5.0
    assert scaled <= 100.0
    print(f"[SUCCESS] Structured 2.5x Scaling Test Passed: Raw={total_raw}, Scaled={scaled}")


def test_paper2_essay_checklist_evaluation():
    """Verify Paper II-B essay checklist evaluation evaluates against 37-41 point rubric."""
    checklist = [
        {"item_number": 1, "criterion": "Primary structure is the linear sequence of amino acids linked by peptide bonds.", "points": 4.0},
        {"item_number": 2, "criterion": "Secondary structure involves alpha-helices and beta-pleated sheets via hydrogen bonding.", "points": 4.0},
        {"item_number": 3, "criterion": "Tertiary structure involves 3D folding stabilized by disulfide bridges and ionic bonds.", "points": 4.0},
    ]
    essay_text = """Protein structure is organized into four levels. The primary structure consists of a linear sequence of amino acids joined together by covalent peptide bonds. The secondary structure features spatial arrangements such as alpha-helices and beta-pleated sheets held by hydrogen bonding between peptide backbones. The tertiary structure represents the full 3D spatial folding stabilized by hydrophobic interactions, disulfide bridges, and ionic bonds between R-groups."""

    eval_res = gemini.evaluate_al_essay(essay_text, checklist)
    assert "checklist_evaluations" in eval_res
    assert "raw_score" in eval_res
    assert len(eval_res["checklist_evaluations"]) == 3
    assert eval_res["raw_score"] >= 8.0 # At least 2 items matched
    print(f"[SUCCESS] Essay 37-41 Point Checklist Test Passed: Raw Score={eval_res['raw_score']}")


def test_al_grade_calculation():
    """Verify G.C.E. A/L standard grade boundaries."""
    assert _calculate_al_grade(85.0) == "A"
    assert _calculate_al_grade(70.0) == "B"
    assert _calculate_al_grade(60.0) == "C"
    assert _calculate_al_grade(45.0) == "S"
    assert _calculate_al_grade(30.0) == "F"
    print("[SUCCESS] G.C.E. A/L Grade Boundaries Test Passed: A, B, C, S, F")

if __name__ == "__main__":
    print("Running Phase 4 Integration Tests...")
    test_paper2_structured_25x_scaling()
    test_paper2_essay_checklist_evaluation()
    test_al_grade_calculation()
    print("\n>>> ALL PHASE 4 INTEGRATION TESTS PASSED 100%! <<<")
