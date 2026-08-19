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
