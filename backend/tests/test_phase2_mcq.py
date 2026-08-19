from app.services.al_weighting_service import calculate_al_template_breakdown
from app.api.al_exams import resolve_combination_grid_option

def test_al_template_breakdown_calculation():
    """Verify proportional template math for 50-question paper."""
    breakdown_50 = calculate_al_template_breakdown(50)
    assert sum(breakdown_50.values()) == 50
    assert breakdown_50["generic_mcq"] == 13
    assert breakdown_50["combination_grid"] == 10
    print(f"[SUCCESS] 50-Question Proportional Breakdown Math Passed: {breakdown_50}")


def test_al_template_breakdown_custom_count():
    """Verify proportional template math for custom 25-question paper."""
    breakdown_25 = calculate_al_template_breakdown(25)
    assert sum(breakdown_25.values()) == 25
    print(f"[SUCCESS] 25-Question Proportional Breakdown Math Passed: {breakdown_25}")


def test_combination_grid_dual_mode_resolution():
    """Verify dual-mode Combination Grid choice resolution."""
    assert resolve_combination_grid_option("A") == "A"
    assert resolve_combination_grid_option("a,b") == "A"
    assert resolve_combination_grid_option("a,c") == "B"
    assert resolve_combination_grid_option("c,d") == "C"
    assert resolve_combination_grid_option("a,b,c") == "D"
    assert resolve_combination_grid_option("b,d") == "E"
    print("[SUCCESS] Dual-Mode Combination Grid Resolution Test Passed: A, B, C, D, E")


if __name__ == "__main__":
    print("Running Phase 2 Integration Tests...")
    test_al_template_breakdown_calculation()
    test_al_template_breakdown_custom_count()
    test_combination_grid_dual_mode_resolution()
    print("\n>>> ALL PHASE 2 INTEGRATION TESTS PASSED 100%! <<<")
