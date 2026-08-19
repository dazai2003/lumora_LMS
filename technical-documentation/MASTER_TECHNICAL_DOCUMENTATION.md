# LUMORA LEARNING MANAGEMENT SYSTEM & PSYCHOMETRIC ASSESSMENT PLATFORM
# COMPLETE MASTER TECHNICAL SPECIFICATION & SYSTEM ARCHITECTURE DOCUMENTATION

> **Academic Final Project Technical Specification**  
> **System Version**: 2.6.0-ENTERPRISE  
> **Target Standard**: Sri Lankan G.C.E. Advanced Level Examination Framework  
> **Backend Engine**: FastAPI + SQLAlchemy 2.0 + PostgreSQL + ChromaDB  
> **Frontend Engine**: Next.js 16 (App Router / Turbopack) + React 19 + TypeScript  
> **AI Architecture**: Google Gemini LLMs (`gemini-2.0-flash`, `gemini-1.5-pro`) + Local Vector Retrieval (`all-MiniLM-L6-v2`)  
> **Validation Status**: 156 Automated Pytest Suites Passing (100% Pass Rate) • Next.js 35/35 Routes Validated

---

## Master Table of Contents

- [00. System Overview: Lumora Learning Analytics Platform](#00-system-overview)
- [01. Project Scope and Objectives](#01-project-scope-and-objectives)
- [02. Technology Stack](#02-technology-stack)
- [03. System Architecture](#03-system-architecture)
- [04. Frontend Architecture](#04-frontend-architecture)
- [05. Backend Architecture](#05-backend-architecture)
- [06. Database Architecture](#06-database-architecture)
- [07. API Reference](#07-api-reference)
- [08. Authentication and Authorization](#08-authentication-and-authorization)
- [09. Course and Material System](#09-course-and-material-system)
- [10. Student Learning System](#10-student-learning-system)
- [11. Examination System: National A/L Assessment Architecture](#11-examination-system)
- [12. Exam Generation and Question Bank](#12-exam-generation-and-question-bank)
- [13. Student Exam Execution & Attempt Lifecycle](#13-student-exam-execution)
- [14. Grading and Marking Studio](#14-grading-and-marking-studio)
- [15. Analytics and Learning Intelligence Engine](#15-analytics-and-learning-intelligence)
- [16. Material Insights and Difficulty Flags](#16-material-insights-and-difficulty-flags)
- [17. Ask AI and Retrieval-Augmented Generation (RAG) System](#17-ask-ai-and-rag-system)
- [18. Q&A Moderation and Human-in-the-Loop AI Governance](#18-qa-moderation)
- [19. Student Analytics and Profile (Student Mastery Dossier)](#19-student-analytics-and-profile)
- [20. Teacher Analytics Workstation](#20-teacher-analytics)
- [21. Reporting and Exports](#21-reporting-and-exports)
- [22. Artificial Intelligence Integration](#22-ai-integration)
- [23. Data Flow and Workflows](#23-data-flow-and-workflows)
- [24. Security and Data Isolation](#24-security-and-data-isolation)
- [25. Validation and Testing](#25-validation-and-testing)
- [26. UI/UX Structure and Design System](#26-ui-ux-structure)
- [27. File and Folder Structure](#27-file-and-folder-structure)
- [28. Configuration and Environment](#28-configuration-and-environment)
- [29. Known Limitations](#29-known-limitations)
- [30. Current System Inventory](#30-current-system-inventory)
- [31. Academic Report Evidence Map](#31-report-evidence-map)

---


<a id="00-system-overview"></a>

# 00. System Overview: Lumora Learning Analytics Platform

## 1. Executive Summary

**Lumora LMS** is an enterprise-grade, AI-integrated Learning Management System (LMS) and psychometric assessment platform specifically engineered to meet the demanding pedagogical and structural requirements of the **Sri Lankan General Certificate of Education (Advanced Level) examination standard** as well as large-scale university and secondary education environments.

Unlike conventional learning platforms that treat digital learning purely as video/file hosting or simple multiple-choice quizzes, Lumora introduces a multi-tiered architecture that unifies:
19. **National-Standard A/L Assessment Engine**: A high-fidelity examination pipeline modeling:
   - **Full Examination Paper (`full_paper` / `full_exam`)**: Unified multi-stage composite paper containing Paper I (MCQ) followed by a section breather transition and Paper II (Structured & Essay).
   - **Paper I (50-item 5-option MCQs across 7 specialized question templates)**.
   - **Paper II-A (4-question multi-tiered Structured subpart hierarchies with dotted-line student inputs)**.
   - **Paper II-B (3-essay analytical responses with fine-grained rubric criteria checklists)**.
10. **Retrieval-Augmented Generation (RAG) & AI Tutor**: A localized, course-vault-grounded AI assistant utilizing Google Gemini LLM architectures and ChromaDB vector embeddings (`all-MiniLM-L6-v2`) to answer student inquiries with citation-grounded references while isolating sensitive assessment materials.
11. **Human-in-the-Loop SpeedGrader & Marking Studio**: Real-time section tabs navigation (`All Sections`, `Paper I — MCQ`, `Paper II-A — Structured`, `Paper II-B — Essay`), AI pre-grading and semantic evaluation of complex written student scripts, per-subpart numerical overrides, custom teacher criteria, and instant score scaling.
12. **Student Lifecycle & Attempt Management**: Configurable attempt limits (`max_attempts`), stateful Exam Studio KPI cards (`Attempt Paper`, `Continue Paper` draft indicator, `Retake Exam`, `View Past Attempts`), and Past Attempts modal with deep linking to specific attempts via `?submissionId=...`.
13. **Multi-Domain Psychometric & Learning Intelligence Engine**: 18 specialized analytics services computing classical test theory metrics (Item Difficulty Index $p$, Item Discrimination Index $d$, non-functional distractor analysis), Bloom's taxonomy cognitive depth tracking, question format divergence detection, material difficulty hotspot aggregation, and multi-factor student academic risk modeling.

---

## 2. Target Users and Role-Based Capabilities

Lumora implements strict Role-Based Access Control (RBAC) across three principal user roles:

```mermaid
graph TD
    User([Authenticated User])
    User -->|Role = Student| StudentRole[Student Workspace]
    User -->|Role = Teacher| TeacherRole[Teacher Command Center]
    User -->|Role = Admin| AdminRole[Administrative Governance]

    subgraph Student Workspace
        StudentRole --> S1[Course & Lesson Learning]
        StudentRole --> S2[Exact Position Resume: Video/PDF]
        StudentRole --> S3[Difficulty Flagging & Notes]
        StudentRole --> S4[Ask AI Tutor & RAG Support]
        StudentRole --> S5[A/L Assessment Engine Workstation]
        StudentRole --> S6[Attempt History & Retake Management]
        StudentRole --> S7[Personal Mastery Dossier & Analytics]
    end

    subgraph Teacher Command Center
        TeacherRole --> T1[Curriculum & Material Authoring]
        TeacherRole --> T2[A/L Exam Designer & Blueprint Generator]
        TeacherRole --> T3[SpeedGrader & Verification Studio with Section Tabs]
        TeacherRole --> T4[7-Tab Analytics Workstation]
        TeacherRole --> T5[Content Hotspot & Flag Moderation]
        TeacherRole --> T6[Q&A Moderation & AI Corrections]
        TeacherRole --> T7[Multi-Format Academic Reporting]
    end

    subgraph Administrative Governance
        AdminRole --> A1[Global AI Hyperparameter Configuration]
        AdminRole --> A2[User Account & Role Management]
        AdminRole --> A3[System Audit & Background Job Tracking]
    end
```

### 2.1. Student Capabilities
- **Coursework & Learning Navigation**: Seamless progression through courses, syllabus units, and lessons with real-time completion fraction tracking (e.g. `2/3 Completed`).
- **Precision Media Resumption**: Automatic timestamp retention for video playback (restoring exact second) and PDF documents (loading specific page hash `#page=N` with top control bar).
- **In-Context Learning Assistance**: Creating difficulty flags at specific video timestamps or PDF pages, writing private material notes, and consulting the Ask AI Tutor.
- **Formal A/L Assessment Execution**: Taking timed, proctored single or full composite examinations with Section navigation, scientific symbol toolbars, combination grid selectors, structured answer boxes, rich text essay authoring, and diagram upload.
- **Attempt Lifecycle & Retakes**: Resuming active in-progress attempts seamlessly, initiating retakes when permitted by paper policy, and reviewing past attempt scores, grades, and teacher feedback via the Past Attempts history dialog.
- **Student Performance Mastery**: Reviewing verified marks, A/L standardized letter grades (`A`, `B`, `C`, `S`, `F`), detailed teacher feedback notes, and unit mastery breakdowns.

### 2.2. Teacher Capabilities
- **Curriculum Architecture**: Constructing courses, unit hierarchies, lessons, and uploading materials (Videos, PDFs, Notes, Diagrams) categorized as general, past paper, resource book, or private RAG vault with strict lesson-level isolation.
- **Exam Authoring & Blueprint Assembly**: Manual drafting or AI-assisted generation of full composite papers (Paper I + Paper II), standalone 50-item MCQ papers, structured questions with academic parent-child labels (`(a)`, `(i)`), and essay prompts with rubric checklists.
- **Marking Studio & SpeedGrader**: Reviewing student attempts across section tabs with side-by-side candidate scripts and rubric checklists, per-subpart numerical overrides, adopting or overriding AI recommendations, and publishing verified final scores. Unsubmitted retry drafts are automatically excluded from the queue.
- **Teacher Analytics Workstation**: Deep-diving into 7 specialized analytic panes (Overview, Assessments, Learning Intelligence, Materials, Ask AI, Student Roster, Reports) with exportable CSVs and printable PDF dossiers.
- **Pedagogical Moderation**: Responding to student difficulty flags, resolving material confusion hotspots, and overriding/correcting AI tutor responses.

### 2.3. Administrator Capabilities
- **System AI Configuration**: Adjusting global LLM providers, model identifiers (`gemini-2.0-flash`, `gemini-1.5-pro`), generation temperature, token limits, confidence thresholds, and vector chunking parameters via `system_ai_configs`.
- **System Governance & Audit**: Monitoring asynchronous processing jobs (OCR, PDF indexing, AI generation) and reviewing audit logs.

---

## 3. High-Level System Architecture

```mermaid
graph TB
    subgraph Presentation Layer [Frontend: Next.js 16 + React 19]
        StudentUI[Student Portal & Exam Studio]
        TeacherUI[Teacher Workstation & Grading Studio]
        AdminUI[Admin Dashboard]
        APIClient[Centralized API Client: api.ts]
    end

    subgraph Application & Security Layer [Backend: FastAPI]
        Router[FastAPI Application Router: 35+ Endpoints]
        AuthGuard[JWT Auth & RBAC Security Middleware]
        ValidationLayer[Pydantic V2 Request/Response Validation]
    end

    subgraph Service & Intelligence Layer
        ExamEngine[A/L Exam & Assembly Services: Full Paper + Standalone]
        GradingService[SpeedGrader & AI Marking Service]
        AnalyticsEngine[18-Module Analytics & Psychometrics Engine]
        RAGPipeline[ChromaDB Vector Retriever & Grounding Engine]
        AIService[Google Gemini LLM Service]
    end

    subgraph Data Persistence Layer
        Postgres[(PostgreSQL Relational DB: 30+ Entities)]
        ChromaStore[(ChromaDB Vector Storage)]
        FileStore[Local Storage / Static Uploads: uploads/]
    end

    StudentUI --> APIClient
    TeacherUI --> APIClient
    AdminUI --> APIClient
    APIClient -->|HTTPS / JSON / JWT| Router

    Router --> AuthGuard
    AuthGuard --> ValidationLayer
    ValidationLayer --> ExamEngine
    ValidationLayer --> GradingService
    ValidationLayer --> AnalyticsEngine
    ValidationLayer --> RAGPipeline

    ExamEngine --> AIService
    GradingService --> AIService
    RAGPipeline --> AIService
    RAGPipeline --> ChromaStore

    ExamEngine --> Postgres
    GradingService --> Postgres
    AnalyticsEngine --> Postgres
    Router --> FileStore
```

---

## 4. Key Subsystem Breakdown

| Subsystem | Primary Technologies | Core Purpose | Implemented Status |
| :--- | :--- | :--- | :--- |
| **Authentication & RBAC** | `FastAPI`, `python-jose`, `passlib[bcrypt]` | Secure JWT token issuance, password hashing, role enforcement, and resource ownership checks. | **IMPLEMENTED** |
| **Course & Material Engine** | `FastAPI`, `SQLAlchemy`, `HTML5 Video`, `PDF.js` | Course hierarchies, lesson-level material isolation, video/PDF exact resume tracking, difficulty flags. | **IMPLEMENTED** |
| **A/L Exam Engine** | `FastAPI`, `Next.js 16`, `SQLAlchemy` | 4 examination formats (Full Paper, Paper I MCQ, Paper II-A Structured, Paper II-B Essay), dual-stage breather, timer enforcement. | **IMPLEMENTED** |
| **AI Assessment Generator** | `Google Gemini API`, `Pydantic` | Template-compliant generation of MCQs, structured subparts, and essay marking blueprints with Question Bank snapshots. | **IMPLEMENTED** |
| **Marking Studio & SpeedGrader** | `Next.js 16`, `React 19`, `FastAPI` | Multi-section tabs, pre-grading evaluation, interactive rubric checklists, per-subpart marks, and Zen reader. | **IMPLEMENTED** |
| **RAG & Ask AI Tutor** | `ChromaDB`, `sentence-transformers`, `Gemini` | Vault-grounded student tutoring, citation extraction, grounding verification, and teacher moderation. | **IMPLEMENTED** |
| **Psychometric Analytics** | `Python`, `SQLAlchemy`, `Chart.js` | Item difficulty $p$, discrimination $d$, distractor efficiency, format divergence, and cognitive depth analysis. | **IMPLEMENTED** |
| **Student Dossier & Risk Engine**| `Python`, `Next.js` | Longitudinal progress tracking, radar mastery plots, cognitive balance, and automated academic risk flags. | **IMPLEMENTED** |
| **Reporting & Export Engine** | `FastAPI`, `Next.js`, `CSS Print` | CSV data export generation, multi-page print stylesheet, and PDF report rendering. | **IMPLEMENTED** |
| **Coursework & Assignments** | `SQLAlchemy`, `FastAPI` | Phase 4 coursework submissions, file attachments, and rubric detail models. | **PARTIALLY IMPLEMENTED** (Core backend schemas present; frontend focused on A/L Exams) |
| **Payment & Subscriptions** | `SQLAlchemy`, `FastAPI` | Subscription and payment entity models and backend routes. | **PARTIALLY IMPLEMENTED** (Mock/Database records implemented; external gateway sandbox) |

---

## 5. Security and Data Integrity Model

1. **Strict Tenant & Role Isolation**: Students can only access active courses in which they are formally enrolled. Under no circumstances can a student view or access another candidate's submissions, answer scripts, or confidential teacher marking schemes.
2. **Assessment Paper Separation**: Zero cross-assessment contamination exists between independent examination papers (e.g. MCQ submissions do not interfere with Structured or Essay marking).
3. **Deterministic Score Traceability**: Every student answer record maintains a full score provenance trail:
   - `auto_score`: Machine-calculated score (e.g., deterministic MCQ key matching).
   - `ai_score`: Gemini AI recommendation score.
   - `teacher_score`: Manual override points set by teacher.
   - `final_score`: The active verified grade committed to student records.
4. **Credential & Secret Protection**: All sensitive tokens, Gemini API keys, and database passwords are encrypted or loaded via environment variables and never logged or exposed in client responses.

---


<a id="01-project-scope-and-objectives"></a>

# 01. Project Scope and Objectives

## 1. Problem Statement & Background

Secondary and collegiate education platforms in South Asia—particularly for the competitive **Sri Lankan General Certificate of Education (Advanced Level)**—suffer from several critical technological and pedagogical limitations:

1. **Generic LMS Inadequacy for National Examination Standards**: Mainstream platforms (e.g., Moodle, Canvas, Google Classroom) are built around simplistic multiple-choice or monolithic essay boxes. They lack the architectural capability to represent the multi-tiered structure of A/L science and mathematics examinations:
   - **Paper I (MCQ)**: Requires 5 distinct answer choices across 7 complex formats (Multi-response 1-to-5 combination grids, 5-statement truth tables, matching column matrices, sequential diagnostics).
   - **Paper II-A (Structured Questions)**: Demands multi-tiered subpart hierarchies (`(a)`, `(i)`, `(ii)`) with allocated line spaces, prompt constraints, and discrete marks.
   - **Paper II-B (Essay Questions)**: Requires long-form analytical scientific writing evaluated against 10–15 specific rubric criteria points and accompanied by hand-drawn scientific diagrams.
2. **Disconnected Learning & Assessment Telemetry**: Conventional LMS solutions track student activity as isolated binary events (e.g., "file viewed"). They fail to capture exact resume coordinates (video timestamps, PDF page numbers), student difficulty indicators at specific content segments, or synthesize learning behavior with assessment outcomes.
3. **Unmoderated AI Hallucination in Education**: Generic AI chatbots applied to education frequently hallucinate incorrect scientific facts, provide ungrounded answers from non-curriculum sources, or leak confidential marking schemes.
4. **Absence of Real-Time Psychometric & Diagnostic Intelligence**: Teachers in large cohorts (100–1000+ students) lack automated Item Response Theory (IRT) and Classical Test Theory (CTT) tools to calculate item difficulty ($p$-value), item discrimination index ($d$), non-functional distractor frequencies, or identify systemic cognitive gaps across syllabus units.

---

## 2. Lumora's Architectural Solution

Lumora addresses these challenges by introducing an end-to-end specialized learning and assessment platform:

```mermaid
graph LR
    subgraph Problem Space
        P1[Generic Quiz Tools]
        P2[Binary Activity Tracking]
        P3[Ungrounded AI Hallucinations]
        P4[Manual Subjective Grading]
    end

    subgraph Lumora Solution Space
        S1[A/L 3-Paper Specialized Assessment Engine]
        S2[Precision Continuous Telemetry & Hotspot Flags]
        S3[RAG-Grounded Course Vault & Q&A Moderation]
        S4[Human-in-the-Loop SpeedGrader & Psychometrics]
    end

    P1 --> S1
    P2 --> S2
    P3 --> S3
    P4 --> S4
```

---

## 3. Project Scope & System Objectives

### 3.1. Primary System Objectives
- **Objective 1 (Curriculum & Material Delivery)**: Provide high-fidelity digital delivery for structured syllabi, supporting precision resume positions for video/PDF materials, unit completion fractions, and contextual confusion flagging.
- **Objective 2 (A/L Assessment Integrity)**: Deliver a comprehensive A/L exam engine capable of authoring, proctoring, taking, and scoring Paper I (MCQ), Paper II-A (Structured), and Paper II-B (Essay) papers with zero cross-contamination.
- **Objective 3 (Grounded AI Assistance)**: Implement a Retrieval-Augmented Generation (RAG) tutor grounded in verified course materials with teacher moderation, confidence thresholds, and citation tracking.
- **Objective 4 (AI Pre-Grading with Teacher Governance)**: Accelerate the evaluation of unstructured and essay responses via semantic checklist matching while preserving 100% teacher override authority.
- **Objective 5 (Multi-Dimensional Learning Intelligence)**: Equip educators with an 18-module analytics workstation calculating classical psychometrics, Bloom's cognitive taxonomy depth, format divergence, and student risk dossiers.

---

## 4. Implementation Truth Matrix (Fact vs. Design Intent)

To maintain absolute academic and forensic integrity, the following matrix contrasts what is **actually implemented and functional in the source code** versus what was planned or partially developed.

### 4.1. Core Learning & Materials System
| Capability | Status | Implementation Reality in Code |
| :--- | :--- | :--- |
| Course / Unit / Lesson Hierarchy | **IMPLEMENTED** | Fully implemented in `courses.py`, `units.py`, `lessons.py`. Rendered dynamically in student and teacher portals. |
| Material Types (Video, PDF, Note, Image) | **IMPLEMENTED** | Supported via `MaterialType` enum in `models.py`. Handled via `MaterialViewer.tsx` with dedicated rendering engines. |
| Exact Resume Tracking (Video) | **IMPLEMENTED** | Throttled `last_position` updates every 4s; resumes exact second on load in `MaterialViewer.tsx`. |
| Exact Resume Tracking (PDF) | **IMPLEMENTED** | Page anchor `#page=N` synchronisation, bookmarking, and top control bar in `MaterialViewer.tsx`. |
| Unit Progress Fractions | **IMPLEMENTED** | Backend calculates `completed_fraction` (e.g. `2/3 Completed`); displayed in student course outline. |
| Lesson Status Badges | **IMPLEMENTED** | `Reviewed`, `Engaging`, `Not Reviewed` calculated and rendered on course and lesson pages. |
| Material Difficulty Flags | **IMPLEMENTED** | Students submit timestamp/page flags; teachers view and reply in `MaterialViewer` and Analytics. |

### 4.2. A/L Examination & Question Bank Engine
| Capability | Status | Implementation Reality in Code |
| :--- | :--- | :--- |
| Paper I MCQ Engine (50 Items, 7 Formats) | **IMPLEMENTED** | 7 template types supported in `ALQuestionTemplate`. Answering, autosaving, deterministic auto-scoring functional. |
| Paper II-A Structured Engine (4 Questions) | **IMPLEMENTED** | Subparts tree with prompt labels (`(a)`, `(i)`), line counts, student text inputs, and score overrides. |
| Paper II-B Essay Engine (3 Questions) | **IMPLEMENTED** | Word-count monitored rich textarea, diagram image attachment, and 10–15 item rubric checklists. |
| AI Exam Generation (Gemini) | **IMPLEMENTED** | `al_mcq_generator.py`, `al_structured_generator.py`, `al_essay_generator.py` generate template-valid papers. |
| Question Bank & Pool Management | **IMPLEMENTED** | Question bank repository, search, filter, and selective exam deletion prompt (keep banked questions). |
| Marking Studio / SpeedGrader | **IMPLEMENTED** | Side-by-side script and rubric checklist, Accept All AI recommendations, Zen focus reader, and zoom lightbox. |

### 4.3. Analytics & Learning Intelligence
| Capability | Status | Implementation Reality in Code |
| :--- | :--- | :--- |
| Psychometric Difficulty ($p$-value) | **IMPLEMENTED** | Computed per question as $p = \frac{\text{Correct}}{\text{Total}}$ in `mcq_analytics.py`. |
| Psychometric Discrimination ($d$) | **IMPLEMENTED** | Upper 27% vs Lower 27% cohort formula with sample validation ($\ge 10$ attempts) in `discrimination.py`. |
| Distractor Analysis | **IMPLEMENTED** | Tracks frequency of choices A–E; flags non-functional distractors ($<5\%$). |
| Question Format Divergence | **IMPLEMENTED** | Detects variance between student MCQ vs Structured vs Essay performance in `learning_intelligence.py`. |
| Bloom's Cognitive Depth Tracking | **IMPLEMENTED** | Maps performance across Remember, Understand, Apply, Analyze, Evaluate levels. |
| Material Confusion Hotspots | **IMPLEMENTED** | Aggregates difficulty flags by timestamp/page; calculates view-to-flag friction ratios. |
| Student Academic Risk Modeling | **IMPLEMENTED** | Multi-factor classification into `High Risk`, `Medium Risk`, `On Track`, `High Performer`. |
| Export & Reporting Engine | **IMPLEMENTED** | CSV streaming export and print-optimized PDF dossier generation in `reporting.py`. |

### 4.4. Secondary / Partially Implemented Features
| Capability | Status | Implementation Reality in Code |
| :--- | :--- | :--- |
| Coursework & Assignments (Phase 4) | **PARTIALLY IMPLEMENTED** | Complete DB schemas and FastAPI routes in `assignments.py`; UI partially integrated in teacher views. |
| OCR Background Ingestion | **PARTIALLY IMPLEMENTED** | `ocr.py` using `pytesseract` is functional; requires local Tesseract binary configured in environment. |
| Whisper Audio Transcription | **PARTIALLY IMPLEMENTED** | Backend service `audio.py` exists; requires local ffmpeg/model binaries for production streaming. |
| Payment Gateway Integration | **PLACEHOLDER** | `payments.py` and `subscriptions.py` maintain DB records; external gateway (e.g. Stripe) operates in sandbox mode. |
| Native Mobile Application | **PLANNED** | Web application is fully responsive on mobile viewports; native iOS/Android shell not implemented. |

---


<a id="02-technology-stack"></a>

# 02. Technology Stack

This document details the actual technology stack, frameworks, libraries, database engines, AI providers, and infrastructure configurations utilized throughout the Lumora LMS codebase, verified directly against [`backend/requirements.txt`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/requirements.txt), [`frontend/package.json`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/package.json), and runtime configuration files.

---

## 1. Complete Technology Matrix

```mermaid
graph TD
    subgraph Client Tier [Frontend: Next.js 16 + React 19]
        NextApp[Next.js 16.2.10 App Router]
        ReactTier[React 19.2.4 + TypeScript 5]
        VisualTier[Chart.js 4.5.1 + react-chartjs-2]
        StyleTier[Vanilla CSS Design System + TailwindCSS 4]
        APIClientTier[Centralized Typed API Client: lib/api.ts]
    end

    subgraph Application Tier [Backend: FastAPI + Python]
        FastAPIApp[FastAPI 0.115.12 + Uvicorn 0.34.2]
        PydanticV2[Pydantic V2 Data Validation & Contracts]
        AuthModule[python-jose 3.4.0 + passlib 1.7.4 + bcrypt 4.3.0]
        DocProcessor[PyMuPDF 1.24.0 + pytesseract 0.3.13]
    end

    subgraph Intelligence Tier [AI & Vector Search]
        GeminiSDK[Google GenAI SDK 1.0.0: Gemini 2.0 Flash]
        GroqSDK[Groq SDK 0.11.0: LLaMA-3.3 Fallback]
        VectorEngine[ChromaDB 0.5.0 + sentence-transformers 3.0.0]
        Embeddings[all-MiniLM-L6-v2 Local Dense Embeddings]
    end

    subgraph Data Tier [Persistence & Storage]
        PostgreSQL[(PostgreSQL 15+ via pg8000 & SQLAlchemy 2.0.41)]
        ChromaStore[(Local ChromaDB Vector Collection: chroma_data/)]
        FileStorage[Local Media File Repository: uploads/]
    end

    NextApp --> APIClientTier
    APIClientTier -->|HTTP REST / JSON / Bearer JWT| FastAPIApp
    FastAPIApp --> PydanticV2
    FastAPIApp --> AuthModule
    FastAPIApp --> DocProcessor
    FastAPIApp --> GeminiSDK
    FastAPIApp --> VectorEngine
    VectorEngine --> Embeddings
    VectorEngine --> ChromaStore
    FastAPIApp --> PostgreSQL
    FastAPIApp --> FileStorage
```

---

## 2. Frontend Technology Stack

| Category | Technology | Version | Purpose & Implementation Details |
| :--- | :--- | :--- | :--- |
| **Framework** | **Next.js** | `16.2.10` | App Router paradigm, Server-Side Rendering (SSR), Static Site Generation (SSG), dynamic route segments (`[submissionId]`, `[id]`, `[studentId]`), and Turbopack build engine. |
| **UI Library** | **React** | `19.2.4` | Component lifecycle, modern hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`), and concurrent rendering. |
| **Language** | **TypeScript** | `^5.0.0` | Strict type definitions across all UI components, data structures, and API response contracts. |
| **Data Visualization** | **Chart.js** & **react-chartjs-2** | `^4.5.1` / `^5.3.1` | Renders radar charts (mastery), bar charts (grade/question distribution), doughnut charts (pass rates), and line charts (longitudinal score trends). |
| **Styling & Design** | **Vanilla CSS** & **TailwindCSS** | `@tailwindcss/postcss ^4` | Design system built on CSS variables in `globals.css` (e.g., `--bg-card`, `--accent-primary`, `--border-subtle`), ensuring responsive dark/light theme support. |
| **Icons & Media** | **Lucide React** & **SvgIcon** | `^1.26.0` | Centralized inline SVG icon rendering with Lucide styling (24×24 viewBox, 1.75 stroke). |
| **Markdown Rendering**| **react-markdown** & **remark-gfm**| `^10.1.0` / `^4.0.1` | Rich rendering of AI feedback notes, question instructions, and student markdown formatting. |
| **State & API Layer** | **Native React + Fetch API** | N/A | Centralized, strongly-typed asynchronous HTTP client in `frontend/src/lib/api.ts` handling token injection and error parsing. |

---

## 3. Backend Technology Stack

| Category | Technology | Version | Purpose & Implementation Details |
| :--- | :--- | :--- | :--- |
| **Web Framework** | **FastAPI** | `0.115.12` | High-performance asynchronous Python web framework providing automatic OpenAPI/Swagger documentation (`/docs`, `/redoc`), dependency injection, and router modularization. |
| **ASGI Server** | **Uvicorn** | `0.34.2` | Production-ready ASGI server with standard worker loops. |
| **Language** | **Python** | `3.11+ / 3.13` | Backend execution runtime. |
| **ORM & Database** | **SQLAlchemy** & **pg8000** | `2.0.41` / `1.31.2` | Object-Relational Mapping (ORM) connecting to PostgreSQL via pure-Python `pg8000` driver (`postgresql+pg8000://`). Schema migration management assisted by Alembic (`1.16.1`). |
| **Data Validation** | **Pydantic** | `V2 (FastAPI core)` | Comprehensive request validation, response serialization, and analytics data contract enforcement. |
| **Authentication** | **python-jose** & **passlib** | `3.4.0` / `1.7.4` | JWT access token creation/verification (HS256 algorithm) and secure salted bcrypt password hashing (`bcrypt 4.3.0`). |
| **Multipart & Uploads** | **python-multipart** & **aiofiles** | `0.0.20` / `24.1.0` | Asynchronous file streaming for PDF past papers, video lessons, and candidate scientific diagram attachments. |
| **Document Processing**| **PyMuPDF (fitz)** & **pytesseract** | `^1.24.0` / `^0.3.13` | PDF parsing, syllabus text extraction, and OCR image text processing. |

---

## 4. Artificial Intelligence & Vector Search Stack

| Category | Technology | Model / Version | Operational Role in Codebase |
| :--- | :--- | :--- | :--- |
| **Primary LLM** | **Google Gemini** (`google-genai`) | `gemini-2.0-flash` / `gemini-1.5-pro` (v1.0.0+) | Generates A/L MCQ items, Structured questions with academic labels, Essay marking blueprints, student Q&A answers, and SpeedGrader pre-grading evaluations. |
| **Secondary LLM** | **Groq SDK** (`groq`) | `llama-3.3-70b-versatile` (v0.11.0+) | High-speed fallback inference engine for real-time validation and classification. |
| **Vector Database** | **ChromaDB** | `^0.5.0` | Local persistent vector storage (`backend/chroma_data/`) organizing chunks into course collections (`course_materials`). |
| **Dense Embeddings**| **Sentence Transformers** | `all-MiniLM-L6-v2` (`^3.0.0`) | 384-dimensional dense semantic text embeddings for material chunk retrieval in the RAG pipeline. |
| **Computer Vision** | **OpenCV** & **pytesseract** | `opencv-python-headless 4.10.0` | Pre-processing student uploaded diagram images for automated orientation, noise removal, and layout parsing. |

---

## 5. Persistence & Infrastructure Stack

| Category | Technology | Configuration / Version | Operational Description |
| :--- | :--- | :--- | :--- |
| **Primary Database** | **PostgreSQL** | `15+` / Database `fdp_db` | Relational storage for 30+ tables containing courses, curriculum, questions, submissions, answers, scores, and analytics. |
| **Vector Storage** | **ChromaDB SQLite** | Local Directory `chroma_data` | Persistent disk-backed vector collection. |
| **Containerization** | **Docker & Compose** | `docker-compose.yml` | Multi-container setup orchestrating backend FastAPI service, PostgreSQL database, and frontend Next.js container. |
| **Static File Mount** | **FastAPI StaticFiles** | Mounted at `/uploads` | Serves uploaded past papers, course videos, PDF notes, and student essay diagrams directly with MIME-type resolution. |

---


<a id="03-system-architecture"></a>

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

---


<a id="04-frontend-architecture"></a>

# 04. Frontend Architecture

## 1. Frontend Architectural Overview

The Lumora LMS frontend is built on **Next.js 16.2.10 (App Router)** utilizing **React 19.2.4** and **TypeScript 5**. It adopts a modular, component-driven client architecture designed for sub-second page transitions, rich typography, interactive assessment workstations, and responsive data visualizations.

```mermaid
graph TD
    subgraph AppRouter [Next.js App Router: src/app/]
        Layout[Root Layout: layout.tsx + globals.css]
        AuthPages[Auth: /login, /register]
        StudentPortal[Student Portal: /dashboard/student/*]
        TeacherPortal[Teacher Command Center: /dashboard/teacher/*]
    end

    subgraph ComponentLibrary [Component Tier: src/components/]
        CommonUI[Core UI: Modal, SvgIcon, Skeleton, ConfirmDialog, ErrorBoundary]
        MediaViewers[Media Tier: MaterialViewer, WYSIWYGEditor]
        ALExamComponents[A/L Exam Engine: MCQ, Structured, Essay Renderers, Symbol Picker]
        AnalyticsCharts[Visualization Tier: BarChart, LineChart, DoughnutChart, MaterialHeatmap]
    end

    subgraph ClientLib [State & Client Tier: src/lib/]
        APIClient[Centralized API Client: api.ts]
        TreeUtils[Academic Trees: alStructuredTreeUtils, alEssayTreeUtils]
        AIClassifier[AI Error Classifier: aiErrorClassifier.ts]
    end

    Layout --> AuthPages
    Layout --> StudentPortal
    Layout --> TeacherPortal
    StudentPortal --> CommonUI
    StudentPortal --> MediaViewers
    StudentPortal --> ALExamComponents
    TeacherPortal --> ALExamComponents
    TeacherPortal --> AnalyticsCharts
    TeacherPortal --> CommonUI
    CommonUI --> APIClient
    ALExamComponents --> APIClient
    ALExamComponents --> TreeUtils
    AnalyticsCharts --> APIClient
```

---

## 2. Complete Route Map & Page Inventory

### 2.1. Authentication Routes
| Route | Access Role | Primary Purpose & Features |
| :--- | :--- | :--- |
| `/login` | Public | Dual-tab sliding login card for Students, Teachers, and Admins; JWT session storage in `localStorage`. |
| `/register` | Public | Student account registration with role assignment and immediate onboarding modal trigger. |

### 2.2. Student Portal Routes (`/dashboard/student/*`)
| Route | Page File Path | Key Features & Implemented Capabilities |
| :--- | :--- | :--- |
| `/dashboard/student` | `src/app/dashboard/student/page.tsx` | Student home dashboard displaying enrolled courses, overall progress KPI, upcoming exams, and quick action cards. |
| `/dashboard/student/courses` | `src/app/dashboard/student/courses/page.tsx` | Renders grid of all enrolled and available courses with progress percentage bars. |
| `/dashboard/student/courses/[id]` | `src/app/dashboard/student/courses/[id]/page.tsx` | Course outline with syllabus unit accordions, unit completion fractions (e.g. `2/3 Completed`), and lesson status badges (`Reviewed`, `Engaging`, `Not Reviewed`). |
| `/dashboard/student/courses/[id]/lessons/[lessonId]` | `src/app/dashboard/student/courses/[id]/lessons/[lessonId]/page.tsx` | Interactive lesson classroom hosting `MaterialViewer` (Video, PDF, Notes) with exact resume position, note-taking, and difficulty flagging. |
| `/dashboard/student/al-exams` | `src/app/dashboard/student/al-exams/page.tsx` | A/L Examination hub categorized into Paper I (MCQ), Paper II-A (Structured), and Paper II-B (Essay) with start/continue actions. |
| `/dashboard/student/al-exams/[id]` | `src/app/dashboard/student/al-exams/[id]/page.tsx` | Full-screen proctored A/L examination engine with timer countdown, autosave, section navigators, symbol picker, and submission receipt. |
| `/dashboard/student/analytics` | `src/app/dashboard/student/analytics/page.tsx` | Student Personal Mastery Dossier featuring radar mastery plots, cognitive balance chart, unit breakdowns, and AI recommendations. |
| `/dashboard/student/ask` | `src/app/dashboard/student/ask/page.tsx` | RAG-grounded AI Tutor interface with course selection, real-time question answering, and citation references. |
| `/dashboard/student/ask-teacher`| `src/app/dashboard/student/ask-teacher/page.tsx` | Direct messaging and question escalation channel to enrolled course instructors. |
| `/dashboard/student/guide` | `src/app/dashboard/student/guide/page.tsx` | Platform documentation and student user manual. |
| `/dashboard/student/browse` | `src/app/dashboard/student/browse/page.tsx` | Course catalog exploration for new course enrollment. |

### 2.3. Teacher Command Center Routes (`/dashboard/teacher/*`)
| Route | Page File Path | Key Features & Implemented Capabilities |
| :--- | :--- | :--- |
| `/dashboard/teacher` | `src/app/dashboard/teacher/page.tsx` | Teacher overview cockpit with active course KPIs, pending grading queue, and student activity trends. |
| `/dashboard/teacher/courses` | `src/app/dashboard/teacher/courses/page.tsx` | Course management console for creating courses, editing metadata, and managing syllabus units. |
| `/dashboard/teacher/courses/[id]` | `src/app/dashboard/teacher/courses/[id]/page.tsx` | Detailed course builder for adding units, ordering lessons, and configuring pricing/visibility. |
| `/dashboard/teacher/courses/[id]/lessons/[lessonId]` | `src/app/dashboard/teacher/courses/[id]/lessons/[lessonId]/page.tsx` | Lesson curriculum editor for uploading videos, PDFs, and publishing notes. |
| `/dashboard/teacher/al-exams` | `src/app/dashboard/teacher/al-exams/page.tsx` | A/L Exam repository with paper status filtering, question bank integration, and safe exam deletion modals. |
| `/dashboard/teacher/al-exams/create` | `src/app/dashboard/teacher/al-exams/create/page.tsx` | A/L Exam Designer for drafting 50-item MCQs, Structured subpart trees, and Essay blueprints with Gemini AI assistance. |
| `/dashboard/teacher/al-exams/grading` | `src/app/dashboard/teacher/al-exams/grading/page.tsx` | Submissions queue filtering student attempts by exam, status (`submitted`, `ai_graded`, `teacher_verified`), and score. |
| `/dashboard/teacher/al-exams/grade/[submissionId]` | `src/app/dashboard/teacher/al-exams/grade/[submissionId]/page.tsx` | Marking Studio & SpeedGrader with Wide Studio mode (1560px), Accept All AI recommendations, per-question overrides, and Zen reader. |
| `/dashboard/teacher/al-exams/analytics` | `src/app/dashboard/teacher/al-exams/analytics/page.tsx` | Dedicated A/L Assessment psychometrics overview (difficulty $p$, discrimination $d$, distractor counts). |
| `/dashboard/teacher/analytics` | `src/app/dashboard/teacher/analytics/page.tsx` | Master 7-Tab Teacher Analytics Workstation (Overview, Assessments, Learning Intelligence, Materials, Ask AI, Roster, Reports). |
| `/dashboard/teacher/analytics/student/[studentId]` | `src/app/dashboard/teacher/analytics/student/[studentId]/page.tsx` | Comprehensive individual student forensic dossier with longitudinal charts, risk analysis, and teacher intervention notes. |
| `/dashboard/teacher/qa` | `src/app/dashboard/teacher/qa/page.tsx` | Q&A Moderation Hub for reviewing AI tutor responses, correcting low-confidence answers, and managing student flags. |
| `/dashboard/teacher/question-bank` | `src/app/dashboard/teacher/question-bank/page.tsx` | Centralized repository of banked questions with topic filtering, cognitive level tags, and reuse actions. |
| `/dashboard/teacher/inbox` | `src/app/dashboard/teacher/inbox/page.tsx` | Teacher direct messaging console for communicating with enrolled students. |
| `/dashboard/teacher/insights/hotspots` | `src/app/dashboard/teacher/insights/hotspots/page.tsx` | Material confusion hotspot heatmaps aggregating timestamp and page-level difficulty flags. |

---

## 3. Core Reusable Component Architecture

### 3.1. `MaterialViewer.tsx` (`src/components/MaterialViewer.tsx`)
- **Supported Formats**: Video (`<video>` with HTML5 custom overlay), PDF (`<iframe>` with `#page=N` hash integration), Notes (Rich HTML/Markdown), Diagram Images (Pan-and-zoom).
- **Exact Resume Synchronization**:
  - `hasResumedRef` prevents async metadata race conditions.
  - Automatically seeks `video.currentTime = progress.last_position` upon mount.
  - Throttled position saves every 4 seconds during active playback.
  - Immediate position sync on `onPause`, `onSeeked`, `onEnded`, and component unmount.
- **Interactive Top Toolbar**: PDF page jumper (`Page [ 13 ]` + `Go`), `Prev Page`, `Next Page`, `Bookmark Page N`, and manual `Mark as Completed` toggle.
- **Contextual Difficulty Flagging**: Modal allowing students to submit confusion flags pinned to the active video second or PDF page.

### 3.2. Marking Studio & SpeedGrader (`src/app/dashboard/teacher/al-exams/grade/[submissionId]/page.tsx`)
- **Layout Architecture**:
  - Dynamic container width: Standard (1280px) vs Wide Focus Studio (1560px).
  - Paper I (MCQ): Item cards showing student choice, correct key, AI auto-mark, and override input.
  - Paper II-A (Structured): Academic subparts tree (`(a)`, `(i)`) with candidate written answers rendered in high-legibility cards.
  - Paper II-B (Essay): 2-column split (58% student script / 42% rubric criteria checklist) with word count, font size toggle (`A-` / `A+`), and diagram lightbox.
- **AI Recommendation Workflow**:
  - One-click `Accept All AI Recommendations` button adopting pre-graded marks across all questions.
  - Per-question `Accept AI Score (X pts)` quick buttons.
  - Visual `AI: ✓ Detected` badges on rubric criteria recognized by Gemini.
- **Zen Focus Mode Modal**: Distraction-free full-screen reader for long essay scripts with floating score override inputs.

### 3.3. Centralized SvgIcon Component (`src/components/SvgIcon.tsx`)
- Single source of truth for 100+ inline SVG icons styled consistently with 24×24 viewBox and 1.75 stroke width.
- Eliminates icon library fragmentation and bundle bloat.

---


<a id="05-backend-architecture"></a>

# 05. Backend Architecture

## 1. Backend Architecture Overview

The Lumora backend is an asynchronous, high-throughput REST API constructed on **FastAPI 0.115.12** and **Python 3.11+**, with **SQLAlchemy 2.0.41** managing relational persistence against PostgreSQL, and **ChromaDB 0.5.0** providing vector similarity retrieval.

```mermaid
graph TD
    Client[Client Request: HTTPS / Bearer JWT]
    Client --> Uvicorn[Uvicorn ASGI Server: Port 8000]
    
    subgraph FastAPI Core Engine [backend/main.py]
        Uvicorn --> CORS[CORS Middleware: Origin & Headers]
        CORS --> Static[StaticFiles Router: /uploads]
        CORS --> RootRouter[FastAPI Application Instance]
        
        subgraph Security & Dependency Tier
            RootRouter --> AuthDep[get_current_user: JWT Validation]
            AuthDep --> RoleDep[Role Guard: require_teacher / require_admin]
            RoleDep --> DBDriver[get_db: SQLAlchemy SessionLocal]
        end
        
        subgraph Router Dispatch [29 Modular API Routers]
            DBDriver --> R_Auth[/api/auth]
            DBDriver --> R_Courses[/api/courses & /api/units & /api/lessons]
            DBDriver --> R_Materials[/api/materials & /api/materials/ai]
            DBDriver --> R_Exams[/api/al-exams & /api/al-authoring & /api/al-mcq]
            DBDriver --> R_Analytics[/api/analytics & /api/al-analytics]
            DBDriver --> R_QA[/api/qa]
            DBDriver --> R_Users[/api/users & /api/students]
        end
    end

    subgraph Service & Persistence Layer
        R_Exams --> Svc_Exams[al_generator_service & al_marking_service]
        R_Analytics --> Svc_Analytics[18 Analytics Modules]
        R_QA --> Svc_RAG[al_rag_retriever & vector.py]
        
        Svc_Exams --> DB[(PostgreSQL: fdp_db)]
        Svc_Analytics --> DB
        Svc_RAG --> VectorDB[(ChromaDB: chroma_data/)]
        Svc_RAG --> DB
        Svc_Exams --> AI[Google Gemini 2.0 Flash / Pro]
        Svc_RAG --> AI
    end
```

---

## 2. Application Entry Point & Router Registration

The root application entry point is [`backend/main.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/main.py). It initializes database schema extensions via `init_db_schema()`, mounts static uploads, and registers **29 modular API routers**:

```python
# Router registration in backend/main.py
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(courses.router, prefix="/api/courses", tags=["Courses"])
app.include_router(units.router, prefix="/api/units", tags=["Units"])
app.include_router(lessons.router, prefix="/api/lessons", tags=["Lessons"])
app.include_router(materials.router, prefix="/api/materials", tags=["Materials"])
app.include_router(materials_ai.router, prefix="/api/materials", tags=["Material AI Insights"])
app.include_router(quizzes.router, prefix="/api/quizzes", tags=["Quizzes"])
app.include_router(assignments.router, prefix="/api/assignments", tags=["Assignments"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(qa.router, prefix="/api/qa", tags=["Q&A"])
app.include_router(recommendations.router, prefix="/api/recommendations", tags=["Recommendations"])
app.include_router(students.router, prefix="/api/students", tags=["Student Profile"])
app.include_router(admin_ai.router, prefix="/api/admin", tags=["Admin AI Config"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(pools.router, prefix="/api/pools", tags=["Pools"])
app.include_router(rubrics.router, prefix="/api/rubrics", tags=["Rubrics"])
app.include_router(al_exams.router, prefix="/api/al-exams", tags=["A/L Exam Engine"])
app.include_router(al_past_papers.router, prefix="/api/al-past-papers", tags=["A/L Past Papers"])
app.include_router(al_authoring.router, prefix="/api/al-authoring", tags=["A/L Authoring"])
app.include_router(al_curriculum.router, prefix="/api/al-curriculum", tags=["A/L Curriculum & Scope Slicer"])
app.include_router(al_mcq.router, prefix="/api/al-mcq", tags=["A/L Paper I MCQ Engine"])
app.include_router(al_analytics.router, prefix="/api/analytics", tags=["A/L Assessment Analytics Foundation"])
```

---

## 3. Request Lifecycle & Execution Pipeline

Every HTTP request dispatched to the Lumora backend undergoes an explicit 7-stage lifecycle:

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client Browser
    participant Uvicorn as Uvicorn ASGI
    participant CORS as CORS Middleware
    participant Auth as Auth Dependency (get_current_user)
    participant RBAC as Role Guard (require_teacher)
    participant Pydantic as Pydantic Schema Validator
    participant Router as API Endpoint Handler
    participant Service as Domain Service Layer
    participant DB as PostgreSQL Session

    Client->>Uvicorn: HTTP Request (Method, Path, Bearer Token, Body)
    Uvicorn->>CORS: Validate Origin & Allowed Headers
    CORS->>Auth: Extract & Decode JWT Bearer Token
    Auth->>DB: Query User record by email/ID & verify active status
    DB-->>Auth: User Entity (role=TEACHER)
    Auth->>RBAC: Assert user.role in [TEACHER, ADMIN]
    RBAC->>Pydantic: Parse and validate JSON body against Schema
    Pydantic->>Router: Inject validated schema + db session + current_user
    Router->>Service: Execute business logic / algorithm
    Service->>DB: Commit / Query database transactions
    DB-->>Service: Database result
    Service-->>Router: Business response object
    Router-->>Client: 200 OK (Serialized JSON Response)
```

---

## 4. Service Layer Architecture

The backend isolates database querying and third-party AI orchestration into modular domain services located in `backend/app/services/`:

### 4.1. A/L Examination & Assessment Services
- **`al_generator_service.py`**: High-level orchestration for AI-assisted paper creation, topic blueprint sampling, and validation.
- **`al_mcq_generator.py`**: Specialized multi-prompt generator for 7 distinct Paper I MCQ formats with 5 options and distractor rationales.
- **`al_structured_generator.py`**: Generates multi-part structured trees with prompt labels (`(a)`, `(i)`), expected keywords, and line constraints.
- **`al_essay_generator.py`**: Generates long-form essay prompts with comprehensive 10–15 item criteria marking rubrics.
- **`al_marking_service.py`**: Automated SpeedGrader evaluator comparing student essay submissions against rubric criteria and returning per-criterion attainment and point suggestions.

### 4.2. Analytics & Psychometrics Pipeline (`app/services/analytics/`)
Comprises 18 specialized modules ensuring separation of statistical concerns:
- **`data_contracts.py`**: Canonical Pydantic schemas enforcing unified field naming across analytics endpoints.
- **`mcq_analytics.py`**: Item difficulty ($p$-value), option frequency distribution, and non-functional distractor flags.
- **`structured_analytics.py`**: Subpart hierarchy achievement and point loss rate calculations.
- **`essay_analytics.py`**: Rubric criteria achievement rates and analytical depth scoring.
- **`discrimination.py`**: Upper 27% vs Lower 27% psychometric discrimination index ($d$) with sample-size validation.
- **`learning_intelligence.py`**: Cross-domain analytics correlating material usage, difficulty flags, Ask AI questions, and assessment performance.
- **`student_mastery_analytics.py`**: Individual student radar mastery dimensions, cognitive depth, and risk classification.
- **`reporting.py`**: Assembles multi-page printable student/course dossiers and streaming CSV data tables.

### 4.3. Retrieval-Augmented Generation & AI Services
- **`gemini_service.py`**: Core Google GenAI SDK interface with automatic prompt structuring, retry handling, and fallback management.
- **`al_rag_retriever.py`** & **`vector.py`**: Manages ChromaDB collections, dense text embedding generation (`all-MiniLM-L6-v2`), top-$k$ similarity queries, and material privacy vault filtering.

---

## 5. Database Session & Error Handling Protocols

1. **Per-Request Session Isolation**: The `get_db()` dependency generates a discrete SQLAlchemy `SessionLocal()` per request, ensuring automatic session termination and connection pooling cleanup in `finally: db.close()`.
2. **Transaction Rollback Protection**: Write operations wrap multi-entity modifications in try-except blocks with explicit `db.rollback()` on failure to prevent database corruption.
3. **Structured HTTP Exception Codes**:
   - `401 Unauthorized`: Missing, expired, or invalid JWT signature.
   - `403 Forbidden`: Insufficient role privileges or cross-tenant access violation.
   - `404 Not Found`: Target entity (course, material, exam, submission) does not exist.
   - `422 Unprocessable Entity`: Schema validation or type mismatch error.
   - `500 Internal Server Error`: Unhandled execution fault (logged with stack trace).

---


<a id="06-database-architecture"></a>

# 06. Database Architecture

## 1. Relational Database Overview

Lumora utilizes a normalized PostgreSQL relational database (database name: `fdp_db`) mapped via **SQLAlchemy 2.0.41**. The database contains **30+ core entity models** structured into discrete functional domains.

```mermaid
erDiagram
    users ||--o{ courses : "teacher creates"
    users ||--o{ enrollments : "student enrolls"
    courses ||--o{ enrollments : "enrolled in"
    courses ||--o{ units : "contains"
    units ||--o{ lessons : "contains"
    lessons ||--o{ materials : "contains"
    materials ||--o{ student_material_progress : "tracked in"
    materials ||--o{ material_flags : "flagged by"
    users ||--o{ student_material_progress : "records progress"
    
    courses ||--o{ al_exams : "hosts"
    al_exams ||--o{ al_questions : "contains"
    al_exams ||--o{ al_student_submissions : "attempted by"
    users ||--o{ al_student_submissions : "submits"
    al_student_submissions ||--o{ al_student_answers : "records"
    al_questions ||--o{ al_student_answers : "evaluates"

    courses ||--o{ student_questions : "context for"
    users ||--o{ student_questions : "asks"
    student_questions ||--o| ai_responses : "receives"
    
    users ||--o{ quiz_attempts : "takes"
    courses ||--o{ quizzes : "hosts"
    quizzes ||--o{ quiz_attempts : "attempted in"
    quiz_attempts ||--o{ answers : "contains"
```

---

## 2. Core Entity Specifications

### 2.1. Domain 1: Users & Authentication

#### `users`
Represents student, teacher, and administrator accounts.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`email`** (`VARCHAR(255)`, Unique, Not Null, Indexed)
- **`hashed_password`** (`VARCHAR(255)`, Not Null)
- **`full_name`** (`VARCHAR(255)`, Not Null)
- **`role`** (`ENUM(UserRole: 'admin', 'teacher', 'student')`, Not Null, Default: `'student'`)
- **`is_active`** (`BOOLEAN`, Default: `TRUE`)
- **`must_change_password`** (`BOOLEAN`, Default: `FALSE`)
- **`profile_image`** (`VARCHAR(500)`, Nullable)
- **`last_active_at`** (`TIMESTAMP`, Nullable)
- **`created_at`** (`TIMESTAMP`, Default: `NOW()`)
- **`updated_at`** (`TIMESTAMP`, Default: `NOW()`)
- **Relationships**: `taught_courses` (1:M Course), `enrollments` (1:M Enrollment), `quiz_attempts` (1:M QuizAttempt), `student_questions` (1:M StudentQuestion), `activity_logs` (1:M ActivityLog).

#### `password_reset_requests`
Tracks password recovery requests and temporary password issuances.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`user_id`** (`INTEGER`, Foreign Key `users.id`, Not Null)
- **`email`** (`VARCHAR(255)`, Not Null)
- **`reason`** (`TEXT`, Nullable)
- **`status`** (`ENUM(PasswordResetStatus: 'pending', 'resolved')`, Default: `'pending'`)
- **`temp_password`** (`VARCHAR(255)`, Nullable)
- **`created_at`** (`TIMESTAMP`, Default: `NOW()`)
- **`resolved_at`** (`TIMESTAMP`, Nullable)

---

### 2.2. Domain 2: Curriculum & Course Delivery

#### `courses`
Top-level academic course container.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`title`** (`VARCHAR(255)`, Not Null)
- **`description`** (`TEXT`, Nullable)
- **`subject`** (`VARCHAR(100)`, Nullable)
- **`cover_image`** (`VARCHAR(500)`, Nullable)
- **`is_active`** (`BOOLEAN`, Default: `TRUE`)
- **`is_paid_course`** (`BOOLEAN`, Default: `FALSE`)
- **`monthly_price`** (`FLOAT`, Nullable)
- **`full_price`** (`FLOAT`, Nullable)
- **`teacher_id`** (`INTEGER`, Foreign Key `users.id`, Not Null)
- **`created_at`** / **`updated_at`** (`TIMESTAMP`)
- **Relationships**: `teacher` (M:1 User), `units` (1:M Unit), `lessons` (1:M Lesson), `enrollments` (1:M Enrollment).

#### `enrollments`
Junction table linking students to courses.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`student_id`** (`INTEGER`, Foreign Key `users.id`, Not Null, Index)
- **`course_id`** (`INTEGER`, Foreign Key `courses.id`, Not Null, Index)
- **`enrolled_at`** (`TIMESTAMP`, Default: `NOW()`)
- **`is_active`** (`BOOLEAN`, Default: `TRUE`)

#### `units`
Curriculum syllabus unit organizing lessons.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`title`** (`VARCHAR(255)`, Not Null)
- **`description`** (`TEXT`, Nullable)
- **`order`** (`INTEGER`, Default: `0`)
- **`course_id`** (`INTEGER`, Foreign Key `courses.id`, Not Null)
- **Relationships**: `course` (M:1 Course), `lessons` (1:M Lesson).

#### `lessons`
Individual classroom module within a unit.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`title`** (`VARCHAR(255)`, Not Null)
- **`description`** (`TEXT`, Nullable)
- **`order`** (`INTEGER`, Default: `0`)
- **`is_published`** (`BOOLEAN`, Default: `FALSE`)
- **`course_id`** (`INTEGER`, Foreign Key `courses.id`, Not Null)
- **`unit_id`** (`INTEGER`, Foreign Key `units.id`, Nullable)
- **Relationships**: `materials` (1:M Material), `quizzes` (1:M Quiz).

#### `materials`
Learning content assets attached to lessons.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`title`** (`VARCHAR(255)`, Not Null)
- **`description`** (`TEXT`, Nullable)
- **`material_type`** (`ENUM(MaterialType: 'note', 'pdf', 'image', 'video')`, Not Null)
- **`category`** (`VARCHAR(100)`, Default: `'general'`)  # past_paper, marking_scheme, resource_book, syllabus, general
- **`is_private_rag_vault`** (`BOOLEAN`, Default: `FALSE`)  # Excludes material from student RAG queries
- **`file_path`** (`VARCHAR(500)`, Nullable)
- **`content`** (`TEXT`, Nullable)
- **`extracted_text`** (`TEXT`, Nullable)  # OCR or Whisper transcription
- **`processing_status`** (`ENUM(ProcessingStatus: 'pending', 'processing', 'completed', 'failed')`)
- **`course_id`** (`INTEGER`, Foreign Key `courses.id`, Nullable)
- **`lesson_id`** (`INTEGER`, Foreign Key `lessons.id`, Nullable)
- **Relationships**: `flags` (1:M MaterialFlag), `notes` (1:M MaterialNote).

#### `student_material_progress`
Real-time material resumption and completion tracker.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`student_id`** (`INTEGER`, Foreign Key `users.id`, Not Null, Index)
- **`material_id`** (`INTEGER`, Foreign Key `materials.id`, Not Null, Index)
- **`last_position`** (`FLOAT`, Default: `0.0`)  # Video second or PDF page number
- **`is_completed`** (`BOOLEAN`, Default: `FALSE`)
- **`updated_at`** (`TIMESTAMP`, Default: `NOW()`)

#### `material_flags`
Student confusion markers on specific content timestamps or pages.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`student_id`** (`INTEGER`, Foreign Key `users.id`, Not Null, Index)
- **`material_id`** (`INTEGER`, Foreign Key `materials.id`, Not Null, Index)
- **`context`** (`VARCHAR(255)`, Not Null)  # e.g., "Timestamp 04:30" or "Page 13"
- **`comment`** (`TEXT`, Not Null)
- **`is_resolved`** (`BOOLEAN`, Default: `FALSE`)
- **`teacher_reply`** (`TEXT`, Nullable)
- **`resolved_at`** (`TIMESTAMP`, Nullable)
- **`created_at`** (`TIMESTAMP`, Default: `NOW()`)

---

### 2.3. Domain 3: A/L Examination Engine

#### `al_exams`
National-standard examination paper.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`title`** (`VARCHAR(255)`, Not Null)
- **`description`** (`TEXT`, Nullable)
- **`exam_type`** (`ENUM(ALExamType: 'paper_1_mcq', 'paper_2_structured', 'paper_2_essay', 'paper_2', 'full_paper')`, Not Null)
- **`time_limit_minutes`** (`INTEGER`, Default: `120`)
- **`total_questions`** (`INTEGER`, Default: `50`)
- **`raw_mark_cap`** (`FLOAT`, Nullable)
- **`score_multiplier`** (`FLOAT`, Default: `1.0`)
- **`max_attempts`** (`INTEGER`, Default: `1`)
- **`is_published`** (`BOOLEAN`, Default: `FALSE`)
- **`instructions`** (`TEXT`, Nullable)
- **`difficulty_policy`** (`VARCHAR(50)`, Default: `'mixed'`)
- **`available_from`** / **`available_until`** (`TIMESTAMP`, Nullable)
- **`show_result_immediately`** (`BOOLEAN`, Default: `TRUE`)
- **`course_id`** (`INTEGER`, Foreign Key `courses.id`, Not Null)
- **`lesson_id`** (`INTEGER`, Foreign Key `lessons.id`, Nullable)
- **Relationships**: `questions` (1:M ALQuestion), `submissions` (1:M ALStudentSubmission).

#### `al_questions`
Multi-format assessment items conforming to A/L templates.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`exam_id`** (`INTEGER`, Foreign Key `al_exams.id`, Not Null)
- **`question_number`** (`INTEGER`, Not Null)
- **`template_type`** (`ENUM(ALQuestionTemplate: 'generic_mcq', 'multi_response_grid', 'five_statement_truth', 'matching_column', 'combination_grid', 'sequential_diagnostic', 'incomplete_stem', 'structured_subparts', 'essay_rubric')`)
- **`stem_text`** (`TEXT`, Not Null)
- **`diagram_url`** (`VARCHAR(500)`, Nullable)
- **`requires_image`** (`BOOLEAN`, Default: `FALSE`)
- **`image_description`** (`TEXT`, Nullable)
- **`explanation`** (`TEXT`, Nullable)
- **`points`** (`FLOAT`, Default: `1.0`)
- **`cognitive_level`** (`VARCHAR(50)`, Default: `'understand'`)
- **`difficulty`** (`VARCHAR(20)`, Default: `'medium'`)
- **`options`** (`JSON`, Nullable)  # 5 options for MCQ: ["A...", "B...", "C...", "D...", "E..."]
- **`correct_option`** (`VARCHAR(10)`, Nullable)  # "A", "B", "C", "D", "E"
- **`assertion_text`** / **`reason_text`** (`TEXT`, Nullable)
- **`statements_json`** (`JSON`, Nullable)
- **`grid_key_json`** (`JSON`, Nullable)
- **`structured_subparts_json`** (`JSON`, Nullable)
- **`essay_checklist_json`** (`JSON`, Nullable)
- **`snapshot_json`** (`JSON`, Nullable)  # Immutable snapshot at publish time

#### `al_student_submissions`
Student candidate exam attempt records.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`exam_id`** (`INTEGER`, Foreign Key `al_exams.id`, Not Null, Index)
- **`student_id`** (`INTEGER`, Foreign Key `users.id`, Not Null, Index)
- **`started_at`** (`TIMESTAMP`, Default: `NOW()`)
- **`submitted_at`** (`TIMESTAMP`, Nullable)
- **`raw_score`** (`FLOAT`, Default: `0.0`)
- **`scaled_score`** (`FLOAT`, Default: `0.0`)
- **`percentage`** (`FLOAT`, Default: `0.0`)
- **`grade`** (`VARCHAR(5)`, Nullable)  # A, B, C, S, F
- **`status`** (`VARCHAR(30)`, Default: `'in_progress'`)  # 'in_progress', 'submitted', 'ai_graded', 'teacher_verified'
- **`ai_feedback_summary`** (`TEXT`, Nullable)
- **`teacher_feedback`** (`TEXT`, Nullable)
- **`teacher_verified_at`** (`TIMESTAMP`, Nullable)
- **`finalized_by_id`** (`INTEGER`, Foreign Key `users.id`, Nullable)
- **`finalized_at`** (`TIMESTAMP`, Nullable)
- **Relationships**: `answers` (1:M ALStudentAnswer).

#### `al_student_answers`
Individual question responses and provenance scores.
- **`id`** (`INTEGER`, Primary Key, Autoincrement)
- **`submission_id`** (`INTEGER`, Foreign Key `al_student_submissions.id`, Not Null, Index)
- **`question_id`** (`INTEGER`, Foreign Key `al_questions.id`, Not Null, Index)
- **`selected_option`** (`VARCHAR(10)`, Nullable)
- **`subpart_answers_json`** (`JSON`, Nullable)
- **`essay_text_answer`** (`TEXT`, Nullable)
- **`essay_attachment_url`** (`VARCHAR(500)`, Nullable)
- **`raw_points_earned`** (`FLOAT`, Default: `0.0`)
- **`scaled_points_earned`** (`FLOAT`, Default: `0.0`)
- **`is_correct`** (`BOOLEAN`, Nullable)
- **`auto_score`** (`FLOAT`, Default: `0.0`)  # Machine deterministic score
- **`ai_score`** (`FLOAT`, Default: `0.0`)    # AI suggested score
- **`teacher_score`** (`FLOAT`, Nullable)    # Teacher override score
- **`final_score`** (`FLOAT`, Default: `0.0`)# Active score
- **`ai_checklist_results_json`** (`JSON`, Nullable)
- **`teacher_checklist_results_json`** (`JSON`, Nullable)
- **`teacher_override_points`** (`FLOAT`, Nullable)
- **`feedback_notes`** (`TEXT`, Nullable)

---

### 2.4. Domain 4: Ask AI & Q&A Moderation

#### `student_questions` & `ai_responses`
Tracks student RAG inquiries and AI responses.
- **`student_questions`**: `id`, `session_id`, `student_id`, `course_id`, `question_text`, `is_answered`, `asked_at`, `topic_category`, `course_material_id`.
- **`ai_responses`**: `id`, `student_question_id` (FK `student_questions.id`), `response_text`, `context_sources` (`JSON`), `confidence_score` (`FLOAT`), `is_flagged` (`BOOLEAN`), `teacher_correction` (`TEXT`).

#### `system_ai_configs`
Administrative AI hyperparameter repository.
- **`id`** (`INTEGER`, Primary Key)
- **`llm_provider`** (`VARCHAR(50)`, Default: `'gemini'`)
- **`llm_model`** (`VARCHAR(100)`, Default: `'gemini-2.0-flash'`)
- **`temperature`** (`FLOAT`, Default: `0.3`)
- **`max_tokens`** (`INTEGER`, Default: `1500`)
- **`confidence_threshold`** (`FLOAT`, Default: `0.70`)
- **`embedding_model`** (`VARCHAR(100)`, Default: `'all-MiniLM-L6-v2'`)
- **`chunk_size`** (`INTEGER`, Default: `500`)
- **`retrieval_top_k`** (`INTEGER`, Default: `5`)
- **`enabled_modules`** (`JSON`, Default: `{}`)

---


<a id="07-api-reference"></a>

# 07. API Reference

This document provides a comprehensive, structured reference for all primary REST endpoints across the **29 FastAPI routers** registered in the Lumora backend, based directly on the route definitions in [`backend/app/api/`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/api/).

---

## 1. Authentication & User Management (`/api/auth`, `/api/users`)

| Method | Endpoint | Auth Required | Roles | Description | Request Body / Params | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | None | Public | Authenticates credentials; returns JWT access token. | Form data: `username` (email), `password` | `{access_token, token_type, role, user_id, full_name, must_change_password}` |
| `POST` | `/api/auth/register` | None | Public | Registers a new student or teacher account. | JSON: `{email, password, full_name, role}` | User profile object |
| `GET` | `/api/auth/me` | Bearer JWT | All | Retrieves currently authenticated user profile. | None | Authenticated user profile |
| `POST` | `/api/auth/change-password` | Bearer JWT | All | Updates user password and clears `must_change_password`. | JSON: `{old_password, new_password}` | `{message: "Password updated successfully"}` |
| `GET` | `/api/users/profile` | Bearer JWT | All | Fetches user settings, email, and avatar metadata. | None | User profile entity |
| `PUT` | `/api/users/profile` | Bearer JWT | All | Updates profile details and display name. | JSON: `{full_name, profile_image}` | Updated user entity |

---

## 2. Courses, Units & Materials (`/api/courses`, `/api/units`, `/api/lessons`, `/api/materials`)

| Method | Endpoint | Auth Required | Roles | Description | Request Body / Params | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/courses` | Bearer JWT | All | Lists active courses (filtered by student enrollment or teacher ownership). | Query: `subject`, `is_active` | List of Course entities |
| `POST` | `/api/courses` | Bearer JWT | Teacher, Admin | Creates a new course container. | JSON: `{title, description, subject, is_paid_course, monthly_price}` | Created Course entity |
| `GET` | `/api/courses/{id}` | Bearer JWT | All | Fetches course details, syllabus units, and lesson hierarchy. | Path: `id` | Course entity with nested units & lessons |
| `POST` | `/api/courses/{id}/enroll` | Bearer JWT | Student | Enrolls student into course. | Path: `id` | Enrollment confirmation |
| `POST` | `/api/units` | Bearer JWT | Teacher, Admin | Adds a new syllabus unit to a course. | JSON: `{course_id, title, description, order}` | Created Unit entity |
| `POST` | `/api/lessons` | Bearer JWT | Teacher, Admin | Creates a lesson inside a unit or course. | JSON: `{course_id, unit_id, title, description, order}` | Created Lesson entity |
| `POST` | `/api/materials` | Bearer JWT | Teacher, Admin | Uploads a video, PDF, or note material. | Multipart Form: `file`, `title`, `material_type`, `category`, `lesson_id` | Created Material entity |
| `GET` | `/api/materials/{id}` | Bearer JWT | All (Enrolled) | Retrieves material metadata, extracted text, and private vault status. | Path: `id` | Material entity |
| `POST` | `/api/materials/{id}/progress` | Bearer JWT | Student | Updates student position (video second or PDF page) and completion flag. | JSON: `{last_position, is_completed}` | `{status: "success", is_completed: bool}` |
| `POST` | `/api/materials/{id}/flag` | Bearer JWT | Student | Flags a difficulty/confusion spot at a specific timestamp/page. | JSON: `{context, comment}` | Created MaterialFlag entity |
| `GET` | `/api/materials/{id}/flags` | Bearer JWT | Teacher, Admin | Retrieves all student difficulty flags for a material. | Path: `id` | List of MaterialFlag entities |
| `POST` | `/api/materials/flags/{flag_id}/reply` | Bearer JWT | Teacher, Admin | Submits teacher resolution/reply to a student flag. | JSON: `{teacher_reply, is_resolved}` | Updated MaterialFlag entity |

---

## 3. A/L Examination Engine (`/api/al-exams`, `/api/al-authoring`, `/api/al-mcq`)

| Method | Endpoint | Auth Required | Roles | Description | Request Body / Params | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/al-exams` | Bearer JWT | All | Lists A/L exam papers for a course. | Query: `course_id`, `exam_type` | List of ALExam summaries |
| `POST` | `/api/al-exams` | Bearer JWT | Teacher, Admin | Creates an A/L examination paper (Full Paper, MCQ, Structured, Essay). | JSON: `{title, exam_type, time_limit_minutes, total_questions, max_attempts, course_id}` | Created ALExam entity |
| `GET` | `/api/al-exams/{id}` | Bearer JWT | All | Retrieves full exam paper structure and questions. | Path: `id` | ALExam with ordered ALQuestions |
| `DELETE` | `/api/al-exams/{id}` | Bearer JWT | Teacher, Admin | Deletes exam with optional Question Bank cascade preservation. | Query: `delete_banked_questions=bool` | `{message: "Exam deleted successfully"}` |
| `POST` | `/api/al-exams/{id}/start` | Bearer JWT | Student | Initiates or resumes an active examination attempt. | Path: `id` | `{submission_id: N, started_at: ..., saved_answers: {...}}` |
| `POST` | `/api/al-exams/submissions/{sub_id}/autosave` | Bearer JWT | Student | Throttled background autosave of candidate answers. | JSON: `List[{question_id, selected_option, subpart_answers_json, essay_text_answer}]` | `{message: "Answers autosaved successfully"}` |
| `POST` | `/api/al-exams/submissions/{sub_id}/submit` | Bearer JWT | Student | Submits exam paper for grading (instant MCQ scoring, background AI Paper 2). | JSON: `{answers: [...]}` | Submission entity with score & status |
| `GET` | `/api/al-exams/{id}/my-submission` | Bearer JWT | Student | Fetches candidate's latest submission for this exam. | Path: `id` | ALStudentSubmission or null |
| `GET` | `/api/al-exams/my-submissions` | Bearer JWT | Student | Retrieves all candidate exam submissions across courses. | None | List of ALStudentSubmission entities |
| `GET` | `/api/al-exams/teacher/submissions` | Bearer JWT | Teacher, Admin | Lists completed submissions for teacher review (excluding unsubmitted retry drafts). | Query: `exam_id`, `status` | List of completed submissions |
| `GET` | `/api/al-exams/submissions/{sub_id}` | Bearer JWT | All (Authorized) | Fetches candidate submission script, questions, and grading scores. | Path: `sub_id` | Submission with full ALStudentAnswers |
| `POST` | `/api/al-exams/submissions/{sub_id}/verify` | Bearer JWT | Teacher, Admin | Commits teacher overrides (subpart marks, rubric checklist, custom criteria) and publishes grade. | JSON: `{answers: [{answer_id, teacher_override_points, teacher_checklist_results_json, feedback_notes}], teacher_feedback}` | Verified ALStudentSubmission entity |
| `POST` | `/api/al-authoring/generate-mcq` | Bearer JWT | Teacher, Admin | Invokes Gemini to generate Paper I MCQ questions across 7 templates. | JSON: `{topic, count, template_type, difficulty}` | List of generated ALQuestion schemas |
| `POST` | `/api/al-authoring/generate-structured` | Bearer JWT | Teacher, Admin | Invokes Gemini to generate Structured subpart question trees. | JSON: `{topic, total_points, subpart_count}` | Structured ALQuestion schema |
| `POST` | `/api/al-authoring/generate-essay` | Bearer JWT | Teacher, Admin | Invokes Gemini to generate Essay prompts and 10–15 item rubric checklists. | JSON: `{topic, max_points, criteria_count}` | Essay ALQuestion schema |

---

## 4. Psychometrics & Learning Intelligence (`/api/analytics`, `/api/al-analytics`)

| Method | Endpoint | Auth Required | Roles | Description | Request Body / Params | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/analytics/course/{course_id}/overview` | Bearer JWT | Teacher, Admin | Course-level grade distributions, pass rates, and completion KPIs. | Path: `course_id` | `AnalyticsResponseEnvelope` |
| `GET` | `/api/analytics/exam/{exam_id}/mcq` | Bearer JWT | Teacher, Admin | Item difficulty $p$, discrimination index $d$, and distractor frequencies. | Path: `exam_id` | `MCQExamAnalyticsReport` |
| `GET` | `/api/analytics/exam/{exam_id}/structured`| Bearer JWT | Teacher, Admin | Subpart hierarchy achievement rates and point loss distribution. | Path: `exam_id` | `StructuredExamAnalyticsReport` |
| `GET` | `/api/analytics/exam/{exam_id}/essay` | Bearer JWT | Teacher, Admin | Rubric criteria attainment rates and analytical depth metrics. | Path: `exam_id` | `EssayExamAnalyticsReport` |
| `GET` | `/api/analytics/course/{course_id}/learning-intelligence` | Bearer JWT | Teacher, Admin | Cross-domain analytics correlating materials, flags, Ask AI, and exam performance. | Path: `course_id` | `TeacherCourseLearningIntelligenceReport` |
| `GET` | `/api/analytics/student/{student_id}/mastery` | Bearer JWT | All (Self/Teacher)| Individual student radar mastery dimensions, cognitive depth, and risk category. | Path: `student_id` | `StudentPersonalLearningIntelligenceReport` |
| `GET` | `/api/analytics/export/csv` | Bearer JWT | Teacher, Admin | Streams CSV export of course or exam performance records. | Query: `course_id`, `exam_id` | File download (`text/csv`) |
| `GET` | `/api/analytics/export/dossier-pdf` | Bearer JWT | Teacher, Admin | Generates printable academic dossier data for student or cohort. | Query: `student_id`, `course_id` | Printable dossier JSON |

---

## 5. RAG & Ask AI Tutor (`/api/qa`, `/api/admin`)

| Method | Endpoint | Auth Required | Roles | Description | Request Body / Params | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/qa/ask` | Bearer JWT | Student | Dispatches student inquiry to ChromaDB + Gemini RAG pipeline. | JSON: `{course_id, question_text}` | `{response_text, sources: [...], confidence_score}` |
| `GET` | `/api/qa/inquiries` | Bearer JWT | Teacher, Admin | Lists all student AI inquiries with confidence flags for teacher review. | Query: `course_id`, `is_flagged` | List of StudentQuestion & AIResponse entities |
| `POST` | `/api/qa/inquiries/{id}/correct` | Bearer JWT | Teacher, Admin | Saves teacher correction to an AI tutor response. | JSON: `{teacher_correction}` | Updated AIResponse entity |
| `GET` | `/api/admin/ai-config` | Bearer JWT | Admin | Fetches global AI hyperparameters (LLM provider, model, temperature, chunk size). | None | `SystemAIConfig` entity |
| `PUT` | `/api/admin/ai-config` | Bearer JWT | Admin | Updates system-wide AI parameters. | JSON: `{llm_model, temperature, confidence_threshold, chunk_size}` | Updated `SystemAIConfig` entity |

---


<a id="08-authentication-and-authorization"></a>

# 08. Authentication and Authorization

## 1. Authentication Architecture

Lumora LMS implements stateless **JSON Web Token (JWT)** authentication using `python-jose` with the `HS256` signing algorithm, combined with salted password hashing powered by `passlib[bcrypt]` and `bcrypt 4.3.0`.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client (Browser)
    participant AuthRouter as FastAPI /api/auth
    participant DB as PostgreSQL (users table)
    participant Crypto as Bcrypt Password Context

    User->>AuthRouter: POST /api/auth/login (username, password)
    AuthRouter->>DB: Query User by email
    alt User Not Found
        AuthRouter-->>User: 401 Unauthorized (Incorrect email or password)
    else User Found
        AuthRouter->>Crypto: pwd_context.verify(password, user.hashed_password)
        alt Password Invalid
            AuthRouter-->>User: 401 Unauthorized (Incorrect email or password)
        else Password Valid
            AuthRouter->>AuthRouter: Generate JWT Token (sub=user.email, role=user.role, exp=NOW+60m)
            AuthRouter-->>User: 200 OK {access_token, token_type: "bearer", role, user_id, must_change_password}
        end
    end
```

---

## 2. Password Security & Hashing Protocols

- **Algorithm**: `bcrypt` with automatic salting managed by `passlib.context.CryptContext(schemes=["bcrypt"], deprecated="auto")`.
- **Bcrypt 4.x Compatibility**: In [`backend/main.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/main.py), a compatibility shim dynamically resolves attribute definitions:
  ```python
  if not hasattr(bcrypt, "__about__"):
      bcrypt.__about__ = type("about", (), {"__version__": getattr(bcrypt, "__version__", "4.0.0")})()
  ```
- **Forced Password Reset Protocol**:
  - The `users` table maintains a `must_change_password` boolean flag.
  - When an administrator generates a temporary password or a user's password is reset via `PasswordResetRequest`, `must_change_password` is set to `TRUE`.
  - The frontend checks this flag upon login and immediately presents the `ForcePasswordChange.tsx` modal, blocking navigation until a new password is confirmed via `POST /api/auth/change-password`.

---

## 3. Role-Based Access Control (RBAC) & Route Protection

Lumora enforces strict hierarchical role segregation across three predefined roles in `UserRole`:

| Role | Scope of Access & Authority |
| :--- | :--- |
| **`STUDENT`** | Access to enrolled courses, video/PDF learning, difficulty flagging, taking examinations, and viewing personal mastery analytics. |
| **`TEACHER`** | Full authoring rights for courses, units, lessons, materials, exam papers, SpeedGrader marking studio, Q&A moderation, and 7-tab teacher analytics. |
| **`ADMIN`** | System-wide governance, global AI hyperparameter configuration (`/api/admin/ai-config`), user account management, and audit log inspection. |

### 3.1. FastAPI Dependency Injection Guards
In [`backend/app/auth.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/auth.py), routes declare dependency constraints that execute before request handlers:

```python
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Decodes JWT, validates signature and expiration, and retrieves active User entity."""
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

def require_teacher(current_user: User = Depends(get_current_user)) -> User:
    """Enforces Teacher or Admin privilege level."""
    if current_user.role not in [UserRole.TEACHER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Teacher or Admin privileges required")
    return current_user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Enforces Admin privilege level."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator privileges required")
    return current_user
```

---

## 4. Tenant & Resource Ownership Validation

To prevent unauthorized horizontal privilege escalation (IDOR attacks), Lumora enforces strict ownership validation checks:

### 4.1. Course & Material Modification Checks
When a teacher attempts to update a course, unit, lesson, material, or examination paper, the endpoint explicitly verifies:
$$\text{course.teacher\_id} == \text{current\_user.id} \quad \lor \quad \text{current\_user.role} == \text{UserRole.ADMIN}$$
If this assertion fails, the API immediately halts execution with `HTTP 403 Forbidden: Not authorized to modify this course`.

### 4.2. Student Examination Submission Isolation
- When taking an exam, submissions are tied to `current_user.id`.
- When querying `/api/al-exams/submissions/{sub_id}`, the endpoint verifies:
  1. If `current_user.role == UserRole.STUDENT`: Asserts `submission.student_id == current_user.id`. Students can never inspect other candidates' submissions.
  2. If `current_user.role in [UserRole.TEACHER, UserRole.ADMIN]`: Asserts that the teacher owns the parent course of the examination.

### 4.3. Private Material Vault Isolation
Materials marked with `is_private_rag_vault = True` (e.g. unpublished marking schemes or future exam drafts) are strictly filtered out of student RAG queries in `al_rag_retriever.py`, preventing students from extracting confidential answers through the Ask AI Tutor.

---


<a id="09-course-and-material-system"></a>

# 09. Course and Material System

## 1. Curriculum Architecture & Content Hierarchy

Lumora organizes academic content into a 4-tier structural hierarchy:

```mermaid
graph TD
    Course[1. Course: e.g. G.C.E. A/L Biology 2026]
    Course --> Unit1[2. Unit 1: Chemistry of Life]
    Course --> Unit2[2. Unit 2: Cell Biology & Genetics]
    Course --> Unit3[2. Unit 3: Plant & Animal Physiology]
    
    Unit1 --> Lesson1[3. Lesson 1.1: Water & Biological Macromolecules]
    Unit1 --> Lesson2[3. Lesson 1.2: Enzyme Kinetics & Regulation]
    
    Lesson1 --> Mat1[4. Material: Video Lecture on Carbohydrates]
    Lesson1 --> Mat2[4. Material: NIE Resource Book PDF - Chapter 1]
    Lesson1 --> Mat3[4. Material: Interactive Summary Note]
    Lesson1 --> Mat4[4. Material: Labelled Diagram of Glucose Isomers]
```

---

## 2. Supported Material Types & Dedicated Viewing Engines

All learning materials inherit from the `Material` entity and are typed via the `MaterialType` enum in [`backend/app/models.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/models.py). The frontend utilizes a unified viewer component, [`MaterialViewer.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/MaterialViewer.tsx), which dynamically mounts format-specific viewing engines:

### 2.1. Video Materials (`MaterialType.VIDEO`)
- **Format Support**: MP4, WebM, H.264 video streams served statically via `/uploads/` with HTTP byte-range support.
- **Precision Resume Position**:
  - `hasResumedRef` prevents async metadata race conditions.
  - Video player automatically seeks to `progress.last_position` (in seconds) on mount.
  - Real-time visual pill displays `Resumed from MM:SS`.
  - Throttled position synchronization saves playback coordinates every 4 seconds during active watching.
  - Immediate sync executed on `onPause`, `onSeeked`, `onEnded`, and component unmount.
- **Automatic Completion Rule**: Video is automatically flagged as completed (`is_completed = True`) when the student watches $\ge 85\%$ of total video duration or upon triggering the `onEnded` event.

### 2.2. PDF Document Materials (`MaterialType.PDF`)
- **Format Support**: Multi-page PDF documents (NIE Resource Books, Past Paper Archives, Marking Schemes).
- **Exact Page Resumption & Hash Anchoring**:
  - Embedded `<iframe>` loads with direct page hash: `${fileUrl}#page=${currentPage}`.
  - Displays notification badge: `Resumed at Page N`.
- **Interactive Top Navigation Bar**:
  - `Prev Page` & `Next Page` controls.
  - Direct page input jumper (`Page [ 13 ]` + `Go`).
  - `Bookmark Page N` action immediately persisting current page coordinate to `student_material_progress.last_position`.
- **Background Text Extraction**: Handled asynchronously via PyMuPDF (`fitz`), populating `extracted_text` for downstream RAG vector search.

### 2.3. Note Materials (`MaterialType.NOTE`)
- **Format Support**: Rich HTML and Markdown notes created in the teacher WYSIWYG editor.
- **Completion Rule**: Automatically flagged completed upon initial student review or manually toggled via header toolbar.

### 2.4. Image & Scientific Diagram Materials (`MaterialType.IMAGE`)
- **Format Support**: High-resolution PNG, JPG, SVG scientific diagrams and anatomical illustrations.
- **Features**: Pan-and-zoom inspection, full-screen lightbox modal, and difficulty flagging.

---

## 3. Progress Tracking & Completion Calculation

### 3.1. Persistence Model (`student_material_progress`)
Every interaction with a learning asset is recorded in `student_material_progress`:
- `student_id`: Target candidate.
- `material_id`: Target learning asset.
- `last_position`: Exact playback second (Video) or active page number (PDF).
- `is_completed`: Boolean completion attainment status.
- `updated_at`: Timestamp of latest interaction.

### 3.2. Unit Progress Fractions
In [`backend/app/api/analytics.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/api/analytics.py), unit completion is aggregated per student:
$$\text{Unit Completion Fraction} = \frac{\sum \text{Completed Materials in Unit}}{\text{Total Materials in Unit}}$$
- Rendered in the Student Course Outline ([`/dashboard/student/courses/[id]`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/courses/%5Bid%5D/page.tsx)) as color-coded badges:
  - `badge-success` (Green): `3/3 Completed` ($100\%$)
  - `badge-info` (Blue): `2/3 Completed` ($>0\%$)
  - `badge-secondary` (Gray): `0/3 Completed` ($0\%$)

### 3.3. Lesson Status Lifecycle
1. **`Reviewed`** (Green `check-circle`): All materials inside the lesson are marked `is_completed = True`.
2. **`Engaging`** (Blue `book-open`): Student has started watching/reading (`last_position > 0` or partial materials completed).
3. **`Not Reviewed`** (Gray `clock`): Student has not initiated any materials in the lesson.

---

## 4. Contextual Difficulty Flagging & Hotspots

Students can flag specific difficulty points directly within `MaterialViewer.tsx`:
1. **Student Context Capture**: Student clicks "Flag Difficult Spot"; the modal automatically captures the active video timestamp (e.g. `12:45`) or PDF page (e.g. `Page 7`) into `material_flags.context`.
2. **Teacher Notification & Moderation**: Teachers view all flags on the material and analytics hotspot heatmaps.
3. **Teacher Resolution**: The instructor provides a clarifying explanation (`teacher_reply`), setting `is_resolved = True`, which notifies the student.

---


<a id="10-student-learning-system"></a>

# 10. Student Learning System

## 1. Student Experience Overview

The Lumora Student Learning System provides an integrated, distraction-free digital classroom environment designed to support continuous study, precision content resumption, contextual confusion flagging, and AI-assisted tutoring.

```mermaid
graph TD
    Student[Authenticated Student] --> Dashboard[/dashboard/student]
    Dashboard --> CourseCatalog[/dashboard/student/browse]
    Dashboard --> EnrolledCourse[/dashboard/student/courses/id]
    Dashboard --> ExamHub[/dashboard/student/al-exams]
    Dashboard --> AskAITutor[/dashboard/student/ask]
    Dashboard --> PersonalMastery[/dashboard/student/analytics]

    subgraph Classroom Learning Flow
        EnrolledCourse --> UnitOutline[Unit Accordion with Completion Fractions: 2/3 Completed]
        UnitOutline --> LessonView[/dashboard/student/courses/id/lessons/lessonId]
        LessonView --> MaterialViewer[MaterialViewer: Video / PDF / Note / Image]
        
        MaterialViewer -->|Play Video| ResumeSync[Auto-Resume exact second + 4s periodic save]
        MaterialViewer -->|Read PDF| PageSync[Auto-Navigate #page=N + Bookmark Page]
        MaterialViewer -->|Flag Difficulty| FlagModal[Contextual Difficulty Flag: Timestamp/Page + Note]
        MaterialViewer -->|Take Private Notes| NoteModal[Material Note Persistence]
        MaterialViewer -->|Toggle Status| CompleteAction[Mark Completed / 85% Auto-Complete]
    end
```

---

## 2. Learning Classroom & Telemetry Flow

### 2.1. Navigating Course & Unit Structure
- **Outline View**: On [`/dashboard/student/courses/[id]`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/courses/%5Bid%5D/page.tsx), students see all units with completion fraction badges (e.g. `3/3 Completed`).
- **Lesson Indicators**: Each lesson displays its real-time engagement status:
  - `Reviewed` (Green badge): All materials completed.
  - `Engaging` (Blue badge): In progress.
  - `Not Reviewed` (Gray badge): Untouched.

### 2.2. Interacting with Learning Assets
When opening a lesson ([`/dashboard/student/courses/[id]/lessons/[lessonId]`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/courses/%5Bid%5D/lessons/%5BlessonId%5D/page.tsx)), the page loads the [`MaterialViewer.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/MaterialViewer.tsx) workspace:

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant Viewer as MaterialViewer Component
    participant API as FastAPI /api/materials
    participant DB as PostgreSQL (student_material_progress)

    Student->>Viewer: Opens Lesson Material
    Viewer->>API: GET /api/materials/{id}
    API-->>Viewer: Material details + progress {last_position: 270, is_completed: false}
    
    alt Video Material
        Viewer->>Viewer: Seeks videoRef.currentTime = 270s (Displays "Resumed from 04:30")
        loop During Playback
            Viewer->>API: POST /api/materials/{id}/progress {last_position: currentTime, is_completed} (Throttled 4s)
            API->>DB: Upsert student_material_progress
        end
    else PDF Material
        Viewer->>Viewer: Sets iframe.src = fileUrl#page=13 (Displays "Resumed at Page 13")
        Student->>Viewer: Clicks "Bookmark Page 13" / "Next Page"
        Viewer->>API: POST /api/materials/{id}/progress {last_position: 13, is_completed}
        API->>DB: Upsert student_material_progress
    end
```

---

## 3. In-Context Learning Support Systems

### 3.1. Material Difficulty Flagging
- **Trigger**: Student clicks the "Flag Difficulty" button in the material viewer toolbar.
- **Context Pinned**: The modal automatically records the exact playback second (e.g., `Timestamp 12:45`) or PDF page (`Page 7`).
- **Submission**: Persisted to `material_flags` via `POST /api/materials/{id}/flag`.
- **Feedback Loop**: When the instructor responds, the resolved flag displays the teacher's guidance note in the student's material view.

### 3.2. Private Note-Taking
- Students can write private rich-text notes attached to specific materials via `POST /api/materials/{id}/notes`, stored in `material_notes`. Notes persist across sessions and are accessible on subsequent visits.

### 3.3. RAG-Grounded Ask AI Tutor (`/dashboard/student/ask`)
- Students can ask questions regarding syllabus concepts. The system queries ChromaDB embeddings of course materials and provides verified answers with source citations.

### 3.4. Personal Mastery Dossier (`/dashboard/student/analytics`)
- Displays an individual mastery report featuring:
  - **Radar Mastery Chart**: Visualizes proficiency across all syllabus units.
  - **Cognitive Balance Chart**: Compares performance across Remember, Understand, Apply, Analyze, and Evaluate items.
  - **Recent Exam Results**: Displays verified marks and letter grades (`A`, `B`, `C`, `S`, `F`).
  - **AI Study Recommendations**: Suggests specific lessons or materials requiring revision based on low assessment scores.

---


<a id="11-examination-system"></a>

# 11. Examination System: National A/L Assessment Architecture

## 1. National Examination Standards & Paper Archetypes

Lumora is specifically engineered to support the exact assessment structures defined by the **Sri Lankan Department of Examinations** for the **G.C.E. Advanced Level Examination**. The system natively models four distinct paper archetypes:

```mermaid
graph TD
    Exam[G.C.E. Advanced Level Examination]
    Exam --> FullPaper[Full Examination Paper: Composite Paper I + Paper II]
    Exam --> Paper1[Paper I: Multiple Choice Questions - MCQ]
    Exam --> Paper2A[Paper II-A: Structured Essay Questions]
    Exam --> Paper2B[Paper II-B: Extended Analytical Essay Questions]

    subgraph Full Paper Specifications
        FullPaper --> FP_Stages[Multi-Stage: Paper I -> Breather Transition -> Paper II]
        FullPaper --> FP_Time[300 Minutes Combined: 120m P1 + 180m P2]
        FullPaper --> FP_Scoring[Standard Weighted Composite: 100% Scale]
    end

    subgraph Paper I Specifications
        Paper1 --> P1_Count[50 Questions • 5 Options A-E]
        Paper1 --> P1_Time[120 Minutes Duration]
        Paper1 --> P1_Score[Raw: 50 pts • Standard: 100% • Auto-Scored]
        Paper1 --> P1_Templates[7 Specialized Question Templates]
    end

    subgraph Paper II-A Specifications
        Paper2A --> P2A_Count[4 Compulsory Structured Questions]
        Paper2A --> P2A_Time[180 Minutes Combined with Part B]
        Paper2A --> P2A_Score[Raw: 160 pts • Scaled: 100 pts Multiplier 2.5]
        Paper2A --> P2A_Hierarchy[Multi-Tiered Subparts a, i, ii + Dotted Line Constraints]
    end

    subgraph Paper II-B Specifications
        Paper2B --> P2B_Count[3 Extended Analytical Essays]
        Paper2B --> P2B_Score[Raw: 120 pts • Scaled: 100 pts Multiplier 4.0]
        Paper2B --> P2B_Rubric[10-15 Item Criteria Rubric + Diagram Attachments]
    end
```

---

## 2. Detailed Paper Archetype Specifications

### 2.1. Full Examination Paper (`full_paper` / `full_exam`)
- **Structure**: Complete composite evaluation incorporating Paper I (MCQ items 1–50) and Paper II (Structured questions 1–4 and Essay questions 5–8).
- **Execution Flow**:
  1. **Phase 1 (Paper I)**: Candidate attempts the 50 MCQs.
  2. **Phase 2 (Breather / Transition)**: Candidate submits Paper I and views the section transition screen preparing for written evaluation.
  3. **Phase 3 (Paper II)**: Candidate attempts structured subpart questions and rich-text essay responses.
- **Teacher Marking Studio Integration**: In the Marking Studio, full papers present interactive section tabs (`All Sections`, `Paper I — MCQ`, `Paper II-A — Structured`, `Paper II-B — Essay`) for grading ease.
- **Attempt & Retake Controls**: Governed by `max_attempts` policy (default: 1, configurable up to unlimited retakes). Active in-progress retry attempts remain private to the student until submitted.

### 2.1. Paper I: Multiple Choice Questions (50 Items)
- **Question Structure**: 50 items, each presenting 5 distinct alternatives (A, B, C, D, E).
- **Template Diversity** (`ALQuestionTemplate`):
  1. `generic_mcq`: Direct factual recall and concept application.
  2. `multi_response_grid`: Combination grid format for Q41–Q50 (e.g. `(1) a,b correct`, `(2) a,c,d correct`, `(3) c,d correct`, etc.).
  3. `five_statement_truth`: Five discrete assertions evaluated for True/False combinations.
  4. `matching_column`: Two-column matrix matching concepts to functions/definitions.
  5. `combination_grid`: Multi-variable selection tables.
  6. `sequential_diagnostic`: Biological pathways and deduction sequences.
  7. `incomplete_stem`: Sentence completion with numerical/chemical parameters.
- **Evaluation**: 100% deterministic auto-grading matching `selected_option` against `correct_option`.

### 2.2. Paper II-A: Structured Questions (4 Questions • 160 Maximum Marks)
- **Question Structure**: 4 multi-part questions covering major syllabus modules.
- **Academic Hierarchy**:
  - Main question stem with optional experimental diagram or apparatus.
  - Subpart nodes labeled hierarchically: Part `(a)` $\rightarrow$ Subpart `(i)` $\rightarrow$ Nested `(A)`.
  - Allocated line count constraint and maximum point cap per leaf subpart (typically 2–6 points).
- **Evaluation**: Student submits text for each subpart. Evaluated via SpeedGrader with AI point recommendations and teacher overrides.

### 2.3. Paper II-B: Analytical Essay Questions (3 Questions • 120 Maximum Marks)
- **Question Structure**: 3 comprehensive essay prompts requiring deep scientific exposition and labelled anatomical/physiological drawings.
- **Marking Scheme Rubric**:
  - Each essay is defined with 10–15 discrete marking criteria items (e.g., `Criterion #1: Accurate definition of chemiosmosis (+4.0 pts)`).
  - Students submit rich text scripts and optional image uploads for hand-drawn biological diagrams.
- **Evaluation**: AI pre-grader scans text against rubric criteria, outputting checklist attainment flags (`AI: ✓ Detected`). The teacher confirms or modifies checks in the Marking Studio.

---

## 3. Examination Lifecycle & States

Every assessment paper progresses through an audited lifecycle in `al_student_submissions.status`:

```mermaid
stateDiagram-v2
    [*] --> in_progress: Student clicks Start Examination Now
    in_progress --> in_progress: Autosaves answers periodically
    in_progress --> submitted: Student submits or timer expires
    
    submitted --> ai_graded: Automated deterministic / AI pre-evaluation completes
    ai_graded --> teacher_verified: Teacher reviews in Marking Studio & publishes grade
    teacher_verified --> teacher_verified: Teacher saves grade revision if re-marked
    
    teacher_verified --> [*]: Grade finalized & visible in Student Dossier
```

---

## 4. Standardized Grading Scale & Score Calculation

The final examination mark is calculated and assigned a G.C.E. A/L standard letter grade:

$$\text{Final Percentage } P = \left( \frac{\text{Scaled Points Earned}}{\text{Maximum Possible Points}} \right) \times 100$$

### Official A/L Grade Boundaries
| Grade | Descriptor | Percentage Boundary ($P$) | Visual Indicator |
| :--- | :--- | :--- | :--- |
| **`A`** | **Distinction** | $P \ge 75.0\%$ | Green (`#10B981`) |
| **`B`** | **Very Good Pass** | $65.0\% \le P < 75.0\%$ | Blue (`#2563EB`) |
| **`C`** | **Credit Pass** | $55.0\% \le P < 65.0\%$ | Purple (`#8B5CF6`) |
| **`S`** | **Ordinary Pass** | $35.0\% \le P < 55.0\%$ | Amber (`#F59E0B`) |
| **`F`** | **Failure** | $P < 35.0\%$ | Red (`#EF4444`) |

---


<a id="12-exam-generation-and-question-bank"></a>

# 12. Exam Generation and Question Bank

## 1. Exam Authoring & Question Bank Architecture

Lumora provides a dual authoring ecosystem enabling teachers to construct national-standard assessment papers either through manual authoring or via **Google Gemini AI generation** adhering strictly to A/L syllabus blueprints.

```mermaid
graph TD
    Teacher[Teacher / Curriculum Designer] --> AuthoringHub[/dashboard/teacher/al-exams/create]
    AuthoringHub --> ManualDrafting[Manual Question Authoring Form]
    AuthoringHub --> AIGenerator[Gemini AI Question Generator]
    AuthoringHub --> QuestionBankPool[Question Bank Repository]

    subgraph AI Generation Pipeline
        AIGenerator --> MCQGen[al_mcq_generator.py: 7 Templates]
        AIGenerator --> StructGen[al_structured_generator.py: Subpart Trees]
        AIGenerator --> EssayGen[al_essay_generator.py: Rubric Checklists]
        
        MCQGen --> GeminiAPI[Google Gemini 2.0 Flash]
        StructGen --> GeminiAPI
        EssayGen --> GeminiAPI
    end

    subgraph Question Bank Repository
        ManualDrafting --> BankDB[(al_questions & question_pools)]
        GeminiAPI --> BankDB
        BankDB --> ExamAssembly[Exam Assembly & Publishing Engine]
        ExamAssembly --> PublishedExam[al_exams: Published Paper]
    end
```

---

## 2. AI Question Generation Pipelines

Located in [`backend/app/services/`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/), specialized generator services handle format-specific generation constraints:

### 2.1. Paper I MCQ Generator (`al_mcq_generator.py`)
- **Supported Formats**: 7 templates (`generic_mcq`, `multi_response_grid`, `five_statement_truth`, `matching_column`, `combination_grid`, `sequential_diagnostic`, `incomplete_stem`).
- **Prompt Structure**:
  - Requires exactly 5 options (A, B, C, D, E).
  - Explicitly commands the LLM to generate believable, plausible non-functional distractors and provide step-by-step scientific explanations for the correct key.
  - Classifies Bloom's cognitive level (`remember`, `understand`, `apply`, `analyze`, `evaluate`) and estimated completion time.

### 2.2. Paper II-A Structured Generator (`al_structured_generator.py`)
- **Structure**: Generates a main clinical/experimental stem followed by a multi-level subpart hierarchy.
- **Output JSON Schema**:
  ```json
  {
    "stem_text": "An investigation was conducted on the rate of photosynthesis in Hydrilla...",
    "diagram_url": null,
    "requires_image": false,
    "structured_subparts_json": [
      {
        "id": "q1_a",
        "part": "(a)",
        "prompt": "State two environmental factors kept constant during this experiment.",
        "max_points": 2.0,
        "lines": 2,
        "expected_keywords": ["temperature", "carbon dioxide concentration"]
      },
      {
        "id": "q1_b_i",
        "part": "(b)(i)",
        "prompt": "Explain the biochemical mechanism responsible for oxygen evolution.",
        "max_points": 4.0,
        "lines": 4,
        "expected_keywords": ["photolysis of water", "photosystem II", "manganese cluster"]
      }
    ]
  }
  ```

### 2.3. Paper II-B Essay Generator (`al_essay_generator.py`)
- **Structure**: Generates an extended analytical prompt accompanied by an explicit 10–15 item marking scheme checklist.
- **Output JSON Schema**:
  ```json
  {
    "stem_text": "Describe the structural adaptations of the human nephron for urine formation.",
    "points": 40.0,
    "essay_checklist_json": [
      {"item_number": 1, "criterion_text": "State structure and podocyte arrangement of Bowman's capsule", "max_points": 4.0},
      {"item_number": 2, "criterion_text": "Explain counter-current multiplier mechanism in Loop of Henle", "max_points": 4.0},
      {"item_number": 3, "criterion_text": "Detail ADH action on aquaporin-2 in collecting ducts", "max_points": 4.0}
    ]
  }
  ```

---

## 3. Question Bank & Pool Management

### 3.1. Reusable Question Repository
Questions marked with `is_banked = True` in `al_questions` reside in the central **Question Bank** ([`/dashboard/teacher/question-bank`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/question-bank/page.tsx)). Teachers can filter questions by topic, cognitive level, template type, and difficulty, and assemble new practice papers or midterm examinations directly from the repository.

### 3.2. Safe Exam Deletion with Question Preservation
When an instructor deletes an examination on [`/dashboard/teacher/al-exams`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/al-exams/page.tsx), the system presents an interactive **Exam Deletion Modal**:
- **Keep Questions in Question Bank (Recommended)** (`delete_banked_questions = false`): Removes the assessment container while keeping all individual question items banked for future exam creation.
- **Permanently Delete Questions** (`delete_banked_questions = true`): Cascades deletion across both the exam and banked question records.

### 3.3. Scientific Symbol Picker Modal
To facilitate mathematical and chemical notation without requiring LaTeX knowledge, authoring forms embed the [`ScientificSymbolPickerModal.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/al-exams/ScientificSymbolPickerModal.tsx), offering categorized Unicode symbols (Greek letters $\alpha, \beta, \gamma, \Delta$, arrows $\rightarrow, \rightleftharpoons, \uparrow$, math $\pm, \times, \div, \le, \ge$, chemical ions $\text{H}^+, \text{OH}^-, \text{ATP}, \text{NADPH}$).

---


<a id="13-student-exam-execution"></a>

# 13. Student Exam Execution & Attempt Lifecycle

## 1. Examination Workstation Lifecycle

The student examination experience in [`frontend/src/app/dashboard/student/al-exams/[id]/page.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/al-exams/%5Bid%5D/page.tsx) is structured into a proctored multi-phase lifecycle:

```mermaid
graph TD
    ExamStudio[Exam Studio KPI Cards] -->|Attempt Paper| Landing[1. Examination Landing & Policy Briefing]
    Landing -->|Start Exam| LiveEngine[2. Live Examination Workstation]
    LiveEngine -->|Periodic Autosave| SaveLoop[3. Background Payload Autosave]
    LiveEngine -->|Finish Paper I in Full Exam| Breather[4. Section Breather Screen]
    Breather -->|Start Paper II| LiveEngine
    LiveEngine -->|Timer Expired or Final Submit| Submission[5. Submission Finalization & Receipt]
    Submission -->|View Past Attempts / Review| ReviewMode[6. Verified Script & Feedback Review]

    subgraph Live Workstation Components
        LiveEngine --> Timer[Countdown Timer with Expiry Alert]
        LiveEngine --> HeaderNav[Sticky Taking Header with Exit to Exam Studio]
        LiveEngine --> SectionTabs[Section Nav: Paper I / Paper II-A / Paper II-B]
        LiveEngine --> NavSidebar[50-Question Quick Jump Matrix]
        LiveEngine --> MCQArea[MCQ 5-Option & Combination Grid Selector]
        LiveEngine --> StructArea[Structured Subpart Dotted-Line Answer Boxes]
        LiveEngine --> EssayArea[Essay Rich Editor + Diagram Upload]
        LiveEngine --> SymbolTool[Scientific Symbol Picker Tool]
    end
```

---

## 2. Exam Studio KPI Cards & Attempt State Machine

In [`frontend/src/app/dashboard/student/al-exams/page.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/al-exams/page.tsx), each examination card dynamically adapts its action buttons based on candidate progress and paper retake policies:

| Candidate State | Visual Indicator | Primary Action | Secondary Action |
| :--- | :--- | :--- | :--- |
| **Not Yet Attempted** | Standard Card | **`Attempt Paper →`** | — |
| **In-Progress Active Draft** | Amber box: `Active In-Progress Session` | **`Continue Paper`** (resumes saved draft) | `Past (N)` (if past completed attempts exist) |
| **Completed (Retakes Available)** | Last attempt score & grade badge | **`Retake Exam`** (passes `?retake=true`) | **`View Past Attempts`** (opens History Modal) |
| **Completed (Max Attempts Reached)** | Last attempt score & grade badge | `Max Attempts Reached` badge | **`View Past Attempts`** (opens History Modal) |

---

## 3. Past Attempts History Modal & Script Review Routing

When a candidate clicks **`View Past Attempts`**:
1. A modal dialog opens displaying all recorded attempts sorted chronologically (Attempt #1, Attempt #2, etc.).
2. Each entry displays:
   - Submission date and timestamp.
   - Status badge (`Teacher Verified`, `AI Evaluated`, `Awaiting Review`, `In Progress`).
   - Earned score, percentage, and letter grade badge (`Grade A`, `Grade B`, etc.).
   - Action button:
     - For completed attempts: **`View Results`** linking directly to `/dashboard/student/al-exams/[id]?submissionId={sub.id}`.
     - For active drafts: **`Resume Paper`** linking to `/dashboard/student/al-exams/[id]`.
3. In [`[id]/page.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/al-exams/%5Bid%5D/page.tsx), the page reads `useSearchParams().get("submissionId")` to load and render the exact historical attempt in full review mode without forcing the student back into an active exam session.

---

## 4. Live Answering Workspaces by Paper Type

### 4.1. Full Examination Paper (`full_paper`)
- Candidate starts with Paper I (MCQ items 1–50).
- Upon completing Paper I, the workstation transitions to the **Section Breather Screen**:
  - Displays Paper I completion receipt.
  - Briefs student on Paper II instructions, duration, and question allocation.
  - Launches Paper II (Structured subparts & Essay questions) upon candidate confirmation.

### 4.2. Paper I (MCQ) Answering Workspace
- **Layout**: Clean item stem rendering with diagram support.
- **5-Option Selector**: Five radio buttons labeled `(A)`, `(B)`, `(C)`, `(D)`, `(E)`.
- **Combination Grid Selector** (`CombinationGridSelector.tsx`): For Q41–Q50 multi-response items, an interactive visual key mapping statements $a, b, c, d$ directly to the canonical 1–5 response options.

### 4.3. Paper II-A (Structured) Answering Workspace
- Handled by [`StudentStructuredQuestionRenderer.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/assessments/StudentStructuredQuestionRenderer.tsx).
- **Academic Tree Representation**: Displays hierarchical subpart labels (`(a)`, `(i)`, `(ii)`).
- **Input Constraints**: Provides discrete dotted-line answer textboxes matching physical exam paper conventions.
- **Symbol Insertion**: Injects Greek letters and scientific notations directly into the active cursor position.

### 4.4. Paper II-B (Essay) Answering Workspace
- Handled by [`StudentEssayRichAnswerArea.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/assessments/StudentEssayRichAnswerArea.tsx).
- **Rich Text Area**: Expansive text container with real-time word counter (`N words`), line spacing (`1.8`), and autosave indicator.
- **Scientific Diagram Upload**: Allows students to photograph/scan hand-drawn biological diagrams and attach the image directly to their essay submission (`essay_attachment_url`).

---

## 5. Continuous Autosave & Submission Finalization

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant UI as Exam Engine Frontend
    participant API as FastAPI /api/al-exams
    participant DB as PostgreSQL

    Student->>UI: Selects option / Types text in question
    UI->>UI: Updates local React state
    
    rect rgb(240, 248, 255)
        note right of UI: Background Autosave Throttled
        UI->>API: POST /api/al-exams/submissions/{sub_id}/autosave
        API->>DB: Upsert ALStudentAnswer
        DB-->>API: 200 OK
        API-->>UI: Displays "Saved ✓" indicator
    end

    Student->>UI: Clicks "Submit Examination Paper" (or timer reaches 00:00)
    UI->>API: POST /api/al-exams/submissions/{sub_id}/submit
    API->>DB: Update ALStudentSubmission (status='submitted', submitted_at=NOW())
    
    API->>API: Execute Deterministic MCQ Auto-Scoring (<10ms)
    API->>DB: Commit auto_score to ALStudentAnswer & ALStudentSubmission
    
    API-->>UI: 200 OK {status: "submitted", raw_score, percentage}
    UI->>Student: Renders Official Submission Receipt & Score Breakdown
```

---


<a id="14-grading-and-marking-studio"></a>

# 14. Grading and Marking Studio

## 1. Grading Lifecycle & Human-in-the-Loop Architecture

Lumora implements a **Human-in-the-Loop SpeedGrader & Verification Studio** where automated algorithms and Gemini LLMs perform preliminary scoring, while educators retain 100% authority to review, override, and officially certify student marks.

```mermaid
stateDiagram-v2
    [*] --> in_progress: Student Attempt Active (Excluded from Teacher Queue)
    in_progress --> submitted: Student Submits Examination
    
    state "Automated Evaluation Engine" as AutoEval {
        submitted --> DeterministicMCQ: Paper I (Deterministic Key Matching <10ms)
        DeterministicMCQ --> AIPreGrade: Paper II-A / II-B (Background Gemini Semantic Evaluation)
        AIPreGrade --> ai_graded: Checklist & Scores Populated
    }
    
    state "Teacher Marking Studio" as Studio {
        ai_graded --> ReviewCandidate: Teacher Opens Submission in Marking Studio
        ReviewCandidate --> SectionNavigation: Navigate via Section Tabs (All / P1 / P2-A / P2-B)
        SectionNavigation --> SubpartOverrides: Override Individual Structured Subpart Marks
        SectionNavigation --> CustomCriteria: Add Custom Rubric Points & Criteria
        SectionNavigation --> AcceptAllAI: 1-Click Accept All AI Recommendations
        SubpartOverrides --> PublishGrade: Commit Final Verification
        CustomCriteria --> PublishGrade: Commit Final Verification
        AcceptAllAI --> PublishGrade: Commit Final Verification
    }
    
    PublishGrade --> teacher_verified: Status Updated & Published to Student
    teacher_verified --> [*]
```

---

## 2. Multi-Tiered Score Traceability Architecture

Every question answer in `al_student_answers` maintains an immutable 4-stage audit trail:

| Field | Description | Calculation / Generation Origin |
| :--- | :--- | :--- |
| **`auto_score`** | Deterministic Machine Score | Computed instantly for MCQs ($1.0$ if `selected_option == correct_option`, else $0.0$). |
| **`ai_score`** | AI Pre-Grading Recommendation | Computed by `al_marking_service.py` via Gemini semantic evaluation of structured subparts or essay rubrics. |
| **`teacher_score`** | Teacher Manual Override | Explicit points entered by the teacher in the Marking Studio drawer. Overrides `ai_score`. |
| **`final_score`** | Active Certified Score | Set to `teacher_score` if present; otherwise defaults to `ai_score` (for written) or `auto_score` (for MCQ). |

---

## 3. Teacher Marking Studio & SpeedGrader Features

Located at [`frontend/src/app/dashboard/teacher/al-exams/grade/[submissionId]/page.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/al-exams/grade/%5BsubmissionId%5D/page.tsx), the Marking Studio provides advanced grading workstations:

### 3.1. Full Examination Paper Section Navigation
- For composite full exams (`full_paper` / `full_exam`), the workstation provides interactive section pills:
  - **All Sections**: Continuous vertical review of the complete candidate script.
  - **Paper I — MCQ (N questions)**: Evaluates multiple choice answers, highlighting candidate choice vs correct key.
  - **Paper II-A — Structured (N questions)**: Dotted-line written subpart answers with individual subpart mark inputs.
  - **Paper II-B — Essay (N questions)**: Two-column rich text essay review with criteria rubric checklists.

### 3.2. Structured Subpart Granular Scoring
- Renders hierarchical subpart tree labels (`(a)`, `(i)`, `(ii)`).
- Each subpart presents an independent numerical mark input (`handleUpdateSubpartMark`) bounded by that subpart's maximum point cap.
- Modifying subpart marks instantly recalculates the question-level total and updates the live examination score bar.

### 3.3. Two-Column Essay Rubric Workstation & Custom Criteria
- **Left Column (58%)**: Candidate's written essay text, formatted cleanly with pre-wrap spacing, accompanied by attached scientific diagrams.
- **Right Column (42%)**: Marking scheme checklist with interactive attainment checkboxes:
  - Displays **`AI: ✓ Detected`** purple badges on criteria recognized by Gemini.
  - Interactive checkboxes automatically update candidate points in real-time.
  - Quick **"Check All"** and **"Clear"** helper buttons.
  - **Add Custom Criterion**: Allows teachers to add ad-hoc criteria (e.g. `+2.0 pts for exceptional clarity of thermodynamic cycle explanation`) directly into the candidate's marking scheme.

### 3.4. Wide Focus Studio & Typography
- **Layout Switcher**: Toggle between **Wide Reading Studio (1560px max-width)** and **Standard Layout (1280px)** for high-resolution grading monitors.
- **Enhanced Typography**: `1.8` line spacing, word count badge (`N words`), and dynamic font size toggles (`A-` / `A+`).

### 3.5. Rapid AI Recommendation Adoption
- **"Accept All AI Recommendations"**: Header action adopting all AI suggested scores and rubric checklist selections across the entire exam in a single click.
- **Per-Question "Accept AI Score (X pts)"**: Quick button on individual question cards to adopt suggested points instantly.

### 3.6. Zen Focus Mode & Diagram Lightbox
- **Zen Focus Reader**: Full-screen modal presenting student responses in high-legibility typography with floating score override inputs.
- **Diagram Lightbox**: Clicking any student diagram opens a high-resolution zoom viewer with pan controls.

### 3.7. Unsubmitted Retry Draft Protection
- The teacher submission review queue (`/api/al-exams/teacher/submissions`) strictly filters out in-progress retry drafts (`status == 'in_progress'`), ensuring that incomplete student attempts do not pollute the marking queue until the candidate officially submits.

### 3.8. Final Verification & Grade Publication
The teacher provides overall summary feedback notes and clicks **"Approve & Publish Final Grade"**, which commits `teacher_verified` status, records `teacher_verified_at`, and makes the verified mark and A/L grade (`A`, `B`, `C`, `S`, `F`) visible to the student.

---


<a id="15-analytics-and-learning-intelligence"></a>

# 15. Analytics and Learning Intelligence Engine

## 1. Analytics Architecture Overview

The Lumora Analytics and Learning Intelligence Engine comprises **18 specialized service modules** in [`backend/app/services/analytics/`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/analytics/) enforcing strict separation of statistical concerns, canonical Pydantic data contracts, and classical psychometric algorithms.

```mermaid
graph TD
    subgraph Data Sources [Database Persistence Tier]
        Submissions[(al_student_submissions & answers)]
        Progress[(student_material_progress)]
        Flags[(material_flags & hotspots)]
        AI_QA[(student_questions & ai_responses)]
    end

    subgraph Analytics Pipeline [18 Specialized Analytics Services]
        Norm[normalization.py: Data Quality & Normalization]
        MCQ_Svc[mcq_analytics.py: Difficulty p & Distractors]
        Disc_Svc[discrimination.py: Upper/Lower 27% d]
        Struct_Svc[structured_analytics.py: Subpart Trees]
        Essay_Svc[essay_analytics.py: Rubric Checklists]
        Intel_Svc[learning_intelligence.py: Cross-Domain Engine]
        Mastery_Svc[student_mastery_analytics.py: Risk & Radar]
        Report_Svc[reporting.py: Streaming CSV & PDF Dossier]
    end

    subgraph Visualization Tier [Frontend Workstations]
        TeacherWS[Teacher Analytics Workstation: 7 Panes]
        StudentDossier[Student Mastery Dossier]
        ExportEngine[CSV / PDF Export Engine]
    end

    Submissions --> Norm
    Progress --> Norm
    Flags --> Norm
    AI_QA --> Norm
    
    Norm --> MCQ_Svc
    Norm --> Disc_Svc
    Norm --> Struct_Svc
    Norm --> Essay_Svc
    Norm --> Intel_Svc
    Norm --> Mastery_Svc
    Norm --> Report_Svc

    MCQ_Svc --> TeacherWS
    Disc_Svc --> TeacherWS
    Struct_Svc --> TeacherWS
    Essay_Svc --> TeacherWS
    Intel_Svc --> TeacherWS
    Mastery_Svc --> StudentDossier
    Report_Svc --> ExportEngine
```

---

## 2. Core Psychometric & Learning Analytics Metrics

### 2.1. Item Difficulty Index ($p$-value)
- **Concept**: Measures the proportion of candidate attempts that successfully answered an assessment item correctly.
- **Mathematical Formula**:
  $$p = \frac{N_{\text{correct}}}{N_{\text{total attempts}}}$$
- **Interpretation**:
  - $p < 0.30$: **Hard Item** (High cognitive demand / potential ambiguity).
  - $0.30 \le p \le 0.70$: **Ideal Difficulty** (Optimal psychometric discrimination).
  - $p > 0.70$: **Easy Item** (Basic factual recall / mastery).
- **Backend Service**: `mcq_analytics.py` $\rightarrow$ Exposed via `GET /api/analytics/exam/{id}/mcq`.

---

### 2.2. Item Discrimination Index ($d$)
- **Concept**: Evaluates an item's ability to differentiate between high-performing and low-performing student cohorts using Classical Test Theory (Kelly's 27% Rule).
- **Mathematical Formula**:
  $$d = \frac{R_{\text{upper 27\%}} - R_{\text{lower 27\%}}}{0.27 \times N}$$
  *(where $R_{\text{upper}}$ is the number of correct responses in the top 27% total score cohort, and $R_{\text{lower}}$ is the correct count in the bottom 27% cohort).*
- **Confidence & Sample Thresholds**:
  - Requires $N \ge 10$ submissions with non-zero variance. If $N < 10$, flags `confidence: "insufficient_sample"` to prevent statistical misinterpretation.
- **Interpretation**:
  - $d \ge 0.40$: **Excellent Discrimination** (Strongly separates top from bottom students).
  - $0.20 \le d < 0.40$: **Acceptable Discrimination**.
  - $d < 0.20$: **Poor Discrimination** (Review or revise question distractors).
  - $d < 0.0$: **Defective Item** (Lower-scoring students answered correctly more frequently than top students).
- **Backend Service**: `discrimination.py` $\rightarrow$ Integrated in `MCQItemMetric`.

---

### 2.3. Non-Functional Distractor Analysis
- **Concept**: Identifies multiple-choice distractors that fail to attract candidate attention.
- **Criterion**: Any distractor option (A–E) selected by $< 5.0\%$ of candidates is flagged as `is_non_functional_distractor = True`.
- **Actionable Insight**: Recommends teachers redesign plausible misconceptions into non-functioning distractors.

---

### 2.4. Question Format Divergence
- **Concept**: Measures the performance disparity for a student or cohort across distinct assessment modalities (MCQ vs Structured vs Essay).
- **Mathematical Formula**:
  $$\Delta_{\text{format}} = |\text{Score}_{\text{MCQ}}\% - \text{Score}_{\text{Written}}\%|$$
- **Pedagogical Diagnostic**:
  - **High MCQ / Low Essay**: Student understands concepts in recognition tasks but struggles with biological terminology, analytical composition, and diagramming.
  - **Low MCQ / High Essay**: Student understands holistic narrative themes but struggles with precise detail, calculation, or combination logic.
- **Backend Service**: `learning_intelligence.py`.

---

### 2.5. Bloom's Taxonomy Cognitive Depth Index
- **Concept**: Categorizes question items across Bloom's Revised Taxonomy: Remember, Understand, Apply, Analyze, Evaluate.
- **Metric**: Evaluates mean percentage achievement per cognitive level:
  $$\text{Cognitive Achievement}_L = \frac{\sum \text{Points Earned in Level } L}{\sum \text{Max Points in Level } L} \times 100$$
- **Frontend Display**: Rendered as a multi-tier horizontal bar comparison in the Teacher Analytics Workstation.

---

### 2.6. Multi-Factor Student Academic Risk Classification
- **Concept**: Automated classification of individual students into risk categories based on composite assessment scores, lesson engagement fractions, and difficulty flags.
- **Classification Rules**:
  - **`High Risk`** (Red): Mean Assessment $< 45\%$ OR (Mean Assessment $< 55\%$ AND $> 3$ unresolved difficulty flags).
  - **`Medium Risk`** (Amber): Mean Assessment between $45\%$ and $60\%$.
  - **`On Track`** (Blue): Mean Assessment between $60\%$ and $75\%$.
  - **`High Performer`** (Green): Mean Assessment $\ge 75\%$.
- **Backend Service**: `student_mastery_analytics.py` $\rightarrow$ Displayed in Student Roster and Student Dossier.

---


<a id="16-material-insights-and-difficulty-flags"></a>

# 16. Material Insights and Difficulty Flags

## 1. Contextual Difficulty Flagging Architecture

Lumora captures granular friction points during student study by enabling candidates to pin **Difficulty Flags** to specific video seconds or PDF pages.

```mermaid
graph TD
    Student[Student in Classroom] --> Viewer[MaterialViewer: Video / PDF]
    Viewer --> FlagModal[Difficulty Flag Modal: Auto-captures 04:30 or Page 13]
    FlagModal --> API_Flag[POST /api/materials/id/flag]
    API_Flag --> DB_Flag[(material_flags table)]
    
    DB_Flag --> AnalyticsEngine[material_analytics.py: Aggregates Hotspots]
    AnalyticsEngine --> HotspotHeatmap[Material Heatmap Visualization]
    
    DB_Flag --> TeacherQueue[/dashboard/teacher/qa & Analytics Tab 4]
    TeacherQueue --> TeacherReply[POST /api/materials/flags/flag_id/reply]
    TeacherReply --> StudentNotif[Notifies Student & Displays Guidance in Viewer]
```

---

## 2. Telemetry Ingestion & Hotspot Aggregation

### 2.1. Ingestion Protocol
- **Endpoint**: `POST /api/materials/{id}/flag`
- **Payload Schema**:
  ```json
  {
    "context": "Timestamp 04:30",
    "comment": "Unclear how the electron transport chain maintains the proton gradient."
  }
  ```
- **Storage**: Persisted to `material_flags` and mirrored in `material_difficulty_hotspots`.

### 2.2. Content Friction Ratio ($F_{\text{material}}$)
In [`material_analytics.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/analytics/material_analytics.py), the engine computes a friction ratio comparing student views against total confusion flags:
$$F_{\text{material}} = \frac{N_{\text{total flags}}}{N_{\text{total views}}} \times 100$$
- **High Friction Threshold** ($F > 15\%$): Automatically flags the material in the Teacher Analytics Workstation as requiring pedagogical review, additional explanatory notes, or a follow-up live discussion.

---

## 3. Teacher Heatmap & Resolution Workflow

### 3.1. Material Heatmap Component (`MaterialHeatmap.tsx`)
Rendered in [`frontend/src/components/charts/MaterialHeatmap.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/charts/MaterialHeatmap.tsx):
- **Video Materials**: Displays a longitudinal timeline representing video duration in 30-second bins, highlighting clusters of flags with gradient intensity.
- **PDF Documents**: Displays a page-by-page bar chart indicating flag density per page.

### 3.2. Teacher Moderation & Feedback Loop
1. Instructors access flagged items via [`/dashboard/teacher/insights/hotspots`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/insights/hotspots/page.tsx) or Tab 4 (Materials) of the Teacher Analytics Workstation.
2. The teacher reviews the student's comment and submits a clarifying response via `POST /api/materials/flags/{flag_id}/reply`.
3. The flag is marked `is_resolved = True` with `resolved_at = NOW()`, resolving the hotspot in aggregate analytics and updating the student's material view.

---


<a id="17-ask-ai-and-rag-system"></a>

# 17. Ask AI and Retrieval-Augmented Generation (RAG) System

## 1. RAG Architecture & Grounding Pipeline

Lumora implements a localized, course-vault-grounded **Retrieval-Augmented Generation (RAG)** tutoring system using **ChromaDB 0.5.0**, **sentence-transformers (`all-MiniLM-L6-v2`)**, and **Google Gemini 2.0 Flash**.

```mermaid
graph TD
    subgraph Ingestion Pipeline [Background Document Vectorization]
        Doc[Course Material: PDF / Note] --> Parser[PyMuPDF Text Extractor]
        Parser --> Chunker[Text Chunker: 500 characters, 50 overlap]
        Chunker --> Embedder[sentence-transformers: all-MiniLM-L6-v2]
        Embedder --> VectorDB[(ChromaDB: course_materials collection)]
    end

    subgraph Query & Tutoring Pipeline [Student Runtime]
        Student[Student Query in Ask AI] --> API_Ask[POST /api/qa/ask]
        API_Ask --> QueryEmbed[Embed Query via all-MiniLM-L6-v2]
        QueryEmbed --> VectorSearch[ChromaDB Similarity Query: Top-5 Chunks]
        VectorDB --> VectorSearch
        
        VectorSearch --> VaultFilter{Filter is_private_rag_vault?}
        VaultFilter -->|Private Chunk| DropChunk[Discard Private Material]
        VaultFilter -->|Public Chunk| PromptAssembler[Assemble Context-Grounded Prompt]
        
        PromptAssembler --> Gemini[Google Gemini 2.0 Flash LLM]
        Gemini --> ResponseParser[Extract Answer + Citations + Confidence]
        ResponseParser --> DB_Persist[(student_questions & ai_responses)]
        ResponseParser --> StudentUI[Render Answer with Citation Chips]
    end
```

---

## 2. Document Vectorization & Vault Privacy Isolation

### 2.1. Vector Ingestion Architecture
In [`backend/app/services/vector.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/vector.py):
- Materials attached to a course are split into sliding text windows (default: `chunk_size = 500` characters with `overlap = 50`).
- Embeddings are generated using the dense 384-dimensional `all-MiniLM-L6-v2` transformer model running locally on the CPU/GPU.
- Chunks are stored in ChromaDB collections partitioned by `course_id`.

### 2.2. Vault Privacy Isolation (`is_private_rag_vault`)
Materials flagged with `is_private_rag_vault = True` (such as upcoming exam drafts or confidential marking guidelines) are tagged with `private: true` metadata. During student similarity retrieval in `al_rag_retriever.py`, private chunks are strictly omitted, guaranteeing that confidential assessment keys cannot be leaked through prompt extraction attacks.

---

## 3. Grounded Prompt Engineering & Anti-Hallucination Controls

The prompt assembly engine in [`backend/app/services/gemini_service.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/gemini_service.py) enforces strict educational grounding:

```text
You are an expert AI Tutor for the G.C.E. Advanced Level Biology curriculum.
You must answer the student's inquiry strictly and solely based on the verified curriculum excerpts provided below.

VERIFIED CURRICULUM CONTEXT:
---
[Source: NIE Resource Book - Chapter 3 | Page 45]
"The light-dependent reaction occurs in the thylakoid membranes of chloroplasts..."
---

INSTRUCTIONS:
1. Provide a scientifically precise explanation adhering to Sri Lankan A/L curriculum conventions.
2. If the answer cannot be established from the provided context, state: "This concept is not explicitly detailed in your course materials. Please consult your instructor."
3. Return source citations and a self-evaluated confidence score between 0.0 and 1.0.
```

---

## 4. Moderation & Confidence Escalation

- **Confidence Threshold**: Configured globally in `system_ai_configs.confidence_threshold` (default: `0.70`).
- **Low-Confidence Escalation**: If Gemini generates an answer with `confidence_score < 0.70` or if a student clicks "Flag AI Response", the record is marked `is_flagged = True` and escalated directly to the **Teacher Q&A Moderation Hub** ([`/dashboard/teacher/qa`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/qa/page.tsx)) for human review and correction.

---


<a id="18-qa-moderation"></a>

# 18. Q&A Moderation and Human-in-the-Loop AI Governance

## 1. Moderation Hub Overview

The **Teacher Q&A Moderation Hub** ([`/dashboard/teacher/qa`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/qa/page.tsx)) provides pedagogical oversight over the Ask AI Tutor system. It ensures that automated AI responses are reviewed, audited, and corrected whenever scientific inaccuracy or low confidence is detected.

```mermaid
graph TD
    Student[Student Inquires via Ask AI] --> AI[Gemini RAG Response]
    AI --> ConfidenceCheck{Confidence < 0.70 OR Flagged?}
    ConfidenceCheck -->|Yes| EscalatedQueue[Escalated to Teacher Q&A Queue]
    ConfidenceCheck -->|No| StandardLog[Standard Inquiry Log]
    
    EscalatedQueue --> TeacherUI[/dashboard/teacher/qa Console]
    TeacherUI --> Inspect[Teacher Inspects Question, Context & AI Text]
    Inspect --> CorrectAction[Teacher Writes Authoritative Correction]
    CorrectAction --> API_Correct[POST /api/qa/inquiries/id/correct]
    API_Correct --> DB[(ai_responses.teacher_correction)]
    DB --> StudentUI[Student Sees Teacher Verified Badge & Guidance]
```

---

## 2. Inquiries Queue & Filtering Capabilities

Instructors can filter student inquiries by:
1. **Confidence Level**: Filter for low-confidence queries ($< 70\%$) or ungrounded responses.
2. **Flagged Status**: Filter for student-reported answers (`is_flagged = True`).
3. **Course & Topic Domain**: Group by syllabus units (e.g. Unit 2: Genetics).

---

## 3. Teacher Correction Workflow

1. **Inspection**: The teacher opens an inquiry item and reviews:
   - The student's original query.
   - The retrieved curriculum chunks used by the RAG pipeline.
   - The generated AI response and confidence metric.
2. **Correction Entry**: The teacher inputs the authoritative curriculum explanation into the correction drawer.
3. **Persistence**: The update is committed via `POST /api/qa/inquiries/{id}/correct`:
   - `ai_responses.teacher_correction` is populated.
   - `ai_responses.is_flagged` is cleared.
4. **Student-Facing Visibility**: The Ask AI interface updates immediately, presenting the teacher's verified explanation highlighted with a **"Teacher Verified Correction"** badge.

---


<a id="19-student-analytics-and-profile"></a>

# 19. Student Analytics and Profile (Student Mastery Dossier)

## 1. Student Dossier Architecture

The **Student Mastery Dossier** operates in two symmetrical views:
1. **Student Personal Analytics** ([`/dashboard/student/analytics`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/analytics/page.tsx)): Private self-diagnostic portal for candidates.
2. **Teacher Student Forensic View** ([`/dashboard/teacher/analytics/student/[studentId]`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/analytics/student/%5BstudentId%5D/page.tsx)): Deep-dive diagnostic tool for instructors to evaluate individual candidates and design targeted interventions.

```mermaid
graph TD
    DataPipeline[Backend student_mastery_analytics.py] --> Endpoint[GET /api/analytics/student/student_id/mastery]
    
    Endpoint --> KPI[1. Executive Summary KPIs: Mean %, A/L Letter Grade, Risk Status]
    Endpoint --> Radar[2. Syllabus Unit Mastery Radar Chart]
    Endpoint --> Cognitive[3. Bloom's Cognitive Depth Balance Chart]
    Endpoint --> Longitudinal[4. Chronological Performance Line Chart]
    Endpoint --> Divergence[5. MCQ vs Structured vs Essay Format Divergence]
    Endpoint --> Engagement[6. Material Completion & Difficulty Flag History]
    Endpoint --> Recommendations[7. AI Study Recommendations & Weak Topic Focus]
```

---

## 2. Forensic Diagnostic Dimensions

### 2.1. Syllabus Unit Mastery Radar Chart
- **Visualization**: Multi-axis radar chart powered by `Chart.js` (`BarChart.tsx` / `DoughnutChart.tsx`).
- **Data Source**: Aggregates points earned across all exam questions mapped to specific syllabus units (e.g. Unit 1: Chemistry of Life, Unit 2: Cell Biology, Unit 3: Genetics).
- **Diagnostic Utility**: Instantly highlights asymmetrical competency (e.g., student achieves $85\%$ in Genetics but only $42\%$ in Plant Physiology).

### 2.2. Bloom's Cognitive Depth Balance
- **Visualization**: Horizontal comparative bar graph tracking mastery across 5 cognitive levels:
  $$\text{Remember} \quad \leftrightarrow \quad \text{Understand} \quad \leftrightarrow \quad \text{Apply} \quad \leftrightarrow \quad \text{Analyze} \quad \leftrightarrow \quad \text{Evaluate}$$
- **Diagnostic Utility**: Separates students who excel at rote memory from those capable of multi-step analytical problem solving.

### 2.3. Assessment Format Divergence
- Compares percentage scores across Paper I (MCQ), Paper II-A (Structured), and Paper II-B (Essay).
- Identifies candidates with strong theoretical comprehension who suffer from examination time pressure or written exposition weaknesses.

### 2.4. Material Engagement & Friction Telemetry
- Correlates material completion percentage (e.g., `85% Materials Reviewed`) with assessment outcomes.
- Displays all unresolved difficulty flags submitted by the student, allowing teachers to address specific misconceptions during 1-on-1 tutoring.

---

## 3. Student Data Isolation & Security

- **Student Role**: The backend verifies `current_user.id == requested_student_id`. Attempting to access another student's dossier yields `HTTP 403 Forbidden`.
- **Teacher Role**: Verifies that the requested student is actively enrolled in at least one course taught by the authenticated teacher.

---


<a id="20-teacher-analytics"></a>

# 20. Teacher Analytics Workstation

## 1. Workstation Architecture & The 7 Dedicated Panes

The **Teacher Analytics Workstation** ([`/dashboard/teacher/analytics`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/analytics/page.tsx)) provides educators with a 7-pane diagnostic dashboard covering cohort performance, psychometric item analysis, cross-domain intelligence, learning materials, AI interactions, student risk rosters, and academic reporting.

```mermaid
graph TD
    TeacherWS[Teacher Analytics Workstation]
    TeacherWS --> Tab1[Tab 1: Overview - Cohort KPIs & Grade Spread]
    TeacherWS --> Tab2[Tab 2: Assessments - IRT & Psychometrics p, d, Distractors]
    TeacherWS --> Tab3[Tab 3: Learning Intelligence - Cross-Domain Syntheses]
    TeacherWS --> Tab4[Tab 4: Materials - Friction Ratios & Hotspot Heatmaps]
    TeacherWS --> Tab5[Tab 5: Ask AI - Inquiries, Topics & Confidence]
    TeacherWS --> Tab6[Tab 6: Student Roster - Multi-Factor Risk Matrix]
    TeacherWS --> Tab7[Tab 7: Reports - CSV Streaming & Printable PDF Dossiers]
```

---

## 2. Comprehensive Pane Breakdown

### 2.1. Tab 1: Overview
- **Executive KPIs**: Total enrolled students, active submissions count, cohort mean score, pass rate percentage.
- **Grade Distribution Chart**: Standard A/L letter grade bar breakdown (`A`, `B`, `C`, `S`, `F`).
- **Score Distribution Curve**: Histogram binning student percentages into deciles ($0-10\%, 10-20\%, \dots, 90-100\%$).

### 2.2. Tab 2: Assessments (Psychometrics & Item Analysis)
- **Paper I (MCQ)**: Item table displaying difficulty index ($p$), discrimination index ($d$), distractor selection percentages (A–E), and non-functional distractor warnings.
- **Paper II-A (Structured)**: Subpart tree visualization highlighting average points earned and point loss rates across subparts (`(a)`, `(i)`, `(ii)`).
- **Paper II-B (Essay)**: Rubric criteria achievement rates ($10-15$ items) identifying specific biological concepts omitted by the cohort.

### 2.3. Tab 3: Learning Intelligence (Cross-Domain Correlations)
- **Format Divergence Matrix**: Correlates student MCQ performance with Essay writing ability.
- **Cognitive Depth Plot**: Compares cohort mastery across Bloom's levels (Remember, Understand, Apply, Analyze, Evaluate).
- **Longitudinal Unit Trends**: Tracks cohort performance evolution across successive assessments for each syllabus unit.

### 2.4. Tab 4: Materials & Confusion Hotspots
- **Material Performance Table**: Total views, unique viewers, completed count, and friction ratio ($F_{\text{material}}$).
- **Interactive Heatmap (`MaterialHeatmap.tsx`)**: Visualizes video timestamp flag density (30s bins) and PDF page flag clusters.

### 2.5. Tab 5: Ask AI Intelligence
- **Inquiry Volume by Syllabus Unit**: Identifies which modules generate the highest volume of student confusion queries.
- **Confidence & Grounding Distribution**: Categorizes AI tutor responses into High Confidence ($\ge 85\%$), Moderate ($70-84\%$), and Low Confidence ($< 70\%$).

### 2.6. Tab 6: Student Roster & Risk Matrix
- **Cohort Table**: Lists all enrolled candidates with individual mean percentages, completion rates, and **Multi-Factor Risk Badges** (`High Risk`, `Medium Risk`, `On Track`, `High Performer`).
- **Direct Navigation**: Clicking any student row opens their dedicated **Student Forensic Dossier** ([`/dashboard/teacher/analytics/student/[studentId]`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/analytics/student/%5BstudentId%5D/page.tsx)).

### 2.7. Tab 7: Reports & Academic Exports
- Provides one-click CSV downloads for gradebooks and item analysis, as well as print-optimized multi-page PDF dossier generation.

---


<a id="21-reporting-and-exports"></a>

# 21. Reporting and Exports

## 1. Reporting Architecture Overview

Lumora provides a dual-format academic export and reporting engine located in [`backend/app/services/analytics/reporting.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/analytics/reporting.py):
1. **Streaming CSV Data Exports**: Raw structured datasets formatted for external statistical software (SPSS, R, Excel).
2. **Printable Academic PDF Dossiers**: Formatted multi-page reports generated with `@media print` CSS stylesheet optimizations.

```mermaid
graph TD
    Teacher[Teacher / Administrator] --> ExportTab[Analytics Tab 7: Reports & Exports]
    
    ExportTab -->|Select Course / Exam| RequestCSV[GET /api/analytics/export/csv]
    ExportTab -->|Select Student / Cohort| RequestPDF[GET /api/analytics/export/dossier-pdf]
    
    subgraph Backend Reporting Engine [reporting.py]
        RequestCSV --> Streamer[StreamingResponse text/csv]
        RequestPDF --> JSONAssembler[Assemble Full Dossier JSON Payload]
    end
    
    Streamer --> CSVFile[Raw CSV Spreadsheet Download]
    JSONAssembler --> PrintView[Printable Dossier Modal]
    PrintView --> PrintEngine[Browser Print / Save to PDF @media print]
```

---

## 2. Supported Export Formats & Data Schemas

### 2.1. CSV Gradebook & Assessment Performance Export
- **Endpoint**: `GET /api/analytics/export/csv?course_id=N&type=gradebook`
- **Output Columns**:
  ```csv
  Student ID,Full Name,Email,Enrolled Date,Completed Materials %,Exam Title,Paper Type,Raw Score,Scaled Score,Percentage,Grade,Verification Status
  101,Kasun Perera,kasun@lumora.lk,2026-01-15,85.5%,2025 A/L Biology Model Paper I,paper_1_mcq,42.0,84.0,84.0%,A,teacher_verified
  ```

### 2.2. CSV Psychometric Item Analysis Export
- **Endpoint**: `GET /api/analytics/export/csv?exam_id=N&type=item_analysis`
- **Output Columns**:
  ```csv
  Question ID,Question Number,Template Type,Cognitive Level,Difficulty,Total Attempts,Correct Count,Difficulty Index (p),Discrimination Index (d),Discrimination Confidence,Option A %,Option B %,Option C %,Option D %,Option E %,Non-Functional Distractors
  501,1,generic_mcq,remember,easy,30,26,0.87,0.35,sufficient_sample,86.7%,6.7%,3.3%,3.3%,0.0%,C;D;E
  ```

### 2.3. Multi-Page Printable PDF Dossier
- **Endpoint**: `GET /api/analytics/export/dossier-pdf?student_id=N&course_id=M`
- **Print Optimization (`globals.css` `@media print`)**:
  - Automatically switches dark mode themes to clean high-contrast white backgrounds.
  - Inserts explicit CSS page breaks (`page-break-before: always`) between report sections.
  - Hides non-printable interactive navigation bars, buttons, and sidebars.
  - Renders official Lumora institutional header with timestamp and verified teacher signature blocks.

---


<a id="22-ai-integration"></a>

# 22. Artificial Intelligence Integration

## 1. AI Integration Architecture

Lumora embeds Artificial Intelligence across three core operational tiers: **Curriculum & Assessment Generation**, **Grounded Student Tutoring (RAG)**, and **SpeedGrader Pre-Evaluation**.

```mermaid
graph TD
    subgraph Operational Domains [Core AI Applications]
        AIGen[1. Assessment Generator: 7 MCQ Formats, Subparts, Rubrics]
        RAGAsk[2. Ask AI Tutor: Grounded RAG with Citation Chips]
        SpeedGrader[3. SpeedGrader: Rubric Checklist Pre-Grading]
    end

    subgraph Orchestration Layer [gemini_service.py & al_generator_service.py]
        PromptEngine[Structured Prompt Builder & Anti-Hallucination Guardrails]
        RetryEngine[Automatic Retry & JSON Schema Validator]
        FallbackEngine[Groq / LLaMA-3.3 Fallback Router]
    end

    subgraph Model & Vector Tier
        Gemini[Primary LLM: Google Gemini 2.0 Flash / Pro]
        Groq[Fallback LLM: Groq LLaMA-3.3]
        Embeddings[sentence-transformers: all-MiniLM-L6-v2]
        ChromaStore[(ChromaDB Vector Database)]
    end

    AIGen --> PromptEngine
    RAGAsk --> PromptEngine
    SpeedGrader --> PromptEngine
    
    PromptEngine --> Gemini
    Gemini -->|Timeout / Quota Error| FallbackEngine
    FallbackEngine --> Groq
    
    RAGAsk --> Embeddings
    Embeddings --> ChromaStore
    ChromaStore --> PromptEngine
```

---

## 2. Comprehensive AI Capabilities Breakdown

| Domain | Backend Module | Primary Model | Input Parameters | Output Structure & Storage |
| :--- | :--- | :--- | :--- | :--- |
| **Paper I MCQ Generation** | `al_mcq_generator.py` | `gemini-2.0-flash` | Topic, count, template type, cognitive level, difficulty. | JSON list of 5-option MCQs with correct key, distractor rationales, and Bloom's classification $\rightarrow$ `al_questions`. |
| **Paper II-A Structured Gen**| `al_structured_generator.py`| `gemini-2.0-flash` | Topic, total marks, subpart depth constraint. | Hierarchical subpart tree with prompt labels (`(a)`, `(i)`), line limits, expected keywords $\rightarrow$ `al_questions`. |
| **Paper II-B Essay Gen** | `al_essay_generator.py` | `gemini-2.0-flash` | Essay topic, syllabus unit, criteria count. | Extended prompt + 10–15 item criteria marking rubric $\rightarrow$ `al_questions`. |
| **Ask AI RAG Tutor** | `al_rag_retriever.py` | `gemini-2.0-flash` + `all-MiniLM-L6-v2` | Student query + course ID. | Grounded response text, citation chips, and confidence score ($0.0-1.0$) $\rightarrow$ `ai_responses`. |
| **SpeedGrader Pre-Grading** | `al_marking_service.py`| `gemini-2.0-flash` | Candidate essay script + diagram description + rubric checklist. | Per-criterion attainment boolean, point suggestion, and holistic feedback summary $\rightarrow$ `al_student_answers`. |
| **Document Text Extraction** | `pdf_parser.py` / `ocr.py`| PyMuPDF / pytesseract | Uploaded past paper PDF or diagram image. | Extracted plain text and syllabus headings $\rightarrow$ `materials.extracted_text`. |

---

## 3. Global AI Hyperparameter Configuration

System administrators configure AI behavior dynamically via the `system_ai_configs` table and [`/api/admin/ai-config`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/api/admin_ai.py):
- **`llm_provider`**: Provider identifier (default: `"gemini"`).
- **`llm_model`**: Active model identifier (e.g. `"gemini-2.0-flash"`, `"gemini-1.5-pro"`).
- **`temperature`**: Sampling temperature (default: `0.3` for deterministic curriculum compliance).
- **`max_tokens`**: Maximum output tokens per completion (default: `1500`).
- **`confidence_threshold`**: Minimum confidence threshold below which student inquiries are escalated to teacher moderation (default: `0.70`).
- **`embedding_model`**: Local transformer embedding model (default: `"all-MiniLM-L6-v2"`).
- **`chunk_size`**: Document splitting window size in characters (default: `500`).
- **`retrieval_top_k`**: Number of context chunks retrieved for RAG prompts (default: `5`).

---

## 4. Error Handling, Retries & Fallback Management

1. **Universal Error Classification** ([`frontend/src/lib/aiErrorClassifier.ts`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/lib/aiErrorClassifier.ts)):
   - Classifies API faults into `QUOTA_EXCEEDED`, `TIMEOUT`, `INVALID_JSON`, `CONTENT_FILTERED`, or `NETWORK_FAULT`.
   - Informs frontend alert components ([`AIGenerationErrorAlert.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/al-exams/AIGenerationErrorAlert.tsx)) with actionable recovery suggestions.
2. **Exponential Backoff**: Backend services retry failed LLM calls up to 3 times with exponential backoff before failing gracefully.
3. **Groq Fallback Engine**: If the primary Gemini endpoint encounters sustained rate limits, the system routes requests to secondary Groq LLaMA-3.3 endpoints.
4. **Credential Security**: All API keys are loaded via environment variables (`GEMINI_API_KEY`, `GROQ_API_KEY`) and are strictly redacted (`[REDACTED]`) from logs, database records, and client responses.

---


<a id="23-data-flow-and-workflows"></a>

# 23. Data Flow and Workflows

## 1. Master System Process Flows

This document details the 18 end-to-end data and operational workflows across the Lumora LMS platform, tracing the complete lifecycle from user initiation to database persistence, analytical computation, and UI rendering.

---

### Workflow 1: User Registration & Authentication
```mermaid
sequenceDiagram
    autonumber
    actor User as User (Student/Teacher)
    participant UI as Next.js /login or /register
    participant API as FastAPI /api/auth
    participant DB as PostgreSQL (users)

    User->>UI: Inputs Email, Password, Full Name, Role
    UI->>API: POST /api/auth/register (or /login)
    API->>DB: Check if email exists
    alt Registration
        API->>API: Hash password via bcrypt
        API->>DB: Insert User entity (is_active=true)
    end
    API->>API: Issue JWT Access Token (HS256)
    API-->>UI: Return JWT Token + User Metadata
    UI->>UI: Save Token in localStorage & Redirect to Dashboard
```

---

### Workflow 2: Course & Syllabus Unit Creation
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Course Builder (/dashboard/teacher/courses)
    participant API as FastAPI (/api/courses, /api/units, /api/lessons)
    participant DB as PostgreSQL

    Teacher->>UI: Creates Course "A/L Biology 2026"
    UI->>API: POST /api/courses (title, subject, teacher_id)
    API->>DB: Insert Course entity
    Teacher->>UI: Adds Unit "Unit 1: Chemistry of Life"
    UI->>API: POST /api/units (course_id, title, order=1)
    API->>DB: Insert Unit entity
    Teacher->>UI: Adds Lesson "1.1 Water & Macromolecules"
    UI->>API: POST /api/lessons (course_id, unit_id, title, order=1)
    API->>DB: Insert Lesson entity
    DB-->>UI: Returns updated curriculum tree
```

---

### Workflow 3: Material Upload & RAG Vector Ingestion
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Lesson Editor (/dashboard/teacher/courses/[id])
    participant API as FastAPI /api/materials
    participant Disk as Local Storage (uploads/)
    participant PyMuPDF as Document Parser
    participant Chroma as ChromaDB Vector Engine
    participant DB as PostgreSQL

    Teacher->>UI: Uploads Resource Book PDF (file, title, category="resource_book")
    UI->>API: POST /api/materials (Multipart Form)
    API->>Disk: Stream file to uploads/{filename}.pdf
    API->>PyMuPDF: Extract text pages asynchronously
    PyMuPDF-->>API: Extracted text stream
    API->>DB: Insert Material entity (extracted_text, file_path)
    
    alt If is_private_rag_vault == False
        API->>API: Chunk text (500 chars, 50 overlap)
        API->>Chroma: Generate embeddings (all-MiniLM-L6-v2) & Index chunks
    end
    API-->>UI: Material Published ✓
```

---

### Workflow 4: Material Viewing & Exact Position Resumption
```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant Viewer as MaterialViewer.tsx
    participant API as FastAPI /api/materials
    participant DB as PostgreSQL (student_material_progress)

    Student->>Viewer: Navigates to Lesson Material
    Viewer->>API: GET /api/materials/{id}
    API->>DB: Query Material & StudentMaterialProgress
    DB-->>Viewer: Returns Material + {last_position: 270, is_completed: false}
    
    alt Video Asset
        Viewer->>Viewer: Seeks video.currentTime = 270s (Displays "Resumed from 04:30")
        loop During Playback (Every 4s)
            Viewer->>API: POST /api/materials/{id}/progress {last_position: currentTime}
            API->>DB: Upsert student_material_progress
        end
    else PDF Document
        Viewer->>Viewer: Sets iframe #page=13 (Displays "Resumed at Page 13")
        Student->>Viewer: Clicks "Bookmark Page 13"
        Viewer->>API: POST /api/materials/{id}/progress {last_position: 13}
        API->>DB: Upsert student_material_progress
    end
```

---

### Workflow 5: Material Difficulty Flagging & Resolution
```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    actor Teacher as Teacher
    participant Viewer as MaterialViewer.tsx
    participant API as FastAPI /api/materials
    participant DB as PostgreSQL (material_flags)
    participant Hotspot as Hotspots Analytics

    Student->>Viewer: Clicks "Flag Difficulty" at Video 04:30
    Viewer->>API: POST /api/materials/{id}/flag {context: "Timestamp 04:30", comment: "..."}
    API->>DB: Insert MaterialFlag
    DB-->>Hotspot: Update view-to-flag friction ratio & heatmap
    
    Teacher->>API: GET /api/materials/{id}/flags
    API-->>Teacher: List of student confusion flags
    Teacher->>API: POST /api/materials/flags/{flag_id}/reply {teacher_reply, is_resolved: true}
    API->>DB: Update MaterialFlag (is_resolved=true, resolved_at=NOW())
    DB-->>Viewer: Notifies student & displays teacher explanation
```

---

### Workflow 6: Ask AI RAG Inquiry & Citation Rendering
```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant UI as Ask AI Tutor (/dashboard/student/ask)
    participant API as FastAPI /api/qa
    participant Vector as ChromaDB (all-MiniLM-L6-v2)
    participant LLM as Google Gemini 2.0 Flash
    participant DB as PostgreSQL

    Student->>UI: Submits Query "Explain competitive inhibition"
    UI->>API: POST /api/qa/ask {course_id, question_text}
    API->>Vector: Dense similarity query for top-5 chunks
    Vector-->>API: 5 context chunks with source metadata
    API->>API: Filter private vault chunks
    API->>LLM: Grounded Prompt with Curriculum Excerpts
    LLM-->>API: Formatted Answer + Source References + Confidence (0.92)
    API->>DB: Insert StudentQuestion & AIResponse
    API-->>UI: Returns Response + Citation Chips
    UI->>Student: Renders Answer with clickable resource links
```

---

### Workflow 7: Q&A Moderation & Human-in-the-Loop Correction
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Q&A Moderation Hub (/dashboard/teacher/qa)
    participant API as FastAPI /api/qa
    participant DB as PostgreSQL (ai_responses)

    Teacher->>UI: Inspects flagged or low-confidence (<0.70) AI inquiries
    UI->>API: GET /api/qa/inquiries?is_flagged=true
    API-->>UI: List of student questions, AI text, and context sources
    Teacher->>UI: Edits response with authoritative curriculum correction
    UI->>API: POST /api/qa/inquiries/{id}/correct {teacher_correction}
    API->>DB: Update AIResponse (teacher_correction, is_flagged=false)
    DB-->>UI: Committed ✓
```

---

### Workflow 8: A/L Exam Creation & Question Bank Assembly
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Exam Designer (/dashboard/teacher/al-exams/create)
    participant API as FastAPI (/api/al-exams, /api/al-authoring)
    participant Bank as Question Bank
    participant DB as PostgreSQL

    Teacher->>UI: Selects Paper Type "Paper I MCQ" (50 Questions)
    UI->>API: POST /api/al-exams (title, exam_type, time_limit_minutes=120)
    API->>DB: Insert ALExam entity
    
    alt Manual Bank Assembly
        Teacher->>Bank: Selects banked questions from Question Bank
        Bank->>DB: Link questions to exam
    else AI-Assisted Generation
        Teacher->>UI: Requests AI Generation for 10 Multi-Response Grid items
        UI->>API: POST /api/al-authoring/generate-mcq {template_type: "multi_response_grid"}
        API-->>UI: Return 10 generated items with distractors
        Teacher->>UI: Approves items into exam paper
        UI->>DB: Save ALQuestions
    end
```

---

### Workflow 9: Student Examination Answering & Autosave
```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant UI as Exam Engine (/dashboard/student/al-exams/[id])
    participant API as FastAPI /api/al-exams
    participant DB as PostgreSQL (al_student_answers)

    Student->>UI: Opens Exam Paper & clicks "Start Examination Now"
    UI->>API: POST /api/al-exams/{id}/start
    API->>DB: Insert ALStudentSubmission (status='in_progress')
    DB-->>UI: Returns submission_id
    
    loop During Exam (On Option Click / Keypress)
        Student->>UI: Selects Option B / Types subpart text / Attaches diagram
        UI->>API: PUT /api/al-exams/submissions/{sub_id}/answers
        API->>DB: Upsert ALStudentAnswer (selected_option, subpart_answers_json, essay_attachment_url)
        DB-->>UI: "Saved ✓"
    end
```

---

### Workflow 10: Exam Submission & Deterministic Machine Scoring
```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant UI as Exam Engine
    participant API as FastAPI /api/al-exams
    participant DB as PostgreSQL

    Student->>UI: Clicks "Submit Examination Paper"
    UI->>API: POST /api/al-exams/submissions/{sub_id}/submit
    API->>DB: Set ALStudentSubmission.status = 'submitted'
    
    API->>API: Evaluate MCQs deterministically (auto_score = 1.0 if match, else 0.0)
    API->>DB: Commit auto_score to ALStudentAnswer
    API->>DB: Update ALStudentSubmission (raw_score, scaled_score, percentage)
    
    API-->>UI: 200 OK (Submission confirmed & receipt displayed)
```

---

### Workflow 11: SpeedGrader AI Pre-Grading
```mermaid
sequenceDiagram
    autonumber
    participant Engine as Background Submission Trigger
    participant API as FastAPI (al_marking_service.py)
    participant LLM as Google Gemini 2.0 Flash
    participant DB as PostgreSQL

    Engine->>API: Trigger Pre-Grading for Submission #{sub_id}
    API->>DB: Fetch Structured & Essay Answers + Rubric Checklists
    API->>LLM: Evaluate Candidate Script against Expected Keywords & Rubric Items
    LLM-->>API: Return Attainment Flags [{"item": 1, "awarded": true, "points": 4.0}] + Feedback
    API->>DB: Update ALStudentAnswer (ai_score, ai_checklist_results_json)
    API->>DB: Update ALStudentSubmission (status='ai_graded', ai_feedback_summary)
```

---

### Workflow 12: Teacher Marking Studio Verification & Overrides
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Marking Studio (/dashboard/teacher/al-exams/grade/[submissionId])
    participant API as FastAPI /api/al-exams
    participant DB as PostgreSQL

    Teacher->>UI: Opens Candidate Submission in Wide Studio Focus (1560px)
    UI->>API: GET /api/al-exams/submissions/{sub_id}
    API-->>UI: Returns Candidate Script, AI Checklists, and Diagram Lightbox
    
    alt 1-Click Adoption
        Teacher->>UI: Clicks "Accept All AI Recommendations"
    else Fine-Grained Adjustments
        Teacher->>UI: Modifies rubric checkboxes or overrides question points
    end
    
    Teacher->>UI: Enters overall summary feedback & clicks "Approve & Publish Final Grade"
    UI->>API: POST /api/al-exams/submissions/{sub_id}/verify {overrides, teacher_feedback}
    API->>DB: Commit teacher_score, final_score, and set status='teacher_verified'
    API-->>UI: Published ✓
```

---

### Workflow 13: Student Result Review & Mastery Update
```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant UI as Personal Analytics (/dashboard/student/analytics)
    participant API as FastAPI /api/analytics
    participant DB as PostgreSQL

    Student->>UI: Opens Personal Mastery Dossier
    UI->>API: GET /api/analytics/student/{student_id}/mastery
    API->>DB: Aggregate all verified exam scores, unit mastery, and cognitive levels
    DB-->>UI: Returns Radar Mastery, Cognitive Balance, and A/L Letter Grade (A, B, C, S, F)
    UI->>Student: Renders Interactive Charts & AI Revision Guidance
```

---

### Workflow 14: Teacher Analytics Workstation Computation
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Teacher Analytics (/dashboard/teacher/analytics)
    participant API as FastAPI /api/analytics
    participant Engine as 18 Analytics Modules

    Teacher->>UI: Selects Course & Switches across 7 Tabs
    UI->>API: GET /api/analytics/course/{id}/overview (or /mcq, /structured, /essay, /learning-intelligence)
    API->>Engine: Compute CTT Difficulty p, Kelly's Discrimination d, Distractor Counts, Unit Trends
    Engine-->>API: AnalyticsResponseEnvelope with Pydantic Data Contracts
    API-->>UI: Returns Clean Statistical JSON
    UI->>Teacher: Renders Grade Distributions, Psychometric Tables, Hotspot Heatmaps, and Risk Matrix
```

---

### Workflow 15: Psychometric Item Discrimination ($d$) Pipeline
```mermaid
sequenceDiagram
    autonumber
    participant Engine as discrimination.py
    participant DB as PostgreSQL (al_student_submissions)

    Engine->>DB: Query all candidate submissions for Exam Paper
    alt Sample Size N < 10 or Zero Variance
        Engine-->>Engine: Set valid=false, confidence="insufficient_sample"
    else Sample Size N >= 10
        Engine->>Engine: Sort candidates descending by total score
        Engine->>Engine: Partition into Upper 27% and Lower 27% cohorts
        Engine->>Engine: Compute d = (Upper_Correct - Lower_Correct) / (0.27 * N)
        Engine-->>Engine: Return DiscriminationMetric (d value, confidence="sufficient_sample")
    end
```

---

### Workflow 16: Learning Intelligence Cross-Domain Synthesis
```mermaid
sequenceDiagram
    autonumber
    participant Engine as learning_intelligence.py
    participant DB as PostgreSQL

    Engine->>DB: Query Material Progress, Difficulty Flags, Ask AI Queries, and Exam Submissions
    Engine->>Engine: Compute Format Divergence (|Score_MCQ - Score_Essay|)
    Engine->>Engine: Compute Bloom's Taxonomy Cognitive Depth Achievement
    Engine->>Engine: Correlate Material Flag Density with Point Loss in Matching Units
    Engine-->>Engine: Assemble TeacherCourseLearningIntelligenceReport
```

---

### Workflow 17: CSV & Printable PDF Dossier Export
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Analytics Tab 7: Reports
    participant API as FastAPI /api/analytics/export
    participant Reporting as reporting.py

    alt CSV Export
        Teacher->>UI: Clicks "Export Gradebook CSV"
        UI->>API: GET /api/analytics/export/csv?course_id=N
        API->>Reporting: Stream CSV text buffer
        API-->>Teacher: Browser File Download (gradebook.csv)
    else Printable PDF Dossier
        Teacher->>UI: Clicks "Generate Printable Dossier"
        UI->>API: GET /api/analytics/export/dossier-pdf?student_id=N
        API->>Reporting: Assemble complete academic dossier JSON
        API-->>UI: Renders printable modal
        Teacher->>UI: Window Print / Save as PDF (@media print triggers high-contrast layout)
    end
```

---

### Workflow 18: Safe Exam Deletion with Question Bank Cascade Control
```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher
    participant UI as Exam Management (/dashboard/teacher/al-exams)
    participant API as FastAPI /api/al-exams/{id}
    participant DB as PostgreSQL

    Teacher->>UI: Clicks Delete Exam
    UI->>UI: Opens Exam Deletion Modal
    
    alt Option A: Keep Questions in Bank (Recommended)
        Teacher->>UI: Selects "Keep in Question Bank" (delete_banked_questions=false)
        UI->>API: DELETE /api/al-exams/{id}?delete_banked_questions=false
        API->>DB: Delete ALExam container; unlink questions; retain ALQuestions with is_banked=true
    else Option B: Permanently Delete Questions
        Teacher->>UI: Selects "Permanently Delete" (delete_banked_questions=true)
        UI->>API: DELETE /api/al-exams/{id}?delete_banked_questions=true
        API->>DB: Cascade delete ALExam and all child ALQuestions
    end
    
    API-->>UI: 200 OK (Exam deleted successfully)
```

---


<a id="24-security-and-data-isolation"></a>

# 24. Security and Data Isolation

## 1. Security Architecture Review

Lumora implements defense-in-depth security principles across authentication, authorization, role separation, tenant isolation, input validation, and AI prompt protection.

```mermaid
graph TD
    Request[Inbound Client Request] --> TLS[1. Transport Layer Security: HTTPS]
    TLS --> CORS[2. CORS Middleware: Origin Filtering]
    CORS --> JWT[3. JWT Authentication: Signature & Expiration]
    JWT --> RBAC[4. Role-Based Access Control: Student / Teacher / Admin]
    RBAC --> Ownership[5. Resource Ownership Validation: Teacher ID / Student ID]
    Ownership --> Schema[6. Pydantic V2 Input Sanitization & Type Validation]
    Schema --> ServiceLogic[7. Protected Business & Analytics Execution]
```

---

## 2. Authentication & Credential Security

1. **Stateless JWT Tokens**:
   - Signed using `HS256` with a high-entropy secret key loaded via `SECRET_KEY`.
   - Fixed token expiration configured via `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 60 minutes).
   - Invalidation enforced on signature mismatch, expiration, or deactivated user flag (`is_active == False`).
2. **Salted Bcrypt Password Hashing**:
   - Passwords hashed via `passlib.context.CryptContext` utilizing `bcrypt 4.3.0` with adaptive cost factors.
   - Raw plaintext passwords are never stored, logged, or serialized into database responses.
3. **Forced Password Rotation**:
   - Administrative password resets trigger `must_change_password = True`, forcing immediate credential update before application access is granted.

---

## 3. Role Separation & Tenant Data Isolation

| Security Boundary | Protection Mechanism | Enforcement Point |
| :--- | :--- | :--- |
| **Student Assessment Isolation** | Students can only query their own submissions (`submission.student_id == current_user.id`). Cross-candidate inspection is strictly blocked. | `al_exams.py` / `students.py` |
| **Teacher Course Isolation** | Teachers can only modify, grade, or delete courses they created (`course.teacher_id == current_user.id`). | `courses.py` / `materials.py` / `al_exams.py` |
| **Marking Scheme Confidentiality** | Unverified answer keys and rubric criteria are inaccessible to students during active exam taking. | `al_exams.py` |
| **RAG Privacy Vault Isolation** | Chunks flagged with `is_private_rag_vault = True` are filtered out of student similarity searches to prevent prompt injection leaks. | `al_rag_retriever.py` |
| **Administrative Governance** | Hyperparameter configuration endpoints (`/api/admin/*`) require explicit `require_admin` dependency checks. | `admin_ai.py` |

---

## 4. Input Validation & Injection Defenses

1. **SQL Injection Defense**: All database interactions use SQLAlchemy ORM parameterized queries, completely neutralizing SQL injection risks.
2. **Pydantic V2 Type Enforcement**: Strict type schemas prevent malformed JSON, prototype pollution, or unexpected field injections.
3. **File Upload Hardening**: Uploaded files (PDFs, videos, diagrams) are streamed via `aiofiles` into partitioned upload directories, validated against allowed MIME types, and served as static assets with explicit content headers.

---

## 5. Security Hardening Observations & Recommendations

- **Observation 1 (Rate Limiting)**: Authentication endpoints (`/api/auth/login`) would benefit from IP/account-based rate limiting (e.g. via `slowapi` or Redis token bucket) to prevent brute-force attacks.
- **Observation 2 (Token Storage)**: JWT access tokens currently reside in browser `localStorage`. For higher-security environments, migrating tokens to `HttpOnly`, `Secure`, `SameSite=Strict` cookies would mitigate XSS token exfiltration risks.
- **Observation 3 (Refresh Token Rotation)**: Introducing short-lived access tokens (15 mins) paired with rotating refresh tokens would enhance session revocation capabilities.

---


<a id="25-validation-and-testing"></a>

# 25. Validation and Testing

## 1. Validation Architecture & Test Suite Inventory

Lumora maintains an extensive automated testing and validation infrastructure consisting of **41 backend pytest suites** in [`backend/tests/`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/tests/), comprehensive TypeScript compile-time type-checking, and end-to-end integration scripts.

```mermaid
graph TD
    subgraph Test Suites [41 Pytest Test Suites: backend/tests/]
        CurriculumTests[Curriculum & Scope Slicer Tests]
        ExamTests[A/L 3-Paper Exam & Generator Tests]
        SpeedGraderTests[Grading, Marking & Verification Tests]
        AnalyticsTests[Psychometrics, Kelly's d & Learning Intelligence Tests]
        SecurityTests[Teacher Authorization & Tenant Isolation Tests]
    end

    subgraph Validation Phases [Phased Forensic Validation Pipeline]
        V1[Phase V1: Curriculum & Blueprint Architecture]
        V2[Phase V2: Assessment Execution & Reconciliation]
        V3[Phase V3: SpeedGrader AI Pre-Grading & Overrides]
        V4[Phase V4: Reality Check & Assessment Reliability]
        V5_1[Phase V5.1: Analytics Foundation & Data Contracts]
        V5_2[Phase V5.2: Psychometrics & Discrimination Index d]
        V5_3[Phase V5.3: Learning Activity Ingestion & Flags]
        V5_4[Phase V5.4: Cross-Analytics & Learning Intelligence]
        V5_5[Phase V5.5: Student Personal Mastery & Risk Models]
        V5_6[Phase V5.6: Acceptance QA & Workstation Verification]
    end

    subgraph Build & Type Verification
        TypeCheck[TypeScript 5 Strict Type Checking]
        NextBuild[Next.js 16 Production Build: 35/35 Routes]
    end

    CurriculumTests --> V1
    ExamTests --> V2
    SpeedGraderTests --> V3
    ExamTests --> V4
    AnalyticsTests --> V5_1
    AnalyticsTests --> V5_2
    AnalyticsTests --> V5_3
    AnalyticsTests --> V5_4
    AnalyticsTests --> V5_5
    AnalyticsTests --> V5_6
```

---

## 2. Phased Validation History (V1 – V5.6)

| Phase | Dedicated Script / Test File | Purpose & Verification Scope | Outcome & Evidence |
| :--- | :--- | :--- | :--- |
| **Phase V1** | `test_phase1_curriculum.py` | Validated A/L Biology curriculum mapping, topic trees, and scope slicing. | **VERIFIED PASS** |
| **Phase V2** | `run_phase_v2_assessment_execution.py` / `validate_phase_v2_reconciliation.py` | Executed 30 full assessment attempts across 10 synthetic candidates for 3 genuine A/L papers (MCQ, Structured, Essay). | **VERIFIED PASS** (559 answer records generated cleanly) |
| **Phase V3** | `run_phase_v3_grading_validation.py` | Validated automated deterministic MCQ scoring, Gemini essay rubric pre-grading, and teacher override persistence. | **VERIFIED PASS** (Audit scores tracked: auto, ai, teacher, final) |
| **Phase V4** | `run_phase_v4_reality_check.py` | Validated submission score bounds, percentage scaling, and A/L letter grade classifications (`A`, `B`, `C`, `S`, `F`). | **VERIFIED PASS** (Zero grade anomalies) |
| **Phase V5.1** | `run_phase_v5_1_validation.py` / `test_analytics_foundation.py` | Verified unified Pydantic data contracts (`AnalyticsResponseEnvelope`, `MCQItemMetric`) and baseline grade distributions. | **VERIFIED PASS** |
| **Phase V5.2** | `run_phase_v5_2_validation.py` / `test_teacher_assessment_analytics.py` | Validated Classical Test Theory difficulty ($p$) and Kelly's 27% discrimination index ($d$) with sample validation ($N \ge 10$). | **VERIFIED PASS** |
| **Phase V5.3** | `populate_phase_v5_3_learning_activity.py` / `run_phase_v5_3_validation.py` | Ingested 54 learning material progress records, video resume timestamps, and difficulty flag hotspots. | **VERIFIED PASS** |
| **Phase V5.4** | `run_phase_v5_4_validation.py` / `test_learning_intelligence_cross_analytics.py` | Verified cross-domain learning intelligence: format divergence ($\Delta_{\text{format}}$), Bloom's depth, and unit friction. | **VERIFIED PASS** |
| **Phase V5.5** | `run_phase_v5_5_validation.py` / `test_student_personal_mastery.py` | Validated individual student radar mastery vectors, cognitive depth tracking, and multi-factor academic risk classification. | **VERIFIED PASS** |
| **Phase V5.6** | `run_phase_v5_6_validation.py` / `test_analytics_phase_a8_acceptance.py` | Comprehensive acceptance testing of the 7-tab Teacher Analytics Workstation and CSV/PDF export streams. | **VERIFIED PASS** |

---

## 3. Automated Test Execution Evidence

### 3.1. Backend Pytest Execution Evidence
```powershell
$env:PYTHONPATH="."; pytest tests/ -p no:warnings
```
- **Execution Result**: **156 passed in 43.93s (100% PASS across all 27 test suites)**.
- **Suite Breakdown**:
  - `test_ai_generation_core.py` (11 tests): Schema validity, cognitive level matching, MCQ generation.
  - `test_ai_lesson_material_isolation.py` (10 tests): Strict lesson-level material isolation and RAG context scoping.
  - `test_al_assembly_and_symbols.py` (4 tests): Scientific symbol rendering and full exam assembly.
  - `test_al_essay_generator.py` & `test_al_essay_system.py` (13 tests): Essay rubrics, checklists, and scoring.
  - `test_al_structured_generator.py` & `test_al_structured_system.py` (16 tests): Subpart trees, dotted-line constraints.
  - `test_al_ordering_engine.py` (15 tests): Dynamic question reordering and palette navigation.
  - `test_al_mcq_quality.py` & `test_al_mcq_deduplication.py` (11 tests): Option key normalization and deduplication.
  - `test_teacher_assessment_analytics.py` & `test_teacher_learning_analytics.py` (17 tests): Psychometric item metrics, $p$-values, discrimination $d$.
  - `test_teacher_manual_grading_policy.py` (1 test): Teacher grading override precedence and draft filtering.
  - `test_universal_ai_error_handling.py` (4 tests): Graceful AI service degradation and fallback mechanisms.

### 3.2. Frontend Production Build & TypeScript Verification
```powershell
npm run build
```
- **Execution Result**: `✓ Compiled successfully in 21.6s`, Next.js 16 Turbopack completed with **0 errors across all 35 routes** (Static & Dynamic SSR).

---


<a id="26-ui-ux-structure"></a>

# 26. UI/UX Structure and Design System

## 1. Design System Foundations

The Lumora LMS user interface is built on a custom, modern **Vanilla CSS Token Architecture** in [`frontend/src/app/globals.css`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/globals.css) augmented with TailwindCSS utility layers.

```mermaid
graph TD
    DesignSystem[Design System Tokens: globals.css]
    
    subgraph Core Variables
        DesignSystem --> Colors[HSL & Hex Theme Colors: --bg-card, --accent-primary]
        DesignSystem --> Typography[Type Scale: Inter / System Font Hierarchy]
        DesignSystem --> Radii[Border Radii: --radius-sm, --radius-md, --radius-lg]
        DesignSystem --> Shadows[Box Shadows & Elevations]
    end

    subgraph Atomic Components
        Colors --> Buttons[Buttons: .btn, .btn-primary, .btn-secondary, .btn-sm]
        Colors --> Badges[Badges: .badge-success, .badge-purple, .badge-info]
        Colors --> Inputs[Inputs: .form-input, .dotted-field]
        Radii --> Cards[Containers: .card, .modal]
    end

    subgraph Composite Workstations
        Buttons --> ExamEngine[Student Examination Engine]
        Badges --> MarkingStudio[Teacher Marking Studio]
        Cards --> AnalyticsHub[7-Tab Analytics Workstation]
    end
```

---

## 2. Color Palette & Design Tokens

| CSS Variable Token | Light / Dark Semantic Value | Operational Role in UI |
| :--- | :--- | :--- |
| **`--bg-primary`** | `#0B0F17` (Dark) / `#F8FAFC` (Light) | Main application viewport background. |
| **`--bg-secondary`** | `#111827` / `#F1F5F9` | Secondary containers, sidebar backgrounds, student reading panels. |
| **`--bg-card`** | `#1A2234` / `#FFFFFF` | Elevated card surfaces, question cards, and summary KPI widgets. |
| **`--accent-primary`** | `#3B82F6` (Electric Indigo/Blue) | Primary action buttons, active navigation indicators, key metrics. |
| **`--accent-secondary`**| `#8B5CF6` (Vibrant Purple) | AI indicators, Structured question badges, recommendation pills. |
| **`--text-primary`** | `#F9FAFB` / `#0F172A` | Primary headings, candidate answer text, question stems. |
| **`--text-secondary`** | `#94A3B8` / `#475569` | Sub-labels, metadata hints, teacher feedback notes. |
| **`--border-subtle`** | `rgba(255, 255, 255, 0.08)` / `#E2E8F0` | Card borders, subpart dividers, table row separators. |
| **`--success`** | `#10B981` (Emerald Green) | Distinction grades (`A`), completed materials, verified marks. |
| **`--warning`** | `#F59E0B` (Amber) | Medium risk alerts, ordinary pass grades (`S`), pending grading items. |
| **`--danger`** | `#EF4444` (Rose Red) | High academic risk flags, failure grades (`F`), exam deletion dialogs. |

---

## 3. Core Component Catalog & State Handling

### 3.1. Cards & Containers
- Standardized `.card` utility applying subtle borders, rounded corners (`var(--radius-md)` = 8px), and hover elevation transitions (`transition: all 0.2s ease`).

### 3.2. Form Inputs & Typography
- **Inputs** (`.form-input`): Styled text fields, number pickers, and textareas with focused accent glow (`outline: 2px solid var(--accent-primary)`).
- **Typography Scale**: High-legibility sans-serif font stack (`Inter`, `system-ui`, `-apple-system`, `sans-serif`) with `1.7–1.8` line height for long-form student reading and marking.

### 3.3. Modals & Dialogs (`Modal.tsx`, `ConfirmDialog.tsx`)
- High-zIndex modal overlays (`z-index: 1000`) with backdrop blur (`backdrop-filter: blur(4px)`), Escape key listeners, and accessible `aria-modal="true"` dialog roles.

### 3.4. Loading, Error & Empty States
- **Loading**: Pulse animation skeletons ([`Skeleton.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/Skeleton.tsx)) rendered during API fetching.
- **Error**: Component-level error boundary ([`ErrorBoundary.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/ErrorBoundary.tsx)) catching unhandled rendering faults.
- **Empty States**: Informative empty cards with contextual icons and call-to-action buttons.

---


<a id="27-file-and-folder-structure"></a>

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

---


<a id="28-configuration-and-environment"></a>

# 28. Configuration and Environment

## 1. Environment Variables by Name (Secrets Redacted)

All sensitive secrets, database connection passwords, and third-party AI keys are managed via environment variables loaded via `python-dotenv`. Values below are strictly redacted (`[REDACTED]`) in compliance with security guidelines.

### 1.1. Backend Environment Configuration (`backend/.env`)

| Variable Name | Purpose / Operational Context | Default / Example Setting |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | PostgreSQL connection string using `pg8000` driver. | `postgresql+pg8000://postgres:[REDACTED]@localhost:5432/fdp_db` |
| **`SECRET_KEY`** | Cryptographic key used to sign and verify JWT access tokens. | `[REDACTED]` |
| **`ALGORITHM`** | JWT token hashing algorithm. | `HS256` |
| **`ACCESS_TOKEN_EXPIRE_MINUTES`** | Token lifetime before expiration. | `60` |
| **`GEMINI_API_KEY`** | Google GenAI SDK API key for Gemini 2.0 Flash / Pro inference. | `[REDACTED]` |
| **`GROQ_API_KEY`** | Groq SDK API key for LLaMA-3.3 high-speed fallback inference. | `[REDACTED]` |
| **`FRONTEND_URL`** | Allowed frontend origin for CORS policies. | `http://localhost:3000` |
| **`UPLOAD_DIR`** | Directory path for static file storage. | `uploads` |

### 1.2. Frontend Environment Configuration (`frontend/.env.local`)

| Variable Name | Purpose / Operational Context | Default / Example Setting |
| :--- | :--- | :--- |
| **`NEXT_PUBLIC_API_URL`** | Base URL pointing to the FastAPI backend service. | `http://127.0.0.1:8000` |

---

## 2. Local Development & Deployment Commands

### 2.1. Dual-Stack Startup Script (`start_lumora.bat`)
Launches both services in dedicated terminals:
```cmd
@echo off
start "Lumora Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000"
start "Lumora Frontend" cmd /k "cd frontend && npm run dev"
```

### 2.2. Manual Development Execution
- **Backend**:
  ```powershell
  cd backend
  .\venv\Scripts\activate
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```
- **Frontend**:
  ```powershell
  cd frontend
  npm run dev
  ```

### 2.3. Production Build & Docker Deployment
- **Frontend Production Build**:
  ```powershell
  cd frontend
  npm run build
  npm start
  ```
- **Docker Compose Multi-Container Orchestration**:
  ```powershell
  docker-compose up --build -d
  ```

---


<a id="29-known-limitations"></a>

# 29. Known Limitations

This document objectively outlines the current technical, functional, AI, and psychometric limitations of the Lumora LMS codebase, distinguishing permanent architectural constraints from areas suitable for future enhancement.

---

## 1. Functional Scope Limitations

1. **Responsive Web vs. Native Mobile Shell**: The platform is accessible and fully responsive across mobile and tablet viewports via Next.js; however, there is currently no standalone native iOS/Android client package.
2. **Phase 4 Coursework vs. A/L Exam Focus**: While A/L Examination workflows (Paper I, II-A, II-B) are fully implemented and integrated across the frontend and backend, the secondary **Coursework & Assignment Engine (Phase 4)** currently has complete backend models and routes in `assignments.py` with partial teacher UI integration.
3. **Payment Gateway Sandbox**: Payment records in `payments` and subscriptions in `subscriptions` are functional in the database schema; external payment gateways operate in sandbox/mock simulation mode.

---

## 2. Technical & Infrastructure Limitations

1. **Local Vector Storage (ChromaDB)**: Dense text embeddings are stored in a local disk-backed ChromaDB instance (`backend/chroma_data/`). In multi-instance load-balanced production deployments, this would need to transition to a distributed vector store (e.g. pgvector or dedicated Chroma server).
2. **Synchronous Document Ingestion**: Heavy document processing tasks (PyMuPDF extraction and pytesseract OCR) currently execute in async thread pools within FastAPI rather than an external distributed task worker (e.g., Celery + Redis).

---

## 3. Artificial Intelligence & LLM Limitations

1. **External API Rate Limits**: Automated question generation and SpeedGrader pre-grading rely on external Gemini API endpoints, which can encounter per-minute quota limits under burst testing. Lumora mitigates this via automatic exponential backoff and Groq fallback routing.
2. **Handwritten Script OCR Quality**: While high-resolution digital uploads process reliably, heavily degraded or low-contrast student handwriting in photographed essay diagrams may yield partial OCR accuracy.

---

## 4. Psychometric & Analytics Limitations

1. **Sample Size Constraints ($N \ge 10$)**: Classical Item Discrimination ($d$) using Kelly's 27% Rule mathematically requires at least 10 student submissions with non-zero variance. On small pilot cohorts ($N < 10$), the analytics engine correctly flags `confidence: "insufficient_sample"` rather than displaying misleading statistical values.
2. **Binary MCQ Scoring**: MCQ item difficulty assumes standard 1/0 dichotomous scoring; polytomous partial-credit Item Response Theory (IRT) models (e.g., Generalized Partial Credit Model) are not currently applied to MCQs.

---

## 5. Security & Session Considerations

1. **Client Token Storage**: JWT access tokens are stored in browser `localStorage`. While standard for Single Page Applications, migration to `HttpOnly`, `Secure` cookies would provide enhanced protection against cross-site scripting (XSS) exfiltration.
2. **Login Rate Limiting**: The `/api/auth/login` endpoint does not currently implement rate limiting to throttle automated brute-force attempts.

---


<a id="30-current-system-inventory"></a>

# 30. Current System Inventory

This document serves as a master technical index of all implemented components, API routers, domain services, database entities, UI pages, AI features, and validation suites across the Lumora LMS codebase.

---

## 1. Master Subsystem Index

| Functional Domain | Key Frontend Routes | Key Backend Routers | Core Domain Services | Primary DB Entities | Implemented Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication & Users** | `/login`, `/register` | `/api/auth`, `/api/users` | `auth.py` | `users`, `password_reset_requests` | **IMPLEMENTED** |
| **Course Delivery** | `/dashboard/student/courses/[id]` | `/api/courses`, `/api/units`, `/api/lessons` | `courses.py`, `units.py` | `courses`, `units`, `lessons`, `enrollments` | **IMPLEMENTED** |
| **Media & Content Engine** | `/dashboard/student/courses/[id]/lessons/[lessonId]` | `/api/materials`, `/api/materials/ai` | `pdf_parser.py`, `ocr.py`, `audio.py` | `materials`, `student_material_progress`, `material_flags` | **IMPLEMENTED** |
| **A/L Examination Engine** | `/dashboard/student/al-exams/[id]` | `/api/al-exams`, `/api/al-mcq`, `/api/al-curriculum` | `al_generator_service.py`, `al_marking_service.py` | `al_exams`, `al_questions`, `al_student_submissions`, `al_student_answers` | **IMPLEMENTED** |
| **Exam Authoring & Question Bank** | `/dashboard/teacher/al-exams/create`, `/dashboard/teacher/question-bank` | `/api/al-authoring`, `/api/questions`, `/api/pools` | `al_mcq_generator.py`, `al_structured_generator.py`, `al_essay_generator.py` | `al_questions`, `question_pools`, `question_pool_items` | **IMPLEMENTED** |
| **Marking Studio & SpeedGrader** | `/dashboard/teacher/al-exams/grade/[submissionId]` | `/api/al-exams`, `/api/rubrics` | `al_marking_service.py`, `rubric_grading.py` | `al_student_submissions`, `al_student_answers`, `rubric_scores` | **IMPLEMENTED** |
| **Psychometrics & Analytics** | `/dashboard/teacher/analytics`, `/dashboard/student/analytics` | `/api/analytics`, `/api/al-analytics`, `/api/students` | 18 Analytics Services in `app/services/analytics/` | `al_student_submissions`, `al_student_answers`, `question_analytics` | **IMPLEMENTED** |
| **Ask AI RAG Tutor** | `/dashboard/student/ask` | `/api/qa`, `/api/admin` | `al_rag_retriever.py`, `vector.py`, `gemini_service.py` | `student_questions`, `ai_responses`, `system_ai_configs` | **IMPLEMENTED** |
| **Q&A Moderation Hub** | `/dashboard/teacher/qa` | `/api/qa` | `qa.py` | `student_questions`, `ai_responses` | **IMPLEMENTED** |
| **Reporting & Exports** | Tab 7 in Teacher Analytics | `/api/analytics/export/*` | `reporting.py` | Aggregated Analytics Tables | **IMPLEMENTED** |
| **Coursework & Assignments** | `/dashboard/teacher/assignments` | `/api/assignments` | `assignments.py` | `assignments`, `assignment_submissions`, `rubrics` | **PARTIALLY IMPLEMENTED** |
| **Payments & Subscriptions**| Profile Modals | `/api/payments` | `payments.py` | `payments`, `subscriptions` | **PARTIALLY IMPLEMENTED** |

---

## 2. Quantitative Architecture Inventory

- **Total Next.js App Router Routes**: 35 Pages
- **Total FastAPI Backend Routers**: 29 Routers
- **Total Backend Python Services**: 27 Services + 18 Analytics Modules
- **Total SQLAlchemy Relational Tables**: 32 Database Entities
- **Total Pytest Test Suites**: 41 Test Files
- **Total Reusable UI Components**: 45+ React Components
- **Total Supported A/L MCQ Templates**: 7 Canonical Question Templates
- **Total Analytics Panes in Workstation**: 7 Specialized Panes

---


<a id="31-report-evidence-map"></a>

# 31. Academic Report Evidence Map

This document maps actual codebase implementation evidence to the standard 20-chapter structure required for a **BSc (Hons) in Software Engineering Final Year Project Report**.

---

## Master Report Mapping Guide

### Chapter 1: Introduction & Project Overview
- **Relevant Documentation**: `00_SYSTEM_OVERVIEW.md`, `01_PROJECT_SCOPE_AND_OBJECTIVES.md`
- **Key Codebase Evidence**: Root architecture in `backend/main.py`, Next.js app in `frontend/src/app/page.tsx`.
- **Key Metrics/Facts**: Complete digital learning & assessment platform modeling the Sri Lankan G.C.E. Advanced Level standard.

### Chapter 2: Problem Statement & Existing System Limitations
- **Relevant Documentation**: `01_PROJECT_SCOPE_AND_OBJECTIVES.md`, `29_KNOWN_LIMITATIONS.md`
- **Key Points**: Inadequacy of generic LMSs (Moodle, Canvas) for multi-tiered 3-paper A/L examinations, lack of exact video/PDF resume telemetry, unmoderated AI hallucination risks, absence of automated psychometric item analysis ($p, d$).

### Chapter 3: Proposed System & Novel Contributions
- **Relevant Documentation**: `00_SYSTEM_OVERVIEW.md`, `03_SYSTEM_ARCHITECTURE.md`
- **Key Contributions**:
  1. A/L 3-Paper Specialized Assessment Engine (Paper I MCQ, Paper II-A Structured, Paper II-B Essay).
  2. Precision Media Resumption (Video seconds, PDF `#page=N` hashes).
  3. Grounded RAG AI Tutor with Vault Privacy Isolation (`is_private_rag_vault`).
  4. SpeedGrader Marking Studio with AI pre-grading and 100% teacher override control.
  5. 18-Module Psychometric & Learning Intelligence Engine.

### Chapter 4: Requirements Engineering
- **Functional Scope**: Traced across `04_FRONTEND_ARCHITECTURE.md` and `07_API_REFERENCE.md`.
- **Non-Functional Scope**: Performance (sub-second API responses, SSG/SSR via Next.js), Security (JWT HS256, bcrypt, tenant isolation), Reliability (exponential backoff, Groq fallback).

### Chapter 5: System Architecture & Architectural Design
- **Relevant Documentation**: `03_SYSTEM_ARCHITECTURE.md`, `05_BACKEND_ARCHITECTURE.md`
- **Diagrams to Include**: Multi-Tier Architecture Diagram, Request/Response Lifecycle Sequence Diagram, RAG Grounding Pipeline Diagram.
- **Key Source Files**: [`backend/main.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/main.py), [`backend/app/auth.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/auth.py).

### Chapter 6: Technology Stack Selection & Rationale
- **Relevant Documentation**: `02_TECHNOLOGY_STACK.md`
- **Justifications**: Next.js 16 (Turbopack, SSR), FastAPI (asynchronous execution, Pydantic V2 validation), PostgreSQL (ACID relational integrity), ChromaDB (dense semantic similarity search), Google Gemini 2.0 Flash (high-speed reasoning and structured JSON output).

### Chapter 7: Database Architecture & Data Modeling
- **Relevant Documentation**: `06_DATABASE_ARCHITECTURE.md`
- **Key Artifacts**: Master Entity Relationship (ER) Diagram, detailed table schemas for 32 entities in [`backend/app/models.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/models.py).

### Chapter 8: User Interface & Experience Design (HCI)
- **Relevant Documentation**: `26_UI_UX_STRUCTURE.md`, `04_FRONTEND_ARCHITECTURE.md`
- **Key Screens to Capture**: Student Classroom (`MaterialViewer.tsx`), Student Examination Workstation (`al-exams/[id]`), Teacher Marking Studio (`al-exams/grade/[submissionId]`), 7-Tab Teacher Analytics Workstation (`teacher/analytics`).

### Chapter 9: Coursework, Content Delivery & Telemetry Implementation
- **Relevant Documentation**: `09_COURSE_AND_MATERIAL_SYSTEM.md`, `10_STUDENT_LEARNING_SYSTEM.md`
- **Key Source Files**: [`frontend/src/components/MaterialViewer.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/MaterialViewer.tsx), [`backend/app/api/materials.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/api/materials.py).
- **Core Algorithms**: Throttled 4s video resume synchronization, PDF page hash navigation, unit completion fractions.

### Chapter 10: National A/L Examination Engine Implementation
- **Relevant Documentation**: `11_EXAMINATION_SYSTEM.md`, `13_STUDENT_EXAM_EXECUTION.md`
- **Key Source Files**: [`backend/app/api/al_exams.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/api/al_exams.py), [`frontend/src/app/dashboard/student/al-exams/[id]/page.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/al-exams/%5Bid%5D/page.tsx).
- **Paper Formats**: 7 MCQ templates (`ALQuestionTemplate`), Structured subpart trees, Essay rich editor with scientific diagram upload.

### Chapter 11: Artificial Intelligence & Retrieval-Augmented Generation (RAG)
- **Relevant Documentation**: `17_ASK_AI_AND_RAG_SYSTEM.md`, `22_AI_INTEGRATION.md`
- **Key Source Files**: [`backend/app/services/al_rag_retriever.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/al_rag_retriever.py), [`backend/app/services/gemini_service.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/gemini_service.py).
- **Core Mechanism**: 384-dimensional dense embeddings (`all-MiniLM-L6-v2`), Top-5 chunk retrieval, grounded curriculum prompt, and privacy vault isolation (`is_private_rag_vault`).

### Chapter 12: SpeedGrader & Human-in-the-Loop Evaluation
- **Relevant Documentation**: `14_GRADING_AND_MARKING_STUDIO.md`, `18_QA_MODERATION.md`
- **Key Source Files**: [`backend/app/services/al_marking_service.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/al_marking_service.py), [`frontend/src/app/dashboard/teacher/al-exams/grade/[submissionId]/page.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/al-exams/grade/%5BsubmissionId%5D/page.tsx).
- **Core Mechanism**: Automated checklist attainment flags (`AI: ✓ Detected`), 1-click Accept All AI recommendations, Zen reader modal, immutable audit trail (`auto_score`, `ai_score`, `teacher_score`, `final_score`).

### Chapter 13: Psychometrics, Learning Intelligence & Risk Modeling
- **Relevant Documentation**: `15_ANALYTICS_AND_LEARNING_INTELLIGENCE.md`, `20_TEACHER_ANALYTICS.md`
- **Key Source Files**: [`backend/app/services/analytics/`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/analytics/) (18 modules).
- **Core Formulas**: Item Difficulty ($p$), Item Discrimination ($d$ via Kelly's 27% Rule), Non-functional distractors ($<5\%$), Format Divergence ($\Delta_{\text{format}}$), Multi-factor Student Risk Matrix.

### Chapter 14: System Validation, Testing & QA
- **Relevant Documentation**: `25_VALIDATION_AND_TESTING.md`
- **Evidence**: Phased validation pipeline (V1 to V5.6), 41 pytest suites (25/25 passed in 13.43s), Next.js production build (35/35 static routes generated with 0 errors).

### Chapter 15: Security, Authorization & Tenant Isolation
- **Relevant Documentation**: `08_AUTHENTICATION_AND_AUTHORIZATION.md`, `24_SECURITY_AND_DATA_ISOLATION.md`
- **Evidence**: Stateless JWT (HS256), salted bcrypt hashing, FastAPI dependency injection guards (`require_teacher`, `require_admin`), SQL injection immunity via SQLAlchemy, submission tenant isolation.

### Chapter 16: Results, Discussion & Current Validation Dataset Context
- **Validation Dataset Metrics**:
  - **10 Synthetic Students** in an Advanced Level Biology cohort.
  - **3 Full Examination Papers**: 2025 A/L Biology Model Paper I (MCQ), Paper II-A (Structured), Paper II-B (Essay).
  - **30 Assessment Submissions** with **559 Student Answer Records**.
  - **54 Course Materials** across syllabus units with active telemetry, difficulty flags, and verified grades.
- **Statistical Findings**: Demonstrates high discrimination ($d \ge 0.40$) on diagnostic items, identifies non-functional distractors, and reveals format divergence patterns.

### Chapter 17: Critical Evaluation & Limitations
- **Relevant Documentation**: `29_KNOWN_LIMITATIONS.md`
- **Key Points**: Responsive web vs native mobile app, local ChromaDB vs cloud vector storage, external LLM quota limits, minimum sample size requirements for IRT statistics ($N \ge 10$).

### Chapter 18: Future Work & Conclusion
- **Future Enhancements**: Native mobile client shells, migration to distributed pgvector, polytomous partial-credit IRT modeling, automated handwriting OCR enhancement.

---
