"""
AI-Powered Student Engagement and Learning Analytics Platform
FastAPI Backend Application (Updated DB Schema)
"""
import sys
import os

# Ensure the backend directory is on the Python path so 'app' can be imported
# regardless of where uvicorn is launched from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Fix passlib bcrypt 4.x compatibility
try:
    import bcrypt
    if not hasattr(bcrypt, "__about__"):
        bcrypt.__about__ = type("about", (), {"__version__": getattr(bcrypt, "__version__", "4.0.0")})()
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from app.api import (
    auth, users, courses, units, lessons, materials, analytics, qa,
    notifications, messages, payments, questions, jobs, audit, pools,
    rubrics, recommendations, students, materials_ai, exams, past_papers,
    exam_authoring, exam_curriculum, exam_mcq, assessment_analytics
)

from sqlalchemy import text
from app.database import engine, Base

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Create all database tables
Base.metadata.create_all(bind=engine)

# Auto-migrate direct_messages course_id column to nullable
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE direct_messages ALTER COLUMN course_id DROP NOT NULL;"))
        conn.commit()
except Exception:
    pass

app = FastAPI(
    title="Lumora - Learning Analytics Platform",
    description="AI-Powered Student Engagement and Learning Analytics Platform for Large-Scale Online Education",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", "http://localhost:3000")
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory static files
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(courses.router, prefix="/api/courses", tags=["Courses"])
app.include_router(units.router, prefix="/api/units", tags=["Units"])
app.include_router(lessons.router, prefix="/api/lessons", tags=["Lessons"])
app.include_router(materials.router, prefix="/api/materials", tags=["Materials"])
app.include_router(materials_ai.router, prefix="/api/materials", tags=["Material AI Insights"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(qa.router, prefix="/api/qa", tags=["Q&A"])
app.include_router(recommendations.router, prefix="/api/recommendations", tags=["Recommendations"])
app.include_router(students.router, prefix="/api/students", tags=["Student Profile"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(pools.router, prefix="/api/pools", tags=["Pools"])
app.include_router(rubrics.router, prefix="/api/rubrics", tags=["Rubrics"])
app.include_router(exams.router, prefix="/api/al-exams", tags=["A/L Exam Engine"])
app.include_router(past_papers.router, prefix="/api/al-past-papers", tags=["A/L Past Papers"])
app.include_router(exam_authoring.router, prefix="/api/al-authoring", tags=["A/L Authoring"])
app.include_router(exam_curriculum.router, prefix="/api/al-curriculum", tags=["A/L Curriculum & Scope Slicer"])
app.include_router(exam_mcq.router, prefix="/api/al-mcq", tags=["A/L Paper I MCQ Engine"])
app.include_router(assessment_analytics.router, prefix="/api/analytics", tags=["A/L Assessment Analytics Foundation"])


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Lumora Learning Analytics Platform API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/api", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "message": "Lumora API server operational"}
