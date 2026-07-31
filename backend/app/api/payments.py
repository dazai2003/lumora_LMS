import uuid
from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import User, Course, Payment, Subscription, PaymentStatus, SubscriptionStatus, PaymentPlanType, UserRole, Notification, NotificationType
from app.schemas import PaymentCreate, PaymentResponse, SubscriptionResponse, PaymentOverview, MessageResponse
from app.auth import get_current_user, require_admin

router = APIRouter()

# ──────────────────────────────────────────────
# Student Payment Routes
# ──────────────────────────────────────────────

@router.post("/checkout", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    payment_data: PaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Process a course payment for a student."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students can make payments")

    course = db.query(Course).filter(Course.id == payment_data.course_id).first()
    if not course or not course.is_active:
        raise HTTPException(status_code=404, detail="Course not found or inactive")
    
    if not course.is_paid_course:
        raise HTTPException(status_code=400, detail="This course is free")

    # Check existing subscription or one-time payment
    from app.models import Enrollment
    existing_sub = db.query(Subscription).filter(
        Subscription.student_id == current_user.id,
        Subscription.course_id == course.id,
        Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.OVERDUE])
    ).first()

    if existing_sub and existing_sub.status == SubscriptionStatus.OVERDUE:
        raise HTTPException(status_code=400, detail="You have an overdue balance. Please pay it from the billing section.")


    existing_full = db.query(Payment).filter(
        Payment.student_id == current_user.id,
        Payment.course_id == course.id,
        Payment.payment_plan == PaymentPlanType.ONE_TIME,
        Payment.status == PaymentStatus.COMPLETED
    ).first()

    if existing_sub or existing_full:
        raise HTTPException(status_code=400, detail="Already subscribed or paid for this course")

    amount = course.monthly_price if payment_data.payment_plan == PaymentPlanType.MONTHLY else course.full_price
    if amount is None or amount <= 0:
        raise HTTPException(status_code=400, detail="Pricing not configured for this course")

    # Simulate successful transaction
    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
    
    payment = Payment(
        student_id=current_user.id,
        course_id=course.id,
        amount=amount,
        payment_plan=payment_data.payment_plan,
        status=PaymentStatus.COMPLETED,
        transaction_id=transaction_id,
        paid_at=datetime.utcnow()
    )
    db.add(payment)
    
    # If monthly, create subscription
    if payment_data.payment_plan == PaymentPlanType.MONTHLY:
        subscription = Subscription(
            student_id=current_user.id,
            course_id=course.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_end=datetime.utcnow() + timedelta(days=30)
        )
        db.add(subscription)

    # Add enrollment if not already enrolled
    existing_enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.course_id == course.id,
        Enrollment.is_active == True
    ).first()
    
    if not existing_enrollment:
        enrollment = Enrollment(
            student_id=current_user.id,
            course_id=course.id
        )
        db.add(enrollment)

    db.commit()
    db.refresh(payment)
    return payment


@router.get("/my-billing/transactions", response_model=List[PaymentResponse])
async def my_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's payment history."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Not authorized")

    payments = db.query(Payment).filter(Payment.student_id == current_user.id).order_by(Payment.created_at.desc()).all()
    
    res = []
    for p in payments:
        data = PaymentResponse.model_validate(p)
        data.course_title = p.course.title if p.course else "Unknown Course"
        res.append(data)
    return res


@router.get("/my-billing/subscriptions", response_model=List[SubscriptionResponse])
async def my_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's active subscriptions."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Not authorized")

    subs = db.query(Subscription).filter(
        Subscription.student_id == current_user.id,
        Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.OVERDUE])
    ).order_by(Subscription.current_period_end.asc()).all()

    res = []
    for s in subs:
        data = SubscriptionResponse.model_validate(s)
        data.course_title = s.course.title if s.course else "Unknown Course"
        res.append(data)
    return res


