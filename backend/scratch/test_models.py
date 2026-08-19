import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))

from google import genai

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

candidate_models = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-flash-latest"
]

for model_name in candidate_models:
    try:
        res = client.models.generate_content(
            model=model_name,
            contents="What is photosynthesis in 10 words?"
        )
        print(f"[SUCCESS] {model_name} -> {res.text.strip()}")
    except Exception as e:
        print(f"[FAILED] {model_name} -> {e}")
