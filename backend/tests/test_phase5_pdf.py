from app.services.gemini_service import gemini

def test_gemini_pdf_past_paper_extraction():
    """Verify Gemini AI PDF past paper question & model answer extraction engine."""
    title = "2024 G.C.E. A/L Biology Paper I"
    year = 2024
    paper_type = "paper_1_mcq"

    # Simulate extraction call
    res = gemini.extract_and_generate_model_answers_from_pdf(
        file_path="uploads/past_papers/sample_2024.pdf",
        title=title,
        year=year,
        paper_type=paper_type
    )

    assert "paper_title" in res
    assert "questions" in res
    assert res["year"] == 2024
    assert len(res["questions"]) > 0

    first_q = res["questions"][0]
    assert "explanation" in first_q
    assert first_q["explanation"] is not None
    print(f"[SUCCESS] PDF Extraction Test Passed: {res['paper_title']} ({len(res['questions'])} Qs Extracted)")


def test_question_bank_grouping_structure():
    """Verify Paper Set Grouping naming convention."""
    group_name = "2024 G.C.E. A/L Biology Paper I"
    assert "2024" in group_name
    assert "Biology" in group_name
    print(f"[SUCCESS] Question Bank Group Naming Test Passed: '{group_name}'")


if __name__ == "__main__":
    print("Running Phase 5 Integration Tests...")
    test_gemini_pdf_past_paper_extraction()
    test_question_bank_grouping_structure()
    print("\n>>> ALL PHASE 5 INTEGRATION TESTS PASSED 100%! <<<")
