/**
 * API client for communicating with the FastAPI backend.
 * Handles authentication tokens automatically.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

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
    return localStorage.getItem("access_token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { skipAuth = false, headers: customHeaders, ...rest } = options;
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

    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers,
      ...rest,
    });

    if (!response.ok) {
      // Auto-logout on expired/invalid token
      if (response.status === 401 && !skipAuth) {
        localStorage.removeItem("access_token");
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }

      const error = await response.json().catch(() => ({
        detail: "An unexpected error occurred",
      }));
      throw new ApiError(
        response.status,
        error.detail || "An unexpected error occurred"
      );
    }

    return response.json();
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

  async login(email: string, password: string) {
    const data = await this.request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    localStorage.setItem("access_token", data.access_token);
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
    localStorage.removeItem("access_token");
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

  async adminCreateUser(data: { email: string; full_name: string; password: string; role: "admin" | "teacher" | "student" }) {
    return this.request<User>("/users/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async adminDeleteUser(userId: number) {
    return this.request<{ message: string; success: boolean }>(`/users/${userId}`, { method: "DELETE" });
  }

  async adminUpdateUser(userId: number, data: { full_name?: string }) {
    return this.request<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data)
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

  async adminDeleteCourse(courseId: number) {
    return this.request<{ message: string; success: boolean }>(`/courses/${courseId}`, { method: "DELETE" });
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

  async summarizeMaterial(materialId: number) {
    return this.request<{ summary: string }>(`/materials/${materialId}/summarize`, {
      method: "POST"
    });
  }

  async getTeacherMaterialFlags() {
    return this.request<TeacherMaterialFlag[]>("/materials/teacher/insights/flags");
  }

  async resolveMaterialFlag(flagId: number) {
    return this.request(`/materials/teacher/insights/flags/${flagId}/resolve`, {
      method: "POST"
    });
  }

  async bulkResolveMaterialFlags(flagIds: number[], message: string) {
    return this.request<{ message: string; success: boolean }>("/materials/teacher/insights/flags/bulk-resolve", {
      method: "POST",
      body: JSON.stringify({ flag_ids: flagIds, message })
    });
  }

  // ─── Quizzes ───────────────────────────
  async listQuizzes(lessonId: number) {
    return this.request<Quiz[]>(`/quizzes/lesson/${lessonId}`);
  }

  async getQuiz(quizId: number) {
    return this.request<QuizDetail>(`/quizzes/${quizId}`);
  }

  async createQuiz(data: {
    title: string;
    description?: string;
    time_limit_minutes?: number;
    lesson_id: number;
    short_answer_grading_mode?: "manual" | "ai";
    questions?: QuestionCreate[];
  }) {
    return this.request<Quiz>("/quizzes/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createQuizFromBank(data: {
    title: string;
    description?: string;
    time_limit_minutes?: number;
    lesson_id: number;
    question_ids: number[];
  }) {
    return this.request<Quiz>("/quizzes/from-bank", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateQuiz(
    quizId: number,
    data: Partial<{
      title: string;
      description: string;
      status: string;
      time_limit_minutes: number;
      short_answer_grading_mode: "manual" | "ai";
    }>
  ) {
    return this.request<Quiz>(`/quizzes/${quizId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async startQuizAttempt(quizId: number) {
    return this.request<QuizAttempt>(`/quizzes/${quizId}/start`, {
      method: "POST"
    });
  }

  async submitQuiz(quizId: number, answers: { question_version_id: number; student_answer: string }[]) {
    return this.request<QuizAttempt>(`/quizzes/${quizId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }

  async logIntegrityEvent(attemptId: number, data: { event_type: string; metadata_json?: any }) {
    return this.request<{ message: string; success: boolean }>(`/quizzes/attempts/${attemptId}/integrity-events`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getQuizAttempts(quizId: number) {
    return this.request<QuizAttempt[]>(`/quizzes/${quizId}/attempts`);
  }

  async flagQuizAnswer(attemptId: number, answerId: number) {
    return this.request(`/quizzes/attempts/${attemptId}/answers/${answerId}/flag`, {
      method: "POST"
    });
  }


  async getTeacherFlaggedAnswers() {
    return this.request<any[]>("/quizzes/teacher/flagged-answers"); // Legacy route
  }

  async getGradingQueue() {
    return this.request<GradingQueueItem[]>("/quizzes/teacher/grading-queue");
  }

  async moderateQuizAnswer(answerId: number, data: { is_correct: boolean, points_earned: number, teacher_note?: string }) {
    return this.request<{ message: string, new_score: number }>(`/quizzes/teacher/answers/${answerId}/moderate`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  async getAttemptDetail(quizId: number, attemptId: number) {
    return this.request<AttemptDetail>(`/quizzes/${quizId}/attempts/${attemptId}/detail`);
  }

  async deleteQuiz(quizId: number) {
    return this.request(`/quizzes/${quizId}`, { method: "DELETE" });
  }

  async addQuestion(quizId: number, data: QuestionCreate) {
    return this.request(`/quizzes/${quizId}/questions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteQuestion(quizId: number, questionId: number) {
    return this.request(`/quizzes/${quizId}/questions/${questionId}`, { method: "DELETE" });
  }

  async importQuestionsFromBank(quizId: number, questionVersionIds: number[]) {
    return this.request<{ message: string; added: number }>(`/quizzes/${quizId}/questions/import-bank`, {
      method: "POST",
      body: JSON.stringify({ question_version_ids: questionVersionIds }),
    });
  }

  async generateAIQuiz(data: {
    lesson_id: number;
    title?: string;
    num_questions?: number;
    question_types?: string[];
    difficulty?: string;
    material_ids?: number[];
  }) {
    return this.request<{ message: string; task_id: number }>("/quizzes/ai/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAITaskStatus(taskId: number) {
    return this.request<{ task_id: number; status: string; quiz_id?: number; error?: string }>(`/quizzes/ai/task/${taskId}`);
  }

  async generateAIQuizFromPDF(data: FormData) {
    return this.request<{ message: string; task_id: number }>("/quizzes/ai/generate-pdf", {
      method: "POST",
      body: data,
    });
  }

  // ─── Analytics ─────────────────────────
  async getAdminStats() {
    return this.request<DashboardStats>("/analytics/admin/stats");
  }

  async getAdminOverview() {
    return this.request<AdminOverview>("/analytics/admin/overview");
  }

  async getAIPerformance() {
    return this.request<AIPerformance>("/analytics/admin/ai-performance");
  }

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
      if (params.limit) q.append("limit", params.limit.toString());
      if (params.offset) q.append("offset", params.offset.toString());
      const qStr = q.toString();
      if (qStr) url += `?${qStr}`;
    }
    return this.request(url);
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

  async askQuestion(courseId: number, question: string) {
    return this.request<QAResponse>("/qa/ask", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, question }),
    });
  }

  async askQuestionStream(
    courseId: number, 
    question: string, 
    onMessage: (data: any) => void, 
    onError: (err: any) => void,
    onDone: () => void
  ) {
    const token = typeof window !== 'undefined' ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${API_BASE}/qa/ask/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ course_id: courseId, question })
      });
      
      if (!res.ok) {
        throw new Error("Failed to stream response");
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      
      if (!reader) return onDone();
      
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\\n\\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === 'error') {
                onError(new Error(data.text));
              } else if (data.type === 'done') {
                onDone();
              } else {
                onMessage(data);
              }
            } catch (e) {
              console.error("Parse error", e);
            }
          }
        }
      }
      if (buffer.startsWith("data: ")) {
         try {
           const data = JSON.parse(buffer.substring(6));
           onMessage(data);
         } catch(e) {}
      }
      onDone();
    } catch (e) {
      onError(e);
    }
  }

  async getQuestionHistory(courseId: number) {
    return this.request<QAResponse[]>(`/qa/history/${courseId}`);
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

  async sendDirectMessage(courseId: number, receiverId: number, content: string, tag?: string) {
    return this.request<DirectMessageResponse>("/messages/send", {
      method: "POST",
      body: JSON.stringify({
        course_id: courseId,
        receiver_id: receiverId,
        content: content,
        tag: tag
      })
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

  // ─── Phase 8: Recommendations ───────────────────────────
  async getStudentRecommendations() {
    return this.request<StudyRecommendation[]>("/analytics/student/recommendations");
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

  async getAdminPaymentOverview() {
    return this.request<PaymentOverview>("/payments/admin/overview");
  }

  async getAdminTransactions(statusFilter?: string) {
    const query = statusFilter ? `?status_filter=${statusFilter}` : "";
    return this.request<PaymentResponse[]>(`/payments/admin/transactions${query}`);
  }

  async sendPaymentReminder(paymentId: number) {
    return this.request<{ message: string; success: boolean }>(`/payments/admin/send-reminder/${paymentId}`, {
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

export interface Lesson {
  id: number;
  title: string;
  description?: string;
  order: number;
  is_published: boolean;
  course_id: number;
  created_at: string;
  material_count: number;
}

export interface Material {
  id: number;
  title: string;
  description?: string;
  material_type: "note" | "pdf" | "image" | "video";
  file_path?: string;
  content?: string;
  extracted_text?: string;
  processing_status: string;
  lesson_id: number;
  created_at: string;
}

export interface Quiz {
  id: number;
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
  total_questions_asked: number;
  completion_rate?: number;
}

export interface StudentProgress {
  student_id: number;
  student_name: string;
  courses_enrolled: number;
  quizzes_taken: number;
  average_score?: number;
  questions_asked: number;
  last_active?: string;
}

export interface QAResponse {
  question_id: number;
  question_text: string;
  response_text?: string;
  context_sources?: { material_id?: number; title?: string; relevance?: number }[];
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
  quiz_title: string;
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
  average_score?: number;
  questions_asked: number;
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
  quiz_results: StudentCourseQuizResult[];
  completion_percentage: number;
  total_quizzes: number;
  completed_quizzes: number;
  questions_asked: number;
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
  events: IntegrityEventView[];
}

// Singleton instance
const api = new ApiClient();
export default api;
