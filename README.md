# Lumora LMS — AI-Powered Learning Analytics & Assessment Platform

Lumora is an AI-driven Learning Management System and Assessment Engine designed for high-fidelity curriculum delivery, automated national-standard exam authoring, real-time RAG-powered tutoring, and multi-dimensional student learning analytics.

---

## 🚀 Quick Start (One-Click Launch)

To start both the Backend (FastAPI on `http://127.0.0.1:8000`) and Frontend (Next.js on `http://localhost:3000`):

```bat
start_lumora.bat
```

Or start each service individually:

### 1. Backend Service
```powershell
cd backend
.\venv\Scripts\activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend Application
```powershell
cd frontend
npm run dev
```

---

## 🔑 Login Credentials

For all verified user accounts and roles, see [`LOGIN_CREDENTIALS.md`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/LOGIN_CREDENTIALS.md).

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Lead Teacher** | Dr. Amara Perera | `amara@fdp.com` | `password123` |
| **Student** | Aseni Pamadi (Student 1) | `student1@fdp.com` | `password123` |
| **Student** | Janani Kavindi (Student 2) | `student2@fdp.com` | `password123` |

---

## 🏗️ System Architecture

* **Frontend**: Next.js 16 (Turbopack, TypeScript, TailwindCSS, Rich UI Component System)
* **Backend**: FastAPI, SQLAlchemy ORM, PostgreSQL database (`pg8000`), Pydantic validation
* **AI & Knowledge Engine**: Google Gemini API, PyMuPDF digital parser, ChromaDB local vector store (`all-MiniLM-L6-v2`)
* **Learning Hierarchy**: `Course` $\rightarrow$ `Unit` $\rightarrow$ `Lesson` $\rightarrow$ `Material` (Lesson-scoped RAG retrieval)
* **Assessment Engine**: Paper I (MCQ with 6 official Sri Lankan A/L question templates), Paper II Part A (Structured), Paper II Part B (Essay), SpeedGrader Studio

---

## 📚 Technical Documentation Archive

Complete architectural specifications, API references, data models, workflow maps, and audit reports are maintained in the [`technical-documentation/`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/technical-documentation/) directory.
