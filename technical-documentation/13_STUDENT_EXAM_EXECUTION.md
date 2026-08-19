# 13. Student Exam Execution

## 1. Examination Workstation Lifecycle

The student examination experience in [`frontend/src/app/dashboard/student/al-exams/[id]/page.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/student/al-exams/%5Bid%5D/page.tsx) is structured into a proctored 4-phase lifecycle:

```mermaid
graph TD
    Landing[1. Examination Landing & Policy Briefing] -->|Click Start Exam| LiveEngine[2. Live Examination Workstation]
    LiveEngine -->|Periodic Autosave| SaveLoop[3. Background Payload Autosave]
    LiveEngine -->|Timer Expired or Submit Clicked| Submission[4. Submission Finalization & Receipt]

    subgraph Live Workstation Components
        LiveEngine --> Timer[Countdown Timer with Expiry Alert]
        LiveEngine --> SectionTabs[Section Nav: Paper I / Paper II-A / Paper II-B]
        LiveEngine --> NavSidebar[50-Question Quick Jump Matrix]
        LiveEngine --> MCQArea[MCQ 5-Option & Combination Grid Selector]
        LiveEngine --> StructArea[Structured Subpart Textboxes with Lines]
        LiveEngine --> EssayArea[Essay Rich Editor + Diagram Upload]
        LiveEngine --> SymbolTool[Scientific Symbol Picker Tool]
    end
```

---

## 2. Live Answering Workspaces by Paper Type

### 2.1. Paper I (MCQ) Answering Workspace
- **Layout**: Clean item stem rendering with diagram support.
- **5-Option Selector**: Five radio buttons labeled `(A)`, `(B)`, `(C)`, `(D)`, `(E)`.
- **Combination Grid Selector** (`CombinationGridSelector.tsx`): For Q41–Q50 multi-response items, an interactive visual key mapping statements $a, b, c, d$ directly to the canonical 1–5 response options.

### 2.2. Paper II-A (Structured) Answering Workspace
- Handled by [`StudentStructuredQuestionRenderer.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/al-exams/StudentStructuredQuestionRenderer.tsx).
- **Academic Tree Representation**: Displays hierarchical subpart labels (`(a)`, `(i)`, `(ii)`).
- **Input Constraints**: Provides discrete multi-line answer textboxes matching the physical paper's allocated line space.
- **Symbol Insertion**: Injects Greek letters and scientific notations directly into the active cursor position.

### 2.3. Paper II-B (Essay) Answering Workspace
- Handled by [`StudentEssayRichAnswerArea.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/al-exams/StudentEssayRichAnswerArea.tsx).
- **Rich Text Area**: Expansive text container with real-time word counter (`N words`), line spacing (`1.8`), and autosave indicator.
- **Scientific Diagram Upload**: Allows students to photograph/scan hand-drawn biological diagrams and attach the image directly to their essay submission (`essay_attachment_url`).

---

## 3. Continuous Autosave & Submission Finalization

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
        UI->>API: PUT /api/al-exams/submissions/{sub_id}/answers
        API->>DB: Upsert ALStudentAnswer
        DB-->>API: 200 OK
        API-->>UI: Displays "Saved ✓" indicator
    end

    Student->>UI: Clicks "Submit Examination Paper" (or timer reaches 00:00)
    UI->>API: POST /api/al-exams/submissions/{sub_id}/submit
    API->>DB: Update ALStudentSubmission (status='submitted', submitted_at=NOW())
    
    API->>API: Execute Deterministic MCQ Auto-Scoring
    API->>DB: Commit auto_score to ALStudentAnswer & ALStudentSubmission
    
    API-->>UI: 200 OK {status: "submitted", raw_score, percentage}
    UI->>Student: Renders Official Submission Receipt & Score Breakdown
```
