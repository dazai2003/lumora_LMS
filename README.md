# 🎓 Lumora LMS - Learning & Assessment Management System

Lumora LMS is a modern, full-stack Learning Management System designed to empower teachers, engage students, and streamline administrative workflows. It features interactive course materials, automated & manual quiz building, AI-powered content analysis, and student analytics.

---

## 🌟 Key Features

### 👨‍🎓 Student Portal
- **Interactive Material Viewer**: PDF, Video, Image, and Markdown reader with collapsible sidebars.
- **Distraction-Free Mode**: Toggleable tools panel for focused reading and video viewing.
- **Personalized Notes & Flags**: Contextual note-taking and content flagging per material.
- **Automated Video Transcripts**: AI-extracted transcripts for video lectures.
- **Quiz System**: Interactive quiz attempts with time-limit countdowns, feedback, and performance tracking.

### 👩‍🏫 Teacher Portal
- **Course & Lesson Management**: Rich content authoring with attached materials.
- **Question Bank**: Centralized bank of questions with cognitive levels, difficulty badges, and performance metrics.
- **Flexible Quiz Builder**: Create quizzes from scratch or import questions directly from the Question Bank.
- **Organized Grading Queue**: Grouped attempts by quiz/lesson with course filtering for quick evaluation.
- **Student Analytics**: In-depth analytics tracking student progress, accuracy, and engagement.

### 🛡️ Admin Portal
- **User Management**: Oversee Teachers, Students, and Administrators.
- **Enrollments & Billing**: Oversight of course access and payment records.
- **System Insights**: Platform-wide analytics and system health metrics.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (Turbopack), React 19, TypeScript, Vanilla CSS Design System |
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy, Pydantic |
| **Database** | PostgreSQL |
| **AI Integration** | Groq API (Speech-to-Text / Whisper, Quiz Generation & Summarization) |
| **Containerization** | Docker, Docker Compose |

---

## 🚀 Quick Start Guide

### Option 1: Docker Compose (Recommended)

Run the complete stack (PostgreSQL + FastAPI Backend + Next.js Frontend) with a single command:

```bash
docker-compose up --build
```

- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **Backend API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Option 2: Manual Setup

#### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **PostgreSQL 16** (Database name: `fdp_db`)

#### 1. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create & activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Seed initial database records (Optional)
python seed.py

# Start FastAPI server
python -m uvicorn main:app --reload
```
*Backend API runs at: `http://localhost:8000`*

#### 2. Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```
*Frontend UI runs at: `http://localhost:3000`*

---

## 🔑 Test Accounts

You can log in immediately using the pre-seeded accounts:

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@fdp.com` | `admin123` |
| **Teacher** | `teacher@fdp.com` | `teacher123` |
| **Student** | `student1@fdp.com` | `student123` |
| **Student** | `student2@fdp.com` | `student123` |

*New student accounts can also be registered at `http://localhost:3000/register`.*

---

## 📂 Project Structure

```
Lumora_LMS/
├── backend/                # FastAPI Application
│   ├── app/
│   │   ├── api/            # API Route Handlers (courses, quizzes, materials, etc.)
│   │   ├── services/       # AI & Processing services (Groq, OCR, Analytics)
│   │   ├── models.py       # SQLAlchemy Database Models
│   │   └── schemas.py      # Pydantic Schemas
│   ├── main.py             # FastAPI App Entrypoint
│   └── seed.py             # Initial database seeder
├── frontend/               # Next.js Application
│   ├── src/
│   │   ├── app/            # Next.js App Router (Dashboard routes for Admin, Teacher, Student)
│   │   ├── components/     # UI Components, Charts, Viewers
│   │   └── lib/            # API Client & Helpers
└── Docker-compose.yml      # Orchestration config
```

---

## 📄 License
This project is developed for educational and institutional research purposes.
