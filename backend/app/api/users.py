"""
User Management API: List, update, activate/deactivate users.
Primarily used by Admin.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import User, UserRole, PasswordResetRequest, PasswordResetStatus, Notification, NotificationType
from app.schemas import UserResponse, UserUpdate, UserCreate, MessageResponse, PasswordResetResponse, PasswordResetResolve
from app.auth import get_current_user, require_admin, require_admin_or_teacher, hash_password

router = APIRouter()


from datetime import datetime

@router.post("/ping", response_model=MessageResponse)
async def ping(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update last_active_at for the current user."""
    current_user.last_active_at = datetime.utcnow()
    db.commit()
    return {"message": "Ping successful", "success": True}

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new user. Admin only."""
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    new_user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("", response_model=List[UserResponse])
async def list_users(
    role: Optional[UserRole] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all users with optional filters. Admin only."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if search:
        query = query.filter(
            (User.full_name.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%"))
        )
    return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/password-resets", response_model=List[PasswordResetResponse])
async def list_password_resets(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
    req_status: Optional[str] = Query(None, alias="status")
):
    """List password reset requests. Admin only."""
    query = db.query(PasswordResetRequest)
    if req_status:
        query = query.filter(PasswordResetRequest.status == req_status)
    
    return query.order_by(PasswordResetRequest.created_at.desc()).all()


@router.post("/password-resets/{request_id}/resolve", response_model=MessageResponse)
async def resolve_password_reset(
    request_id: int,
    resolve_data: PasswordResetResolve,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Resolve a password reset request by setting a new password. Admin only."""
    reset_req = db.query(PasswordResetRequest).filter(PasswordResetRequest.id == request_id).first()
    if not reset_req:
        raise HTTPException(status_code=404, detail="Password reset request not found")
        
    if reset_req.status == PasswordResetStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Request is already resolved")

    # Update user password
    user = db.query(User).filter(User.id == reset_req.user_id).first()
    if user:
        user.hashed_password = hash_password(resolve_data.new_password)
        user.must_change_password = True
        
        # [SIMULATED EMAIL] In a production environment, this is where we would use SMTP/SendGrid
        # to email the temporary password to the user.
        print(f"\n[EMAIL DISPATCHER] To: {user.email}")
        print(f"[EMAIL DISPATCHER] Subject: Your Lumora Password Has Been Reset")
        print(f"[EMAIL DISPATCHER] Body: Your temporary password is: {resolve_data.new_password}\n")
        
        # Send system notification to user as an audit trail (they will see it after they log in)
        notif = Notification(
            user_id=user.id,
            title="Password Reset Successful",
            message="Your password was reset by the administrator.",
            type=NotificationType.SYSTEM
        )
        db.add(notif)
        
    # Mark request resolved
    reset_req.status = PasswordResetStatus.RESOLVED
    reset_req.temp_password = resolve_data.new_password
    reset_req.resolved_at = datetime.utcnow()
    
    db.commit()
    return {"message": "Password reset successfully and user notified", "success": True}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a specific user by ID. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a user's profile. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/toggle-active", response_model=MessageResponse)
async def toggle_user_active(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Activate or deactivate a user account. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    user.is_active = not user.is_active
    db.commit()
    action = "activated" if user.is_active else "deactivated"
    return {"message": f"User {user.full_name} has been {action}", "success": True}


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a user. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db.delete(user)
    db.commit()
    return {"message": f"User {user.full_name} has been deleted", "success": True}
