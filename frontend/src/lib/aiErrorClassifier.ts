/**
 * Universal AI Generation Error Classifier for Lumora LMS
 * Standardizes error categories and messages across MCQ, Structured, and Essay generation systems.
 * Guarantees zero raw stack trace leaks, provides preservation reassurance, and formats retry delays.
 */

export type AIErrorCategory =
  | "quota"
  | "network"
  | "response"
  | "timeout"
  | "service"
  | "auth"
  | "server";

export interface ClassifiedAIError {
  category: AIErrorCategory;
  title: string;
  message: string;
  retryable: boolean;
  retryDelaySeconds?: number;
  generationId?: string;
  originalError?: any;
}

/**
 * Classifies any error (ApiError, fetch exception, HTTP status, detail dict, or message) into a standard category.
 * Guarantees human-friendly explanation and never leaks raw stack traces or internal logs.
 */
export function classifyAIError(err: any): ClassifiedAIError {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  
  // Check if detail is a structured object from Lumora's centralized backend
  const detailObj = typeof err?.detail === "object" && err?.detail !== null ? err.detail : null;
  const backendCode = detailObj?.code || (typeof err?.code === "string" ? err.code : "");
  const backendMessage = detailObj?.message || "";
  const backendRetrySeconds = detailObj?.retry_after_seconds;
  const generationId = detailObj?.generation_id || err?.generation_id;

  const rawMsg = (
    backendMessage ||
    err?.message ||
    (typeof err?.detail === "string" ? err.detail : "") ||
    err?.error ||
    (typeof err === "string" ? err : "")
  ).toLowerCase();

  // 1. Quota / Rate-limit Exceeded (429, RATE_LIMITED, RESOURCE_EXHAUSTED, RateLimit)
  if (
    status === 429 ||
    backendCode === "RATE_LIMITED" ||
    rawMsg.includes("429") ||
    rawMsg.includes("rate_limited") ||
    rawMsg.includes("resource_exhausted") ||
    rawMsg.includes("quota") ||
    rawMsg.includes("rate_limit") ||
    rawMsg.includes("rate limit") ||
    rawMsg.includes("free_tier_requests") ||
    rawMsg.includes("too many requests") ||
    rawMsg.includes("limit reached")
  ) {
    let retryDelaySeconds: number | undefined = backendRetrySeconds;
    if (retryDelaySeconds === undefined) {
      const delayMatch = rawMsg.match(/(?:retry.*?|in\s+)(\d+)\s*(?:s|sec|second)/i);
      if (delayMatch) {
        retryDelaySeconds = parseInt(delayMatch[1], 10);
      }
    }

    const delaySuffix = retryDelaySeconds && retryDelaySeconds > 0
      ? ` Try again in approximately ${retryDelaySeconds} seconds.`
      : "";

    return {
      category: "quota",
      title: "AI generation temporarily limited",
      message: `Lumora's AI service has reached its current generation limit. Your configuration and existing generated questions are safe. Please try again when the service becomes available.${delaySuffix}`,
      retryable: true,
      retryDelaySeconds,
      generationId,
      originalError: err,
    };
  }

  // 2. Network Drops / Connection Errors / Socket Resets
  if (
    status === 0 ||
    backendCode === "NETWORK_ERROR" ||
    rawMsg.includes("network_error") ||
    rawMsg.includes("network") ||
    rawMsg.includes("failed to fetch") ||
    rawMsg.includes("connection refused") ||
    rawMsg.includes("connection reset") ||
    rawMsg.includes("unable to connect") ||
    rawMsg.includes("offline") ||
    rawMsg.includes("econnrefused") ||
    rawMsg.includes("socket") ||
    rawMsg.includes("interrupted") ||
    rawMsg.includes("wsarecv") ||
    rawMsg.includes("wsasend") ||
    rawMsg.includes("forcibly closed") ||
    rawMsg.includes("connection failed")
  ) {
    return {
      category: "network",
      title: "Connection problem",
      message: "Lumora could not reach the AI generation service. Check your internet connection and try again. Your configuration has been preserved.",
      retryable: true,
      generationId,
      originalError: err,
    };
  }

  // 3. Request Timeout / Aborted
  if (
    status === 408 ||
    status === 504 ||
    backendCode === "TIMEOUT" ||
    rawMsg.includes("timeout") ||
    rawMsg.includes("timed out") ||
    rawMsg.includes("deadline_exceeded") ||
    rawMsg.includes("aborted")
  ) {
    return {
      category: "timeout",
      title: "Generation timed out",
      message: "The AI service took too long to respond. Your configuration has been preserved and you can safely retry.",
      retryable: true,
      generationId,
      originalError: err,
    };
  }

  // 4. Invalid AI Response / Malformed JSON / Zero Questions
  if (
    status === 422 ||
    backendCode === "INVALID_RESPONSE" ||
    rawMsg.includes("invalid_response") ||
    rawMsg.includes("json") ||
    rawMsg.includes("unparseable") ||
    rawMsg.includes("invalid response") ||
    rawMsg.includes("malformed") ||
    rawMsg.includes("syntaxerror") ||
    rawMsg.includes("decode") ||
    rawMsg.includes("zero questions") ||
    rawMsg.includes("0 valid") ||
    rawMsg.includes("incomplete")
  ) {
    return {
      category: "response",
      title: "Generation could not be completed",
      message: "The AI service responded, but Lumora could not safely process the generated content. Your configuration has been preserved. You can retry without rebuilding your blueprint.",
      retryable: true,
      generationId,
      originalError: err,
    };
  }

  // 5. Service Temporarily Busy / High Demand (503, PROVIDER_UNAVAILABLE)
  if (
    status === 503 ||
    backendCode === "PROVIDER_UNAVAILABLE" ||
    rawMsg.includes("provider_unavailable") ||
    rawMsg.includes("unavailable") ||
    rawMsg.includes("high demand") ||
    rawMsg.includes("overloaded") ||
    rawMsg.includes("server is busy")
  ) {
    return {
      category: "service",
      title: "AI generation temporarily unavailable",
      message: "AI generation is temporarily unavailable. Please try again later. Your configuration has been preserved.",
      retryable: true,
      generationId,
      originalError: err,
    };
  }

  // 6. Authentication / Configuration Error (401, 403, AUTH_ERROR)
  if (
    status === 401 ||
    status === 403 ||
    backendCode === "AUTH_ERROR" ||
    rawMsg.includes("auth_error") ||
    rawMsg.includes("unauthorized") ||
    rawMsg.includes("unauthenticated") ||
    rawMsg.includes("permission_denied") ||
    rawMsg.includes("api key") ||
    rawMsg.includes("api_key")
  ) {
    return {
      category: "auth",
      title: "AI configuration error",
      message: "The AI generation service is not configured correctly. Please contact the system administrator.",
      retryable: false,
      generationId,
      originalError: err,
    };
  }

  // 7. Backend Server Error / Unexpected (500)
  return {
    category: "server",
    title: "Generation service error",
    message: "Something went wrong while processing the generation request. Your configuration has been preserved.",
    retryable: true,
    generationId,
    originalError: err,
  };
}
