"""
Populate controlled synthetic learning activity data for the 10 synthetic students
in Course 36 (Advanced Level Biology) adhering strictly to Phase V5.3 Requirement 10.

STUDENT STUDY BEHAVIOURAL PROFILES:
- Student 6 (Aseni Pamadi): S1 Profile — High completion (85%), several revisits, 0 flags, 1 AI inquiry
- Student 7 (Janani Kavindi): S2 Profile — High completion (80%), consistent study
- Student 8 (Dulith Malika): S3 Profile — Moderate-high completion (70%)
- Student 9 (Asitha Sandaruwan): S4 Profile — Moderate completion (60%)
- Student 10 (Malithi Raveesha): S5 Profile — Moderate completion (55%)
- Student 11 (Harshana Madhubashana): S6 Profile — Selective study (Units 1, 2, 5, 6 active)
- Student 12 (Sakuna Rambukwella): S7 Profile — Focused study (Units 1, 2, 3, 4 active)
- Student 13 (Sakuni Ruwinika): S8 Profile — Uneven study, 2 difficulty flags, 2 Ask AI inquiries
- Student 14 (Chami Mali): S9 Profile — Low completion (35%), 3 difficulty flags, 3 Ask AI inquiries
- Student 15 (Sakura Niladenuwani): S10 Profile — Very low completion (20%), 3 difficulty flags, 2 Ask AI inquiries

NOTE: PROTECTED EXAMS (210, 212, 213), SUBMISSIONS (1001-1030), AND 559 ANSWERS REMAIN 100% UNTOUCHED.
"""
import sys
import os
from datetime import datetime, timedelta
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import (
    Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, AIResponse, User, ActivityLog
)


