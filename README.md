# Lumora LMS: Advanced Learning Management and Assessment Intelligence Platform

Lumora is a full-stack Learning Management System and Assessment Intelligence Engine engineered for standardized national curriculum delivery, multi-format examination authoring, automated criterion-referenced grading, and psychometric learning analytics.

The platform is designed to support the Sri Lankan G.C.E. Advanced Level (A/L) curriculum with rigorous item generation, grounded retrieval-augmented generation (RAG) tutoring, and multi-dimensional student telemetry.

---

## 1. System Overview and Core Capabilities

### Multi-Paper Examination Authoring Studio
* **Paper I Multiple Choice Questions (MCQ):** Generates and balances 50-item question papers across seven certified national taxonomy templates (Direct Recall, Five-Statement Truth Evaluation, Profile Matrix Matching, Multi-Variable Combination Grids, Sequential Diagnostic, Incomplete Calculation Stems, and Multiple-Response Grids).
* **Deterministic Distribution:** Implements Hamilton's largest-remainder algorithm to enforce exact, integer-balanced question distribution across syllabus units without rounding anomalies.
* **Paper II Part A (Structured Questions):** Supports hierarchical subpart trees with dedicated dotted-line response lengths and rubric keyword definitions.
* **Paper II Part B (Essay Questions):** Multi-criteria rubric engine generating 8 to 10 evaluation criteria per question with step-level mark allocations.

### SpeedGrader and Marking Studio
* **Split-Screen Marking Interface:** Real-time synchronized marking console displaying student answers side-by-side with official marking schemes and rubric checklists.
* **Hybrid Evaluation Hierarchy:** Four-tier automated pre-scoring combining deterministic exact matches, token overlap analysis, semantic cosine similarity, and structured rubric evaluation.
* **Teacher Moderation:** Provides teachers with point override controls, criterion check toggles, and formative feedback generation.

### Learning Intelligence and Psychometrics
* **Classical Test Theory (CTT):** Automated calculation of facility values (item difficulty index, p) and Kelly's 27% upper-lower discrimination index (d).
* **Distractor Efficiency Analysis:** Tracks option distribution frequencies to detect non-functional and misleading distractors.
* **Personal Student Mastery Radar:** Multi-vector mastery profiling across syllabus units to identify learning gaps and revision priorities.
* **Material Difficulty Heatmap:** Aggregates student confusion flags, video scrub drops, and reading telemetry to pinpoint pedagogical friction points.

### Retrieval-Augmented Generation (RAG) AI Tutor
* **Curriculum-Grounded Tutoring:** Uses semantic chunking and dense vector retrieval over uploaded syllabus textbooks and lesson materials to answer student inquiries with precise source citations.
* **Q&A Moderation Queue:** Allows educators to audit, edit, and approve AI-generated student explanations.

---

## 2. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Application** | Next.js 16 (React 19), TypeScript, Tailwind CSS, Lucide React, Axios |
| **Backend REST API** | FastAPI, Python 3.12, Pydantic v2, Uvicorn (ASGI) |
| **Database and ORM** | PostgreSQL (Relational Store), SQLAlchemy 2.0 ORM |
| **Vector Store and Search** | ChromaDB (Vector Embeddings, all-MiniLM-L6-v2) |
| **Artificial Intelligence** | Google Gemini 1.5 Pro / Flash APIs |
| **Document and Audio Processing** | PyMuPDF (PDF Parser), Tesseract OCR, Whisper Engine |
| **Testing and Quality Assurance** | Pytest, Pytest-Asyncio, HTTPX TestClient |

---

## 3. Project Directory Structure

