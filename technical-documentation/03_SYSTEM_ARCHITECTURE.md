# 03. System Architecture

## 1. Architectural Overview

Lumora LMS adopts a modern, decoupled **Multi-Tier Layered Architecture** emphasizing high modularity, strict role separation, data isolation, and low coupling between the presentation layer, business services, psychometric analytics pipeline, and external AI providers.

```mermaid
graph TB
    subgraph Client Tier [Presentation Layer]
        Browser[Web Browser / Client Device]
        NextServer[Next.js 16 App Router SSR/SSG Tier]
        ReactClient[React 19 Interactive Client Components]
        Browser --> NextServer
        NextServer --> ReactClient
    end

    subgraph Gateway Tier [API & Security Layer]
        CORS[CORS Middleware: Port 3000 & Hostnames]
        StaticMount[Static Files Server: /uploads]
        APIRouter[FastAPI Root Router: 29 Endpoints]
        AuthGuard[JWT Auth Dependency: get_current_user]
        RoleGuard[RBAC Guard: require_teacher / require_admin]
        Validation[Pydantic V2 Serialization & Validation]
        
        ReactClient -->|HTTP REST / JSON| CORS
        CORS --> APIRouter
        APIRouter --> AuthGuard
        AuthGuard --> RoleGuard
        RoleGuard --> Validation
    end

    subgraph Service Tier [Core Application & Intelligence Services]
        CurriculumSvc[Curriculum & Material Service]
        ExamEngineSvc[A/L Exam Engine & Question Bank Service]
        AIGenSvc[Gemini Question & Blueprint Generator]
        MarkingSvc[SpeedGrader & Rubric Scoring Engine]
        RAGSvc[RAG Vector Retriever & Grounding Service]
        AnalyticsSvc[18-Module Psychometric Analytics Engine]
        ReportingSvc[CSV Streaming & PDF Report Service]
        
        Validation --> CurriculumSvc
        Validation --> ExamEngineSvc
        Validation --> MarkingSvc
        Validation --> RAGSvc
        Validation --> AnalyticsSvc
        Validation --> ReportingSvc
        ExamEngineSvc --> AIGenSvc
        MarkingSvc --> AIGenSvc
    end

    subgraph AI & Vector Tier [External AI & Embeddings]
        Gemini[Google Gemini 2.0 Flash / Pro LLM]
        Groq[Groq LLaMA-3.3 Fallback Inference]
        SentenceTransformers[sentence-transformers: all-MiniLM-L6-v2]
        ChromaEngine[ChromaDB Local Vector Engine]
        
        AIGenSvc --> Gemini
        AIGenSvc --> Groq
        RAGSvc --> SentenceTransformers
        SentenceTransformers --> ChromaEngine
        RAGSvc --> Gemini
    end

    subgraph Data Tier [Persistence Layer]
        PostgreSQL[(PostgreSQL Relational DB: fdp_db)]
        ChromaStore[(ChromaDB Vector Disk: chroma_data/)]
        FileStore[Local File System: uploads/]
        
        CurriculumSvc --> PostgreSQL
        ExamEngineSvc --> PostgreSQL
        MarkingSvc --> PostgreSQL
        AnalyticsSvc --> PostgreSQL
        ChromaEngine --> ChromaStore
        CurriculumSvc --> FileStore
        StaticMount --> FileStore
    end
```

---

## 2. Layer Responsibilities & Interactions

