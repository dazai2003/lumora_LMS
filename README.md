# Lumora LMS - Learning & Assessment Management System

Lumora LMS is an enterprise-grade, full-stack Learning Management System engineered to streamline institutional instruction, automate assessment workflows, and deliver a zero-scroll, high-impact learning experience for students, teachers, and administrators.

---

## Executive Summary & Key Systems

### Student Command Portal
- **Active Learning Hub**: A 360-degree, viewport-locked (`100vh`) course management interface with in-card carousel navigation controls, live progress tracking, and unified deliverable status.
- **Daily Learning Briefing**: Automated daily digest modal providing priority task summaries, urgent deadlines, and unread notifications upon first daily login.
- **Interactive Material Viewer**: Unified viewer supporting PDF documents, video lectures with AI speech-to-text transcripts, high-resolution imagery, and Markdown content.
- **Distraction-Free Workspace**: Toggleable sidebars and distraction-free viewing modes for deep study sessions.

### Educator & Grading Workspace
- **SpeedGrader Workspace**: High-throughput assessment engine for evaluating written coursework with inline feedback, score breakdowns, and rubric criteria.
- **WYSIWYG Rich Text Editor**: Full-featured content authoring tool for assignments, lesson materials, and announcements.
- **Question Bank & Versioning**: Centralized repository of assessment questions tagged by cognitive level, difficulty, and performance analytics.
- **Flexible Quiz Construction**: Manual and automated quiz generation with custom time limits, instant scoring, and retake controls.
- **Student Performance Analytics**: Real-time course engagement charts, quiz average distributions, and progress heatmaps.

### Administrative Oversight
- **User & Role Management**: Administrative controls for student, teacher, and administrator accounts.
- **Course Enrollment & Access Control**: Centralized course provisioning and student enrollment tracking.
- **Audit Logging & Job Tracking**: System-wide action audit trails and asynchronous background job management.

---

## Technical Architecture

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 16 (App Router with Turbopack), React 19, TypeScript |
| **Styling & UI** | Modular Vanilla CSS Design System, Custom SVG Icon Architecture |
| **Backend Framework** | Python 3.11+, FastAPI (Asynchronous REST API) |
| **Database & ORM** | PostgreSQL 16, SQLAlchemy ORM, Pydantic Schemas |
| **AI & Vector Engine** | Groq API (Whisper Transcriptions & Summarization), ChromaDB Vector Store |
| **Containerization** | Docker, Docker Compose |

---

## Deployment & Quick Start Guide

### Option 1: Docker Container Orchestration (Recommended)

To build and run the full stack (PostgreSQL database, FastAPI backend, and Next.js frontend) with Docker Compose:

```bash
docker-compose up --build
```

- **Application Web Interface**: `http://localhost:3000`
- **Backend API Documentation (Swagger UI)**: `http://localhost:8000/docs`

---

### Option 2: Local Environment Setup

#### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **PostgreSQL 16** (Database name: `fdp_db`)

#### 1. Backend Service Configuration
```bash
# Navigate to backend directory
cd backend

# Initialize and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .\.venv\Scripts\activate

# Install Python packages
pip install -r requirements.txt

# Run initial database migrations and seeding
python seed.py

# Launch FastAPI development server
python -m uvicorn main:app --reload
```
*Backend API service endpoint: `http://localhost:8000`*

#### 2. Frontend Application Configuration
```bash
# Navigate to frontend directory
cd frontend

# Install Node modules
npm install

# Launch Next.js development server
npm run dev
```
*Frontend application endpoint: `http://localhost:3000`*

---

## Initial Verification Credentials

Pre-configured accounts for environment testing:

| Role | Username / Email | Password | Access Level |
|---|---|---|---|
| **Administrator** | `admin@fdp.com` | `admin123` | Full System Administration |
| **Educator / Teacher** | `teacher@fdp.com` | `teacher123` | Course & Grading Workspace |
| **Student** | `student1@fdp.com` | `student123` | Active Learning Hub |
| **Student** | `student2@fdp.com` | `student123` | Active Learning Hub |

*Public student self-registration is available at `http://localhost:3000/register`.*

---

## Directory Hierarchy

```
Lumora_LMS/
├── backend/                # FastAPI Application & Services
│   ├── app/
│   │   ├── api/            # REST API Endpoint Controllers
│   │   ├── services/       # AI, RAG, SpeedGrader & Analytics Engines
│   │   ├── models.py       # SQLAlchemy ORM Database Schemas
│   │   └── schemas.py      # Pydantic Request/Response Models
│   ├── main.py             # FastAPI App Entrypoint
│   └── seed.py             # Initial Seeder Script
├── frontend/               # Next.js Application
│   ├── src/
│   │   ├── app/            # Next.js App Router Pages (Student, Teacher, Admin)
│   │   ├── components/     # Reusable Design System & Viewer Components
│   │   └── lib/            # Centralized API Client & Data Fetching
└── docker-compose.yml      # Container Orchestration Specification
```

---

## License & Compliance
This software repository is developed for institutional learning research and academic demonstration purposes.
