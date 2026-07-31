"""
JWT Authentication utilities: token creation, password hashing, and user extraction.
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os

from app.database import get_db
from app.models import User, UserRole
from app.schemas import TokenData

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── Password helpers ──

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT helpers ──

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        user_id = int(user_id_str)
        return TokenData(user_id=user_id, email=email, role=role)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# ── Current user dependency ──

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    token_data = decode_token(token)
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    return user


# ── Role-based access helpers ──

def require_role(*roles: UserRole):
    """Dependency factory that restricts endpoints to specific roles."""
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(r.value for r in roles)}",
            )
        return current_user
    return role_checker

# ── Course Access check ──

def check_course_access(course_id: int, current_user: User, db: Session):
    """Enforce payment status checks for students accessing course content."""
    if current_user.role == UserRole.STUDENT:
        from app.models import Course, Subscription, Payment, PaymentStatus, SubscriptionStatus, PaymentPlanType
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
            
        if course.is_paid_course:
            sub = db.query(Subscription).filter(
                Subscription.student_id == current_user.id,
                Subscription.course_id == course_id
            ).first()
            
            if sub:
                if sub.status == SubscriptionStatus.OVERDUE:
                    raise HTTPException(status_code=403, detail="Payment Required: Overdue")
                elif sub.status == SubscriptionStatus.CANCELLED:
                    raise HTTPException(status_code=403, detail="Payment Required: Cancelled")
                elif sub.status == SubscriptionStatus.ACTIVE:
                    return # Access granted
            
            # Check one-time payment
            one_time = db.query(Payment).filter(
                Payment.student_id == current_user.id,
                Payment.course_id == course_id,
                Payment.payment_plan == PaymentPlanType.ONE_TIME,
                Payment.status == PaymentStatus.COMPLETED
            ).first()
            
            if not one_time and not sub:
                raise HTTPException(status_code=403, detail="Payment Required: Not Subscribed")



# Convenience dependencies
require_admin = require_role(UserRole.ADMIN)
require_teacher = require_role(UserRole.TEACHER)
require_student = require_role(UserRole.STUDENT)
require_admin_or_teacher = require_role(UserRole.ADMIN, UserRole.TEACHER)
