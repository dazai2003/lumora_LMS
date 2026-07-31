"""
Authentication API: Register, Login, Get Current User.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, PasswordResetRequest, Notification, NotificationType
from app.schemas import UserRegister, UserLogin, Token, UserResponse, PasswordResetCreate, MessageResponse, ChangePasswordRequest
from app.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user account."""
    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Only allow student registration publicly; admin creates teachers
    if user_data.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot be created via registration",
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


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Authenticate and return a JWT token."""
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact an administrator.",
        )

    token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role.value}
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(reset_data: PasswordResetCreate, db: Session = Depends(get_db)):
    """Submit a password reset request."""
    user = db.query(User).filter(User.email == reset_data.email).first()
    if not user:
        # Prevent email enumeration by returning a generic success message
        return {"message": "If that email is registered, a password reset request has been sent to the administrator."}
    
    # Check if a pending request already exists
    existing = db.query(PasswordResetRequest).filter(
        PasswordResetRequest.user_id == user.id,
        PasswordResetRequest.status == "pending"
    ).first()
    
    if existing:
        return {"message": "A password reset request is already pending for this account. Please wait for an administrator to process it."}
        
    reset_request = PasswordResetRequest(
        user_id=user.id,
        email=user.email,
        reason=reset_data.reason
    )
    db.add(reset_request)
    db.commit()
    return {"message": "Password reset request submitted successfully. An administrator will review your request."}


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allow user to change their password, typically forced after an admin reset."""
    current_user.hashed_password = hash_password(data.new_password)
    current_user.must_change_password = False
    
    # Notify them via system notification
    notif = Notification(
        user_id=current_user.id,
        title="Password Updated",
        message="Your password was successfully changed.",
        type=NotificationType.SYSTEM
    )
    db.add(notif)
    db.commit()
    
    return {"message": "Password successfully reset.", "success": True}
