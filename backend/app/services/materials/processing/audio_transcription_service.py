"""
Audio/Video Transcription Service using Groq's Whisper API.
Sends audio to Groq cloud for fast transcription — no local compute needed.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def transcribe_audio(file_path: str) -> Optional[str]:
    """Transcribe audio/video file using Groq Whisper API."""
    try:
        from groq import Groq

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.error("GROQ_API_KEY not set in environment")
            return None

        model = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")

        # Check file size — Groq has a 25MB limit
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > 25:
            logger.warning(f"File is {file_size_mb:.1f}MB, exceeds Groq 25MB limit. Skipping transcription.")
            return None

        client = Groq(api_key=api_key)

        with open(file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model=model,
                file=audio_file,
                language="en",
                response_format="text",
            )

        text = str(transcription).strip()

        if text:
            logger.info(f"Transcribed {len(text)} chars from: {file_path}")
            return text
        else:
            logger.info(f"No speech detected in: {file_path}")
            return None

    except ImportError:
        logger.error("groq package not installed. Run: pip install groq")
        return None
    except Exception as e:
        logger.error(f"Transcription failed for {file_path}: {e}")
        return None
