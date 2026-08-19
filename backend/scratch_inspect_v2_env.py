"""
Inspect environment, students, and paper structures for Phase V2.
Writes complete JSON data to scratch_v2_env_data.json.
"""
import json
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer,
    StudentMaterialProgress, MaterialNote, MaterialDifficultyHotspot
)

def inspect_v2_environment():
    db: Session = SessionLocal()
    try:
        students = db.query(User).filter(User.role == UserRole.STUDENT).order_by(User.id.asc()).all()
        exam_mcq = db.query(ALExam).filter(ALExam.id == 210).first()
        mcq_qs = db.query(ALQuestion).filter(ALQuestion.exam_id == 210).order_by(ALQuestion.question_number.asc()).all()
        
        exam_struct = db.query(ALExam).filter(ALExam.id == 212).first()
        struct_qs = db.query(ALQuestion).filter(ALQuestion.exam_id == 212).order_by(ALQuestion.question_number.asc()).all()
        
        exam_essay = db.query(ALExam).filter(ALExam.id == 213).first()
        essay_qs = db.query(ALQuestion).filter(ALQuestion.exam_id == 213).order_by(ALQuestion.question_number.asc()).all()

        out_data = {
            "students": [],
            "paper_1_mcq": {
                "id": exam_mcq.id,
                "title": exam_mcq.title,
                "time_limit": exam_mcq.time_limit_minutes,
                "questions": []
            },
            "paper_2a_structured": {
                "id": exam_struct.id,
                "title": exam_struct.title,
                "time_limit": exam_struct.time_limit_minutes,
                "questions": []
            },
            "paper_2b_essay": {
                "id": exam_essay.id,
                "title": exam_essay.title,
                "time_limit": exam_essay.time_limit_minutes,
                "questions": []
            }
        }

        for s in students:
            prog_cnt = db.query(func.count(StudentMaterialProgress.id)).filter(StudentMaterialProgress.student_id == s.id).scalar()
            notes_cnt = db.query(func.count(MaterialNote.id)).filter(MaterialNote.student_id == s.id).scalar()
            hotspots_cnt = db.query(func.count(MaterialDifficultyHotspot.id)).filter(MaterialDifficultyHotspot.student_id == s.id).scalar()
            subs = db.query(ALStudentSubmission).filter(ALStudentSubmission.student_id == s.id).all()
            sub_strs = [{"exam_id": sub.exam_id, "sub_id": sub.id, "status": sub.status.value if hasattr(sub.status, "value") else str(sub.status)} for sub in subs]
            out_data["students"].append({
                "id": s.id,
                "name": s.full_name,
                "email": s.email,
                "progress_count": prog_cnt,
                "notes_count": notes_cnt,
                "hotspots_count": hotspots_cnt,
                "submissions": sub_strs
            })

        for q in mcq_qs:
            out_data["paper_1_mcq"]["questions"].append({
                "id": q.id,
                "number": q.question_number,
                "stem": q.stem_text,
                "options": q.options,
                "correct_option": q.correct_option,
                "points": q.points,
                "cognitive_level": q.cognitive_level,
                "difficulty": q.difficulty
            })

        for q in struct_qs:
            out_data["paper_2a_structured"]["questions"].append({
                "id": q.id,
                "number": q.question_number,
                "stem": q.stem_text,
                "points": q.points,
                "subparts": q.structured_subparts_json,
                "cognitive_level": q.cognitive_level,
                "difficulty": q.difficulty
            })

        for q in essay_qs:
            out_data["paper_2b_essay"]["questions"].append({
                "id": q.id,
                "number": q.question_number,
                "stem": q.stem_text,
                "points": q.points,
                "checklist": q.essay_checklist_json,
                "cognitive_level": q.cognitive_level,
                "difficulty": q.difficulty
            })

        with open("scratch_v2_env_data.json", "w", encoding="utf-8") as f:
            json.dump(out_data, f, indent=2, ensure_ascii=False)
        print("Inspection saved successfully to scratch_v2_env_data.json!")

    finally:
        db.close()

if __name__ == "__main__":
    inspect_v2_environment()
