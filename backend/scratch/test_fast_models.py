import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))

from google import genai

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

models_to_test = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-pro-preview",
    "gemini-pro-latest"
]

for m in models_to_test:
    try:
        res = client.models.generate_content(
            model=m,
            contents="State the first law of thermodynamics in 10 words."
        )
        print(f"[OK] {m}: {res.text.strip()}")
    except Exception as e:
        print(f"[ERR] {m}: {e}")
