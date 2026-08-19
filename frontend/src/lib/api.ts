/**
 * API client for communicating with the FastAPI backend.
 * Handles authentication tokens automatically.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

/**
 * Resolves a diagram URL path (relative or absolute) to a full HTTP URL served by backend.
 */
export function resolveDiagramImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
    return trimmed;
  }
  
  const backendOrigin = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api").replace(/\/api\/?$/, "");
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${backendOrigin}${normalizedPath}`;
}

export interface Notification {
  id: number;
  user_id: number;
  sender_id?: number;
  title: string;
  message: string;
  type: "system" | "course" | "reminder" | "message";
  is_read: boolean;
  related_entity_id?: number;
  created_at: string;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  timeoutMs?: number;
}

/** Structured API error with HTTP status code for downstream handling. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("access_token") || localStorage.getItem("access_token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { skipAuth = false, timeoutMs, headers: customHeaders, ...rest } = options;
    const headers: Record<string, string> = {
      ...(customHeaders as Record<string, string>),
    };

    // Only set Content-Type for non-FormData requests
    if (!(rest.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (!skipAuth) {
      const token = this.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    const cleanBase = API_BASE.replace(/\/+$/, "");
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${cleanBase}${cleanEndpoint}`;

    // Configure resilient timeout (90s for AI generation, 35s for standard endpoints)
    const isAiEndpoint = endpoint.includes("/generate-") || endpoint.includes("/ai-") || endpoint.includes("/evaluate") || endpoint.includes("/regenerate") || endpoint.includes("/qa/") || endpoint.includes("/ask");
    const effectiveTimeout = timeoutMs || (isAiEndpoint ? 90000 : 35000);

    const controller = new AbortController();
    const timerId = setTimeout(() => {
      controller.abort();
    }, effectiveTimeout);

    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        signal: controller.signal,
        ...rest,
      });
      clearTimeout(timerId);
    } catch (err: any) {
      clearTimeout(timerId);
      if (err?.name === "AbortError") {
        const timeoutMsg = endpoint.includes("/generate-") || endpoint.includes("/synthesize")
          ? `Request timed out after ${Math.round(effectiveTimeout / 1000)}s while waiting for AI generation. Please try generating a smaller batch or retry.`
          : endpoint.includes("/qa/") || endpoint.includes("/ask")
          ? `Request timed out while waiting for the AI tutor response. Please try asking again.`
          : `Request timed out after ${Math.round(effectiveTimeout / 1000)}s. Please try again.`;
        throw new ApiError(504, timeoutMsg);
      }
      // Fast retry to handle transient dev-server socket reloads
      await new Promise((r) => setTimeout(r, 250));
      const retryController = new AbortController();
      const retryTimerId = setTimeout(() => retryController.abort(), effectiveTimeout);
      try {
        response = await fetch(url, {
          headers,
          signal: retryController.signal,
          ...rest,
        });
        clearTimeout(retryTimerId);
      } catch (retryErr: any) {
        clearTimeout(retryTimerId);
        if (retryErr?.name === "AbortError") {
          throw new ApiError(
            504,
            `Request timed out after ${Math.round(effectiveTimeout / 1000)}s while waiting for server response.`
          );
        }
        console.error(`[Lumora ApiClient Network Error] Failed to connect to ${url}:`, retryErr);
        throw new ApiError(
          0,
          `Unable to connect to Lumora API server at ${cleanBase}. Please ensure the backend is running.`
        );
      }
    }

    if (!response.ok) {
      // Auto-logout on expired/invalid token
      if (response.status === 401 && !skipAuth) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("access_token");
          localStorage.removeItem("access_token");
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
        }
      }

      const defaultStatusMsg =
        response.status === 401
          ? "Your session has expired. Please sign in again."
          : response.status === 403
          ? "You do not have permission to access this resource."
          : response.status === 404
          ? "The requested resource was not found."
          : response.status === 422
          ? "Invalid request parameters or payload structure."
          : response.status >= 500
          ? "The Lumora API encountered an internal server error."
          : "An unexpected error occurred";

      const error = await response.json().catch(() => ({ detail: defaultStatusMsg }));

      let errorMsg = defaultStatusMsg;
      if (typeof error.detail === "string" && error.detail.trim()) {
        errorMsg = error.detail;
      } else if (Array.isArray(error.detail)) {
        errorMsg = error.detail.map((e: any) => e.msg || (typeof e === "string" ? e : JSON.stringify(e))).join("; ");
      } else if (error.detail && typeof error.detail === "object") {
        errorMsg = JSON.stringify(error.detail);
      } else if (typeof error.message === "string" && error.message.trim()) {
        errorMsg = error.message;
      }

      throw new ApiError(response.status, errorMsg);
    }

    if (response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      return {} as T;
    }

    try {
      return JSON.parse(text);
    } catch {
      return {} as T;
    }
  }


  // ─── Auth ──────────────────────────────
  async register(data: {
    email: string;
    password: string;
    full_name: string;
    role?: string;
  }) {
    return this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    });
  }

  async login(email: string, password: string, rememberMe: boolean = false) {
    const data = await this.request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    if (typeof window !== "undefined") {
      if (rememberMe) {
        localStorage.setItem("access_token", data.access_token);
        sessionStorage.removeItem("access_token");
      } else {
        sessionStorage.setItem("access_token", data.access_token);
        localStorage.removeItem("access_token");
      }
    }
    return data;
  }

  async getMe() {
    return this.request<User>("/auth/me");
  }

  async requestPasswordReset(email: string, reason?: string) {
    return this.request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, reason }),
    });
  }

  async ping() {
    return this.request<{ message: string; success: boolean }>("/users/ping", { method: "POST" });
  }

  logout() {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("access_token");
      localStorage.removeItem("access_token");
    }
  }

  // ─── Users ─────────────────────────────
  async listUsers(params?: {
    role?: string;
    is_active?: boolean;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.role) query.set("role", params.role);
    if (params?.is_active !== undefined)
      query.set("is_active", String(params.is_active));
    if (params?.search) query.set("search", params.search);
    return this.request<User[]>(`/users/?${query}`);
  }

  async toggleUserActive(userId: number) {
    return this.request(`/users/${userId}/toggle-active`, { method: "PATCH" });
  }

  async getPasswordResetRequests(status?: "pending" | "resolved") {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    return this.request<any[]>(`/users/password-resets?${query}`);
  }

  async resolvePasswordReset(requestId: number, newPassword: string) {
    return this.request<{ message: string; success: boolean }>(`/users/password-resets/${requestId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    });
  }

  async deleteUser(userId: number) {
    return this.request(`/users/${userId}`, { method: "DELETE" });
  }

  // ─── Courses ───────────────────────────
  async listCourses(params?: { search?: string; subject?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.subject) query.set("subject", params.subject);
    return this.request<Course[]>(`/courses/?${query}`);
  }

  async getCourse(courseId: number) {
    return this.request<Course>(`/courses/${courseId}`);
  }

  async createCourse(data: {
    title: string;
    description?: string;
    subject?: string;
    teacher_id?: number;
  }) {
    return this.request<Course>("/courses/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCourse(
    courseId: number,
    data: Partial<{
      title: string;
      description: string;
      subject: string;
      is_active: boolean;
    }>
  ) {
    return this.request<Course>(`/courses/${courseId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteCourse(courseId: number) {
    return this.request(`/courses/${courseId}`, { method: "DELETE" });
  }

  async enrollInCourse(courseId: number) {
    return this.request(`/courses/${courseId}/enroll`, { method: "POST" });
  }

  async unenrollFromCourse(courseId: number) {
    return this.request<{ message: string; success: boolean }>(`/courses/${courseId}/enroll`, { method: "DELETE" });
  }

  async getMyEnrolledCourses() {
    return this.request<Course[]>("/courses/enrolled/my-courses");
  }

  async getCourseStudents(courseId: number) {
    return this.request(`/courses/${courseId}/students`);
  }

  // ─── Units ─────────────────────────────
  async listUnits(courseId: number) {
    return this.request<UnitWithLessons[]>(`/units/course/${courseId}`);
  }

  async getUnit(unitId: number) {
    return this.request<Unit>(`/units/${unitId}`);
  }

  async createUnit(data: {
    title: string;
    description?: string;
    order?: number;
    course_id: number;
  }) {
    return this.request<Unit>("/units/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateUnit(
    unitId: number,
    data: Partial<{
      title: string;
      description: string;
      order: number;
    }>
  ) {
    return this.request<Unit>(`/units/${unitId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async reorderUnits(courseId: number, unitIds: number[]) {
    return this.request<Unit[]>(`/units/course/${courseId}/reorder`, {
      method: "PUT",
      body: JSON.stringify({ unit_ids: unitIds }),
    });
  }

  async deleteUnit(unitId: number) {
    return this.request<{ message: string; success: boolean }>(`/units/${unitId}`, { method: "DELETE" });
  }

  // ─── Lessons ───────────────────────────
  async listLessons(courseId: number) {
    return this.request<Lesson[]>(`/lessons/course/${courseId}`);
  }

  async getLesson(lessonId: number) {
    return this.request<Lesson>(`/lessons/${lessonId}`);
  }

  async createLesson(data: {
    title: string;
    description?: string;
    order?: number;
    course_id: number;
    unit_id?: number;
  }) {
    return this.request<Lesson>("/lessons/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateLesson(
    lessonId: number,
    data: Partial<{
      title: string;
      description: string;
      order: number;
      is_published: boolean;
    }>
  ) {
    return this.request<Lesson>(`/lessons/${lessonId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteLesson(lessonId: number) {
    return this.request(`/lessons/${lessonId}`, { method: "DELETE" });
  }

  // ─── Materials ─────────────────────────
  async listMaterials(lessonId: number) {
    return this.request<Material[]>(`/materials/lesson/${lessonId}`);
  }

  async uploadMaterial(formData: FormData) {
    return this.request<Material>("/materials/upload", {
      method: "POST",
      body: formData,
    });
  }

  async parsePastPaperPdf(formData: FormData) {
    return this.request<{ message: string; count: number; questions: any[]; success: boolean }>("/questions/parse-pdf", {
      method: "POST",
      body: formData,
    });
  }

  async updateMaterial(materialId: number, formData: FormData) {
    return this.request<Material>(`/materials/${materialId}`, {
      method: "PUT",
      body: formData,
    });
  }

  async updateMaterialTranscript(materialId: number, extractedText: string) {
    return this.request<Material>(`/materials/${materialId}/transcript`, {
      method: "PUT",
      body: JSON.stringify({ extracted_text: extractedText }),
    });
  }

  async createNote(data: {
    title: string;
    description?: string;
    content: string;
    material_type: string;
    lesson_id: number;
  }) {
    return this.request<Material>("/materials/note", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteMaterial(materialId: number) {
    return this.request(`/materials/${materialId}`, { method: "DELETE" });
  }

  // Material Analytics & AI
  async flagMaterial(materialId: number, data: { context: string; comment: string }) {
    return this.request<MaterialFlag>(`/materials/${materialId}/flags`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async getMaterialFlags(materialId: number) {
    return this.request<MaterialFlag[]>(`/materials/${materialId}/flags`);
  }

  async addMaterialNote(materialId: number, data: { context?: string; content: string }) {
    return this.request<MaterialNote>(`/materials/${materialId}/notes`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async createMaterialNote(materialId: number, data: { context?: string; content: string }) {
    return this.addMaterialNote(materialId, data);
  }

  async deleteMaterialNote(noteId: number) {
    return this.request(`/materials/notes/${noteId}`, {
      method: "DELETE"
    });
  }

  async getMaterialNotes(materialId: number) {
    return this.request<MaterialNote[]>(`/materials/${materialId}/notes`);
  }

  async getMaterialProgress(materialId: number) {
    return this.request<StudentMaterialProgress>(`/materials/${materialId}/progress`);
  }

  async updateMaterialProgress(materialId: number, data: { last_position: number; is_completed: boolean }) {
    return this.request<StudentMaterialProgress>(`/materials/${materialId}/progress`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async summarizeMaterial(materialId: number, summaryType: string = "paragraph") {
    return this.request<{ summary: string; summary_type?: string }>(`/materials/${materialId}/summarize`, {
      method: "POST",
      body: JSON.stringify({ summary_type: summaryType }),
    });
  }

  async getTeacherMaterialFlags() {
    return this.request<TeacherMaterialFlag[]>("/materials/teacher/insights/flags");
  }

  async resolveMaterialFlag(flagId: number, data?: { teacher_reply?: string }) {
    return this.request<{ message: string; success: boolean }>(`/materials/teacher/insights/flags/${flagId}/resolve`, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async bulkResolveMaterialFlags(flagIds: number[], message: string) {
    return this.request<{ message: string; success: boolean }>("/materials/teacher/insights/flags/bulk-resolve", {
      method: "POST",
      body: JSON.stringify({ flag_ids: flagIds, message })
    });
  }



  // ─── A/L Exam Engine Methods ─────────────────────────

  async listALExams(courseId?: number, examType?: string, isPublished?: boolean) {
    let url = "/al-exams";
    const params = new URLSearchParams();
    if (courseId) params.append("course_id", courseId.toString());
    if (examType) params.append("exam_type", examType);
    if (isPublished !== undefined) params.append("is_published", isPublished.toString());
    if (params.toString()) url += `?${params.toString()}`;
    return this.request<ALExam[]>(url);
  }

  async getALExam(examId: number) {
    return this.request<ALExam>(`/al-exams/${examId}`);
  }

  async createALExam(data: Partial<ALExam>) {
    return this.request<ALExam>("/al-exams", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateALExam(examId: number, data: Partial<ALExam>) {
    return this.request<ALExam>(`/al-exams/${examId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteALExam(examId: number, deleteBankedQuestions: boolean = false) {
    return this.request<void>(`/al-exams/${examId}?delete_banked_questions=${deleteBankedQuestions}`, {
      method: "DELETE",
    });
  }

  async addALQuestion(examId: number, data: Partial<ALQuestion>) {
    return this.request<ALQuestion>(`/al-exams/${examId}/questions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateALQuestion(examId: number, questionId: number, data: Partial<ALQuestion>) {
    return this.request<ALQuestion>(`/al-exams/${examId}/questions/${questionId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteALQuestion(examId: number, questionId: number) {
    return this.request<void>(`/al-exams/${examId}/questions/${questionId}`, {
      method: "DELETE",
    });
  }

  async reorderALQuestions(examId: number, orderedQuestionIds: number[]) {
    return this.request<ALQuestion[]>(`/al-exams/${examId}/reorder-questions`, {
      method: "POST",
      body: JSON.stringify(orderedQuestionIds),
    });
  }

  async getALSubmission(submissionId: number) {
    return this.request<ALStudentSubmission>(`/al-exams/submissions/${submissionId}`);
  }

  async getMyALSubmission(examId: number) {
    return this.request<ALStudentSubmission | null>(`/al-exams/${examId}/my-submission`);
  }

  async getMyALSubmissions() {
    return this.request<ALStudentSubmission[]>("/al-exams/my-submissions");
  }

  async listALExamSubmissions(examId: number) {
    return this.request<ALStudentSubmission[]>(`/al-exams/${examId}/submissions`);
  }

  async getPendingTeacherReviews(status?: string, examId?: number) {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (examId) params.append("exam_id", examId.toString());
    const queryString = params.toString();
    return this.request<ALStudentSubmission[]>(`/al-exams/pending-reviews${queryString ? `?${queryString}` : ""}`);
  }

  async verifyTeacherSubmission(submissionId: number, data: { answers: { answer_id: number; teacher_override_points?: number; teacher_checklist_results_json?: any; feedback_notes?: string }[]; teacher_feedback?: string }) {
    return this.request<ALStudentSubmission>(`/al-exams/submissions/${submissionId}/verify`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listALPastPapers(year?: number, paperType?: string) {
    let url = "/al-past-papers";
    const params = new URLSearchParams();
    if (year) params.append("year", year.toString());
    if (paperType) params.append("paper_type", paperType);
    if (params.toString()) url += `?${params.toString()}`;
    return this.request<ALPastPaper[]>(url);
  }

  async extractPDFPastPaper(formData: FormData) {
    return this.request<{
      message: string;
      past_paper_id: number;
      paper_set_group: string;
      questions_count: number;
      exam_id?: number;
    }>("/al-past-papers/extract-pdf", {
      method: "POST",
      body: formData,
    });
  }

  async getQuestionBankGroups() {
    return this.request<QuestionBankGroup[]>("/al-past-papers/question-bank/groups");
  }

  async publishPaperSetAsExam(formData: FormData) {
    return this.request<{ message: string; exam_id: number; title: string }>("/al-past-papers/publish-exam", {
      method: "POST",
      body: formData,
    });
  }



  async generateAIQuestions(data: {
    assessment_type: string;
    question_count: number;
    generation_mode?: string;
    subtype_distribution?: Record<string, number>;
    difficulty_distribution?: Record<string, number>;
    cognitive_distribution?: Record<string, number>;
    course_id?: number;
    unit_ids?: number[];
    lesson_ids?: number[];
    material_ids?: number[];
    material_scopes?: string[];
    custom_instruction?: string;
  }) {
    return this.request<any[]>("/al-authoring/generate-questions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async regenerateAICandidate(candidateQuestion: any, customInstruction?: string) {
    return this.request<any>("/al-authoring/regenerate-candidate", {
      method: "POST",
      body: JSON.stringify({
        candidate_question: candidateQuestion,
        custom_instruction: customInstruction,
      }),
    });
  }

  async getMaterialSummary(courseId?: number, unitIds?: number[]) {
    const params = new URLSearchParams();
    if (courseId) params.append("course_id", courseId.toString());
    if (unitIds && unitIds.length > 0) params.append("unit_ids", unitIds.join(","));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<any>(`/al-authoring/material-summary${query}`);
  }

  async createCustomALExam(data: any) {
    return this.request<ALExam>("/al-authoring/create-exam", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async duplicateALExam(examId: number) {
    return this.request<ALExam>(`/al-exams/${examId}/duplicate`, {
      method: "POST",
    });
  }

  async validateALExam(examId: number) {
    return this.request<{
      is_valid: boolean;
      errors: string[];
      warnings: string[];
      summary: any;
    }>(`/al-exams/${examId}/validate`);
  }

  async importQuestionsToALExam(examId: number, questionVersionIds: number[]) {
    return this.request<ALExam>(`/al-exams/${examId}/import-bank-questions`, {
      method: "POST",
      body: JSON.stringify({ question_version_ids: questionVersionIds }),
    });
  }

  async reorderALExamQuestions(examId: number, questionIds: number[]) {
    return this.request<ALExam>(`/al-exams/${examId}/reorder-questions`, {
      method: "POST",
      body: JSON.stringify({ question_ids: questionIds }),
    });
  }

  async publishALExam(examId: number) {
    return this.request<ALExam>(`/al-exams/${examId}/publish`, {
      method: "POST",
    });
  }

  async reviseALExam(examId: number, data: { revision_type: string; question_number?: number; reason: string; notify_students: boolean }) {
    return this.request<{ message: string; exam_id: number; students_notified: number }>(`/al-exams/${examId}/revise`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async startALExamAttempt(examId: number) {
    return this.request<{
      submission_id: number;
      exam_id: number;
      title: string;
      exam_type: string;
      time_limit_minutes: number;
      time_remaining_seconds?: number | null;
      is_resumed?: boolean;
      started_at: string;
      saved_answers?: Record<number, any>;
      questions: any[];
    }>(`/al-exams/${examId}/start`, {
      method: "POST",
    });
  }

  async autosaveALAnswers(submissionId: number, answers: { question_id: number; selected_option?: string; subpart_answers_json?: any; essay_text_answer?: string; essay_attachment_url?: string }[]) {
    return this.request<{ message: string }>(`/al-exams/submissions/${submissionId}/answers`, {
      method: "PUT",
      body: JSON.stringify(answers),
    });
  }

  async submitALExam(submissionId: number, answers: { question_id: number; selected_option?: string; subpart_answers_json?: any; essay_text_answer?: string; essay_attachment_url?: string }[]) {
    return this.request<ALStudentSubmission>(`/al-exams/submissions/${submissionId}/submit`, {
      method: "POST",
      body: JSON.stringify({ exam_id: 0, answers }),
    });
  }

  async createAuthoringQuestion(data: any) {
    return this.request<ALQuestion>("/al-authoring/questions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAuthoringQuestion(questionId: number, data: any) {
    return this.request<ALQuestion>(`/al-authoring/questions/${questionId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async uploadQuestionDiagram(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const res = await fetch(`${API_BASE}/al-authoring/upload-diagram`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to upload diagram image" }));
      throw new Error(err.detail || "Failed to upload diagram image");
    }
    return res.json() as Promise<{ message: string; image_url: string; filename: string }>;
  }

  async batchAcceptCandidates(examId: number, candidates: any[]) {
    return this.request<{ requested: number; accepted: number; failed: number; results: any[]; errors: any[] }>("/al-authoring/batch-accept-questions", {
      method: "POST",
      body: JSON.stringify({ exam_id: examId, candidates }),
    });
  }

  async generateStructuredQuestions(data: {
    question_count?: number;
    course_id?: number;
    unit_ids?: number[];
    custom_instruction?: string;
    custom_blueprints?: any[];
    difficulty_mode?: string;
    cognitive_mode?: string;
  }) {
    return this.request<any[]>("/al-authoring/generate-structured-questions", {
      method: "POST",
      body: JSON.stringify({
        assessment_type: "paper_2_structured",
        question_count: data.question_count || 4,
        course_id: data.course_id,
        unit_ids: data.unit_ids,
        custom_instruction: data.custom_instruction,
        custom_blueprints: data.custom_blueprints,
        difficulty_mode: data.difficulty_mode || "balanced",
        cognitive_mode: data.cognitive_mode || "recommended",
      }),
    });
  }

  async regenerateStructuredCandidate(data: {
    candidate: any;
    course_id?: number;
    unit_ids?: number[];
    custom_instruction?: string;
    difficulty_mode?: string;
    cognitive_mode?: string;
  }) {
    return this.request<any>("/al-authoring/regenerate-structured-candidate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async generateEssayQuestions(data: {
    question_count?: number;
    course_id?: number;
    unit_ids?: number[];
    custom_instruction?: string;
    custom_blueprints?: any[];
    paper_blueprint?: any;
    difficulty_mode?: string;
    cognitive_mode?: string;
  }) {
    return this.request<any[]>("/al-authoring/generate-essay-questions", {
      method: "POST",
      body: JSON.stringify({
        assessment_type: "paper_2_essay",
        question_count: data.question_count || 3,
        course_id: data.course_id,
        unit_ids: data.unit_ids,
        custom_instruction: data.custom_instruction,
        custom_blueprints: data.custom_blueprints,
        paper_blueprint: data.paper_blueprint,
        difficulty_mode: data.difficulty_mode || "balanced",
        cognitive_mode: data.cognitive_mode || "recommended",
      }),
    });
  }

  async regenerateEssayCandidate(data: {
    candidate: any;
    course_id?: number;
    unit_ids?: number[];
    custom_instruction?: string;
    difficulty_mode?: string;
    cognitive_mode?: string;
  }) {
    return this.request<any>("/al-authoring/regenerate-essay-candidate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async flagDifficultyHotspot(data: { material_id: number; timestamp_seconds?: number; page_number?: number; note?: string }) {
    return this.request<{ id: number; material_id: number; timestamp_seconds?: number }>("/al-authoring/hotspots", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMaterialHotspots(materialId: number) {
    return this.request<{
      material_id: number;
      total_hotspots: number;
      timestamp_clusters: { bucket_seconds: number; flag_count: number }[];
      student_notes: { student_name: string; timestamp_seconds?: number; note: string; created_at: string }[];
    }>(`/al-authoring/materials/${materialId}/hotspots`);
  }

  async sendTargetedRemediation(data: { student_ids: number[]; material_title: string; note: string }) {
    return this.request<{ message: string; notified_count: number }>("/al-authoring/remediation", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async generateScopeExam(formData: FormData) {
    return this.request<{ message: string; exam_id: number; title: string; questions_count: number; paper_set_group: string }>("/al-curriculum/generate-scope-exam", {
      method: "POST",
      body: formData,
    });
  }

  async getProportionalTemplateBreakdown(totalQuestions: number = 50) {
    return this.request<{
      total_questions: number;
      template_counts: Record<string, number>;
      official_ratios: Record<string, string>;
    }>(`/al-mcq/proportional-breakdown?total_questions=${totalQuestions}`);
  }

  async generatePaper1MCQExam(courseId: number, totalQuestions: number = 50, title?: string) {
    let url = `/al-mcq/generate-paper1?course_id=${courseId}&total_questions=${totalQuestions}`;
    if (title) url += `&title=${encodeURIComponent(title)}`;
    return this.request<{ message: string; exam_id: number; title: string; questions_count: number; paper_set_group: string }>(url, {
      method: "POST",
    });
  }



  // ─── Phase 2 Question Bank & Moderation ─────
  async approveQuestion(questionId: number) {
    return this.request<{ message: string; success: boolean }>(`/questions/${questionId}/approve`, { method: "POST" });
  }

  async rejectQuestion(questionId: number) {
    return this.request<{ message: string; success: boolean }>(`/questions/${questionId}/reject`, { method: "POST" });
  }

  async archiveQuestion(questionId: number) {
    return this.request<{ message: string; success: boolean }>(`/questions/${questionId}/archive`, { method: "POST" });
  }

  async deleteBankQuestion(questionId: number) {
    return this.request<{ message: string; success: boolean }>(`/questions/${questionId}`, { method: "DELETE" });
  }

  async bulkModerateQuestions(questionIds: number[], action: "approve" | "reject" | "archive") {
    return this.request<{ message: string; success: boolean }>("/questions/bulk-moderate", {
      method: "POST",
      body: JSON.stringify({ question_ids: questionIds, action }),
    });
  }

  async importQuestions(questionsData: any) {
    return this.request<{ message: string; count: number; success: boolean }>("/questions/import", {
      method: "POST",
      body: JSON.stringify({ questions_data: questionsData }),
    });
  }

  async scanDuplicateQuestions(lessonId?: number) {
    return this.request<{ total_scanned: number; duplicate_groups: any[] }>("/questions/scan-duplicates", {
      method: "POST",
      body: JSON.stringify({ lesson_id: lessonId }),
    });
  }

  // ─── Phase 2 Question Pools ─────────────────
  async getQuestionPools(courseId?: number) {
    const url = courseId ? `/pools?course_id=${courseId}` : "/pools";
    return this.request<any[]>(url);
  }

  async createQuestionPool(data: { title: string; description?: string; course_id: number; question_ids?: number[] }) {
    return this.request<any>("/pools", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ─── Phase 2 Rubrics ────────────────────────
  async getGradingRubrics(questionId?: number) {
    const url = questionId ? `/rubrics?question_id=${questionId}` : "/rubrics";
    return this.request<any[]>(url);
  }

  async submitRubricScore(answerId: number, data: { rubric_id: number; criteria_scores: any[]; teacher_final_score: number; override_reason?: string }) {
    return this.request<{ message: string; success: boolean }>(`/rubrics/scores/submit?answer_id=${answerId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }



  // ─── Analytics ─────────────────────────
  async getTeacherCourseAnalytics() {
    return this.request<CourseAnalytics[]>("/analytics/teacher/courses");
  }

  async getTeacherStudentProgressStats() {
    return this.request<StudentCourseProgressResponse[]>("/analytics/teacher/student-progress");
  }

  async sendProgressReminders() {
    return this.request<{ message: string }>("/analytics/teacher/remind-low-progress", {
      method: "POST",
    });
  }

  // ─── Notifications ─────────────────────────
  async getNotifications() {
    return this.request<Notification[]>("/notifications");
  }

  async markNotificationRead(id: number) {
    return this.request<{ message: string }>(`/notifications/${id}/read`, {
      method: "POST",
    });
  }

  async markAllNotificationsRead() {
    return this.request<{ message: string }>("/notifications/mark-all-read", {
      method: "POST",
    });
  }

  async getFullCourseAnalytics(courseId: number) {
    return this.request<FullCourseAnalytics>(`/analytics/teacher/course/${courseId}/full-analytics`);
  }

  async getCourseQuizBreakdown(courseId: number) {
    return this.request<QuizBreakdown>(`/analytics/teacher/course/${courseId}/quiz-breakdown`);
  }

  async getCourseEngagement(courseId: number) {
    return this.request<CourseEngagement>(`/analytics/teacher/course/${courseId}/engagement`);
  }

  async getCourseStudentProgress(courseId: number) {
    return this.request<StudentProgress[]>(
      `/analytics/teacher/course/${courseId}/students`
    );
  }

  async getStudentProgress() {
    return this.request<StudentProgress>("/analytics/student/progress");
  }

  async getStudentQuizHistory() {
    return this.request<StudentQuizHistory>("/analytics/student/quiz-history");
  }

  async getStudentCoursePerformance(courseId: number) {
    return this.request<StudentCoursePerformance>(`/analytics/student/course/${courseId}/performance`);
  }

  // ─── Q&A (Phase 4) ─────────────────────
  async askTeacherQuestion(data: { course_id: number; question_text: string; tag?: string }) {
    return this.request("/qa/teacher/ask", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  
  // ─── Question Bank ──────────────────────────
  async getQuestionBank(params?: {
    subject_id?: number;
    topic_id?: number;
    lesson_id?: number;
    question_type?: string;
    question_family?: string;
    source_type?: string;
    difficulty?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuestionVersionResponse[]> {
    let url = "/questions/bank";
    if (params) {
      const q = new URLSearchParams();
      if (params.subject_id) q.append("subject_id", params.subject_id.toString());
      if (params.topic_id) q.append("topic_id", params.topic_id.toString());
      if (params.lesson_id) q.append("lesson_id", params.lesson_id.toString());
      if (params.question_type) q.append("question_type", params.question_type);
      if (params.question_family) q.append("question_family", params.question_family);
      if (params.source_type) q.append("source_type", params.source_type);
      if (params.difficulty) q.append("difficulty", params.difficulty);
      if (params.search) q.append("search", params.search);
      if (params.limit) q.append("limit", params.limit.toString());
      if (params.offset) q.append("offset", params.offset.toString());
      const qStr = q.toString();
      if (qStr) url += `?${qStr}`;
    }
    return this.request(url);
  }

  async scanQuestionBankDuplicates(params?: { threshold?: number; lesson_id?: number }) {
    return this.request<{ total_scanned: number; duplicate_groups: any[] }>("/questions/scan-duplicates", {
      method: "POST",
      body: JSON.stringify(params || { threshold: 0.85 }),
    });
  }

  async getQuestionAnalytics(questionId: number) {
    return this.request<QuestionAnalyticsResponse>(`/questions/${questionId}/analytics`);
  }

  async improveQuestion(questionId: number, instructions: string[]) {
    return this.request<QuestionVersionResponse>(`/questions/${questionId}/improve`, {
      method: "POST",
      body: JSON.stringify({ instructions }),
    });
  }

  async generateQuestionVariations(questionId: number, count: number = 3) {
    return this.request<QuestionVersionResponse[]>(`/questions/${questionId}/variations`, {
      method: "POST",
      body: JSON.stringify({ count }),
    });
  }

  async checkDuplicateQuestion(questionText: string, lessonId?: number) {
    return this.request<{ is_duplicate: boolean; duplicates: { id: number; text: string; similarity: number }[] }>("/questions/check-duplicate", {
      method: "POST",
      body: JSON.stringify({ question_text: questionText, lesson_id: lessonId }),
    });
  }

  async getMaterialAiSummary(data: {
    material_title: string;
    material_type: string;
    flag_contexts: string[];
    flag_comments: string[];
  }): Promise<{ summary: string; recommended_action: string; success: boolean }> {
    return this.request("/materials/teacher/insights/ai-summary", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async askQuestion(courseId: number, question: string, sessionId?: number) {
    return this.request<QAResponse>("/qa/ask", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, question, session_id: sessionId }),
    });
  }

  // ─── Phase 3 AI Learning Intelligence ─────
  async createAITutorSession(courseId?: number, title?: string) {
    return this.request<{ id: number; title: string; course_id?: number; created_at: string; is_active: boolean }>("/qa/sessions", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, title }),
    });
  }

  async listAITutorSessions(courseId?: number, search?: string) {
    let url = "/qa/sessions";
    const params = new URLSearchParams();
    if (courseId) params.append("course_id", courseId.toString());
    if (search) params.append("search", search);
    if (params.toString()) url += `?${params.toString()}`;
    return this.request<any[]>(url);
  }

  async getAITutorSession(sessionId: number) {
    return this.request<any>(`/qa/sessions/${sessionId}`);
  }

  async deleteAITutorSession(sessionId: number) {
    return this.request(`/qa/sessions/${sessionId}`, { method: "DELETE" });
  }

  async getMyLearningProfile() {
    return this.request<any>("/students/me/profile");
  }

  async getStudentProfileForTeacher(studentId: number) {
    return this.request<any>(`/students/teacher/${studentId}/profile`);
  }

  async generateMaterialAIInsights(materialId: number) {
    return this.request<any>(`/materials/${materialId}/insights/generate`, { method: "POST" });
  }

  async getMaterialAIInsights(materialId: number) {
    return this.request<any>(`/materials/${materialId}/insights`);
  }

  async updateMaterialAIInsights(materialId: number, data: any) {
    return this.request<any>(`/materials/${materialId}/insights`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }




  async askQuestionStream(
    courseId: number, 
    question: string, 
    onMessage: (data: any) => void, 
    onError: (err: any) => void,
    onDone: () => void,
    existingQuestionId?: number
  ) {
    const token = this.getToken();
    if (!token) {
      onError(new ApiError(401, "Please log in to ask questions with the AI tutor."));
      return;
    }

    try {
      const cleanBase = API_BASE.replace(/\/+$/, "");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000);

      let res: Response;
      try {
        res = await fetch(`${cleanBase}/qa/ask/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ course_id: courseId, question, existing_question_id: existingQuestionId }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      
      if (!res.ok) {
        if (res.status === 401) {
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("access_token");
            localStorage.removeItem("access_token");
            window.location.href = "/login";
          }
          onError(new ApiError(401, "Your session has expired. Please log in again."));
          return;
        }

        // Automatic non-streaming fallback
        try {
          const fallbackRes = await this.askQuestion(courseId, question, existingQuestionId);
          if (fallbackRes) {
            onMessage({
              type: "start",
              question_id: fallbackRes.question_id,
              is_grounded: fallbackRes.is_grounded,
              context_sources: fallbackRes.context_sources || [],
            });
            onMessage({
              type: "chunk",
              text: fallbackRes.response_text || "",
            });
            onDone();
            return;
          }
        } catch (_) {}

        let errMessage = "AI service is currently busy. Please try again in a moment.";
        try {
          const errData = await res.json();
          if (errData?.detail) {
            errMessage = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
          }
        } catch (_) {}
        onError(new ApiError(res.status, errMessage));
        return;
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      
      if (!reader) {
        try {
          const fallbackRes = await this.askQuestion(courseId, question, existingQuestionId);
          if (fallbackRes) {
            onMessage({ type: "start", question_id: fallbackRes.question_id, is_grounded: fallbackRes.is_grounded, context_sources: fallbackRes.context_sources || [] });
            onMessage({ type: "chunk", text: fallbackRes.response_text || "" });
          }
          return onDone();
        } catch (fbErr: any) {
          onError(fbErr instanceof Error ? fbErr : new Error("Unable to reach AI tutor. Please try again."));
          return;
        }
      }
      
      let buffer = "";
      let receivedAnyChunk = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const rawLines = buffer.split(/\r?\n/);
        buffer = rawLines.pop() || "";
        
        for (const rawLine of rawLines) {
          const trimmed = rawLine.trim();
          if (trimmed.startsWith("data:")) {
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr) {
              try {
                const data = JSON.parse(jsonStr);
                if (data.type === 'error') {
                  onError(new Error(data.text || "AI tutor encountered an error."));
                } else if (data.type === 'done') {
                  onDone();
                } else {
                  receivedAnyChunk = true;
                  onMessage(data);
                }
              } catch (e) {
                console.error("SSE Parse Error", e);
              }
            }
          }
        }
      }
      if (buffer.trim().startsWith("data:")) {
        const jsonStr = buffer.trim().slice(5).trim();
        if (jsonStr) {
          try {
            const data = JSON.parse(jsonStr);
            receivedAnyChunk = true;
            onMessage(data);
          } catch (e) {}
        }
      }

      if (!receivedAnyChunk) {
        try {
          const fallbackRes = await this.askQuestion(courseId, question, existingQuestionId);
          if (fallbackRes) {
            onMessage({ type: "start", question_id: fallbackRes.question_id, is_grounded: fallbackRes.is_grounded, context_sources: fallbackRes.context_sources || [] });
            onMessage({ type: "chunk", text: fallbackRes.response_text || "" });
          }
        } catch (_) {}
      }

      onDone();
    } catch (e: any) {
      // Automatic non-streaming fallback on network/stream failure
      try {
        const fallbackRes = await this.askQuestion(courseId, question, existingQuestionId);
        if (fallbackRes) {
          onMessage({
            type: "start",
            question_id: fallbackRes.question_id,
            is_grounded: fallbackRes.is_grounded,
            context_sources: fallbackRes.context_sources || [],
          });
          onMessage({
            type: "chunk",
            text: fallbackRes.response_text || "",
          });
          onDone();
          return;
        }
      } catch (_) {}

      const userMsg = e?.message && !e.message.includes("Failed to fetch")
        ? e.message
        : "Connection to AI tutor was interrupted. Please click 'Ask Question' to retry.";
      onError(new Error(userMsg));
    }
  }

  async getQuestionHistory(courseId: number) {
    return this.request<QAResponse[]>(`/qa/history/${courseId}`);
  }

  async getQuestionsByTopic(courseId: number, topic: string) {
    return this.request<{
      id: number;
      question_text: string;
      created_at: string | null;
      student_name: string;
      student_email: string;
      avatar_url: string | null;
      ai_response: string;
      sentiment_difficulty: string;
    }[]>(`/qa/teacher/course/${courseId}/topic-questions?topic=${encodeURIComponent(topic)}`);
  }

  // ─── Direct Q&A (Ask Teacher - Legacy) ──────────────────
  async askTeacher(courseId: number, questionText: string, tag?: string) {
    return this.request<TeacherQuestionResponse>("/qa/ask-teacher", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, question_text: questionText, tag }),
    });
  }

  async initiateTeacherQuestion(studentId: number, courseId: number, teacherResponse: string) {
    return this.request<TeacherQuestionResponse>(`/qa/teacher-questions/initiate?student_id=${studentId}&course_id=${courseId}`, {
      method: "POST",
      body: JSON.stringify({
        teacher_response: teacherResponse
      })
    });
  }

  async replyTeacherQuestion(questionId: number, teacherResponse: string) {
    return this.request<TeacherQuestionResponse>(`/qa/teacher-questions/${questionId}/reply`, {
      method: "POST",
      body: JSON.stringify({ teacher_response: teacherResponse }),
    });
  }

  // ─── Direct Messaging (Chat) ─────────────────────────────
  
  async getConversations() {
    return this.request<ConversationSummary[]>("/messages/conversations");
  }

  async getMessageThread(courseId: number, otherUserId: number) {
    return this.request<DirectMessageResponse[]>(`/messages/thread?course_id=${courseId}&other_user_id=${otherUserId}`);
  }

  async sendDirectMessage(
    courseIdOrData: number | { course_id: number; receiver_id: number; content: string; tag?: string },
    receiverId?: number,
    content?: string,
    tag?: string
  ) {
    let payload;
    if (typeof courseIdOrData === "object") {
      payload = courseIdOrData;
    } else {
      payload = {
        course_id: courseIdOrData,
        receiver_id: receiverId!,
        content: content!,
        tag: tag
      };
    }
    return this.request<DirectMessageResponse>("/messages/send", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getTeacherAllQuestions() {
    return this.request<TeacherQuestionView[]>("/qa/teacher/all-questions");
  }

  async getTeacherAIInsights(courseId: number) {
    return this.request<any>(`/analytics/ai-insights?course_id=${courseId}`);
  }

  async moderateAIResponse(aiResponseId: number, data: { is_flagged: boolean; correction_text: string }) {
    return this.request<{ message: string; success: boolean }>(`/qa/teacher/moderate/${aiResponseId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getStudentTeacherQuestions() {
    return this.request<TeacherQuestionResponse[]>("/qa/teacher-questions/student");
  }

  async getTeacherInboxQuestions() {
    return this.request<TeacherQuestionResponse[]>("/qa/teacher-questions/teacher");
  }

  async markTeacherQuestionRead(questionId: number) {
    return this.request<TeacherQuestionResponse>(`/qa/teacher-questions/${questionId}/read`, {
      method: "POST",
    });
  }

  async getSidebarBadges() {
    return this.request<Record<string, number>>("/notifications/sidebar-badges");
  }


  // ─── Payments & Subscriptions ─────────────────────────
  async checkoutCourse(courseId: number, paymentPlan: "monthly" | "one_time") {
    return this.request<PaymentResponse>("/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, payment_plan: paymentPlan }),
    });
  }

  async payTransaction(txnId: number) {
    return this.request<PaymentResponse>(`/payments/transactions/${txnId}/pay`, {
      method: "POST"
    });
  }

  async getMyTransactions() {
    return this.request<PaymentResponse[]>("/payments/my-billing/transactions");
  }

  async getMySubscriptions() {
    return this.request<SubscriptionResponse[]>("/payments/my-billing/subscriptions");
  }

  async cancelSubscription(subId: number) {
    return this.request<{ message: string; success: boolean }>(`/payments/subscriptions/${subId}/cancel`, {
      method: "POST",
    });
  }

  async updateCoursePricing(courseId: number, isPaid: boolean, monthlyPrice?: number, fullPrice?: number) {
    const query = new URLSearchParams({
      is_paid_course: String(isPaid),
    });
    if (monthlyPrice !== undefined) query.set("monthly_price", String(monthlyPrice));
    if (fullPrice !== undefined) query.set("full_price", String(fullPrice));

    return this.request<{ message: string; success: boolean }>(`/payments/admin/courses/${courseId}/pricing?${query}`, {
      method: "PATCH",
    });
  }

  async changePassword(new_password: string): Promise<{ message: string; success: boolean }> {
    return this.request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ new_password }),
    });
  }

  async updateProfile(data: { full_name?: string; email?: string; phone?: string; avatar_url?: string | null }): Promise<{ message: string; success: boolean }> {
    return this.request<{ message: string; success: boolean }>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }).catch(() => ({ message: "Profile updated locally", success: true }));
  }

  // ─── A/L Assessment Analytics Foundation (A1 / A2) ─────────────────────────
  async getExamFoundationAnalytics(examId: number) {
    return this.request<AnalyticsResponseEnvelope<ExamFoundationOverview>>(`/analytics/exams/${examId}/foundation`);
  }

  async getMCQExamAnalytics(examId: number) {
    return this.request<AnalyticsResponseEnvelope<MCQExamAnalyticsReport>>(`/analytics/exams/${examId}/mcq`);
  }

  async getStructuredExamAnalytics(examId: number) {
    return this.request<AnalyticsResponseEnvelope<StructuredExamAnalyticsReport>>(`/analytics/exams/${examId}/structured`);
  }

  async getEssayExamAnalytics(examId: number) {
    return this.request<AnalyticsResponseEnvelope<EssayExamAnalyticsReport>>(`/analytics/exams/${examId}/essay`);
  }

  async getExamDataQuality(examId: number) {
    return this.request<AnalyticsResponseEnvelope<DataQualityReport>>(`/analytics/exams/${examId}/data-quality`);
  }

  async getCourseMaterialAnalytics(courseId: number) {
    return this.request<AnalyticsResponseEnvelope<CourseMaterialAnalyticsReport>>(`/analytics/materials/${courseId}`);
  }

  async getCourseAIAnalytics(courseId: number) {
    return this.request<AnalyticsResponseEnvelope<AskAIAnalyticsReport>>(`/analytics/ai/${courseId}`);
  }

  // ─── Learning Behaviour & Student Profile Analytics (A3) ─────────────────────────
  async getCourseLearningOverview(courseId: number) {
    return this.request<AnalyticsResponseEnvelope<CourseLearningOverview>>(`/analytics/courses/${courseId}/learning-overview`);
  }

  async getUnitLearningCrossover(courseId: number) {
    return this.request<AnalyticsResponseEnvelope<UnitLearningAssessmentCrossover[]>>(`/analytics/courses/${courseId}/unit-crossover`);
  }

  async getStudentLearningProfile(studentId: number, courseId?: number) {
    const query = courseId ? `?course_id=${courseId}` : "";
    return this.request<AnalyticsResponseEnvelope<StudentLearningProfileReport>>(`/analytics/students/${studentId}/learning-profile${query}`);
  }

  async getStudentPersonalMastery(courseId?: number) {
    const query = courseId ? `?course_id=${courseId}` : "";
    return this.request<AnalyticsResponseEnvelope<StudentPersonalMasteryReport>>(`/analytics/student/mastery${query}`);
  }

  // ─── Advanced Cross-Analytics & Learning Intelligence (A5) ─────────────────────────
  async getCourseLearningIntelligence(courseId: number) {
    return this.request<AnalyticsResponseEnvelope<TeacherCourseLearningIntelligenceReport>>(`/analytics/courses/${courseId}/learning-intelligence`);
  }

  async getStudentLearningIntelligence(courseId?: number) {
    const query = courseId ? `?course_id=${courseId}` : "";
    return this.request<AnalyticsResponseEnvelope<StudentPersonalLearningIntelligenceReport>>(`/analytics/student/learning-intelligence${query}`);
  }

  // ─── Analytics Reporting & Export (A6) ─────────────────────────
  async getCourseAnalyticsReport(courseId: number) {
    return this.request<AnalyticsResponseEnvelope<CourseComprehensiveReport>>(`/analytics/courses/${courseId}/report`);
  }

  getCourseAnalyticsCsvUrl(
    courseId: number,
    exportType: string = "course_summary",
    params?: { unit_id?: number; exam_id?: number; student_id?: number }
  ): string {
    const q = new URLSearchParams();
    q.set("type", exportType);
    if (params?.unit_id) q.set("unit_id", String(params.unit_id));
    if (params?.exam_id) q.set("exam_id", String(params.exam_id));
    if (params?.student_id) q.set("student_id", String(params.student_id));
    return `${API_BASE}/analytics/courses/${courseId}/export/csv?${q.toString()}`;
  }

  // ─── Phase V5.4: Cross-Analytics & Teacher Learning Intelligence ─────────────
  async getTeacherCrossAnalytics(courseId: number) {
    return this.request<TeacherCrossAnalyticsReport>(`/analytics/teacher/course/${courseId}/cross-intelligence`);
  }

  async getUnitQuestionInventory(courseId: number, unitId: number) {
    return this.request<UnitQuestionInventoryItem[]>(`/analytics/teacher/course/${courseId}/unit/${unitId}/inspect-items`);
  }

  async getTeacherStudentCrossIntelligence(courseId: number, studentId: number) {
    return this.request<StudentCrossAnalyticsDossier>(`/analytics/teacher/course/${courseId}/student/${studentId}/cross-intelligence`);
  }

  async getStudentSelfCrossIntelligence(courseId: number) {
    return this.request<StudentCrossAnalyticsDossier>(`/analytics/student/course/${courseId}/cross-intelligence`);
  }
}

// ─── TypeScript Interfaces ────────────────
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "teacher" | "student";
  is_active: boolean;
  must_change_password?: boolean;
  profile_image?: string;
  created_at: string;
}

export interface Course {
  id: number;
  title: string;
  description?: string;
  subject?: string;
  cover_image?: string;
  is_active: boolean;
  is_paid_course?: boolean;
  monthly_price?: number;
  full_price?: number;
  teacher_id?: number;
  teacher_name?: string;
  teacher_last_active_at?: string;
  lesson_count: number;
  student_count: number;
  created_at?: string;
}

export interface PaymentResponse {
  id: number;
  student_id: number;
  course_id: number;
  course_title: string;
  amount: number;
  payment_plan: "monthly" | "one_time";
  status: "pending" | "completed" | "overdue" | "refunded" | "cancelled";
  transaction_id?: string;
  due_date?: string;
  paid_at?: string;
  created_at: string;
}

export interface SubscriptionResponse {
  id: number;
  student_id: number;
  course_id: number;
  course_title: string;
  status: "active" | "overdue" | "cancelled";
  current_period_end: string;
  created_at: string;
}

export interface PaymentOverview {
  total_revenue: number;
  monthly_recurring: number;
  overdue_balance: number;
  active_subscriptions: number;
}

export interface Unit {
  id: number;
  title: string;
  description?: string;
  order: number;
  unit_number?: number;
  course_id: number;
  created_at: string;
  lesson_count?: number;
}

export interface UnitWithLessons extends Unit {
  lessons: Lesson[];
}

export interface Lesson {
  id: number;
  title: string;
  description?: string;
  order: number;
  is_published: boolean;
  course_id: number;
  unit_id?: number;
  created_at: string;
  material_count?: number;
}

export interface Material {
  id: number;
  title: string;
  description?: string;
  material_type: "note" | "pdf" | "image" | "video";
  category?: string;
  file_path?: string;
  content?: string;
  extracted_text?: string;
  processing_status: "pending" | "processing" | "completed" | "failed";
  course_id?: number;
  lesson_id?: number;
  created_at: string;
}

export interface Quiz {
  id: number;
  course_id?: number;
  title: string;
  description?: string;
  status: "draft" | "published" | "archived";
  time_limit_minutes?: number;
  available_from?: string;
  available_until?: string;
  max_attempts?: number;
  is_strict_mode?: boolean;
  is_ai_generated: boolean;
  short_answer_grading_mode: "manual" | "ai";
  lesson_id: number;
  question_count?: number;
  created_at: string;
}

export interface Question {
  id: number;
  question_text: string;
  question_type: "mcq" | "true_false" | "short_answer";
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  points: number;
  order: number;
}

export interface QuestionCreate {
  question_text: string;
  question_type: "mcq" | "true_false" | "short_answer";
  options?: string[];
  correct_answer: string;
  explanation?: string;
  points?: number;
  order?: number;
}

export interface QuizDetail extends Quiz {
  questions: Question[];
}

export interface AnswerSubmit {
  question_id: number;
  student_answer: string;
}

export interface QuizAttempt {
  id: number;
  student_id: number;
  quiz_id: number;
  score?: number;
  total_points?: number;
  percentage?: number;
  status: string;
  started_at: string;
  deadline_at?: string;
  completed_at?: string;
  integrity_warnings?: number;
  student_name?: string;
  answers?: {
    id?: number;
    question_id: number;
    question_version_id?: number;
    student_answer?: string;
    is_correct?: boolean;
    points_earned: number;
    correct_answer?: string;
    is_flagged?: boolean;
    teacher_note?: string;
    is_overridden?: boolean;
    question_text?: string;
    question_type?: string;
    max_points?: number;
    options?: string[];
    explanation?: string;
  }[];
}

export interface AttemptDetailAnswer {
  id: number;
  attempt_id: number;
  question_version_id: number;
  student_answer?: string;
  is_correct?: boolean;
  points_earned: number;
  correct_answer?: string;
  is_flagged: boolean;
  teacher_note?: string;
  is_overridden: boolean;
  question_text: string;
  question_type: string;
  max_points: number;
  options?: string[];
  explanation?: string;
}

export interface AttemptDetail {
  id: number;
  student_id: number;
  student_name: string;
  quiz_id: number;
  quiz_title: string;
  score?: number;
  total_points?: number;
  percentage?: number;
  status: string;
  started_at: string;
  completed_at?: string;
  answers: AttemptDetailAnswer[];
}

export interface TeacherFlaggedAnswerView {
  answer_id: number;
  attempt_id: number;
  student_name: string;
  course_title: string;
  quiz_title: string;
  question_text: string;
  student_answer?: string;
  expected_answer?: string;
  points_earned: number;
  max_points: number;
  is_correct?: boolean;
  is_overridden: boolean;
  teacher_note?: string;
  submitted_at: string;
}

export interface DashboardStats {
  total_students: number;
  total_teachers: number;
  total_courses: number;
  total_quizzes: number;
  total_questions_asked: number;
  active_enrollments: number;
}

// ─── Direct Messaging ─────────────────────────

export interface DirectMessageResponse {
  id: number;
  sender_id: number;
  receiver_id: number;
  course_id: number;
  content: string;
  tag?: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
  receiver_name?: string;
  course_title?: string;
}

export interface ConversationSummary {
  course_id: number;
  course_title: string;
  other_user_id: number;
  other_user_name: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface CourseAnalytics {
  course_id: number;
  course_title: string;
  total_students: number;
  average_quiz_score?: number;
  average_coursework_score?: number;
  average_exam_score?: number;
  average_mcq_score?: number;
  average_structured_score?: number;
  average_essay_score?: number;
  total_exams_count?: number;
  total_submissions_count?: number;
  material_completion_rate?: number;
  total_questions_asked: number;
  completion_rate?: number;
}

export interface CourseworkAnalyticsSummary {
  assignment_id: number;
  title: string;
  max_marks: number;
  total_submitted: number;
  submission_rate_pct: number;
  late_count: number;
  average_marks: number;
  average_pct: number;
}

export interface StudentRosterAnalytics {
  student_id: number;
  student_name: string;
  email: string;
  enrolled_at: string;
  quiz_avg: number | null;
  quizzes_taken: number;
  coursework_avg: number | null;
  courseworks_submitted: number;
  material_completion_pct: number;
  ai_questions_asked: number;
  composite_score: number;
  risk_level: "healthy" | "moderate" | "at_risk";
}

export interface FullCourseAnalytics {
  course_id: number;
  course_title: string;
  summary: {
    total_students: number;
    average_quiz_score: number;
    average_coursework_score: number;
    material_completion_rate: number;
    total_ai_questions: number;
    at_risk_students_count: number;
  };
  coursework_breakdown: CourseworkAnalyticsSummary[];
  quiz_breakdown: QuizBreakdownItem[];
  material_breakdown: {
    total_materials: number;
    overall_completion_pct: number;
    by_type: Record<string, { count: number; completed_count: number; completion_pct: number }>;
  };
  student_roster: StudentRosterAnalytics[];
  top_confusion_areas: { topic: string; count: number }[];
}

export interface StudentProgress {
  student_id?: number;
  student_name?: string;
  courses_enrolled: number;
  overall_progress?: number;
  
  // A/L Exam Metrics
  papers_taken?: number;
  average_exam_score?: number;
  predicted_grade?: string;
  recent_exam_scores?: Array<{
    exam_id: number;
    exam_title: string;
    score: number;
    grade: string;
    date: string | null;
  }>;

  // Materials & Engagement
  completed_materials?: number;
  total_materials?: number;
  questions_asked: number;

  // Legacy / Compatibility
  quizzes_taken?: number;
  average_score?: number;
  coursework_submitted?: number;
  average_coursework_score?: number;
  last_active?: string;
}

export interface QAResponse {
  question_id: number;
  question_text: string;
  response_text?: string;
  is_grounded?: boolean;
  context_sources?: {
    course_id?: number;
    lesson_id?: number;
    material_id?: number;
    title?: string;
    material_type?: string;
    lesson_title?: string;
    unit_name?: string;
    file_url?: string;
    relevance?: number;
    [key: string]: any;
  }[];
  confidence_score?: number;
  is_flagged?: boolean;
  teacher_correction?: string;
  asked_at: string;
  student_name?: string;
}

export interface TeacherQuestionView {
  question_id: number;
  ai_response_id?: number;
  question_text: string;
  response_text?: string;
  confidence_score?: number;
  is_flagged?: boolean;
  teacher_correction?: string;
  asked_at: string;
  student_name: string;
  course_title: string;
  is_answered: boolean;
}

// ─── Phase 6: Advanced Analytics Interfaces ─────
export interface TrendPoint {
  date: string;
  count: number;
}

export interface ActivityFeedItem {
  type: "quiz_submit" | "ai_question" | "user_register";
  message: string;
  timestamp: string;
}

export interface CourseBreakdownItem {
  id: number;
  title: string;
  students: number;
  lessons: number;
  quizzes: number;
}

export interface AdminOverview {
  enrollment_trend: TrendPoint[];
  registration_trend: TrendPoint[];
  quiz_attempt_trend: TrendPoint[];
  qa_trend: TrendPoint[];
  activity_feed: ActivityFeedItem[];
  course_breakdown: CourseBreakdownItem[];
}

export interface AIActionBreakdown {
  action: string;
  count: number;
  avg_time_ms: number;
}

export interface AIPerformance {
  total_operations: number;
  completed: number;
  failed: number;
  success_rate: number;
  avg_response_time_ms: number;
  action_breakdown: AIActionBreakdown[];
  usage_trend: TrendPoint[];
}

export interface QuizScoreDistribution {
  "0-20": number;
  "21-40": number;
  "41-60": number;
  "61-80": number;
  "81-100": number;
}

export interface QuizBreakdownItem {
  quiz_id: number;
  exam_id?: number;
  quiz_title: string;
  exam_type?: string;
  paper_phase?: string;
  total_questions?: number;
  total_attempts: number;
  average_score?: number;
  highest_score?: number;
  lowest_score?: number;
  score_distribution: QuizScoreDistribution;
}

export interface QuizBreakdown {
  quizzes: QuizBreakdownItem[];
}

export interface EngagementStudent {
  student_id: number;
  student_name: string;
  quizzes_taken: number;
  total_quizzes?: number;
  quiz_completion_pct?: number;
  paper_1_score?: number | null;
  paper_2_score?: number | null;
  exam_avg?: number | null;
  exams_taken?: number;
  total_exams?: number;
  exam_completion_pct?: number;
  average_score?: number;
  questions_asked: number;
  unresolved_flags?: number;
  weighted_score?: number;
  flag_reason?: string;
  completed_materials?: number;
  total_materials?: number;
  material_pct?: number;
  coursework_submitted?: number;
  total_coursework?: number;
  coursework_pct?: number;
  engagement_level: "high" | "medium" | "low";
  enrolled_at: string;
}

export interface CourseEngagement {
  students: EngagementStudent[];
  engagement_summary: { high: number; medium: number; low: number };
  total_students: number;
}

export interface StudentQuizHistoryItem {
  attempt_id: number;
  quiz_id: number;
  quiz_title: string;
  course_title: string;
  score: number;
  total_points: number;
  percentage: number;
  completed_at: string;
}

export interface StudentQuizHistory {
  attempts: StudentQuizHistoryItem[];
  score_trend: { date: string; score: number }[];
  total_attempts: number;
  average_score: number;
  best_score: number;
}

export interface StudentCourseQuizResult {
  quiz_id: number;
  quiz_title: string;
  status: "completed" | "not_attempted" | "in_progress";
  score?: number;
  completed_at?: string;
}

export interface StudentCoursePerformance {
  course_id: number;
  course_title: string;
  completion_percentage: number;

  // Tri-factor Breakdown (40% Materials, 30% Paper 1, 30% Paper 2)
  materials_score?: number;
  materials_completion_pct?: number;
  completed_materials?: number;
  total_materials?: number;

  paper_1_score?: number;
  paper_1_completion_pct?: number;
  completed_paper_1?: number;
  total_paper_1?: number;

  paper_2_score?: number;
  paper_2_completion_pct?: number;
  completed_paper_2?: number;
  total_paper_2?: number;

  // Mastery & Engagement
  papers_done?: number;
  total_papers?: number;
  questions_asked: number;

  // Pending & Alerts
  pending_papers?: Array<{ id: number; title: string; exam_type: string }>;
  low_score_papers?: Array<{ id: number; title: string; score: number }>;

  // Unit, Lesson & Material Progress
  unit_progress?: Array<{
    unit_id: number;
    completed_lessons: number;
    total_lessons: number;
    completed_materials: number;
    total_materials: number;
    completed_fraction: string;
    is_completed: boolean;
    completion_percentage: number;
  }>;
  lesson_progress?: Array<{
    lesson_id: number;
    unit_id?: number | null;
    status: "reviewed" | "engaging" | "not_reviewed";
    completed_materials: number;
    total_materials: number;
    is_completed: boolean;
  }>;
  material_progress?: Array<{
    material_id: number;
    last_position: number;
    is_completed: boolean;
    updated_at?: string | null;
  }>;

  // Legacy / Compatibility
  quiz_results?: StudentCourseQuizResult[];
  total_quizzes?: number;
  completed_quizzes?: number;
  submitted_assignments?: number;
  total_assignments?: number;
  coursework_completion_pct?: number;
  quiz_completion_pct?: number;
  coursework_score?: number;
  quiz_score?: number;
}

export interface RecommendationMaterial {
  material_id: number;
  title: string;
  material_type: string;
  file_url?: string;
}

export interface StudyRecommendation {
  id: number;
  lesson_id: number;
  course_id: number;
  course_title: string;
  lesson_title: string;
  ai_tip: string;
  materials: RecommendationMaterial[];
}

export interface MaterialFlag {
  id: number;
  student_id: number;
  material_id: number;
  context: string;
  comment: string;
  is_resolved: boolean;
  teacher_reply?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface MaterialNote {
  id: number;
  student_id: number;
  material_id: number;
  context?: string;
  content: string;
  created_at: string;
}

export interface StudentMaterialProgress {
  id: number;
  student_id: number;
  material_id: number;
  last_position: number;
  is_completed: boolean;
  updated_at: string;
}

export interface TeacherMaterialFlag extends MaterialFlag {
  material_title: string;
  material_type: string;
  student_name: string;
}

export interface StudentCourseProgressResponse {
  student_id: number;
  student_name: string;
  course_id: number;
  course_title: string;
  completed_materials: number;
  total_materials: number;
  progress_percentage: number;
}

export interface TeacherQuestionResponse {
  id: number;
  student_id: number;
  course_id: number;
  question_text: string;
  tag?: string;
  teacher_response?: string;
  is_answered: boolean;
  created_at: string;
  answered_at?: string;
  teacher_seen_at?: string;
  student_seen_at?: string;
  student_name?: string;
  course_title?: string;
}
// ─── Question Bank ──────────────────────────────
export interface QuestionVersionResponse {
  id: number;
  question_id: number;
  question_text: string;
  question_type: string;
  options?: string[];
  correct_answer: string;
  explanation?: string;
  default_points: number;
  difficulty: string;
  cognitive_level: string;
  teacher_approval_status: string;
  ai_validation_status: string;
  source_type: string;
  source_reference?: string;
  created_at: string;
  lesson_id?: number;
  lesson_title?: string;
  unit_id?: number;
  unit_title?: string;
  tags?: string[];
}

export interface QuestionAnalyticsResponse {
  total_attempts: number;
  correct_attempts: number;
  success_rate: number;
  observed_difficulty: string;
  distractor_distribution: Record<string, number>;
}

// ─── Grading Queue ──────────────────────────────
export interface IntegrityEventView {
  event_type: string;
  timestamp: string;
  metadata?: any;
}

export interface GradingQueueItem {
  attempt_id: number;
  quiz_id: number;
  quiz_title: string;
  student_id: number;
  student_name: string;
  course_title: string;
  submitted_at: string;
  score: number;
  total_points: number;
  integrity_warnings: number;
  flagged_answers_count: number;
  pending_short_answers_count: number;
  is_pending_review?: boolean;
  events: IntegrityEventView[];
}

// ─── A/L Exam Engine Interfaces ─────────────────────────

export type ALExamType = "paper_1_mcq" | "paper_2_structured" | "paper_2_essay" | "paper_2" | "full_paper";

export type ALQuestionTemplate = 
  | "generic_mcq"
  | "multi_response_grid"
  | "five_statement_truth"
  | "matching_column"
  | "combination_grid"
  | "sequential_diagnostic"
  | "incomplete_stem"
  | "assertion_reason"
  | "diagram_based"
  | "experimental_procedure"
  | "structured_subparts"
  | "essay_rubric"
  | "essay_checklist";

export interface ALQuestion {
  id: number;
  exam_id: number;
  question_number: number;
  template_type: ALQuestionTemplate;
  stem_text: string;
  diagram_url?: string;
  requires_image?: boolean;
  image_description?: string;
  explanation?: string;
  points: number;
  cognitive_level: string;
  difficulty: string;
  options?: string[];
  correct_option?: string;
  assertion_text?: string;
  reason_text?: string;
  statements_json?: any;
  grid_key_json?: any;
  structured_subparts_json?: any;
  essay_checklist_json?: any;
  created_at: string;
}

export interface ALExam {
  id: number;
  title: string;
  description?: string;
  instructions?: string;
  exam_type: ALExamType;
  time_limit_minutes: number;
  total_questions: number;
  raw_mark_cap?: number;
  score_multiplier: number;
  max_attempts: number;
  is_published: boolean;
  difficulty_policy?: string;
  available_from?: string;
  available_until?: string;
  show_result_immediately?: boolean;
  course_id: number;
  lesson_id?: number;
  created_at: string;
  updated_at: string;
  questions?: ALQuestion[];
}

export interface ALStudentAnswer {
  id: number;
  submission_id: number;
  question_id: number;
  selected_option?: string;
  subpart_answers_json?: any;
  essay_text_answer?: string;
  essay_attachment_url?: string;
  raw_points_earned: number;
  scaled_points_earned: number;
  is_correct?: boolean;
  auto_score?: number;
  ai_score?: number;
  teacher_score?: number;
  final_score?: number;
  correct_option?: string;
  explanation?: string;
  ai_checklist_results_json?: any;
  teacher_checklist_results_json?: any;
  teacher_override_points?: number;
  feedback_notes?: string;
}

export interface ALStudentSubmission {
  id: number;
  exam_id: number;
  exam_title?: string;
  exam_type?: string;
  student_id: number;
  student_name?: string;
  student_email?: string;
  started_at?: string;
  submitted_at?: string;
  raw_score?: number;
  scaled_score?: number;
  percentage?: number;
  total_score?: number;
  max_score?: number;
  score_percentage?: number;
  grade?: string;
  status: string;
  ai_feedback_summary?: string;
  teacher_feedback?: string;
  teacher_verified_at?: string;
  answers?: ALStudentAnswer[];
}

export interface ALPastPaper {
  id: number;
  year: number;
  title: string;
  paper_type: ALExamType;
  pdf_url?: string;
  marking_scheme_url?: string;
  exam_id?: number;
  status: string;
  created_at: string;
}

export interface QuestionBankGroup {
  group_name: string;
  total_questions: number;
}

// ─── Assessment Analytics Interfaces (A1 / A2) ─────────────────────────

export interface AnalyticsMeta {
  sample_size: number;
  generated_at: string;
  data_quality: "sufficient" | "insufficient_sample" | "degraded" | "warning";
  execution_time_ms?: number;
}

export interface AnalyticsResponseEnvelope<T> {
  status: "success" | "warning" | "error";
  data: T;
  meta: AnalyticsMeta;
}

export interface ExamFoundationOverview {
  exam_id: number;
  title: string;
  exam_type: string;
  time_limit_minutes: number;
  total_questions: number;
  raw_mark_cap: number;
  is_published: boolean;
  total_submissions: number;
  in_progress_count: number;
  submitted_count: number;
  ai_graded_count: number;
  teacher_verified_count: number;
  average_raw_score?: number | null;
  average_scaled_score?: number | null;
  average_percentage?: number | null;
  median_percentage?: number | null;
  highest_percentage?: number | null;
  lowest_percentage?: number | null;
  score_distribution_buckets: Record<string, number>;
  grade_distribution: Record<string, number>;
}

export interface OptionDistributionItem {
  option_key: string;
  count: number;
  percentage?: number | null;
  is_correct: boolean;
  is_non_functional_distractor: boolean;
}

export interface DiscriminationMetric {
  value?: number | null;
  sample_size: number;
  valid: boolean;
  confidence: "sufficient_sample" | "low_confidence" | "insufficient_sample";
  reason?: string | null;
}

export interface MCQItemMetric {
  question_id: number;
  question_number: number;
  template_type: string;
  stem_summary: string;
  cognitive_level: string;
  difficulty: string;
  points: number;
  correct_option?: string | null;
  total_attempts: number;
  answered_count: number;
  unanswered_count: number;
  correct_count: number;
  incorrect_count: number;
  difficulty_index_p?: number | null;
  percentage_score?: number | null;
  discrimination: DiscriminationMetric;
  option_distribution: OptionDistributionItem[];
}

export interface MCQExamAnalyticsReport {
  exam_id: number;
  exam_title: string;
  total_questions: number;
  total_submissions: number;
  average_score?: number | null;
  average_percentage?: number | null;
  median_percentage?: number | null;
  highest_percentage?: number | null;
  lowest_percentage?: number | null;
  cognitive_level_breakdown: Record<string, any>;
  template_type_breakdown: Record<string, any>;
  difficulty_level_breakdown: Record<string, any>;
  hardest_questions: Array<{
    question_number: number;
    question_id: number;
    stem_summary: string;
    difficulty_index_p?: number | null;
    percentage_score?: number | null;
    template_type: string;
  }>;
  easiest_questions: Array<{
    question_number: number;
    question_id: number;
    stem_summary: string;
    difficulty_index_p?: number | null;
    percentage_score?: number | null;
    template_type: string;
  }>;
  questions: MCQItemMetric[];
}

export interface StructuredSubpartMetric {
  node_id: string;
  display_label: string;
  part_type: string;
  prompt_text?: string | null;
  expected_keywords: string[];
  maximum_points: number;
  awarded_points_avg?: number | null;
  percentage_achieved?: number | null;
  loss_rate_percentage?: number | null;
  total_attempts: number;
  successful_attempts: number;
  children: StructuredSubpartMetric[];
}

export interface StructuredQuestionMetric {
  question_id: number;
  question_number: number;
  stem_summary: string;
  total_points: number;
  total_attempts: number;
  average_score?: number | null;
  average_percentage?: number | null;
  hierarchy: StructuredSubpartMetric[];
}

export interface StructuredExamAnalyticsReport {
  exam_id: number;
  exam_title: string;
  total_questions: number;
  total_submissions: number;
  average_score?: number | null;
  average_percentage?: number | null;
  subpart_loss_ranking: Array<{
    node_id: string;
    display_label: string;
    maximum_points: number;
    awarded_points_avg?: number | null;
    percentage_achieved?: number | null;
    loss_rate_percentage?: number | null;
    total_attempts: number;
  }>;
  questions: StructuredQuestionMetric[];
}

export interface EssayCriterionMetric {
  criterion_id: number | string;
  item_number: number;
  criterion_text: string;
  max_points: number;
  total_attempts: number;
  awarded_count: number;
  omitted_count: number;
  omission_frequency_percentage?: number | null;
  success_percentage?: number | null;
  average_awarded_points?: number | null;
}

export interface EssayQuestionMetric {
  question_id: number;
  question_number: number;
  stem_summary: string;
  total_points: number;
  total_attempts: number;
  average_score?: number | null;
  average_percentage?: number | null;
  criteria_count: number;
  criteria: EssayCriterionMetric[];
}

export interface EssayExamAnalyticsReport {
  exam_id: number;
  exam_title: string;
  total_questions: number;
  total_submissions: number;
  average_score?: number | null;
  average_percentage?: number | null;
  most_omitted_criteria: Array<{
    criterion_id: number | string;
    question_number: number;
    item_number: number;
    criterion_text: string;
    omission_frequency_percentage?: number | null;
    success_percentage?: number | null;
    average_awarded_points?: number | null;
    max_points: number;
    total_attempts: number;
  }>;
  questions: EssayQuestionMetric[];
}

export interface DataQualityAnomaly {
  severity: "error" | "warning" | "info";
  category: string;
  entity_type: string;
  entity_id?: number | null;
  description: string;
  context?: Record<string, any>;
}

export interface DataQualityReport {
  target_type: string;
  target_id: number;
  total_checks_run: number;
  errors_count: number;
  warnings_count: number;
  is_clean: boolean;
  anomalies: DataQualityAnomaly[];
}

export interface ContextualFlagMetric {
  flag_id: number;
  student_id: number;
  student_name?: string | null;
  context_type: string;
  context_value?: string | null;
  comment?: string | null;
  is_resolved: boolean;
  teacher_reply?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface MaterialEngagementMetric {
  material_id: number;
  lesson_id?: number | null;
  lesson_title?: string | null;
  unit_id?: number | null;
  unit_title?: string | null;
  title: string;
  material_type: string;
  total_enrolled: number;
  total_views: number;
  completed_count: number;
  completion_rate_percentage?: number | null;
  avg_last_position?: number | null;
  total_flags: number;
  unresolved_flags: number;
  resolved_flags: number;
  contextual_flags: ContextualFlagMetric[];
}

export interface CourseMaterialAnalyticsReport {
  course_id: number;
  course_title: string;
  total_materials: number;
  total_enrolled: number;
  overall_completion_rate?: number | null;
  total_flags: number;
  total_unresolved_flags: number;
  materials: MaterialEngagementMetric[];
}

export interface AIConceptTopicMetric {
  topic_category: string;
  question_count: number;
  percentage?: number | null;
  sentiment_breakdown: Record<string, number>;
  sample_questions: string[];
}

export interface AIInquiryDetailMetric {
  question_id: number;
  student_id: number;
  student_name: string;
  question_text: string;
  response_id?: number | null;
  response_text?: string | null;
  confidence_score?: number | null;
  is_grounded: boolean;
  context_sources?: any[] | null;
  topic_category?: string | null;
  sentiment_difficulty?: string | null;
  is_flagged: boolean;
  teacher_correction?: string | null;
  asked_at: string;
}

export interface AskAIAnalyticsReport {
  course_id: number;
  course_title: string;
  total_questions_asked: number;
  answered_questions_count: number;
  unique_students_count: number;
  low_confidence_count: number;
  flagged_count: number;
  teacher_corrected_count: number;
  average_confidence_score?: number | null;
  source_grounded_percentage?: number | null;
  topic_categories: AIConceptTopicMetric[];
  sentiment_distribution: Record<string, number>;
  recent_ai_logs_summary: Record<string, any>;
  detailed_inquiries: AIInquiryDetailMetric[];
}

// ─── Phase A3 Learning & Student Behaviour Interfaces ─────────────────────────

export interface UnitLearningAssessmentCrossover {
  unit_id: number;
  unit_title: string;
  total_materials: number;
  materials_viewed_count?: number;
  materials_completed_count?: number;
  material_completion_percentage?: number | null;
  total_material_views: number;
  total_flags: number;
  unresolved_flags: number;
  ask_ai_questions_count: number;
  questions_count?: number;
  attempts_count?: number;
  attainment_percentage?: number | null;
  mcq_average_percentage?: number | null;
  structured_average_percentage?: number | null;
  essay_average_percentage?: number | null;
  evidence_state?: string;
  support_signals: string[];
}

export interface CourseLearningOverview {
  course_id: number;
  course_title: string;
  enrolled_students: number;
  active_learners_30d: number;
  total_materials: number;
  materials_viewed_count: number;
  materials_completed_count: number;
  average_material_completion_percentage?: number | null;
  average_revisit_frequency?: number | null;
  total_flags: number;
  unresolved_flags: number;
  flag_resolution_rate_percentage?: number | null;
  ask_ai_questions_count: number;
  unique_students_asking_ai: number;
  top_flagged_materials: Array<{
    material_id: number;
    title: string;
    material_type: string;
    total_flags: number;
    unresolved_flags: number;
    hotspots: Array<{ location: string; count: number }>;
  }>;
  top_revisited_materials: Array<{
    material_id: number;
    title: string;
    material_type: string;
    total_views: number;
    unique_students: number;
    revisit_frequency: number;
  }>;
  temporal_activity: Record<string, { views: number; flags: number; ai_questions: number }>;
  unit_crossover_profiles: UnitLearningAssessmentCrossover[];
}

export interface StudentSupportSignalItem {
  signal_type: string;
  severity: "info" | "warning" | "attention";
  topic_or_material: string;
  evidence_text: string;
}

export interface StudentLearningProfileReport {
  student_id: number;
  student_name: string;
  student_email: string;
  enrolled_courses_count: number;
  materials_completed: number;
  materials_total: number;
  material_completion_percentage?: number | null;
  frequently_revisited_materials: Array<{
    material_id: number;
    title: string;
    material_type: string;
    is_completed: boolean;
    last_position?: number | null;
    last_updated: string;
  }>;
  flags_submitted_count: number;
  flags_unresolved_count: number;
  ask_ai_questions_count: number;
  top_asked_topics: Array<{ topic: string; count: number }>;
  recent_flags: Array<{
    flag_id: number;
    material_title: string;
    context_type: string;
    context_value: string;
    comment: string;
    is_resolved: boolean;
    created_at: string;
  }>;
  recent_ai_questions: Array<{
    question_id: number;
    question_text: string;
    topic_category: string;
    sentiment_difficulty: string;
    asked_at: string;
  }>;
  assessment_history: Array<{
    submission_id: number;
    exam_id: number;
    exam_title: string;
    exam_type: string;
    raw_score?: number | null;
    scaled_score?: number | null;
    percentage?: number | null;
    grade?: string | null;
    status: string;
    submitted_at: string;
  }>;
  assessment_average_percentage?: number | null;
  highest_assessment_percentage?: number | null;
  recent_assessment_percentage?: number | null;
  mcq_average_percentage?: number | null;
  structured_average_percentage?: number | null;
  essay_average_percentage?: number | null;
  unit_mastery_breakdown: Array<{
    unit_id: number;
    unit_title: string;
    materials_count: number;
    material_completion_pct?: number | null;
    assessment_score_pct?: number | null;
    flags_count: number;
    mastery_status: string;
  }>;
  engagement_pattern: string;
  status_diagnostic?: {
    status: string;
    label: string;
    badgeClass: string;
    reason: string;
  };
  support_signals: StudentSupportSignalItem[];
  recommended_interventions: Array<{
    title: string;
    reason: string;
    action_type: string;
  }>;
  last_activity_at?: string | null;
}

// ─── Phase A4 Student Personal Mastery Interfaces ─────────────────────────

export interface UnitFormatBreakdownItem {
  format_key: string;
  format_name: string;
  attempts: number;
  correct?: number;
  earned_marks?: number;
  max_marks?: number;
  percentage?: number | null;
}

export interface StudentSyllabusUnitMastery {
  unit_id: number;
  unit_title: string;
  assessment_mastery_percentage?: number | null;
  learning_activity_percentage?: number | null;
  materials_total?: number;
  materials_completed?: number;
  questions_count?: number;
  attempts_count: number;
  mcq_percentage?: number | null;
  structured_percentage?: number | null;
  essay_percentage?: number | null;
  material_completion_percentage?: number | null;
  evidence_state?: string;
  mastery_status: string;
  data_source_note: string;
  mcq_breakdown?: {
    attempts: number;
    correct: number;
    percentage?: number | null;
    formats?: UnitFormatBreakdownItem[];
  };
  structured_breakdown?: {
    attempts: number;
    earned_marks: number;
    max_marks: number;
    percentage?: number | null;
    formats?: UnitFormatBreakdownItem[];
  };
  essay_breakdown?: {
    attempts: number;
    earned_marks: number;
    max_marks: number;
    percentage?: number | null;
    formats?: UnitFormatBreakdownItem[];
  };
}

export interface QuestionTypeMasteryItem {
  template_type: string;
  template_name: string;
  paper_phase?: string;
  attempts_count: number;
  correct_count: number;
  accuracy_percentage?: number | null;
  mastery_status: string;
}

export interface CognitiveSkillMasteryItem {
  cognitive_level: string;
  attempts_count: number;
  correct_count: number;
  accuracy_percentage?: number | null;
  mastery_status: string;
}

export interface RevisionPriorityItem {
  priority_rank: number;
  unit_id?: number | null;
  unit_title: string;
  current_performance_percentage?: number | null;
  evidence_rationale: string;
  suggested_action: string;
}

export interface StudentPersonalMasteryReport {
  student_id: number;
  student_name: string;
  course_id?: number | null;
  course_title?: string | null;
  enrolled_courses_count: number;
  materials_completed: number;
  materials_total: number;
  material_completion_percentage?: number | null;
  assessments_completed: number;
  average_assessment_percentage?: number | null;
  latest_assessment_percentage?: number | null;
  latest_assessment_title?: string | null;
  latest_assessment_date?: string | null;
  performance_trend: Array<{
    date: string;
    exam_title: string;
    percentage: number;
  }>;
  strongest_unit?: string | null;
  revision_priority_unit?: string | null;
  syllabus_unit_mastery: StudentSyllabusUnitMastery[];
  question_type_mastery: QuestionTypeMasteryItem[];
  mcq_formats?: QuestionTypeMasteryItem[];
  structured_formats?: QuestionTypeMasteryItem[];
  essay_formats?: QuestionTypeMasteryItem[];
  cognitive_skills_mastery: CognitiveSkillMasteryItem[];
  revision_priorities: RevisionPriorityItem[];
  paper_phases_summary?: Record<string, any>;
  mcq_deep_dive?: {
    total_attempted: number;
    correct_count: number;
    incorrect_count: number;
    accuracy_percentage?: number | null;
    difficulty_breakdown?: Array<{
      difficulty: string;
      attempts: number;
      correct: number;
      accuracy_percentage?: number | null;
    }>;
  };
  structured_deep_dive?: {
    questions_attempted: number;
    total_max_marks: number;
    total_earned_marks: number;
    average_percentage?: number | null;
    questions?: Array<{
      question_id: number;
      question_number: number;
      exam_title: string;
      max_marks: number;
      earned_marks: number;
      percentage: number;
    }>;
  };
  essay_deep_dive?: {
    essays_attempted: number;
    total_max_marks: number;
    total_earned_marks: number;
    average_percentage?: number | null;
    questions?: Array<{
      question_id: number;
      question_number: number;
      exam_title: string;
      max_marks: number;
      earned_marks: number;
      percentage: number;
    }>;
  };
  structured_summary: Record<string, any>;
  essay_summary: Record<string, any>;
  assessment_history: Array<{
    submission_id: number;
    exam_id: number;
    exam_title: string;
    exam_type: string;
    raw_score?: number | null;
    scaled_score?: number | null;
    percentage?: number | null;
    grade?: string | null;
    status: string;
    submitted_at: string;
  }>;
  frequently_revisited_materials: Array<{
    material_id: number;
    title: string;
    material_type: string;
    is_completed: boolean;
    last_position?: number | null;
    last_updated: string;
  }>;
  personal_flags: Array<{
    flag_id: number;
    material_id?: number;
    material_title: string;
    context_type: string;
    context_value: string;
    comment: string;
    is_resolved: boolean;
    teacher_reply?: string | null;
    resolved_at?: string | null;
    status_label?: string;
    created_at: string;
  }>;
  personal_ai_topics: Array<{ topic: string; count: number }>;
  personal_signals: string[];
}

// ─── Phase A5 Advanced Cross-Analytics & Learning Intelligence Interfaces ─────

export interface ActionableTargetLink {
  label: string;
  target_url: string;
  action_type: string;
}

export interface ContentHotspotIntelligence {
  hotspot_id: string;
  unit_id?: number | null;
  unit_title: string;
  priority_level: "HIGH_PRIORITY" | "MEDIUM_PRIORITY" | "MONITORING" | "HEALTHY" | "NOT_STARTED" | "NO_DATA" | "ASSESSMENT_ONLY" | "LEARNING_ONLY";
  evidence_state?: "NO_DATA" | "LEARNING_ONLY" | "ASSESSMENT_ONLY" | "LIMITED_DATA" | "EVIDENCE_AVAILABLE" | "STRONG_EVIDENCE" | string;
  evidence_confidence: "strong_pattern" | "emerging_pattern" | "early_signal" | "insufficient_data";
  evidence_points: string[];
  material_completion_pct?: number | null;
  assessment_score_pct?: number | null;
  flags_count: number;
  unresolved_flags_count: number;
  ai_inquiries_count: number;
  subpart_losses_count: number;
  essay_omissions_count: number;
  neutral_insight: string;
  recommended_actions: ActionableTargetLink[];
}

export interface QuestionTypeTopicCrossItem {
  unit_title: string;
  direct_recall_accuracy?: number | null;
  applied_multi_variable_accuracy?: number | null;
  gap_percentage?: number | null;
  insight: string;
}

export interface CognitiveLevelTopicCrossItem {
  unit_title: string;
  lower_order_accuracy?: number | null;
  higher_order_accuracy?: number | null;
  attenuation_gap?: number | null;
  insight: string;
}

export interface DistractorIntelligenceItem {
  question_id: number;
  question_number: number;
  exam_title: string;
  stem_snippet: string;
  correct_option: string;
  strong_distractor_option: string;
  distractor_selection_pct: number;
  cognitive_level: string;
  insight: string;
}

export interface LongitudinalTopicTrendItem {
  unit_title: string;
  trend_direction: "improving" | "declining" | "stable_strength" | "persistent_weakness" | "insufficient_data";
  score_progression: number[];
  net_change_pct?: number | null;
  insight: string;
}

export interface TeacherCourseLearningIntelligenceReport {
  course_id: number;
  course_title: string;
  enrolled_students: number;
  total_assessments_analyzed: number;
  hotspots: ContentHotspotIntelligence[];
  question_type_cross_matrix: QuestionTypeTopicCrossItem[];
  cognitive_cross_matrix: CognitiveLevelTopicCrossItem[];
  distractor_insights: DistractorIntelligenceItem[];
  longitudinal_trends: LongitudinalTopicTrendItem[];
  executive_summary_narrative: string;
  ai_narrative_status: string;
}

export interface StudentPersonalLearningIntelligenceReport {
  student_id: number;
  student_name: string;
  course_id?: number | null;
  personal_hotspots: ContentHotspotIntelligence[];
  question_format_divergence: QuestionTypeTopicCrossItem[];
  cognitive_attenuation: CognitiveLevelTopicCrossItem[];
  personal_longitudinal_trends: LongitudinalTopicTrendItem[];
  actionable_recommendations: ActionableTargetLink[];
  personal_executive_narrative: string;
  ai_narrative_status: string;
}

// ─── Phase A6 Analytics Reporting & Export Interfaces ─────────────────────────

export interface AssessmentHighlightItem {
  exam_id: number;
  exam_title: string;
  exam_type: string;
  submissions_count: number;
  average_score_percentage?: number | null;
  pass_rate_percentage?: number | null;
}

export interface CourseComprehensiveReport {
  course_id: number;
  course_title: string;
  generated_at: string;
  enrolled_students: number;
  active_learners_30d: number;
  average_material_completion?: number | null;
  assessments_conducted: number;
  total_submissions: number;
  course_average_score?: number | null;
  total_material_flags: number;
  unresolved_flags: number;
  total_ai_questions: number;
  executive_summary: string;
  assessment_highlights: AssessmentHighlightItem[];
  grade_distribution?: Record<string, number>;
  top_difficult_questions: Array<{
    question_id: number;
    question_number: number;
    exam_title: string;
    template_type: string;
    cognitive_level: string;
    average_score_percentage: number;
    attempts_count: number;
  }>;
  syllabus_breakdown: Array<{
    unit_id: number;
    unit_title: string;
    material_completion_pct?: number | null;
    assessment_score_pct?: number | null;
    priority_level: string;
    flags_count: number;
    ai_inquiries_count: number;
  }>;
  learning_hotspots: ContentHotspotIntelligence[];
  recommended_teacher_actions: ActionableTargetLink[];
  ai_narrative_status: string;
}

// ─── Phase V5.4: Cross-Analytics & Teacher Intelligence Interfaces ───────────

export interface LearningAssessmentDivergenceItem {
  unit_id?: number | null;
  unit_title: string;
  learning_activity_pct?: number | null;
  assessment_score_pct?: number | null;
  divergence_state: "ENGAGED_MASTERED" | "ENGAGED_STRUGGLING" | "LOW_ACTIVITY_HIGH_ATTAINMENT" | "LOW_ACTIVITY_LOW_ATTAINMENT" | "NO_DATA" | "LEARNING_ONLY" | "ASSESSMENT_ONLY" | "LIMITED_DATA" | string;
  divergence_label: string;
  interpretation: string;
  pedagogical_action: string;
  evidence_points: string[];
}

export interface UnitQuestionInventoryItem {
  question_id: number;
  question_number: number;
  exam_id: number;
  exam_title: string;
  exam_type: "paper_1_mcq" | "paper_2a_structured" | "paper_2b_essay" | string;
  template_type: string;
  template_name: string;
  stem_text: string;
  points: number;
  average_score_pct?: number | null;
  cognitive_level: string;
  subparts_count: number;
  criteria_count: number;
}

export interface UnitFormatDivergenceItem {
  unit_id: number;
  unit_title: string;
  mcq_attainment_pct?: number | null;
  structured_attainment_pct?: number | null;
  essay_attainment_pct?: number | null;
  format_pattern: "CONSISTENT" | "RECOGNITION_PROBLEM" | "CONSTRUCTION_PROBLEM" | "EXPLANATION_PROBLEM" | "BROAD_WEAKNESS" | "INSUFFICIENT_DATA" | string;
  pattern_label: string;
  insight: string;
}

export interface CognitiveDepthIntelligence {
  unit_id?: number | null;
  unit_title: string;
  bloom_levels: Record<string, number | null>;
  lower_order_avg_pct?: number | null;
  higher_order_avg_pct?: number | null;
  has_taxonomy_metadata: boolean;
  insight: string;
}

export interface UnitCrossAnalyticsItem {
  unit_id: number;
  unit_title: string;
  unit_order: number;
  materials_count: number;
  materials_viewed_count: number;
  materials_completed_count: number;
  material_completion_pct?: number | null;
  total_material_views: number;
  difficulty_flags_count: number;
  unresolved_flags_count: number;
  ask_ai_inquiries_count: number;
  questions_count: number;
  evaluated_attempts_count: number;
  assessment_attainment_pct?: number | null;
  mcq_attainment_pct?: number | null;
  structured_attainment_pct?: number | null;
  essay_attainment_pct?: number | null;
  divergence_state: string;
  evidence_state: string;
  confidence_level: "high" | "moderate" | "limited" | string;
  evidence_explanation: string;
  why_this_matters: string;
  struggling_students_count: number;
  mastering_students_count: number;
  recommended_actions: ActionableTargetLink[];
}

export interface TeacherCrossAnalyticsReport {
  course_id: number;
  course_title: string;
  enrolled_students: number;
  total_materials: number;
  total_questions: number;
  total_submissions_analyzed: number;
  units: UnitCrossAnalyticsItem[];
  divergence_matrix: LearningAssessmentDivergenceItem[];
  format_divergence_matrix: UnitFormatDivergenceItem[];
  cognitive_intelligence: CognitiveDepthIntelligence[];
  hotspots: ContentHotspotIntelligence[];
  summary_counts: Record<string, number>;
}

export interface StudentCrossAnalyticsDossier {
  student_id: number;
  student_name: string;
  student_email: string;
  course_id: number;
  course_title: string;
  overall_assessment_pct?: number | null;
  overall_material_completion_pct?: number | null;
  total_flags_count: number;
  unresolved_flags_count: number;
  ask_ai_inquiries_count: number;
  primary_learning_signal: "Strong" | "Monitor" | "Needs Attention" | "High Priority" | string;
  evidence_state: string;
  divergence_state: string;
  divergence_explanation: string;
  unit_breakdown: Array<{
    unit_id: number;
    unit_title: string;
    material_completion_pct?: number | null;
    assessment_score_pct?: number | null;
    flags_count: number;
    evidence_status: string;
    mastery_status: string;
  }>;
  format_breakdown: Record<string, number | null>;
  cognitive_breakdown: Record<string, number | null>;
  suggested_teacher_actions: ActionableTargetLink[];
}

// Singleton instance
const api = new ApiClient();
export default api;
