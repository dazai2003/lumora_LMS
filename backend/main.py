"""
AI-Powered Student Engagement and Learning Analytics Platform
FastAPI Backend Application
"""
import sys
import os

# Ensure the backend directory is on the Python path so 'app' can be imported
# regardless of where uvicorn is launched from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from app.api import auth, users, courses, lessons, materials, quizzes, analytics, qa, notifications, messages, payments, questions
from app.database import engine, Base

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Create all database tables
Base.metadata.create_all(bind=engine)

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
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(courses.router, prefix="/api/courses", tags=["Courses"])
app.include_router(lessons.router, prefix="/api/lessons", tags=["Lessons"])
app.include_router(materials.router, prefix="/api/materials", tags=["Materials"])
app.include_router(quizzes.router, prefix="/api/quizzes", tags=["Quizzes"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(qa.router, prefix="/api/qa", tags=["Q&A"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Lumora Learning Analytics Platform API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
