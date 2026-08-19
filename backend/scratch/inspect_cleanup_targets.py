"""
Comprehensive inspection of all assessment entities, questions, submissions, answers, and dependencies.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("=" * 80)
print("LUMORA LMS — DETAILED PRE-CLEANUP ASSESSMENT DATABASE AUDIT")
print("=" * 80)

# 1. Protected Exams Audit
print("\n--- 1. PROTECTED EXAMINATIONS (IDs: 210, 212, 213) ---")
for eid in (210, 212, 213):
    exam = db.execute(text("SELECT id, course_id, title, exam_type, is_published FROM al_exams WHERE id = :eid;"), {"eid": eid}).fetchone()
    if not exam:
        print(f"CRITICAL ERROR: Exam {eid} NOT FOUND IN DATABASE!")
        continue
    
    qs = db.execute(text("""
        SELECT id, question_number, template_type, points 
        FROM al_questions 
        WHERE exam_id = :eid 
        ORDER BY question_number, id;
    """), {"eid": eid}).fetchall()
    
    subs = db.execute(text("""
        SELECT id, student_id, status, scaled_score, raw_score, percentage, grade 
        FROM al_student_submissions 
        WHERE exam_id = :eid 
        ORDER BY student_id, id;
    """), {"eid": eid}).fetchall()
    sub_ids = [s[0] for s in subs]
    
    ans_count = 0
    if sub_ids:
        ans_count = db.execute(text(f"""
            SELECT COUNT(*) FROM al_student_answers WHERE submission_id IN ({','.join(map(str, sub_ids))});
        """)).scalar()
    
    print(f"\nProtected Exam ID {exam[0]}:")
    print(f"  Title: '{exam[2]}'")
    print(f"  Course ID: {exam[1]} (Expected 36)")
    print(f"  Type: {exam[3]}")
    print(f"  Published: {exam[4]}")
    print(f"  Questions Count: {len(qs)}")
    print(f"  Submissions Count: {len(subs)} (Expected 10)")
    print(f"  Total Answers: {ans_count}")
    print(f"  Question ID Range: {qs[0][0]} to {qs[-1][0]}")

# 2. Overall Summary of All AL Exams
all_exams = db.execute(text("SELECT id, course_id, title, exam_type, is_published FROM al_exams ORDER BY id;")).fetchall()
protected_eids = {210, 212, 213}
unwanted_exams = [e for e in all_exams if e[0] not in protected_eids]

print("\n" + "=" * 80)
print(f"--- 2. ALL AL_EXAMS BREAKDOWN ---")
print(f"Total AL Exams in DB: {len(all_exams)}")
print(f"Protected Exams: {len(protected_eids)} ({sorted(list(protected_eids))})")
print(f"Unwanted Exams to be deleted: {len(unwanted_exams)}")

# 3. Questions Summary
all_qs = db.execute(text("SELECT id, exam_id, question_number, template_type FROM al_questions ORDER BY id;")).fetchall()
protected_qs = [q for q in all_qs if q[1] in protected_eids]
unwanted_qs = [q for q in all_qs if q[1] not in protected_eids]
orphaned_qs = [q for q in all_qs if q[1] is None]

print("\n" + "=" * 80)
print(f"--- 3. AL_QUESTIONS BREAKDOWN ---")
print(f"Total AL Questions in DB: {len(all_qs)}")
print(f"Protected Questions: {len(protected_qs)} (Exam 210: 50, Exam 212: 4, Exam 213: 3 -> Total: 57)")
print(f"Unwanted Questions belonging to other exams: {len(unwanted_qs) - len(orphaned_qs)}")
print(f"Orphaned Questions (exam_id IS NULL): {len(orphaned_qs)}")
print(f"Total Unwanted AL Questions to be deleted: {len(unwanted_qs)}")

# 4. Submissions Summary
all_subs = db.execute(text("SELECT id, exam_id, student_id, status, scaled_score FROM al_student_submissions ORDER BY id;")).fetchall()
protected_subs = [s for s in all_subs if s[1] in protected_eids]
unwanted_subs = [s for s in all_subs if s[1] not in protected_eids]

print("\n" + "=" * 80)
print(f"--- 4. AL_STUDENT_SUBMISSIONS BREAKDOWN ---")
print(f"Total Submissions in DB: {len(all_subs)}")
print(f"Protected Submissions: {len(protected_subs)} (Expected 30)")
print(f"Unwanted Submissions to be deleted: {len(unwanted_subs)}")

# 5. Answers Summary
protected_sub_ids = set([s[0] for s in protected_subs])
all_answers_count = db.execute(text("SELECT COUNT(*) FROM al_student_answers;")).scalar()
protected_answers_count = db.execute(text(f"""
    SELECT COUNT(*) FROM al_student_answers 
    WHERE submission_id IN ({','.join(map(str, protected_sub_ids))});
""")).scalar()
unwanted_answers_count = all_answers_count - protected_answers_count

print("\n" + "=" * 80)
print(f"--- 5. AL_STUDENT_ANSWERS BREAKDOWN ---")
print(f"Total Answers in DB: {all_answers_count}")
print(f"Protected Answers: {protected_answers_count} (Expected 559)")
print(f"Unwanted Answers to be deleted: {unwanted_answers_count}")

# 6. Check Dependent Tables: al_ai_grading_logs and al_teacher_overrides
logs_total = db.execute(text("SELECT COUNT(*) FROM al_ai_grading_logs;")).scalar()
overrides_total = db.execute(text("SELECT COUNT(*) FROM al_teacher_overrides;")).scalar()

logs_protected = db.execute(text(f"""
    SELECT COUNT(*) FROM al_ai_grading_logs 
    WHERE submission_id IN ({','.join(map(str, protected_sub_ids))});
""")).scalar() if protected_sub_ids else 0

overrides_protected = db.execute(text(f"""
    SELECT COUNT(*) FROM al_teacher_overrides 
    WHERE submission_id IN ({','.join(map(str, protected_sub_ids))});
""")).scalar() if protected_sub_ids else 0

print("\n" + "=" * 80)
print(f"--- 6. DEPENDENT LOGS & OVERRIDES ---")
print(f"al_ai_grading_logs: Total = {logs_total}, Protected = {logs_protected}, Unwanted = {logs_total - logs_protected}")
print(f"al_teacher_overrides: Total = {overrides_total}, Protected = {overrides_protected}, Unwanted = {overrides_total - overrides_protected}")

# 7. Check Generic Question Bank: questions, question_versions
gen_q_total = db.execute(text("SELECT COUNT(*) FROM questions;")).scalar()
gen_qv_total = db.execute(text("SELECT COUNT(*) FROM question_versions;")).scalar()
print("\n" + "=" * 80)
print(f"--- 7. GENERIC QUESTION BANK (questions & question_versions) ---")
print(f"questions table: {gen_q_total} rows")
print(f"question_versions table: {gen_qv_total} rows")

# 8. Check any Foreign Keys pointing to al_exams, al_questions, al_student_submissions, al_student_answers
print("\n" + "=" * 80)
print(f"--- 8. FOREIGN KEY CONSTRAINTS CHECK ---")
fk_refs = db.execute(text("""
    SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND (ccu.table_name LIKE 'al_%' OR tc.table_name LIKE 'al_%')
    ORDER BY tc.table_name, kcu.column_name;
""")).fetchall()

for fk in fk_refs:
    print(f"  {fk[0]}.{fk[1]} -> {fk[2]}.{fk[3]}")

db.close()
