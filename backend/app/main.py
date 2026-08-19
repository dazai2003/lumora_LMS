"""
Module alias wrapper for FastAPI application.
Ensures both 'uvicorn main:app' and 'uvicorn app.main:app' work seamlessly.
"""
import sys
import os

backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from main import app  # noqa: F401
