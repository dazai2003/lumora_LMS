"""
G.C.E. Advanced Level Curriculum & Scope Slicer API.

Handles 3-tier Scope Slicing (Lesson Scope, Unit Scope, Subject Scope) assessment generation
grounded exclusively in Lesson Learning Materials.
"""

from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import User
from app.auth import require_teacher
from app.services.scope_slicer_service import scope_slicer

router = APIRouter(tags=["A/L Curriculum & Scope Slicer"])


@router.post("/generate-scope-exam")
def generate_scope_exam(
    course_id: int = Form(...),
    scope: str = Form("lesson"),  # lesson, unit, subject
    target_id: Optional[int] = Form(None),  # lesson_id or unit_id
    paper_type: str = Form("paper_1_mcq"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Generates an assessment sliced by Lesson Scope, Unit Scope, or Full Subject Scope.
    Grounded exclusively in valid Lesson Learning Materials.
    """
    try:
        res = scope_slicer.generate_scope_sliced_assessment(
            db=db,
            scope=scope,
            target_id=target_id,
            course_id=course_id,
            paper_type=paper_type,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
