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
