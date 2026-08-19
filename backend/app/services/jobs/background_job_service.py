"""
Processing Job Service for Lumora LMS.
Tracks asynchronous background jobs (OCR, Transcription, Vector Indexing, AI Quiz Gen, AI Summaries).
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models import ProcessingJob, JobType, JobStatus


def create_processing_job(
    db: Session,
    job_type: JobType,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[int] = None
) -> ProcessingJob:
    """
    Create a new background job record in QUEUED status.
    """
    job = ProcessingJob(
        job_type=job_type,
        status=JobStatus.QUEUED,
        progress=0.0,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def update_job_status(
    db: Session,
    job_id: int,
    status: JobStatus,
    progress: Optional[float] = None,
    error_message: Optional[str] = None
) -> Optional[ProcessingJob]:
    """
    Update progress and state transitions for a processing job.
    """
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        return None

    job.status = status
    if progress is not None:
        job.progress = progress

    if status == JobStatus.RUNNING and not job.started_at:
        job.started_at = datetime.utcnow()
    elif status in [JobStatus.COMPLETED, JobStatus.FAILED]:
        job.completed_at = datetime.utcnow()
        if status == JobStatus.COMPLETED:
            job.progress = 100.0

    if error_message:
        job.error_message = error_message

    db.commit()
    db.refresh(job)
    return job
