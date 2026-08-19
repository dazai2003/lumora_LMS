# 14. Grading and Marking Studio

## 1. Grading Lifecycle & Human-in-the-Loop Architecture

Lumora implements a **Human-in-the-Loop SpeedGrader & Verification Studio** where automated algorithms and Gemini LLMs perform preliminary scoring, while educators retain 100% authority to review, override, and officially certify student marks.

```mermaid
stateDiagram-v2
    [*] --> in_progress: Student Attempt Active
    in_progress --> submitted: Student Submits Examination
    
    state "Automated Evaluation Engine" as AutoEval {
        submitted --> DeterministicMCQ: Paper I (Deterministic Key Matching)
        DeterministicMCQ --> AIPreGrade: Paper II-A / II-B (Gemini Semantic Evaluation)
        AIPreGrade --> ai_graded: Checklist & Scores Populated
    }
    
    state "Teacher Marking Studio" as Studio {
        ai_graded --> ReviewCandidate: Teacher Opens Submission in Marking Studio
        ReviewCandidate --> AcceptAllAI: 1-Click Accept All AI Recommendations
        ReviewCandidate --> ManualOverrides: Manual Score Overrides & Rubric Checks
        AcceptAllAI --> PublishGrade: Commit Final Verification
        ManualOverrides --> PublishGrade: Commit Final Verification
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

### 3.1. Wide Focus Studio & Typography
- **Layout Switcher**: Toggle between **Wide Reading Studio (1560px max-width)** and **Standard Layout (1280px)** for high-resolution grading monitors.
- **Enhanced Typography**: `1.8` line spacing, word count badge (`N words`), and dynamic font size toggles (`A-` / `A+`).

### 3.2. Two-Column Essay Rubric Workstation
- **Left Column (58%)**: Candidate's written essay text, formatted cleanly with pre-wrap spacing, accompanied by attached scientific diagrams.
- **Right Column (42%)**: Marking scheme checklist with interactive attainment checkboxes:
  - Displays **`AI: ✓ Detected`** purple badges on criteria recognized by Gemini.
  - Interactive checkboxes automatically update candidate points in real-time.
  - Quick **"Check All"** and **"Clear"** helper buttons.

### 3.3. Rapid AI Recommendation Adoption
- **"Accept All AI Recommendations"**: Header action adopting all AI suggested scores and rubric checklist selections across the entire exam in a single click.
- **Per-Question "Accept AI Score (X pts)"**: Quick button on individual question cards to adopt suggested points instantly.

### 3.4. Zen Focus Mode & Diagram Lightbox
- **Zen Focus Reader**: Full-screen modal presenting student responses in high-legibility typography with floating score override inputs.
- **Diagram Lightbox**: Clicking any student diagram opens a high-resolution zoom viewer with pan controls.

### 3.5. Final Verification & Grade Publication
The teacher provides overall summary feedback notes and clicks **"Approve & Publish Final Grade"**, which commits `teacher_verified` status, records `teacher_verified_at`, and makes the verified mark and A/L grade (`A`, `B`, `C`, `S`, `F`) visible to the student.
