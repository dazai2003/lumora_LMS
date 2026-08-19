"""
Dry Run Cleanup Script
Performs complete simulated cleanup in a transaction and rolls back,
verifying exact pre- and post-cleanup counts and invariants.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("=" * 80)
print("DRY-RUN ASSESSMENT DATABASE CLEANUP & RECONCILIATION")
print("=" * 80)

try:
    # ── 1. PRE-CLEANUP VERIFICATION ──
    print("\n--- PHASE 1: PRE-CLEANUP GROUND TRUTH AUDIT ---")
    
    # Verify Protected Exams
    for eid in (210, 212, 213):
        exam = db.execute(text(f"SELECT id, course_id, title, exam_type FROM al_exams WHERE id = {eid};")).fetchone()
        assert exam is not None, f"FATAL: Protected Exam {eid} missing!"
        print(f"  Verified Protected Exam {eid}: '{exam[2]}' (Course {exam[1]}, Type: {exam[3]})")
    
    # Pre-cleanup counts
    initial_exams_count = db.execute(text("SELECT COUNT(*) FROM al_exams;")).scalar()
    initial_qs_count = db.execute(text("SELECT COUNT(*) FROM al_questions;")).scalar()
    initial_subs_count = db.execute(text("SELECT COUNT(*) FROM al_student_submissions;")).scalar()
    initial_ans_count = db.execute(text("SELECT COUNT(*) FROM al_student_answers;")).scalar()
    
    protected_exams_count = db.execute(text("SELECT COUNT(*) FROM al_exams WHERE id IN (210, 212, 213);")).scalar()
    protected_qs_count = db.execute(text("SELECT COUNT(*) FROM al_questions WHERE exam_id IN (210, 212, 213);")).scalar()
    protected_subs_count = db.execute(text("SELECT COUNT(*) FROM al_student_submissions WHERE exam_id IN (210, 212, 213);")).scalar()
    protected_ans_count = db.execute(text("""
        SELECT COUNT(*) FROM al_student_answers 
        WHERE submission_id IN (SELECT id FROM al_student_submissions WHERE exam_id IN (210, 212, 213));
    """)).scalar()
    
    print(f"\nPre-Cleanup Counts:")
    print(f"  Total AL Exams: {initial_exams_count} (Protected: {protected_exams_count}, Unwanted: {initial_exams_count - protected_exams_count})")
    print(f"  Total AL Questions: {initial_qs_count} (Protected: {protected_qs_count}, Unwanted: {initial_qs_count - protected_qs_count})")
    print(f"  Total Submissions: {initial_subs_count} (Protected: {protected_subs_count}, Unwanted: {initial_subs_count - protected_subs_count})")
    print(f"  Total Answers: {initial_ans_count} (Protected: {protected_ans_count}, Unwanted: {initial_ans_count - protected_ans_count})")
    
    assert protected_exams_count == 3, f"Expected 3 protected exams, found {protected_exams_count}"
    assert protected_qs_count == 57, f"Expected 57 protected questions, found {protected_qs_count}"
    assert protected_subs_count == 30, f"Expected 30 protected submissions, found {protected_subs_count}"
    assert protected_ans_count == 559, f"Expected 559 protected answers, found {protected_ans_count}"
    
    # ── 2. IDENTIFY DELETION TARGETS ──
    print("\n--- PHASE 2: IDENTIFY DELETION TARGETS ---")
    
    unwanted_exam_ids = [r[0] for r in db.execute(text("SELECT id FROM al_exams WHERE id NOT IN (210, 212, 213);")).fetchall()]
    unwanted_submission_ids = [r[0] for r in db.execute(text("SELECT id FROM al_student_submissions WHERE exam_id NOT IN (210, 212, 213);")).fetchall()]
    unwanted_question_ids = [r[0] for r in db.execute(text("SELECT id FROM al_questions WHERE exam_id NOT IN (210, 212, 213) OR exam_id IS NULL;")).fetchall()]
    
    print(f"  Unwanted Exam IDs to delete ({len(unwanted_exam_ids)}): {unwanted_exam_ids[:10]}...")
    print(f"  Unwanted Submission IDs to delete ({len(unwanted_submission_ids)}): {unwanted_submission_ids[:10]}...")
    print(f"  Unwanted Question IDs to delete ({len(unwanted_question_ids)}): {unwanted_question_ids[:10]}...")
    
    # Safety Check: Verify Intersection with Protected IDs is strictly empty
    for pid in (210, 212, 213):
        assert pid not in unwanted_exam_ids, f"CRITICAL SAFETY VIOLATION: Protected Exam {pid} is in deletion set!"
    
    protected_q_ids = set([r[0] for r in db.execute(text("SELECT id FROM al_questions WHERE exam_id IN (210, 212, 213);")).fetchall()])
    for qid in protected_q_ids:
        assert qid not in unwanted_question_ids, f"CRITICAL SAFETY VIOLATION: Protected Question {qid} is in deletion set!"
    
    protected_sub_ids = set([r[0] for r in db.execute(text("SELECT id FROM al_student_submissions WHERE exam_id IN (210, 212, 213);")).fetchall()])
    for sid in protected_sub_ids:
        assert sid not in unwanted_submission_ids, f"CRITICAL SAFETY VIOLATION: Protected Submission {sid} is in deletion set!"

    print("  [PASSED] Zero intersection with protected dataset verified.")

    # ── 3. SIMULATE DELETION IN A TRANSACTION ──
    print("\n--- PHASE 3: SIMULATING ORDERED CASCADING DELETION ---")

    # Step A: Delete unwanted student answers
    del_ans = db.execute(text("""
        DELETE FROM al_student_answers 
        WHERE submission_id IN (SELECT id FROM al_student_submissions WHERE exam_id NOT IN (210, 212, 213))
           OR question_id NOT IN (SELECT id FROM al_questions WHERE exam_id IN (210, 212, 213));
    """)).rowcount
    print(f"  Step A: Deleted {del_ans} unwanted student answer records.")

    # Step B: Delete unwanted submissions
    del_subs = db.execute(text("""
        DELETE FROM al_student_submissions 
        WHERE exam_id NOT IN (210, 212, 213);
    """)).rowcount
    print(f"  Step B: Deleted {del_subs} unwanted student submission records.")

    # Step C: Delete unwanted questions
    del_qs = db.execute(text("""
        DELETE FROM al_questions 
        WHERE exam_id NOT IN (210, 212, 213) OR exam_id IS NULL;
    """)).rowcount
    print(f"  Step C: Deleted {del_qs} unwanted assessment questions.")

    # Step D: Delete unwanted exams
    del_exams = db.execute(text("""
        DELETE FROM al_exams 
        WHERE id NOT IN (210, 212, 213);
    """)).rowcount
    print(f"  Step D: Deleted {del_exams} unwanted examination records.")

    # ── 4. POST-CLEANUP INVARIANTS CHECK ──
    print("\n--- PHASE 4: POST-CLEANUP INVARIANTS CHECK ---")
    
    rem_exams = db.execute(text("SELECT id, course_id, title FROM al_exams ORDER BY id;")).fetchall()
    rem_qs = db.execute(text("SELECT id, exam_id, question_number FROM al_questions ORDER BY id;")).fetchall()
    rem_subs = db.execute(text("SELECT id, exam_id, student_id FROM al_student_submissions ORDER BY id;")).fetchall()
    rem_ans = db.execute(text("SELECT id, submission_id, question_id, final_score FROM al_student_answers ORDER BY id;")).fetchall()
    
    print(f"  Remaining AL Exams: {len(rem_exams)} (Expected: 3)")
    for e in rem_exams:
        q_count = sum(1 for q in rem_qs if q[1] == e[0])
        s_count = sum(1 for s in rem_subs if s[1] == e[0])
        print(f"    - Exam {e[0]}: '{e[2]}' (Questions: {q_count}, Submissions: {s_count})")
    
    print(f"  Remaining AL Questions: {len(rem_qs)} (Expected: 57)")
    print(f"  Remaining Submissions: {len(rem_subs)} (Expected: 30)")
    print(f"  Remaining Answers: {len(rem_ans)} (Expected: 559)")
    
    assert len(rem_exams) == 3, f"Expected 3 remaining exams, got {len(rem_exams)}"
    assert len(rem_qs) == 57, f"Expected 57 remaining questions, got {len(rem_qs)}"
    assert len(rem_subs) == 30, f"Expected 30 remaining submissions, got {len(rem_subs)}"
    assert len(rem_ans) == 559, f"Expected 559 remaining answers, got {len(rem_ans)}"

    # Check question counts per exam
    assert sum(1 for q in rem_qs if q[1] == 210) == 50, "Exam 210 must have 50 MCQs"
    assert sum(1 for q in rem_qs if q[1] == 212) == 4, "Exam 212 must have 4 Structured questions"
    assert sum(1 for q in rem_qs if q[1] == 213) == 3, "Exam 213 must have 3 Essay questions"

    # Check submission counts per exam
    assert sum(1 for s in rem_subs if s[1] == 210) == 10, "Exam 210 must have 10 submissions"
    assert sum(1 for s in rem_subs if s[1] == 212) == 10, "Exam 212 must have 10 submissions"
    assert sum(1 for s in rem_subs if s[1] == 213) == 10, "Exam 213 must have 10 submissions"

    # Check answers count per exam
    sub_ids_210 = set([s[0] for s in rem_subs if s[1] == 210])
    sub_ids_212 = set([s[0] for s in rem_subs if s[1] == 212])
    sub_ids_213 = set([s[0] for s in rem_subs if s[1] == 213])
    
    ans_count_210 = sum(1 for a in rem_ans if a[1] in sub_ids_210)
    ans_count_212 = sum(1 for a in rem_ans if a[1] in sub_ids_212)
    ans_count_213 = sum(1 for a in rem_ans if a[1] in sub_ids_213)
    
    print(f"  Exam 210 Answers: {ans_count_210} (Expected: 489)")
    print(f"  Exam 212 Answers: {ans_count_212} (Expected: 40)")
    print(f"  Exam 213 Answers: {ans_count_213} (Expected: 30)")
    
    assert ans_count_210 == 489, f"Expected 489 answers for Exam 210, got {ans_count_210}"
    assert ans_count_212 == 40, f"Expected 40 answers for Exam 212, got {ans_count_212}"
    assert ans_count_213 == 30, f"Expected 30 answers for Exam 213, got {ans_count_213}"

    print("\n[SUCCESS] ALL DRY-RUN INVARIANTS PASSED 100% PERFECTLY!")

finally:
    # Always rollback in dry-run
    db.rollback()
    print("\n[DRY RUN] Transaction rolled back safely. Database remains unmodified.")
    db.close()
