"""
Vector Store Service using ChromaDB + SentenceTransformers.
Stores text embeddings for RAG-based AI Q&A (Phase 4).

Uses all-MiniLM-L6-v2 (~80MB) — extremely lightweight and fast, perfect for low-end machines.
"""
import os
import logging
import hashlib
from typing import List, Optional, Dict

logger = logging.getLogger(__name__)

# Lazy-loaded globals
_chroma_client = None
_collection = None
_embedding_model = None


def _get_embedding_model():
    """Lazy-load the sentence-transformer model (first call downloads ~80MB)."""
    global _embedding_model
    if _embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Loaded embedding model: all-MiniLM-L6-v2")
        except ImportError:
            logger.error("sentence-transformers not installed")
            raise
    return _embedding_model


def _get_collection():
    """Lazy-load the ChromaDB collection."""
    global _chroma_client, _collection
    if _collection is None:
        try:
            import chromadb
            persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
            persist_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                persist_dir.lstrip("./")
            )
            os.makedirs(persist_path, exist_ok=True)

            _chroma_client = chromadb.PersistentClient(path=persist_path)
            _collection = _chroma_client.get_or_create_collection(
                name="fdp_materials",
                metadata={"description": "Learning material embeddings for RAG"}
            )
            logger.info(f"ChromaDB collection ready at: {persist_path}")
        except ImportError:
            logger.error("chromadb not installed")
            raise
    return _collection


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks for better embedding quality."""
    if not text or len(text) < 50:
        return [text] if text else []

    words = text.split()
    chunks = []
    start = 0

    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap

    return chunks


def store_material_embeddings(
    material_id: int,
    lesson_id: int,
    course_id: int,
    text: str,
    title: str = "",
) -> int:
    """Chunk text, embed it, and store in ChromaDB. Returns number of chunks stored."""
    try:
        collection = _get_collection()
        model = _get_embedding_model()

        # Remove any existing embeddings for this material (in case of re-processing)
        try:
            existing = collection.get(where={"material_id": material_id})
            if existing and existing["ids"]:
                collection.delete(ids=existing["ids"])
                logger.info(f"Removed {len(existing['ids'])} old embeddings for material {material_id}")
        except Exception:
            pass  # Collection might be empty

        # Chunk the text
        chunks = chunk_text(text)
        if not chunks:
            logger.info(f"No chunks to embed for material {material_id}")
            return 0

        # Generate embeddings
        embeddings = model.encode(chunks).tolist()

        # Prepare IDs and metadata
        ids = []
        metadatas = []
        for i, chunk in enumerate(chunks):
            chunk_hash = hashlib.md5(f"{material_id}_{i}".encode()).hexdigest()[:12]
            ids.append(f"mat_{material_id}_chunk_{i}_{chunk_hash}")
            metadatas.append({
                "material_id": material_id,
                "lesson_id": lesson_id,
                "course_id": course_id,
                "title": title,
                "chunk_index": i,
            })

        # Store in ChromaDB
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        logger.info(f"Stored {len(chunks)} embeddings for material {material_id} ('{title}')")
        return len(chunks)

    except Exception as e:
        logger.error(f"Failed to store embeddings for material {material_id}: {e}")
        return 0


def search_similar(
    query: str,
    course_id: Optional[int] = None,
    n_results: int = 5,
) -> List[Dict]:
    """Search for similar content in the vector store (used by Phase 4 Q&A)."""
    try:
        collection = _get_collection()
        model = _get_embedding_model()

        query_embedding = model.encode([query]).tolist()

        where_filter = {"course_id": course_id} if course_id else None

        results = collection.query(
            query_embeddings=query_embedding,
            n_results=n_results,
            where=where_filter,
        )

        hits = []
        if results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                hits.append({
                    "text": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0,
                })

        return hits

    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []

def check_duplicate_question(new_text: str, existing_questions: List[Dict], threshold: float = 0.85) -> List[Dict]:
    """
    Check if a new question is semantically identical to any existing questions in the bank.
    existing_questions should be a list of dicts: {"id": 1, "text": "What is...?"}
    Returns a list of dicts: [{"id": 1, "similarity": 0.92}, ...]
    """
    if not existing_questions or not new_text.strip():
        return []

    try:
        model = _get_embedding_model()
        import numpy as np

        # Embed new text
        new_embedding = model.encode(new_text)

        # Embed all existing texts
        texts = [q["text"] for q in existing_questions]
        existing_embeddings = model.encode(texts)

        # Compute cosine similarity
        # embeddings are usually shape (N, dim), so we can do dot product if they are normalized
        # SentenceTransformers all-MiniLM-L6-v2 outputs normalized embeddings by default,
        # but let's be safe and compute true cosine similarity: (A dot B) / (|A| * |B|)
        
        # normalize
        norm_new = np.linalg.norm(new_embedding)
        if norm_new == 0:
            return []
        
        new_normed = new_embedding / norm_new
        
        duplicates = []
        for i, q in enumerate(existing_questions):
            ex_emb = existing_embeddings[i]
            norm_ex = np.linalg.norm(ex_emb)
            if norm_ex == 0:
                continue
                
            ex_normed = ex_emb / norm_ex
            sim = np.dot(new_normed, ex_normed)
            
            if sim >= threshold:
                duplicates.append({
                    "id": q["id"],
                    "text": q["text"],
                    "similarity": float(sim)
                })

        # Sort by similarity descending
        duplicates.sort(key=lambda x: x["similarity"], reverse=True)
        return duplicates

    except Exception as e:
        logger.error(f"Duplicate check failed: {e}")
        return []
