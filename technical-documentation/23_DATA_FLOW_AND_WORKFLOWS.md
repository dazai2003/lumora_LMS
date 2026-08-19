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
