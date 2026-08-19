import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import Material, Lesson, ProcessingStatus
from app.services.ocr import extract_text_from_pdf, extract_text_from_image
from app.services.vector import store_material_embeddings

db = SessionLocal()
materials = db.query(Material).all()

synced = 0
for m in materials:
    txt_len = len(m.extracted_text) if m.extracted_text else 0
    cnt_len = len(m.content) if m.content else 0
    if txt_len < 50 and cnt_len < 50 and m.file_path and os.path.exists(m.file_path):
        print(f"Extracting material ID {m.id}: {m.title} ({m.file_path})...")
        extracted = None
        if m.file_path.lower().endswith(".pdf"):
            extracted = extract_text_from_pdf(m.file_path)
        elif any(m.file_path.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
            extracted = extract_text_from_image(m.file_path)
        elif any(m.file_path.lower().endswith(ext) for ext in [".md", ".txt"]):
            with open(m.file_path, "r", encoding="utf-8", errors="ignore") as f:
                extracted = f.read()
                
        if extracted and len(extracted.strip()) >= 20:
            clean_text = extracted.replace("\x00", "").strip()
            m.extracted_text = clean_text
            m.processing_status = ProcessingStatus.COMPLETED
            db.commit()
            synced += 1
            print(f"  -> Extracted {len(clean_text)} chars for ID {m.id}")
            
            try:
                lesson = db.query(Lesson).filter(Lesson.id == m.lesson_id).first() if m.lesson_id else None
                course_id = lesson.course_id if lesson else (m.course_id or 0)
                store_material_embeddings(
                    material_id=m.id,
                    lesson_id=m.lesson_id or 0,
                    course_id=course_id,
                    text=clean_text,
                    title=m.title,
                )
            except Exception as e:
                print(f"  -> Vector store error for ID {m.id}: {e}")

print(f"Sync complete. Total materials updated: {synced}")
db.close()