@router.post("/transactions/{txn_id}/pay", response_model=PaymentResponse)
async def pay_transaction(
    txn_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Pay an overdue or pending transaction."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Not authorized")

    payment = db.query(Payment).filter(Payment.id == txn_id, Payment.student_id == current_user.id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    if payment.status == PaymentStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Transaction already completed")

    # Simulate payment success
    payment.status = PaymentStatus.COMPLETED
    payment.paid_at = datetime.utcnow()
    
    # Update associated subscription if exists
    sub = db.query(Subscription).filter(
        Subscription.student_id == current_user.id,
        Subscription.course_id == payment.course_id
    ).first()
    
    if sub and sub.status == SubscriptionStatus.OVERDUE:
        sub.status = SubscriptionStatus.ACTIVE
        sub.current_period_end = datetime.utcnow() + timedelta(days=30)
        
    # Ensure enrollment exists and is active
    from app.models import Enrollment
    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.course_id == payment.course_id
    ).first()
    
    if not enrollment:
        enrollment = Enrollment(student_id=current_user.id, course_id=payment.course_id, is_active=True)
        db.add(enrollment)
    elif not enrollment.is_active:
        enrollment.is_active = True

    db.commit()
    db.refresh(payment)
    return payment


@router.post("/subscriptions/{sub_id}/cancel", response_model=MessageResponse)
async def cancel_subscription(
    sub_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel an active subscription."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    sub.status = SubscriptionStatus.CANCELLED
    db.commit()
    return {"message": "Subscription cancelled successfully", "success": True}


# ──────────────────────────────────────────────
# Admin Payment Routes
# ──────────────────────────────────────────────

@router.get("/admin/overview", response_model=PaymentOverview)
async def admin_payment_overview(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get admin payment overview metrics."""
    total_rev = db.query(func.sum(Payment.amount)).filter(Payment.status == PaymentStatus.COMPLETED).scalar() or 0.0
    
    # Calculate MRR (Monthly Recurring Revenue)
    active_subs = db.query(Subscription).filter(Subscription.status == SubscriptionStatus.ACTIVE).all()
    mrr = 0.0
    for s in active_subs:
        if s.course and s.course.monthly_price:
            mrr += s.course.monthly_price

    overdue_bal = db.query(func.sum(Payment.amount)).filter(Payment.status == PaymentStatus.OVERDUE).scalar() or 0.0
    
    return PaymentOverview(
        total_revenue=total_rev,
        monthly_recurring=mrr,
        overdue_balance=overdue_bal,
        active_subscriptions=len(active_subs)
    )


@router.get("/admin/transactions", response_model=List[PaymentResponse])
async def admin_transactions(
    status_filter: str = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all transactions for admin."""
    query = db.query(Payment)
    if status_filter:
        try:
            status_enum = PaymentStatus(status_filter)
            query = query.filter(Payment.status == status_enum)
        except ValueError:
            pass
            
    payments = query.order_by(Payment.created_at.desc()).all()
    
    res = []
    for p in payments:
        data = PaymentResponse.model_validate(p)
        data.course_title = p.course.title if p.course else "Unknown"
        res.append(data)
    return res


@router.post("/admin/send-reminder/{payment_id}", response_model=MessageResponse)
async def admin_send_reminder(
    payment_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Send a late payment reminder notification to student."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
        
    student = payment.student
    course = payment.course
    
    notif = Notification(
        user_id=student.id,
        type=NotificationType.REMINDER,
        title="Payment Overdue",
        message=f"Your payment of ${payment.amount} for {course.title} is overdue. Please settle it as soon as possible.",
        is_read=False,
    )
    db.add(notif)
    db.commit()
    
    return {"message": f"Reminder sent to {student.full_name}", "success": True}


@router.patch("/admin/courses/{course_id}/pricing", response_model=MessageResponse)
async def admin_update_pricing(
    course_id: int,
    is_paid_course: bool,
    monthly_price: float = None,
    full_price: float = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Admin endpoint to set course pricing."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    course.is_paid_course = is_paid_course
    course.monthly_price = monthly_price
    course.full_price = full_price
    db.commit()
    
    return {"message": "Course pricing updated successfully", "success": True}
