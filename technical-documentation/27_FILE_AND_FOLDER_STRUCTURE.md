# 27. File and Folder Structure

## 1. Complete Repository Map

```text
lumora_LMS/
├── docker-compose.yml                      # Container orchestration for FastAPI, PostgreSQL, and Next.js
├── README.md                               # Project readme & repository overview
├── pyrightconfig.json                      # Python language server configuration
├── start_lumora.bat                        # Windows launch batch script for backend & frontend
├── uploads/                                # Static media uploads (PDFs, Videos, Diagrams)
│
├── backend/                                # FastAPI Python Backend
│   ├── Dockerfile                          # Backend containerization Dockerfile
│   ├── requirements.txt                    # Python dependencies & libraries
│   ├── main.py                             # Root FastAPI entrypoint & 29 router registrations
│   ├── .env.example                        # Example environment configuration
│   ├── app/
│   │   ├── auth.py                         # JWT creation, decoding, and RBAC dependencies
│   │   ├── database.py                     # SQLAlchemy database engine & init_db_schema()
│   │   ├── models.py                       # 1,809-line master SQLAlchemy ORM entity definitions
│   │   ├── schemas.py                      # Master Pydantic schemas for API serialization
│   │   ├── api/                            # 29 Modular API routers
│   │   │   ├── auth.py, users.py, courses.py, units.py, lessons.py, materials.py
│   │   │   ├── al_exams.py, al_authoring.py, al_mcq.py, al_curriculum.py, al_analytics.py
│   │   │   ├── analytics.py, qa.py, students.py, questions.py, assignments.py, quizzes.py, ...
│   │   ├── services/                       # Business logic, AI generators & parsers
│   │   │   ├── gemini_service.py, al_generator_service.py, al_marking_service.py
│   │   │   ├── al_mcq_generator.py, al_structured_generator.py, al_essay_generator.py
│   │   │   ├── al_rag_retriever.py, vector.py, pdf_parser.py, ocr.py, audio.py
│   │   │   └── analytics/                  # 18-module analytics & psychometrics pipeline
│   │   │       ├── data_contracts.py, normalization.py, mcq_analytics.py, discrimination.py
│   │   │       ├── structured_analytics.py, essay_analytics.py, learning_intelligence.py
│   │   │       ├── student_mastery_analytics.py, material_analytics.py, reporting.py, ...
│   ├── tests/                              # 41 Automated pytest test suites
│   ├── chroma_data/                        # ChromaDB persistent vector database directory
│   └── (Validation scripts: run_phase_v2..v5_6.py)
│
├── frontend/                               # Next.js 16 App Router Frontend
│   ├── package.json                        # Node dependencies (Next.js 16, React 19, Chart.js 4)
│   ├── tsconfig.json                       # TypeScript compiler configuration
│   ├── src/
│   │   ├── app/                            # 35 Next.js App Router routes & pages
│   │   │   ├── layout.tsx, globals.css, not-found.tsx, page.tsx
│   │   │   ├── login/page.tsx, register/page.tsx
│   │   │   ├── dashboard/student/          # Student portal & examination engine routes
│   │   │   └── dashboard/teacher/          # Teacher Command Center, Marking Studio, 7-tab Analytics
│   │   ├── components/                     # Reusable React components
│   │   │   ├── MaterialViewer.tsx, Modal.tsx, SvgIcon.tsx, Skeleton.tsx, ConfirmDialog.tsx
│   │   │   ├── al-exams/                   # A/L exam renderers, symbol picker, combination grid
│   │   │   └── charts/                     # Chart.js visualizers (BarChart, LineChart, MaterialHeatmap)
│   │   └── lib/                            # Typed API client (api.ts) & utility helpers
│
└── technical-documentation/                # Master Read-Only Forensic Documentation Suite
```

---

## 2. File Classifications & Forensic Inventory

### 2.1. Critical Foundational Files
- `backend/app/models.py`: Central data schema for the entire application.
- `backend/app/database.py`: Session engine connecting to PostgreSQL.
- `backend/main.py`: Gateway router dispatching 29 API routes.
- `frontend/src/lib/api.ts`: 119KB centralized strongly-typed API client.
- `frontend/src/app/globals.css`: Master CSS design system tokens.

### 2.2. Validation & Phase Pipeline Files
- `backend/run_phase_v2_assessment_execution.py`: Generates the 30-submission assessment dataset across 10 candidates.
- `backend/populate_phase_v5_3_learning_activity.py`: Populates 54 learning material telemetry records.
- `backend/run_phase_v5_6_validation.py`: Complete acceptance test suite for the analytics workstation.

### 2.3. Suspicious / Legacy / Potential Cleanup Candidates (DO NOT DELETE — Documented for Record)
1. **`backend/lumor2.db`**: A 700KB SQLite database file in the backend root. The active system connects to PostgreSQL (`fdp_db`). This file appears to be a legacy standalone SQLite database from early prototyping.
2. **`backend/fix_materials_nullable.py`**: Ad-hoc schema patch script for nullable material columns; rendered obsolete by `database.py:init_db_schema()`.
3. **`backend/repair_enums.py`**: Ad-hoc script for PostgreSQL enum repairs; superseded by `init_db_schema()`.
4. **`backend/check_postgres.py`**: Standalone diagnostic script for testing pg8000 connections.
5. **`backend/scratch_inspect_v2_env.py`** & **`backend/scratch/`**: Temporary environment inspection scratch scripts.
