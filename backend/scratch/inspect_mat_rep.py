"""
Inspect compute_course_material_analytics(36, db)
"""
import os, sys
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)
from app.database import SessionLocal
from app.services.analytics import compute_course_material_analytics
db = SessionLocal()

mat_rep = compute_course_material_analytics(36, db)
print(f"mat_rep.total_materials: {mat_rep.total_materials}")
print(f"mat_rep.total_flags: {mat_rep.total_flags}")
for m in mat_rep.materials:
    print(f"  Material #{m.material_id}: '{m.title}' | flags: {m.flag_count} | views: {m.views_count}")

db.close()
