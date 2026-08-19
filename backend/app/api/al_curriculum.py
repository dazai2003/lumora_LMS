"""
G.C.E. Advanced Level Curriculum & Scope Slicer API.

Handles private Teacher RAG Vault management (past papers, marking schemes, resource books)
and 3-tier Scope Slicing (Lesson Scope, Unit Scope, Subject Scope) assessment generation.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import os
import shutil

from app.database import get_db
from app.models import (
    User, Course, Material, MaterialType
)
from app.auth import get_current_user, require_teacher
from app.services.scope_slicer_service import scope_slicer

router = APIRouter(tags=["A/L Curriculum & Scope Slicer"])


@router.get("/rag-vault")
def get_private_rag_vault_materials(
    course_id: int = Query(...),
    category: Optional[str] = Query(None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher views private RAG Vault materials (past papers, marking schemes, resource books).
    These files are hidden from student learning material lists.
    """
    query = db.query(Material).filter(
        Material.course_id == course_id,
        Material.is_private_rag_vault == True
    )
    if category:
        query = query.filter(Material.category == category)

    materials = query.order_by(Material.created_at.desc()).all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "category": m.category,
            "material_type": m.material_type,
            "file_path": m.file_path,
            "is_private_rag_vault": m.is_private_rag_vault,
            "created_at": m.created_at,
        }
        for m in materials
    ]


@router.post("/rag-vault")
def upload_to_private_rag_vault(
    course_id: int = Form(...),
    title: str = Form(...),
    category: str = Form("past_paper"), # past_paper, marking_scheme, resource_book, syllabus
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher uploads a past paper, marking scheme, or resource book to the private RAG Vault.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    file_url = None
    if file:
        os.makedirs("uploads/rag_vault", exist_ok=True)
        file_path = os.path.join("uploads/rag_vault", f"{course_id}_{file.filename}")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        file_url = f"/{file_path}"

    material = Material(
        course_id=course_id,
        title=title,
        material_type=MaterialType.PDF,
        category=category,
        is_private_rag_vault=True,
        file_path=file_url,
        extracted_text=f"Sample extracted RAG content for {title}",
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    return {
        "message": f"Successfully uploaded '{title}' to private Course Materials RAG Vault!",
        "material_id": material.id,
        "category": material.category,
        "is_private_rag_vault": True,
    }


@router.post("/generate-scope-exam")
def generate_scope_exam(
    course_id: int = Form(...),
    scope: str = Form("lesson"), # lesson, unit, subject
    target_id: Optional[int] = Form(None), # lesson_id or unit_id
    paper_type: str = Form("paper_1_mcq"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Generates an assessment sliced by Lesson Scope, Unit Scope, or Full Subject Scope.
    Fuses lesson learning materials with marking schemes & resource books from the private RAG Vault.
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
