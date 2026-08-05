"""
Material Processor: Orchestrates OCR, audio transcription, and vectorization.
Called as a FastAPI BackgroundTask when materials are uploaded.
"""
import logging
import time
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Material, MaterialType, ProcessingStatus, Lesson, AILog
from app.services.ocr import extract_text_from_image, extract_text_from_pdf
from app.services.audio import transcribe_audio
from app.services.vector import store_material_embeddings

logger = logging.getLogger(__name__)


def process_material(material_id: int, db_session_factory) -> None:
    """
    Background task: process an uploaded material.
    1. Extract text (OCR for images/PDFs, Whisper for audio/video)
    2. Save extracted text to the database
    3. Store text embeddings in the vector database
    """
    start_time = time.time()
    db: Session = db_session_factory()

    try:
        material = db.query(Material).filter(Material.id == material_id).first()
        if not material:
            logger.error(f"Material {material_id} not found")
            return

        if material.processing_status == ProcessingStatus.COMPLETED:
            logger.info(f"Material {material_id} already processed, skipping")
            return

        # Mark as processing
        material.processing_status = ProcessingStatus.PROCESSING
        db.commit()

        logger.info(f"Processing material {material_id}: type={material.material_type.value}, file={material.file_path}")

        extracted_text: Optional[str] = None

        # ── Step 1: Extract text based on type ──
        if material.material_type == MaterialType.NOTE:
            # Notes already have their text in the content field
            extracted_text = material.content

        elif material.material_type == MaterialType.IMAGE:
            extracted_text = extract_text_from_image(material.file_path)

        elif material.material_type == MaterialType.PDF:
            extracted_text = extract_text_from_pdf(material.file_path)

        elif material.material_type == MaterialType.VIDEO:
            extracted_text = transcribe_audio(material.file_path)

        # ── Step 2: Save to database ──
        if extracted_text:
            material.extracted_text = extracted_text
            material.processing_status = ProcessingStatus.COMPLETED
            db.commit()
            logger.info(f"Material {material_id}: extracted {len(extracted_text)} chars")
        else:
            # No text found, but not necessarily an error
            material.extracted_text = ""
            material.processing_status = ProcessingStatus.COMPLETED
            db.commit()
            logger.info(f"Material {material_id}: no text extracted (this may be expected)")

        # ── Step 3: Vectorize for RAG Q&A ──
        if extracted_text and len(extracted_text) > 20:
            lesson = db.query(Lesson).filter(Lesson.id == material.lesson_id).first()
            course_id = lesson.course_id if lesson else 0

            chunks_stored = store_material_embeddings(
                material_id=material.id,
                lesson_id=material.lesson_id,
                course_id=course_id,
                text=extracted_text,
                title=material.title,
            )
            logger.info(f"Material {material_id}: stored {chunks_stored} vector chunks")

            # Notify teacher if video transcript is ready
            if material.material_type == MaterialType.VIDEO and lesson:
                from app.models import Course, Notification, NotificationType
                course = db.query(Course).filter(Course.id == lesson.course_id).first()
                if course and course.teacher_id:
                    comp_notif = Notification(
                        user_id=course.teacher_id,
                        title=f"AI Transcript Ready: '{material.title}'",
                        message=f"AI speech-to-text transcript for video '{material.title}' is ready. Click to review and edit.",
                        type=NotificationType.SYSTEM,
                        related_entity_id=material.id,
                    )
                    db.add(comp_notif)
                    db.commit()

        # ── Log the AI operation ──
        elapsed_ms = int((time.time() - start_time) * 1000)
        ai_log = AILog(
            action="process_material",
            input_summary=f"Material {material_id} ({material.material_type.value}): {material.title}",
            output_summary=f"Extracted {len(extracted_text or '')} chars" if extracted_text else "No text extracted",
            processing_time_ms=elapsed_ms,
            status=ProcessingStatus.COMPLETED,
        )
        db.add(ai_log)
        db.commit()

        logger.info(f"Material {material_id} processing complete in {elapsed_ms}ms")

    except Exception as e:
        logger.error(f"Material {material_id} processing FAILED: {e}", exc_info=True)
        try:
            material = db.query(Material).filter(Material.id == material_id).first()
            if material:
                material.processing_status = ProcessingStatus.FAILED
                db.commit()

            elapsed_ms = int((time.time() - start_time) * 1000)
            ai_log = AILog(
                action="process_material",
                input_summary=f"Material {material_id}",
                output_summary=None,
                processing_time_ms=elapsed_ms,
                status=ProcessingStatus.FAILED,
                error_message=str(e),
            )
            db.add(ai_log)
            db.commit()
        except Exception:
            pass  # Don't let logging errors mask the original error

    finally:
        db.close()
