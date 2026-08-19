import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import Material, Lesson, Course

db = SessionLocal()
materials = db.query(Material).all()
print(f"Total Materials in DB: {len(materials)}")
for m in materials:
    txt_len = len(m.extracted_text) if m.extracted_text else 0
    cnt_len = len(m.content) if m.content else 0
    f_exists = os.path.exists(m.file_path) if m.file_path else False
    print(f"ID: {m.id} | Title: {m.title} | Type: {m.material_type} | Extracted: {txt_len} chars | Content: {cnt_len} chars | Status: {m.processing_status} | FilePath: {m.file_path} (exists: {f_exists})")

db.close()
