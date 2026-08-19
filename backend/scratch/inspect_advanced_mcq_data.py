import json
from app.database import SessionLocal
from app.models import ALExam, ALQuestion, QuestionVersion, Question

db = SessionLocal()
try:
    print("=== INSPECTING AL_QUESTIONS ACROSS EXAMS ===")
    questions = db.query(ALQuestion).all()
    print(f"Total ALQuestions in database: {len(questions)}")
    
    types_found = {}
    sample_by_type = {}
    for q in questions:
        tt = str(q.template_type.value if hasattr(q.template_type, "value") else q.template_type)
        types_found[tt] = types_found.get(tt, 0) + 1
        if tt not in sample_by_type:
            sample_by_type[tt] = {
                "id": q.id,
                "exam_id": q.exam_id,
                "question_number": q.question_number,
                "template_type": tt,
                "stem_text": q.stem_text[:120] if q.stem_text else None,
                "options": q.options,
                "diagram_url": q.diagram_url,
                "requires_image": q.requires_image,
                "statements_json": q.statements_json,
                "grid_key_json": q.grid_key_json,
                "assertion_text": q.assertion_text,
                "reason_text": q.reason_text,
                "snapshot_json_keys": list(q.snapshot_json.keys()) if isinstance(q.snapshot_json, dict) else None
            }
    
    print("\nTemplate Types Count in ALQuestion:")
    for tt, count in types_found.items():
        print(f"  - {tt}: {count}")

    print("\nSamples by Template Type:")
    for tt, s in sample_by_type.items():
        print(f"\n--- TYPE: {tt} ---")
        print(json.dumps(s, indent=2))

    print("\n=== QUESTIONS WITH DIAGRAMS ===")
    diag_qs = [q for q in questions if q.diagram_url or q.requires_image]
    print(f"Questions with diagram_url or requires_image: {len(diag_qs)}")
    for q in diag_qs[:5]:
        print(f"Q{q.question_number} (ID {q.id}): diagram_url={q.diagram_url[:60] if q.diagram_url else None}, desc={q.image_description}")

    print("\n=== QUESTIONS WITH GRID_KEY_JSON OR STATEMENTS_JSON ===")
    grid_qs = [q for q in questions if q.grid_key_json or q.statements_json]
    print(f"Questions with grid_key_json or statements_json: {len(grid_qs)}")
    for q in grid_qs[:5]:
        print(f"\nQ{q.question_number} (ID {q.id}, Type {q.template_type}):")
        print(f"  stem: {q.stem_text[:80] if q.stem_text else None}")
        print(f"  statements_json: {q.statements_json}")
        print(f"  grid_key_json: {q.grid_key_json}")

finally:
    db.close()
