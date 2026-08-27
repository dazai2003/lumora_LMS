"""
Lumora JWT Authentication & Role-Based Access Control (RBAC) Security Service.

Handles secure password hashing, stateless JWT token generation/validation, and
FastAPI role-enforcement dependency injection.

Key Design Decisions & Notes:
1. Security Specifications:
   - Password hashing: CryptContext using Bcrypt with automatic salt generation.
   - Token standard: RFC 7519 JSON Web Tokens signed with HMAC-SHA256 (HS256).
   - Default token validity: 1440 minutes (24 hours) for smooth classroom sessions.
2. RBAC Dependency Injection:
   - `get_current_user`: Decodes JWT payload, validates expiration, and fetches user from DB.
   - `require_role(...)`: Higher-order dependency rejecting unauthorized roles with HTTP 403 Forbidden.
   - `require_teacher`: Enforces Teacher privilege for course management and SpeedGrader access.
3. Compatibility Fix:
   - Patches passlib bcrypt 4.x __about__ version attribute dynamically to avoid deprecation runtime crash.
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
# Fix passlib bcrypt 4.x compatibility
try:
    import bcrypt
    if not hasattr(bcrypt, "__about__"):
        bcrypt.__about__ = type("about", (), {"__version__": getattr(bcrypt, "__version__", "4.0.0")})()
except Exception:
    pass

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
        sub = payload.get("sub")
        email: Optional[str] = payload.get("email")
        role: Optional[str] = payload.get("role")
        if sub is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        
        user_id: Optional[int] = None
        if isinstance(sub, int) or (isinstance(sub, str) and sub.isdigit()):
            user_id = int(sub)
        elif isinstance(sub, str) and "@" in sub:
            email = sub

        return TokenData(user_id=user_id, email=email, role=role)
    except (JWTError, ValueError):
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
    user = None
    if token_data.user_id is not None:
        user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None and token_data.email:
        user = db.query(User).filter(User.email == token_data.email).first()

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
require_teacher = require_role(UserRole.TEACHER)
require_student = require_role(UserRole.STUDENT)
require_admin = require_teacher  # Aliased to teacher for compatibility
require_admin_or_teacher = require_teacher  # Aliased to teacher for teacher authorization