```
lumora_LMS/
├── backend/
│   ├── app/
│   │   ├── api/                    # REST API route controllers
│   │   │   ├── assessment_analytics.py
│   │   │   ├── auth.py
│   │   │   ├── courses.py
│   │   │   ├── exams.py
│   │   │   ├── materials.py
│   │   │   ├── qa.py
│   │   │   └── ...
│   │   ├── services/               # Domain business logic and algorithms
│   │   │   ├── ai/                 # Gemini API integration and vector search
│   │   │   ├── analytics/          # Psychometrics, CTT, and mastery engines
│   │   │   ├── assessments/        # MCQ, Structured, Essay generation and grading
│   │   │   ├── curriculum/         # Scope slicing and syllabus mapping
│   │   │   └── materials/          # Document parsers and RAG retrieval
│   │   ├── auth.py                 # JWT authentication and RBAC
│   │   ├── database.py             # PostgreSQL session management
│   │   ├── models.py               # SQLAlchemy ORM database models
│   │   └── schemas.py              # Pydantic request and response schemas
│   ├── tests/                      # Automated test suite (156 tests)
│   ├── main.py                     # FastAPI application entrypoint
│   ├── requirements.txt            # Python dependencies
│   └── seed.py                     # Baseline database seeder
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages
│   │   │   ├── dashboard/teacher/  # Teacher workstations and analytics
│   │   │   ├── dashboard/student/  # Student examination and learning console
│   │   │   └── login/              # Role-aware authentication portal
│   │   ├── components/             # Reusable UI component architecture
│   │   ├── contexts/               # React session and authentication context
│   │   └── lib/                    # API client and scientific notation utilities
│   ├── package.json                # Node.js dependencies
│   └── tsconfig.json               # TypeScript configuration
├── lumora_database_dump.sql        # Complete PostgreSQL database backup
├── docker-compose.yml              # Container orchestration configuration
├── start_lumora.bat                # Unified application launcher
└── README.md                       # System documentation
```

---

## 4. Installation and Setup

### Prerequisites
* Python 3.11+ or 3.12
* Node.js 18+ and npm 9+
* PostgreSQL 15+ (Running on `localhost:5432`)

### 1. Database Initialization
Create a PostgreSQL database named `fdp_db` and restore the included SQL backup:

```bash
# Using PostgreSQL CLI
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE fdp_db;"
psql -h localhost -p 5432 -U postgres -d fdp_db -f lumora_database_dump.sql
```

### 2. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate      # On Windows
# source venv/bin/activate   # On Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Ensure backend/.env contains your PostgreSQL credentials and Gemini API Key:
# DATABASE_URL=postgresql+pg8000://postgres:password@localhost:5432/fdp_db
# GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Frontend Setup
```bash
cd frontend

# Install Node dependencies
npm install

# Start frontend development server
npm run dev
```

### 4. Unified Launch (Windows)
To start both backend and frontend servers simultaneously:
```cmd
start_lumora.bat
```

* **Frontend Client:** `http://localhost:3000`
* **Backend API Docs (Swagger UI):** `http://127.0.0.1:8000/docs`

---

## 5. Demonstration User Credentials

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Lead Teacher** | Dr. Amara Perera | `amara@fdp.com` | `password123` |
| **Student** | Aseni Pamadi (Student 1) | `student1@fdp.com` | `password123` |
| **Student** | Janani Kavindi (Student 2) | `student2@fdp.com` | `password123` |
| **Student** | Dulith Malika (Student 3) | `student3@fdp.com` | `password123` |
| **Administrator** | System Administrator | `admin@fdp.com` | `admin123` |

---

## 6. Automated Testing and Verification

The test suite contains 156 unit and integration test assertions covering safe psychometric normalization, discrimination indexes, hierarchical structured traversal, RAG context isolation, and teacher authorization policies.

To execute the test suite:
```bash
cd backend
.\venv\Scripts\activate
pytest tests/ -q -W ignore
```

**Expected Result:**
```
156 passed in ~24s (100% pass rate)
```

The test framework includes an automated session teardown fixture (`backend/tests/conftest.py`) ensuring zero test artifacts or mock records persist in the production database.
