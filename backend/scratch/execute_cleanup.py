"""
Production Assessment Database Cleanup Script
Executes atomic deletion of unwanted assessment data with strict post-cleanup validation.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("=" * 80)
print("EXECUTING LUMORA LMS ASSESSMENT DATABASE CLEANUP")
print("=" * 80)

PROTECTED_EXAM_IDS = (210, 212, 213)

try:
    # ── 1. PRE-CLEANUP VALIDATION & INVARIANTS ──
    print("\n[STEP 1] Validating pre-cleanup state...")
    for eid in PROTECTED_EXAM_IDS:
        exam = db.execute(text(f"SELECT id, course_id, title, exam_type FROM al_exams WHERE id = {eid};")).fetchone()
        assert exam is not None, f"FATAL: Protected Exam {eid} missing before cleanup!"
        print(f"  Verified Protected Exam {eid}: '{exam[2]}'")
    
    init_exams = db.execute(text("SELECT COUNT(*) FROM al_exams;")).scalar()
    init_qs = db.execute(text("SELECT COUNT(*) FROM al_questions;")).scalar()
    init_subs = db.execute(text("SELECT COUNT(*) FROM al_student_submissions;")).scalar()
    init_ans = db.execute(text("SELECT COUNT(*) FROM al_student_answers;")).scalar()

    print(f"  Pre-cleanup totals: {init_exams} exams, {init_qs} questions, {init_subs} submissions, {init_ans} answers.")

    # ── 2. CASCADING DELETION IN ATOMIC TRANSACTION ──
    print("\n[STEP 2] Executing cascading deletion of unwanted records...")

    # Step A: Delete unwanted student answers
    del_ans = db.execute(text("""
        DELETE FROM al_student_answers 
        WHERE submission_id IN (SELECT id FROM al_student_submissions WHERE exam_id NOT IN (210, 212, 213))
           OR question_id NOT IN (SELECT id FROM al_questions WHERE exam_id IN (210, 212, 213));
    """)).rowcount
    print(f"  - Deleted {del_ans} unwanted student answer rows.")

    # Step B: Delete unwanted submissions
    del_subs = db.execute(text("""
        DELETE FROM al_student_submissions 
        WHERE exam_id NOT IN (210, 212, 213);
    """)).rowcount
    print(f"  - Deleted {del_subs} unwanted student submission rows.")

    # Step C: Delete unwanted questions
    del_qs = db.execute(text("""
        DELETE FROM al_questions 
        WHERE exam_id NOT IN (210, 212, 213) OR exam_id IS NULL;
    """)).rowcount
    print(f"  - Deleted {del_qs} unwanted assessment question rows.")

    # Step D: Delete unwanted exams
    del_exams = db.execute(text("""
        DELETE FROM al_exams 
        WHERE id NOT IN (210, 212, 213);
    """)).rowcount
    print(f"  - Deleted {del_exams} unwanted examination rows.")

    # ── 3. STRICT POST-CLEANUP INVARIANTS AUDIT ──
    print("\n[STEP 3] Performing post-cleanup integrity audit...")

    rem_exams = db.execute(text("SELECT id, course_id, title FROM al_exams ORDER BY id;")).fetchall()
    rem_qs = db.execute(text("SELECT id, exam_id, question_number FROM al_questions ORDER BY id;")).fetchall()
    rem_subs = db.execute(text("SELECT id, exam_id, student_id FROM al_student_submissions ORDER BY id;")).fetchall()
    rem_ans = db.execute(text("SELECT id, submission_id, question_id, final_score FROM al_student_answers ORDER BY id;")).fetchall()

    print(f"  Remaining AL Exams: {len(rem_exams)} (Expected: 3)")
    print(f"  Remaining AL Questions: {len(rem_qs)} (Expected: 57)")
    print(f"  Remaining Submissions: {len(rem_subs)} (Expected: 30)")
    print(f"  Remaining Answers: {len(rem_ans)} (Expected: 559)")

    assert len(rem_exams) == 3, f"CRITICAL ASSERTION FAILED: Expected 3 exams, found {len(rem_exams)}"
    assert len(rem_qs) == 57, f"CRITICAL ASSERTION FAILED: Expected 57 questions, found {len(rem_qs)}"
    assert len(rem_subs) == 30, f"CRITICAL ASSERTION FAILED: Expected 30 submissions, found {len(rem_subs)}"
    assert len(rem_ans) == 559, f"CRITICAL ASSERTION FAILED: Expected 559 answers, found {len(rem_ans)}"

    # Check question counts per exam
    q_count_210 = sum(1 for q in rem_qs if q[1] == 210)
    q_count_212 = sum(1 for q in rem_qs if q[1] == 212)
    q_count_213 = sum(1 for q in rem_qs if q[1] == 213)
    assert q_count_210 == 50, f"Exam 210 must have 50 MCQs (Found: {q_count_210})"
    assert q_count_212 == 4, f"Exam 212 must have 4 Structured questions (Found: {q_count_212})"
    assert q_count_213 == 3, f"Exam 213 must have 3 Essay questions (Found: {q_count_213})"

    # Check submission counts per exam
    s_count_210 = sum(1 for s in rem_subs if s[1] == 210)
    s_count_212 = sum(1 for s in rem_subs if s[1] == 212)
    s_count_213 = sum(1 for s in rem_subs if s[1] == 213)
    assert s_count_210 == 10, f"Exam 210 must have 10 submissions (Found: {s_count_210})"
    assert s_count_212 == 10, f"Exam 212 must have 10 submissions (Found: {s_count_212})"
    assert s_count_213 == 10, f"Exam 213 must have 10 submissions (Found: {s_count_213})"

    # Check answers count per exam
    sub_ids_210 = set([s[0] for s in rem_subs if s[1] == 210])
    sub_ids_212 = set([s[0] for s in rem_subs if s[1] == 212])
    sub_ids_213 = set([s[0] for s in rem_subs if s[1] == 213])
    
    ans_count_210 = sum(1 for a in rem_ans if a[1] in sub_ids_210)
    ans_count_212 = sum(1 for a in rem_ans if a[1] in sub_ids_212)
    ans_count_213 = sum(1 for a in rem_ans if a[1] in sub_ids_213)
    
    assert ans_count_210 == 489, f"Expected 489 answers for Exam 210, got {ans_count_210}"
    assert ans_count_212 == 40, f"Expected 40 answers for Exam 212, got {ans_count_212}"
    assert ans_count_213 == 30, f"Expected 30 answers for Exam 213, got {ans_count_213}"

    # Commit Transaction
    db.commit()
    print("\n[SUCCESS] TRANSACTION COMMITTED SUCCESSFULLY. CLEANUP IS COMPLETE!")

except Exception as e:
    db.rollback()
    print(f"\n[ERROR] Cleanup failed: {e}. Transaction rolled back.")
    raise
finally:
    db.close()
