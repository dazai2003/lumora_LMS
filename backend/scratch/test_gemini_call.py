import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))

print("GEMINI_API_KEY set:", bool(os.getenv("GEMINI_API_KEY")))
print("GOOGLE_API_KEY set:", bool(os.getenv("GOOGLE_API_KEY")))

try:
    from app.services.gemini_service import gemini
    print("Calling gemini.generate_text...")
    res = gemini.generate_text(
        prompt="What is photosynthesis in 1 sentence?",
        model_tier="flash",
    )
    print("Gemini response:", res)
except Exception as e:
    print("Gemini call error:", type(e), e)
    import traceback
    traceback.print_exc()
