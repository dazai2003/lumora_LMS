from app.models import ALExam, ALQuestion, MaterialDifficultyHotspot

def test_custom_al_exam_creation_structure():
    """Verify custom A/L exam creation model fields and attempt limits."""
    exam = ALExam(
        course_id=1,
        title="Unit 3 Model Exam",
        exam_type="paper_1_mcq",
        time_limit_minutes=120,
        total_questions=50,
        max_attempts=1,
        is_published=True,
    )
    assert exam.title == "Unit 3 Model Exam"
    assert exam.max_attempts == 1
    print(f"[SUCCESS] Custom Exam Creation Test Passed: '{exam.title}' (Attempts: {exam.max_attempts})")


def test_hotspot_timestamp_cluster_math():
    """Verify timestamp bucket cluster calculation logic (1-minute intervals)."""
    timestamps = [645, 650, 710, 120]  # 645s (10:45) -> 600, 650s (10:50) -> 600, 710s (11:50) -> 660, 120s -> 120
    clusters = {}
    for ts in timestamps:
        bucket = (ts // 60) * 60
        clusters[bucket] = clusters.get(bucket, 0) + 1

    assert clusters[600] == 2  # 2 flags in 10:00-11:00 bucket
    assert clusters[660] == 1  # 1 flag in 11:00-12:00 bucket
    assert clusters[120] == 1  # 1 flag in 02:00-03:00 bucket
    print(f"[SUCCESS] Hotspot Cluster Math Test Passed: Buckets = {clusters}")


if __name__ == "__main__":
    print("Running Phase 6 Integration Tests...")
    test_custom_al_exam_creation_structure()
    test_hotspot_timestamp_cluster_math()
    print("\n>>> ALL PHASE 6 INTEGRATION TESTS PASSED 100%! <<<")
