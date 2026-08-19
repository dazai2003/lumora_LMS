import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))

from google import genai

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

try:
    models = list(client.models.list())
    print(f"Total models available: {len(models)}")
    for m in models:
        methods = getattr(m, 'supported_generation_methods', []) or getattr(m, 'supported_actions', [])
        print(f"Name: {m.name} | Display: {getattr(m, 'display_name', '')} | Methods: {methods}")
except Exception as e:
    print("Error listing models:", e)
