"""
Lumora Assessment Engine — Diagram Image & Base64 Processing Utility.
Intercepts Base64 Data URLs, decodes and saves image files to disk,
and returns clean static file URL paths (/uploads/diagrams/diagram_uuid.png).
"""

import os
import base64
import uuid
import logging

logger = logging.getLogger(__name__)

def process_and_save_diagram_url(url_or_base64: str | None) -> str | None:
    """
    If url_or_base64 is a Base64 data URL (e.g. data:image/png;base64,...),
    decodes it, writes the image file to 'uploads/diagrams/', and returns
    the clean static URL path (e.g. '/uploads/diagrams/diagram_abc123.png').
    
    If it is already a URL or path, returns it unchanged.
    If empty or None, returns None.
    """
    if not url_or_base64:
        return None

    val = str(url_or_base64).strip()
    if not val:
        return None

    if val.startswith("data:image/") or ";base64," in val:
        try:
            # Extract header and base64 payload
            if ";base64," in val:
                header, encoded = val.split(";base64,", 1)
            else:
                header = "data:image/png"
                encoded = val

            # Determine file extension
            ext = "png"
            header_lower = header.lower()
            if "jpeg" in header_lower or "jpg" in header_lower:
                ext = "jpg"
            elif "gif" in header_lower:
                ext = "gif"
            elif "svg" in header_lower:
                ext = "svg"
            elif "webp" in header_lower:
                ext = "webp"

            # Clean any whitespace or newlines in base64 string
            cleaned_encoded = "".join(encoded.split())
            file_bytes = base64.b64decode(cleaned_encoded)

            filename = f"diagram_{uuid.uuid4().hex}.{ext}"
            target_dir = os.path.join("uploads", "diagrams")
            os.makedirs(target_dir, exist_ok=True)
            file_path = os.path.join(target_dir, filename)

            with open(file_path, "wb") as f:
                f.write(file_bytes)

            clean_url = f"/uploads/diagrams/{filename}"
            logger.info(f"Successfully converted Base64 diagram image to static file: {clean_url} ({len(file_bytes)} bytes)")
            return clean_url
        except Exception as e:
            logger.error(f"Failed to decode base64 diagram image: {e}")
            return None

    return val
