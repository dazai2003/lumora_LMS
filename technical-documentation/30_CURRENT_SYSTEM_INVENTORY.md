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
