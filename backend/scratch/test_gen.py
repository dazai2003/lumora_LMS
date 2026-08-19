import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))

from google import genai

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

for m in ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-2.5-flash"]:
    try:
        res = client.models.generate_content(
            model=m,
            contents="Explain photosynthesis in 15 words."
        )
        print(f"[OK] {m}: {res.text.strip()}")
    except Exception as e:
        print(f"[ERR] {m}: {e}")
