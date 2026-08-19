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
