# Lumora LMS — Teacher Insights & Analytics UI Architecture Documentation

This document provides a comprehensive, exhaustive breakdown of all user interfaces, components, buttons, navigation flows, and interactive elements across the **Teacher Insights, Analytics, Q&A Moderation, and Grading Queue** modules of Lumora LMS.

---

## Table of Contents

1. [Teacher Analytics Workstation (`/dashboard/teacher/analytics`)](#1-teacher-analytics-workstation)
2. [Material Stats & Confusion Heatmaps (`/dashboard/teacher/insights`)](#2-material-stats--confusion-heatmaps)
3. [Q&A Moderation (`/dashboard/teacher/qa`)](#3-qa-moderation)
4. [Grading Queue (`/dashboard/teacher/grading`)](#4-grading-queue)
5. [Summary of Navigation Links & Redirects](#5-summary-of-navigation-links--redirects)

---

## 1. Teacher Analytics Workstation

- **URL:** `http://localhost:3000/dashboard/teacher/analytics`
- **Component File:** `frontend/src/app/dashboard/teacher/analytics/page.tsx`
- **Primary Objective:** Multi-source academic analytics workstation combining assessment psychometrics, difficulty hotspots, longitudinal learning progression, and printable dossiers.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TEACHER ANALYTICS WORKSTATION                                                          │
│ [Course Selector ▼]  [📥 Export CSV]  [🔔 Nudge Inactive Students]                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [📊 Overview] [📋 Assessments] [✨ Intelligence] [📖 Materials] [💬 Ask AI]            │
│ [🔀 Unit Crossover] [👥 Student Roster] [📄 Reports & Print]                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ WORKSTATION CONTENT AREA (Active Tab)                                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1. Header & Global Controls

| UI Element | Type | What It Contains / Displays | What Happens When Clicked |
| :--- | :--- | :--- | :--- |
| **Breadcrumb** | Navigation Link | `Dashboard / Analytics & Learning Intelligence` | Clicking `Dashboard` redirects to `/dashboard/teacher`. |
| **Course Selector** | Dropdown (`<select>`) | List of courses taught by the teacher (`api.listCourses()`). Defaults to the first course. | Selecting a course immediately updates `selectedCourse` and triggers reactive re-fetching of all 8 analytics reports for that course. |
| **Export CSV** | Action Button (`<a>`) | Text `"Export CSV"` with a download icon. | Initiates a direct browser download of the comprehensive course analytics CSV file from `${API_BASE}/analytics/courses/${courseId}/export/csv`. |
| **Nudge / Send Reminders** | Action Button (`<button>`) | Text `"Nudge"` with a bell icon. Disables and shows `"Sending..."` while submitting. | Calls `api.sendCourseStudyReminders(selectedCourse)`. Sends notification alerts to inactive students and displays a success toast. |

---

### 1.2. Workstation Tabs Breakdown

#### Tab 1: Overview & KPIs (`overview`)
- **Metric Cards (Top Row):**
  1. **Enrolled Students:** Total students enrolled and active learners in the past 30 days (`active_learners_30d`).
  2. **Course Average Score:** Mean score across all conducted examinations (`course_average_score%`) and total submission count.
  3. **Material Completion Rate:** Average completion percentage (`average_material_completion_percentage%`) across course materials.
  4. **Difficulty Flags:** Total confusion flags submitted by students, highlighting unresolved count in red if $>0$.
  5. **Ask AI Questions:** Total queries submitted to Ask AI and unique inquiring learners count.
- **Activity Progression (Past 4 Weeks):** Visual timeline bar representing weekly material views (blue), Ask AI questions (cyan), and flags (red).
- **Top Challenging Assessment Items:** List of questions with the lowest average class attainment:
  - Question number, exam title, question template type (e.g. `combination_grid`), Bloom cognitive depth (e.g. `analyze`), and average percentage score.

#### Tab 2: Assessments & Psychometrics (`assessments`)
- **Assessment Highlights Cards:**
  - Card for each published examination showing: Exam title, exam type badge (`Paper 1 MCQ`, `Paper 2 Part A Structured`, `Paper 2 Part B Essay`), submissions count, average score %, and pass rate %.
  - **Button:** `Open Psychometrics Workstation` -> Redirects to `/dashboard/teacher/al-exams/analytics?exam_id=${ah.exam_id}` to view full item psychometrics.
- **Item Discrimination & Difficulty Table ($p$ and $d$):**
  - Item number and stem snippet.
  - Template structure and Bloom taxonomy level.
  - Difficulty Index ($p = \text{mean score}$): High $p$ = Easy, Low $p$ = Difficult.
  - Discrimination Index ($d = \text{top 27\%} - \text{bottom 27\%}$): Validates if high-performing students got the question right.
  - Point-Biserial Correlation ($r_{pb}$): Correlation between item success and overall exam score.
- **Distractor Analysis Bar Breakdown:**
  - Interactive selection frequencies across options `A`, `B`, `C`, `D`, and `E`. Identifies strong misleading distractors chosen by $>20\%$ of students.

#### Tab 3: Learning Intelligence & Hotspots (`intelligence`)
- **Executive Summary Narrative:**
  - Synthesized summary of class-wide conceptual mastery, identifying top retention bottlenecks without incurring duplicate Gemini API costs.
- **Multi-Source Difficulty Hotspots:**
  - List of syllabus units evaluated across materials, exams, and flags.
  - Priority Badge: `HIGH_PRIORITY` (red), `MONITORING` (amber), `HEALTHY` (green), `NOT_STARTED` (gray).
  - Confidence Badge: `Strong Evidence (N>=25)`, `Emerging Pattern (N>=10)`, `Early Signal (N<10)`, `Limited Data`.
  - Evidence points list (e.g. `24.5% avg score`, `8 confusion flags`, `14 Ask AI inquiries`).
  - **Action Button 1:** `Review Material` -> Redirects to `/dashboard/teacher/materials`
  - **Action Button 2:** `Create Targeted Assessment` -> Redirects to `/dashboard/teacher/al-exams/create`
- **Question Format Divergence Matrix:**
  - Compares Direct Factual Recall accuracy vs Applied Multi-Variable accuracy per syllabus unit.
- **Cognitive Depth Attenuation Matrix:**
  - Identifies units where students score well on lower-order Bloom questions (Remember/Understand) but struggle on higher-order questions (Analyze/Evaluate).

#### Tab 4: Materials & Flags (`materials`)
- **Search & Filter Controls:** Search input for material titles; filter dropdown for material types (`all`, `video`, `pdf`, `image`).
- **Materials Table:**
  - Material title and ID.
  - Media type badge (`VIDEO`, `PDF`, `IMAGE`).
  - Total views count and student completion rate %.
  - Difficulty flags counter with unresolved badges.
  - **Button:** `Open Material` -> Redirects to `/dashboard/teacher/materials?material_id=${m.material_id}` to edit or preview the material.

#### Tab 5: Ask AI Inquiries (`ai_insights`)
- **Most Frequently Asked Concepts:** Top 6 curriculum topics students asked the AI Tutor about, with inquiry volume badges.
  - **Clicking any topic card:** Opens the **Topic Inquiries Drilldown Modal** to view exact student questions and AI answers.
- **RAG Grounding & Confidence Card:**
  - Displays the Source Grounding Rate % (percentage of AI tutor answers verified directly from uploaded teacher documents).

#### Tab 6: Unit Crossover Matrix (`unit_crossover`)
- **Alignment Table:** Cross-references learning activities with assessment results per unit:
  - Unit Title, Material count, Completion %, Flags, Inquiries, Assessment Attainment %, and Divergence Status.

#### Tab 7: Student Roster & Learning Profiles (`roster`)
- **Risk Level Filters:** Buttons for `All`, `At-Risk (<50%)`, `Moderate (50-70%)`, `Healthy (>70%)`.
- **Roster Table:** Student name, email, exams completed, average assessment score %, material progress %, flags submitted.
- **Button:** `View Learning Profile` -> Opens the **Student Learning Profile Modal**:
  - Displays the individual student's chronological performance progression.
  - Displays unit-by-unit attainment scores.
  - Displays personal difficulty flags and teacher feedback notes.
  - Displays personal support signals (e.g. `Requires revision on Unit 3`).

#### Tab 8: Reports & Print (`reports`)
- **Printable Dossier:** Clean, high-contrast academic summary formatted for paper and PDF export.
- **Button:** `Print / Save as PDF` -> Executes browser native `window.print()`.

---

## 2. Material Stats & Confusion Heatmaps

- **URL:** `http://localhost:3000/dashboard/teacher/insights`
- **Component File:** `frontend/src/app/dashboard/teacher/insights/page.tsx`
- **Primary Objective:** Granular analysis of student confusion flags tied to exact video timestamps (e.g., `04:15`) or document pages (e.g., `Page 12`), with AI clustering and bulk resolution.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ MATERIAL INSIGHTS & DIFFICULTY HEATMAPS                                                │
│ [Course Filter ▼]  [Lesson Filter ▼]  [Material Filter ▼]                              │
│ Filter Pills: (All) (Active Unresolved) (Video Materials) (PDF Materials)              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ KPI SUMMARY: [Total Flags] [Unique Students Flagging] [Most Flagged Material]          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ MATERIAL HEATMAP CARD (Video Timestamp or PDF Page Timeline)                           │
│  • AI Confusion Diagnosis & Recommended Action                                         │
│  • Visual Cluster Bar (High-density friction points)                                   │
│  • Student Comments List with Context Badges                                           │
│  • [⚡ Bulk Resolve Cluster] Button                                                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Controls & Filters

| UI Element | Type | What It Does |
| :--- | :--- | :--- |
| **Course Dropdown** | Dropdown | Filters material flags by course. Triggers fetching of that course's lessons. |
| **Lesson Dropdown** | Dropdown | Dependent on selected course. Filters materials belonging to that specific lesson. |
| **Material Dropdown** | Dropdown | Filters down to one specific video or PDF document. |
| **Filter Pills** | Toggle Buttons | `All`, `Active Unresolved` (shows only flags where `is_resolved == false`), `Video Materials`, `PDF Materials`. |

### 2.2. Interactive Elements & Modals

| UI Element | Action Trigger | What It Does / Where It Redirects |
| :--- | :--- | :--- |
| **Heatmap Timeline Bar** | Click on Timestamp / Page | Highlights the student flags submitted at that specific video timestamp or document slide. |
| **AI Diagnosis Card** | Auto-fetched or Cached | Summarizes why students are confused at this location and recommends a pedagogical fix (e.g., `"Review slide 4 formula definition"`). |
| **Bulk Resolve Cluster Button** | Click `<button>` | Opens the **Bulk Resolve Modal** containing all unresolved flags in that specific timestamp/page cluster. |
| **Resolve & Notify Button (In Modal)** | Form Submit (`POST`) | Calls `api.bulkResolveMaterialFlags(flagIds, message)`: <br>1. Marks all cluster flags as resolved in the database.<br>2. Saves the teacher's reply/explanation text.<br>3. Dispatches automated notifications to all affected students.<br>4. Closes modal and updates the heatmap badge to `Resolved`. |

---

## 3. Q&A Moderation

- **URL:** `http://localhost:3000/dashboard/teacher/qa`
- **Component File:** `frontend/src/app/dashboard/teacher/qa/page.tsx`
- **Primary Objective:** Quality assurance, auditing, flagging, and human-in-the-loop teacher corrections for AI Tutor responses.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Q&A MODERATION                                                        [🔄 Refresh List]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ METRICS: [Total Inquiries] [Low Confidence (<70%)] [Flagged] [Teacher Corrected]       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [Search inquiries, students...]  [Course Filter ▼]                                     │
│ Filters: [All] [Low Confidence] [Flagged for Review] [Teacher Corrected]               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ INQUIRIES LIST TABLE                                                                   │
│  Student Name │ Course │ Question │ AI Answer Snippet │ Confidence │ Status            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [EXPANDED ROW VIEW]                                                                    │
│  • Full Student Question & Asked Timestamp                                             │
│  • Full Markdown-rendered AI Tutor Response                                            │
│  • RAG Source Documents & Semantic Grounding Citations                                 │
│  • Moderation Controls: [ ] Flag as Inaccurate  [Teacher Correction Textarea]          │
│  • [💾 Save Moderation] Button                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Metrics & Search Filters

- **KPI Cards:**
  - `Total Inquiries`: Total questions asked by students across all courses.
  - `Low Confidence (<70%)`: Inquiries where the RAG semantic certainty score was below $0.70$.
  - `Flagged for Review`: Inquiries flagged by teachers or students for manual review.
  - `Teacher Corrected`: Inquiries where a teacher has submitted an authoritative human correction.
- **Search Bar:** Real-time search filter matching student name, course title, or question content.
- **Filter Tabs:** `All`, `Low Confidence`, `Flagged`, `Teacher Corrected`.

### 3.2. Expanded Row & Moderation Actions

| UI Element | Type | Action / Data Flow |
| :--- | :--- | :--- |
| **Table Row Click** | Expandable Accordion | Expands the selected inquiry row to reveal full question details, complete Markdown AI output, and grounding citations. |
| **Flag Checkbox** | Checkbox (`is_flagged`) | Toggles the flagged status of the AI response. |
| **Correction Textarea** | Text Area (`teacher_correction`) | Teacher types the verified, accurate academic explanation to replace or supplement the AI response. |
| **Save Moderation Button** | Action Button (`<button>`) | Calls `api.moderateAIResponse(aiResponseId, { is_flagged, correction_text })`. Saves the correction in the database so students see the verified teacher answer in their Ask AI interface, and displays a success toast. |

---

## 4. Grading Queue

- **URL:** `http://localhost:3000/dashboard/teacher/grading`
- **Component File:** `frontend/src/app/dashboard/teacher/grading/page.tsx`
- **Primary Objective:** Teacher grading interface for reviewing short-answer responses, overriding AI preliminary marks, and inspecting proctoring integrity events.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ GRADING QUEUE                                                                          │
│ Filter Tabs: [Pending Review (N)] [Graded Attempts] [All Attempts]  [Course Filter ▼] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ GROUPED ASSESSMENTS LIST (Grouped by Quiz / Exam Title)                                │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Quiz: Unit 2 Chemical Kinetics • Course: Chemistry A/L                           │  │
│  │  Student Name │ Attempt # │ Submitted At │ Score │ Integrity Warnings │ Action   │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [EXPANDED ATTEMPT GRADING ACCORDION]                                                   │
│  • 🛡️ Integrity Alert Banner (Tab switches, Fullscreen exits, Paste events)             │
│  • Question-by-Question Grading Cards:                                                 │
│     - Question Stem, Points Cap, & Model Answer Key                                    │
│     - Student Submitted Answer                                                         │
│     - AI Score & Reasoning Note                                                        │
│     - Teacher Points Input [ 3.5 / 5.0 ]  [Mark Correct] [Mark Incorrect]             │
│     - Teacher Feedback Note Textarea                                                   │
│     - [💾 Save Grade & Feedback] Button                                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1. Filter Tabs & Grouping

- **Tab Filters:**
  - `Pending Review`: Attempts containing un-graded short answers, flagged answers, or integrity anomalies.
  - `Graded`: Completed attempts where all questions have final validated scores.
  - `All Attempts`: Complete chronological history of student quiz submissions.
- **Course Selector:** Filters attempts by course.
- **Grouped by Quiz:** Automatically organizes attempts by quiz/exam title with pending count badges.

### 4.2. Attempt Grading Accordion & Actions

| UI Element | Type | Action / Data Flow |
| :--- | :--- | :--- |
| **Review Attempt Row** | Expandable Accordion | Calls `api.getAttemptDetail(quizId, attemptId)` to load all questions, student answers, points earned, AI grading notes, and proctoring logs. |
| **Integrity Alert Banner** | Warning Alert Banner | Displays proctoring events logged during the attempt (e.g. `2 Tab switches`, `1 Fullscreen exit`, `Unfocused window for 45s`). |
| **Points Input** | Number Input (`points_earned`) | Teacher assigns or overrides points for that specific question (bounded by question point cap). |
| **Correct / Incorrect Buttons** | Quick Toggle Buttons | Sets `is_correct: true` (full points) or `is_correct: false` (0 points) with one click. |
| **Teacher Note Input** | Text Input (`teacher_note`) | Teacher writes personalized feedback to explain point deductions or commend reasoning. |
| **Save Grade Button** | Action Button (`<button>`) | Calls `api.moderateQuizAnswer(answerId, { is_correct, points_earned, teacher_note })`. Recalculates total attempt score, updates the attempt status, and sends a notification to the student. |

---

## 5. Summary of Navigation Links & Redirects

| Source Page | Trigger Button / Link | Target URL / Destination | Purpose |
| :--- | :--- | :--- | :--- |
| `/dashboard/teacher/analytics` | Breadcrumb `Dashboard` | `/dashboard/teacher` | Return to primary teacher dashboard |
| `/dashboard/teacher/analytics` | `Export CSV` | `${API_BASE}/analytics/courses/${id}/export/csv` | Download course analytics CSV |
| `/dashboard/teacher/analytics` | `Open Psychometrics Workstation` | `/dashboard/teacher/al-exams/analytics?exam_id=${id}` | Deep dive item psychometrics |
| `/dashboard/teacher/analytics` | `Review Material` (Hotspot action) | `/dashboard/teacher/materials` | Edit course material |
| `/dashboard/teacher/analytics` | `Create Targeted Assessment` | `/dashboard/teacher/al-exams/create` | Author a new exam for weak units |
| `/dashboard/teacher/analytics` | `Open Material` (Materials tab) | `/dashboard/teacher/materials?material_id=${id}` | Preview/edit specific material |
| `/dashboard/teacher/analytics` | `Print / Save as PDF` | Native browser print dialog | Export clean printable dossier |
| `/dashboard/teacher/insights` | `Bulk Resolve Cluster` | Opens In-Page Modal | Bulk resolve flags & notify students |
| `/dashboard/teacher/qa` | Table Row Click | In-Page Accordion | Review AI answer & submit correction |
| `/dashboard/teacher/grading` | `Review Attempt` | In-Page Accordion | Grade short answers & inspect proctoring |