### 2.1. Presentation Layer (Frontend)
- **Framework**: Next.js 16 (App Router) with React 19.
- **Responsibilities**:
  - Route navigation and layout hierarchy (`/dashboard/student/*`, `/dashboard/teacher/*`, `/login`, `/register`).
  - Client-side state orchestration using React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`).
  - Real-time media position tracking (Video timestamp throttling, PDF page hash navigation).
  - Assessment workstations (50-item MCQ grid, Structured subparts, Rich-text essay workspace, Diagram lightbox).
  - Interactive data visualization (Chart.js radar, bar, doughnut, and line charts).
- **Communication**: Interacts with the backend exclusively via `frontend/src/lib/api.ts`, which sends standard `fetch` HTTP requests with `Authorization: Bearer <JWT_TOKEN>` headers.

### 2.2. API Gateway & Security Layer (Backend)
- **Framework**: FastAPI (0.115.12) running under Uvicorn ASGI.
- **Responsibilities**:
  - Global CORS handling allowing frontend origins (`http://localhost:3000`, `http://127.0.0.1:3000`).
  - Route authentication via `get_current_user` in [`backend/app/auth.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/auth.py).
  - RBAC verification ensuring students cannot access teacher authoring endpoints or marking studio.
  - Pydantic V2 schema validation preventing malformed or unverified payloads from executing business logic.

### 2.3. Service Tier (Business Logic)
- **Modular Services**:
  - `al_generator_service.py` & `al_mcq_generator.py`: Generates template-accurate questions conforming to national curriculum constraints.
  - `al_marking_service.py`: Computes preliminary AI scores and checklist matches for unstructured student answers.
  - `al_rag_retriever.py` & `vector.py`: Extracts top-$k$ relevant chunks from ChromaDB for student inquiries.
  - `analytics/`: 18 specialized services computing Item Difficulty Index $p$, Item Discrimination $d$, Distractor efficiency, Bloom's cognitive taxonomy, and student risk scores.
  - `reporting.py`: Assembles multi-page printable student/course dossiers and streaming CSV data tables.

### 2.4. Persistence Layer (Data Tier)
- **Relational Storage**: PostgreSQL (database `fdp_db`) managing 30+ tables with ACID guarantees, foreign key cascades, and unique constraints.
- **Vector Storage**: Disk-persisted ChromaDB database (`backend/chroma_data/`) storing 384-dimensional text embeddings of course materials.
- **File System**: `uploads/` folder housing original PDF past papers, lecture videos, diagram attachments, and student essay images.

---

## 3. End-to-End Request Lifecycle & Workflows

### 3.1. Student Examination Execution & Submission Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student Client
    participant Frontend as Next.js Exam Workstation
    participant API as FastAPI Backend (al_exams.py)
    participant DB as PostgreSQL Database
    participant AI as Gemini AI Marking Engine

    Student->>Frontend: Opens Exam / Clicks "Start Examination Now"
    Frontend->>API: POST /api/al-exams/{id}/start (Bearer JWT)
    API->>DB: Query ALExam & ALQuestions (Snapshots)
    API->>DB: Insert ALStudentSubmission (status='in_progress')
    DB-->>API: Return submission record (ID=N)
    API-->>Frontend: Return Exam Questions, Structure & Submission ID
    
    loop Answering & Autosaving
        Student->>Frontend: Selects Option / Types Subpart / Writes Essay
        Frontend->>API: PUT /api/al-exams/submissions/{sub_id}/answers (Autosave payload)
        API->>DB: Upsert ALStudentAnswer (selected_option, subparts_json, essay_text)
        DB-->>API: Success
        API-->>Frontend: 200 OK (Saved state confirmed)
    end

    Student->>Frontend: Clicks "Submit Examination Paper"
    Frontend->>API: POST /api/al-exams/submissions/{sub_id}/submit
    API->>DB: Update ALStudentSubmission (status='submitted', submitted_at=now)
    
    opt Automated Machine / AI Pre-Grading Trigger
        API->>API: Deterministic MCQ Evaluation (auto_score = 1.0 if match, else 0.0)
        API->>AI: Async Semantic Evaluation (Structured / Essay against Rubric)
        AI-->>API: Return ai_score + ai_checklist_results_json
        API->>DB: Update ALStudentAnswer (auto_score, ai_score)
        API->>DB: Update ALStudentSubmission (status='ai_graded', raw_score, percentage)
    end

    API-->>Frontend: 200 OK (Submission Finalized)
    Frontend->>Student: Displays Submission Receipt / Score Preview
```

---

### 3.2. RAG-Grounded Ask AI Tutor Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant UI as Ask AI UI Component
    participant API as FastAPI (qa.py)
    participant Vector as ChromaDB & sentence-transformers
    participant LLM as Google Gemini 2.0 Flash
    participant DB as PostgreSQL

    Student->>UI: Types Question: "Explain light-dependent reaction"
    UI->>API: POST /api/qa/ask (course_id, question_text)
    API->>Vector: Generate Embedding (all-MiniLM-L6-v2) & Query Top-5 Chunks
    Vector-->>API: Return Chunks with distance & metadata (Title, Lesson, Page)
    
    API->>API: Filter private/unauthorized vault materials
    API->>LLM: Dispatch Grounded Prompt with Context Chunks + Anti-Hallucination Constraints
    LLM-->>API: Return Grounded Response + Source References + Confidence Score
    
    API->>DB: Insert StudentQuestion (text, asked_at)
    API->>DB: Insert AIResponse (response_text, context_sources, confidence_score)
    DB-->>API: Saved
    API-->>UI: Return AI Tutor Answer with Citation Chips
    UI->>Student: Displays Formatted Answer & Source Material Links
```
