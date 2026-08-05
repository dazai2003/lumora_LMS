"""
Background Jobs API Router for Lumora LMS.
Allows frontend and system services to query the status of async background tasks.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import ProcessingJob, User
from app.schemas import ProcessingJobResponse
from app.auth import get_current_user

router = APIRouter()


@router.get("/{job_id}", response_model=ProcessingJobResponse)
def get_processing_job_status(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve current status, progress, and error state for a processing job.
    """
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Processing job not found")

    return job