def populate_learning_activity():
    db = SessionLocal()
    random.seed(42)

    try:
        print("Auditing Course 36 structure...")
        course = db.query(Course).filter(Course.id == 36).first()
        if not course:
            print("Course 36 not found!")
            return False

        units = db.query(Unit).filter(Unit.course_id == 36).order_by(Unit.order).all()
        lessons = db.query(Lesson).filter(Lesson.course_id == 36).all()
        lesson_map = {l.id: l for l in lessons}
        materials = db.query(Material).filter(Material.lesson_id.in_([l.id for l in lessons])).all()

        print(f"Course: {course.title} | Units: {len(units)} | Lessons: {len(lessons)} | Materials: {len(materials)}")

        # Clean existing material progress and flags for Course 36 materials
        mat_ids = [m.id for m in materials]
        db.query(StudentMaterialProgress).filter(StudentMaterialProgress.material_id.in_(mat_ids)).delete(synchronize_session=False)
        db.query(MaterialFlag).filter(MaterialFlag.material_id.in_(mat_ids)).delete(synchronize_session=False)
        
        sq_ids = [q.id for q in db.query(StudentQuestion).filter(StudentQuestion.course_id == 36).all()]
        if sq_ids:
            db.query(AIResponse).filter(AIResponse.student_question_id.in_(sq_ids)).delete(synchronize_session=False)
            db.query(StudentQuestion).filter(StudentQuestion.id.in_(sq_ids)).delete(synchronize_session=False)
        db.commit()

        # Organize materials by unit
        mats_by_unit = {}
        for m in materials:
            les = lesson_map.get(m.lesson_id)
            if les and les.unit_id:
                mats_by_unit.setdefault(les.unit_id, []).append(m)

        # 10 Students (IDs 6 to 15)
        # Define student profiles
        # (user_id, completion_rate, unit_affinity, num_flags, num_ai_queries)
        profiles = [
            # S1: Aseni Pamadi (Top performer: high completion across all units, 0 flags, 1 AI inquiry)
            (6, 0.85, "all", 0, 1),
            # S2: Janani Kavindi (High performer: high completion, 0 flags, 1 AI inquiry)
            (7, 0.80, "all", 0, 1),
            # S3: Dulith Malika (High performer: 70% completion, 1 flag, 1 AI inquiry)
            (8, 0.70, "all", 1, 1),
            # S4: Asitha Sandaruwan (Medium performer: 60% completion)
            (9, 0.60, "all", 1, 1),
            # S5: Malithi Raveesha (Medium performer: 55% completion)
            (10, 0.55, "all", 1, 1),
            # S6: Harshana Madhubashana (Selective: Units 1, 2, 5, 6)
            (11, 0.50, "selective_1_2_5_6", 2, 2),
            # S7: Sakuna Rambukwella (Focus: Units 1, 2, 3, 4)
            (12, 0.50, "focus_1_2_3_4", 1, 2),
            # S8: Sakuni Ruwinika (Uneven: lower completion, 2 flags, 2 AI queries)
            (13, 0.45, "uneven", 2, 2),
            # S9: Chami Mali (Struggling: low completion, 3 flags, 3 AI queries)
            (14, 0.35, "low", 3, 3),
            # S10: Sakura Niladenuwani (Struggling: very low completion, 3 flags, 2 AI queries)
            (15, 0.20, "very_low", 3, 2),
        ]

        total_progress_created = 0
        total_flags_created = 0
        total_ai_created = 0

        # Sample AI inquiries context
        ai_sample_queries = [
            ("Explain the counter-current multiplier mechanism in the loop of Henle.", "Unit 5: Animal Form and Function"),
            ("What is the difference between cyclic and non-cyclic photophosphorylation?", "Unit 04: Plant Form and Function"),
            ("How do DNA polymerase I and III differ during lagging strand replication?", "Unit 6: Genetics"),
            ("Why is the resting membrane potential of a neuron negative (-70mV)?", "Unit 5: Animal Form and Function"),
            ("Can you summarize the major differences between C3, C4, and CAM plants?", "Unit 04: Plant Form and Function"),
            ("How does competitive inhibition affect the Km and Vmax of an enzyme?", "Unit 02: Chemical and Cellular Basis of Life"),
            ("Explain how recombinant DNA technology uses restriction endonucleases.", "Unit 6: Genetics"),
            ("What are the secondary lymphoid organs and their biological functions?", "Unit 5: Animal Form and Function"),
        ]

        for user_id, target_rate, affinity, num_flags, num_ai in profiles:
            student = db.query(User).filter(User.id == user_id).first()
            s_name = student.full_name if student else f"Student {user_id}"

            # 1. Create Material Progress Records
            for u in units:
                u_mats = mats_by_unit.get(u.id, [])
                if not u_mats:
                    continue

                # Adjust rate based on affinity
                u_order = u.order or 1
                if affinity == "selective_1_2_5_6":
                    effective_rate = target_rate * 1.5 if u_order in [1, 2, 5, 6] else target_rate * 0.2
                elif affinity == "focus_1_2_3_4":
                    effective_rate = target_rate * 1.6 if u_order in [1, 2, 3, 4] else target_rate * 0.15
                elif affinity == "uneven":
                    effective_rate = target_rate * (1.3 if u_order % 2 == 1 else 0.4)
                elif affinity == "low":
                    effective_rate = target_rate * (1.2 if u_order in [1, 2] else 0.6)
                elif affinity == "very_low":
                    effective_rate = target_rate * (1.2 if u_order == 1 else 0.3)
                else:
                    effective_rate = target_rate

                for m in u_mats:
                    # Decide if student engaged with this material
                    rand_val = random.random()
                    if rand_val < effective_rate:
                        is_comp = rand_val < (effective_rate * 0.85)
                        pos = 100.0 if is_comp else random.uniform(20.0, 80.0)

                        prog = StudentMaterialProgress(
                            student_id=user_id,
                            material_id=m.id,
                            last_position=round(pos, 1),
                            is_completed=is_comp,
                            updated_at=datetime.utcnow() - timedelta(days=random.randint(1, 20))
                        )
                        db.add(prog)
                        total_progress_created += 1

            # 2. Create Material Difficulty Flags
            if num_flags > 0:
                flagged_mats = random.sample(materials, min(num_flags, len(materials)))
                for f_idx, fm in enumerate(flagged_mats):
                    context_loc = f"Page {random.randint(4, 25)}" if fm.material_type.value == "pdf" else f"Timestamp {random.randint(1, 15):02d}:{random.randint(10, 50):02d}"
                    is_res = (f_idx == 0 and num_flags > 1) # first flag resolved for realism

                    m_flag = MaterialFlag(
                        student_id=user_id,
                        material_id=fm.id,
                        context=context_loc,
                        comment=f"Need clarification on the scientific diagram and biochemical mechanism explained at {context_loc}.",
                        is_resolved=is_res,
                        teacher_reply="Reviewed in classroom tutorial. Please review the updated annotations on slide 14." if is_res else None,
                        resolved_at=datetime.utcnow() - timedelta(days=2) if is_res else None,
                        created_at=datetime.utcnow() - timedelta(days=random.randint(3, 15))
                    )
                    db.add(m_flag)
                    total_flags_created += 1

            # 3. Create Ask AI Questions
            if num_ai > 0:
                for a_idx in range(num_ai):
                    q_text, t_cat = ai_sample_queries[(user_id + a_idx) % len(ai_sample_queries)]
                    matching_mat = next((m for m in materials if t_cat.lower() in (m.title or "").lower()), materials[0])

                    sq = StudentQuestion(
                        student_id=user_id,
                        course_id=36,
                        course_material_id=matching_mat.id,
                        question_text=q_text,
                        topic_category=t_cat,
                        is_answered=True,
                        asked_at=datetime.utcnow() - timedelta(days=random.randint(2, 14))
                    )
                    db.add(sq)
                    db.flush()

                    ai_resp = AIResponse(
                        student_question_id=sq.id,
                        response_text=f"**Official G.C.E. A/L Biology Explanation**:\n\nRegarding **{q_text}**:\n\n1. In accordance with the National Institute of Education (NIE) syllabus, key biochemical processes follow regulated pathways.\n2. Ensure you clearly state the molecular intermediates and energetic yield.\n\n*Source: G.C.E. A/L Resource Book.*",
                        confidence_score=0.92,
                        reasoning_quality="high",
                        created_at=sq.asked_at + timedelta(seconds=3)
                    )
                    db.add(ai_resp)
                    total_ai_created += 1

        db.commit()
        print(f"\nSuccessfully populated learning activity:")
        print(f"  - StudentMaterialProgress records: {total_progress_created}")
        print(f"  - MaterialFlag records: {total_flags_created}")
        print(f"  - StudentQuestion & AIResponse records: {total_ai_created}")
        return True

    finally:
        db.close()


if __name__ == "__main__":
    success = populate_learning_activity()
    sys.exit(0 if success else 1)
