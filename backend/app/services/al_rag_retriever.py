"""
Backwards-compatibility alias shim for curriculum RAG retriever.
Re-exports app.services.materials.retrieval.learning_material_retriever.
"""
from app.services.materials.retrieval import learning_material_retriever as _mod
import sys; sys.modules[__name__] = _mod
