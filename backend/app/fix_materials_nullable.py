from app.database import engine
from sqlalchemy import text

def fix_materials_lesson_id_nullable():
    """Drop NOT NULL constraint on materials.lesson_id column in PostgreSQL."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE materials ALTER COLUMN lesson_id DROP NOT NULL;"))
            conn.commit()
            print("[SUCCESS] Successfully altered column 'materials.lesson_id' to DROP NOT NULL constraint!")
        except Exception as e:
            print(f"[NOTE] Migration execution info: {e}")

if __name__ == "__main__":
    fix_materials_lesson_id_nullable()
