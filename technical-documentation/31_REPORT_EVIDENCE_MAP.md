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
