"""
Centralized AI Generation Infrastructure for Lumora LMS.

Provides a unified, cost-conscious, observable, and resilient execution engine
for all AI question generation workflows (MCQ, Structured, and Essay).

Guarantees:
- Unique generation_id per request for end-to-end tracing.
- Immediate 429 rate-limit detection with retry_after_seconds extraction (no wasteful loops).
- Differentiated handling for network errors, timeouts, malformed JSON, and auth failures.
- Partial generation retention (preserves valid questions when output is incomplete).
- Structured logging without exposing API keys or huge payloads.
- Clean FastAPI error contract with machine-readable error codes and user-friendly messages.
"""

import json
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import HTTPException
from app.services.gemini_service import gemini

logger = logging.getLogger(__name__)


# Standardized Machine-Readable Error Codes
class AIErrorCode:
    RATE_LIMITED = "RATE_LIMITED"
    NETWORK_ERROR = "NETWORK_ERROR"
    TIMEOUT = "TIMEOUT"
    INVALID_RESPONSE = "INVALID_RESPONSE"
    AUTH_ERROR = "AUTH_ERROR"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    SERVER_ERROR = "SERVER_ERROR"


# User-Friendly Error Message Mapping (never exposes raw Python/Gemini stack traces)
USER_FRIENDLY_ERROR_MESSAGES = {
    AIErrorCode.RATE_LIMITED: "AI generation is temporarily rate limited. Your configuration and existing generated questions are safe. Please try again when the service is available.",
    AIErrorCode.NETWORK_ERROR: "Lumora could not reach the AI service. Check your internet connection and try again.",
    AIErrorCode.TIMEOUT: "The AI generation request took too long to complete. Your configuration has been preserved.",
    AIErrorCode.INVALID_RESPONSE: "The AI service responded, but Lumora could not safely interpret the generated content. Your configuration has been preserved.",
    AIErrorCode.AUTH_ERROR: "The AI generation service is not configured correctly. Please check the AI service configuration.",
    AIErrorCode.PROVIDER_UNAVAILABLE: "The AI service is temporarily unavailable. Please try again later.",
    AIErrorCode.SERVER_ERROR: "Lumora encountered an unexpected server error while generating questions. Your configuration has been preserved.",
}


@dataclass
class AIGenerationResult:
    """
    Standardized internal result payload across all Lumora AI generators.
    """
    success: bool
    status: str  # "success" | "partial" | "rate_limited" | "timeout" | "network_error" | "invalid_response" | "provider_error" | "auth_error"
    data: Optional[Dict[str, Any]] = None  # Parsed and validated questions dictionary
    raw_text: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    retry_after_seconds: Optional[int] = None
    generation_id: str = field(default_factory=lambda: f"gen_{uuid.uuid4().hex[:8]}")
    generation_type: str = "MCQ"  # "MCQ" | "STRUCTURED" | "ESSAY"
    model: str = "gemini-flash-latest"
    duration_ms: int = 0
    tokens_used: Optional[int] = None
    requested_count: int = 0
    generated_count: int = 0
    rejected_count: int = 0
    retry_count: int = 0
    diagnostic_summary: Optional[str] = None


def generate_generation_id(gen_type: str) -> str:
    """Creates a short, recognizable generation identifier for request tracing."""
    prefix_map = {
        "mcq": "gen_mcq",
        "paper_1_mcq": "gen_mcq",
        "structured": "gen_str",
        "paper_2_structured": "gen_str",
        "structured_subparts": "gen_str",
        "essay": "gen_ess",
        "paper_2_essay": "gen_ess",
        "essay_rubric": "gen_ess",
    }
    prefix = prefix_map.get(gen_type.lower(), f"gen_{gen_type.lower()[:3]}")
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def extract_retry_after_seconds(error_text: str) -> Optional[int]:
    """Extracts integer retry delay (in seconds) from Gemini error text if present."""
    match = re.search(r'(?:retry.*?|in\s+)(\d+)\s*(?:s|sec|second)', error_text, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except (ValueError, TypeError):
            return None
    return None


def classify_raw_exception(e: Exception) -> Tuple[str, str, Optional[int]]:
    """
    Classifies raw exception into (error_code, user_message, retry_after_seconds).
    Guarantees no raw Python stack trace or internal credential leaks.
    """
    error_str = str(e).lower()

    # 1. Auth / Missing API Key / Permission Denied
    if any(kw in error_str for kw in ["401", "403", "api_key", "api key", "unauthenticated", "permission_denied"]):
        code = AIErrorCode.AUTH_ERROR
        return code, USER_FRIENDLY_ERROR_MESSAGES[code], None

    # 2. Gemini 429 Quota / Rate-limit Exceeded (Immediate detection)
    if any(kw in error_str for kw in ["429", "resource_exhausted", "quota", "rate_limit", "free_tier_requests"]):
        code = AIErrorCode.RATE_LIMITED
        retry_delay = extract_retry_after_seconds(error_str)
        msg = USER_FRIENDLY_ERROR_MESSAGES[code]
        if retry_delay:
            msg += f" Retry available in approximately {retry_delay} seconds."
        return code, msg, retry_delay

    # 3. Timeout / Deadline Exceeded
    if any(kw in error_str for kw in ["timeout", "timed out", "deadline_exceeded", "408", "504"]):
        code = AIErrorCode.TIMEOUT
        return code, USER_FRIENDLY_ERROR_MESSAGES[code], None

    # 4. Low/Unstable Internet, Socket Drops, Reset, Failed to Fetch, Remote Forcibly Closed
    if any(kw in error_str for kw in ["connection", "failed to fetch", "offline", "wsarecv", "wsasend", "forcibly closed", "socket", "network", "econnrefused", "reset"]):
        code = AIErrorCode.NETWORK_ERROR
        return code, USER_FRIENDLY_ERROR_MESSAGES[code], None

    # 5. Service Temporarily Busy / 503 / Overloaded
    if any(kw in error_str for kw in ["503", "unavailable", "high demand", "overloaded", "server is busy"]):
        code = AIErrorCode.PROVIDER_UNAVAILABLE
        return code, USER_FRIENDLY_ERROR_MESSAGES[code], None

    # 6. JSON Parse / Malformed Response
    if isinstance(e, json.JSONDecodeError) or any(kw in error_str for kw in ["json", "decode", "unparseable", "syntaxerror", "malformed"]):
        code = AIErrorCode.INVALID_RESPONSE
        return code, USER_FRIENDLY_ERROR_MESSAGES[code], None

    # 7. Generic Server / Unknown
    code = AIErrorCode.SERVER_ERROR
    return code, USER_FRIENDLY_ERROR_MESSAGES[code], None


def execute_central_ai_generation(
    prompt: str,
    system_instruction: str = "",
    generation_type: str = "MCQ",
    requested_count: int = 10,
    model_tier: str = "flash",
    temperature: float = 0.25,
    max_tokens: int = 8192,
    validator_fn: Optional[Callable[[Dict[str, Any]], Tuple[List[Any], List[Any]]]] = None,
    generation_id: Optional[str] = None,
    max_fallback_models: int = 5,
) -> AIGenerationResult:
    """
    Executes a structured AI generation request through the centralized Gemini infrastructure.

    Cost-conscious retry policy:
    - 429 Rate limits: Fails immediately (or waits once ONLY if retry delay <= 15s).
    - Network drops / socket errors: Retries max 2 times with backoff (1s, 2s).
    - Provider 503 / busy: Retries 1 time with backoff (2s).
    - Auth / Invalid JSON: Never retries blindly.
    """
    gen_id = generation_id or generate_generation_id(generation_type)
    resolved_model = gemini._resolve_model(model_tier)
    start_time = time.time()

    retry_count = 0
    max_network_retries = 2
    raw_result: Optional[Dict[str, Any]] = None
    last_exception: Optional[Exception] = None

    for attempt in range(1, max_network_retries + 2):
        try:
            raw_result = gemini.generate_json(
                prompt=prompt,
                system_instruction=system_instruction,
                model_tier=model_tier,
                temperature=temperature,
                max_tokens=max_tokens,
                max_fallback_models=max_fallback_models,
            )
            break
        except Exception as e:
            last_exception = e
            error_str = str(e).lower()
            code, _, retry_delay = classify_raw_exception(e)

            # Never retry auth errors or malformed JSON
            if code in (AIErrorCode.AUTH_ERROR, AIErrorCode.INVALID_RESPONSE):
                logger.warning(f"[{gen_id}] AI generation aborted immediately on non-retryable {code}: {type(e).__name__}")
                break

            # 429 Quota Rate Limits: Do NOT execute aggressive repeated retries!
            if code == AIErrorCode.RATE_LIMITED:
                # If explicit short retry delay was given (<= 10s) on attempt 1, wait once; otherwise abort immediately
                if retry_delay and retry_delay <= 10 and attempt == 1:
                    logger.info(f"[{gen_id}] Rate limit with short delay ({retry_delay}s): waiting {retry_delay + 1}s before single retry...")
                    time.sleep(retry_delay + 1)
                    retry_count += 1
                    continue
                else:
                    logger.warning(f"[{gen_id}] Gemini rate limit reached (429). Aborting immediately to conserve quota.")
                    break

            # Transient Network or 503 errors: allow limited backoff retry
            if code in (AIErrorCode.NETWORK_ERROR, AIErrorCode.PROVIDER_UNAVAILABLE, AIErrorCode.TIMEOUT) and attempt <= max_network_retries:
                wait_sec = attempt * 1.5
                logger.info(f"[{gen_id}] Transient {code} on attempt {attempt}: waiting {wait_sec}s before retry...")
                time.sleep(wait_sec)
                retry_count += 1
                continue

            break

    elapsed_ms = int((time.time() - start_time) * 1000)

    # If raw result could not be obtained
    if raw_result is None:
        error_code, user_msg, retry_after = classify_raw_exception(last_exception or Exception("Unknown error"))
        diag = f"{type(last_exception).__name__}: {str(last_exception)[:200]}" if last_exception else "No result"

        res = AIGenerationResult(
            success=False,
            status=error_code.lower(),
            data=None,
            error_code=error_code,
            error_message=user_msg,
            retry_after_seconds=retry_after,
            generation_id=gen_id,
            generation_type=generation_type,
            model=resolved_model,
            duration_ms=elapsed_ms,
            tokens_used=None,
            requested_count=requested_count,
            generated_count=0,
            rejected_count=0,
            retry_count=retry_count,
            diagnostic_summary=diag,
        )

        logger.info(
            f"[AI GENERATION] generation_id={res.generation_id} type={res.generation_type} "
            f"requested={res.requested_count} model={res.model} status={res.status} "
            f"duration_ms={res.duration_ms} retry_count={res.retry_count} generated=0 rejected=0"
        )
        return res

    # Validate output schema if validator function was provided
    valid_items: List[Any] = []
    rejected_items: List[Any] = []

    if validator_fn:
        try:
            valid_items, rejected_items = validator_fn(raw_result)
        except Exception as ve:
            logger.warning(f"[{gen_id}] Validation function error: {ve}")
            valid_items = []
            rejected_items = []
    else:
        # Default extraction: check for root "questions" key
        if isinstance(raw_result, dict) and "questions" in raw_result and isinstance(raw_result["questions"], list):
            valid_items = raw_result["questions"]
        elif isinstance(raw_result, list):
            valid_items = raw_result
        else:
            valid_items = [raw_result]

    generated_count = len(valid_items)
    rejected_count = len(rejected_items)

    # Check for zero valid questions
    if generated_count == 0:
        res = AIGenerationResult(
            success=False,
            status="invalid_response",
            data=None,
            error_code=AIErrorCode.INVALID_RESPONSE,
            error_message=USER_FRIENDLY_ERROR_MESSAGES[AIErrorCode.INVALID_RESPONSE],
            generation_id=gen_id,
            generation_type=generation_type,
            model=resolved_model,
            duration_ms=elapsed_ms,
            requested_count=requested_count,
            generated_count=0,
            rejected_count=rejected_count,
            retry_count=retry_count,
            diagnostic_summary="AI returned 0 questions passing validation.",
        )
        logger.info(
            f"[AI GENERATION] generation_id={res.generation_id} type={res.generation_type} "
            f"requested={res.requested_count} model={res.model} status={res.status} "
            f"duration_ms={res.duration_ms} retry_count={res.retry_count} generated=0 rejected={rejected_count}"
        )
        return res

    # Partial vs Full Success
    status = "success" if generated_count >= requested_count else "partial"

    res = AIGenerationResult(
        success=True,
        status=status,
        data={"questions": valid_items},
        generation_id=gen_id,
        generation_type=generation_type,
        model=resolved_model,
        duration_ms=elapsed_ms,
        requested_count=requested_count,
        generated_count=generated_count,
        rejected_count=rejected_count,
        retry_count=retry_count,
    )

    logger.info(
        f"[AI GENERATION] generation_id={res.generation_id} type={res.generation_type} "
        f"requested={res.requested_count} model={res.model} status={res.status} "
        f"duration_ms={res.duration_ms} retry_count={res.retry_count} "
        f"generated={res.generated_count} rejected={res.rejected_count}"
    )
    return res


def raise_ai_generation_http_exception(result: AIGenerationResult) -> None:
    """
    Translates an unsuccessful AIGenerationResult into a standardized FastAPI HTTPException.
    Returns machine-readable JSON detail without leaking internal stack traces.
    """
    code = result.error_code or AIErrorCode.SERVER_ERROR
    msg = result.error_message or USER_FRIENDLY_ERROR_MESSAGES[AIErrorCode.SERVER_ERROR]

    status_map = {
        AIErrorCode.RATE_LIMITED: 429,
        AIErrorCode.NETWORK_ERROR: 503,
        AIErrorCode.TIMEOUT: 408,
        AIErrorCode.INVALID_RESPONSE: 422,
        AIErrorCode.AUTH_ERROR: 401,
        AIErrorCode.PROVIDER_UNAVAILABLE: 503,
        AIErrorCode.SERVER_ERROR: 500,
    }

    http_status = status_map.get(code, 500)

    detail_payload: Dict[str, Any] = {
        "code": code,
        "message": msg,
        "generation_id": result.generation_id,
    }

    headers: Dict[str, str] = {}
    if result.retry_after_seconds:
        detail_payload["retry_after_seconds"] = result.retry_after_seconds
        headers["Retry-After"] = str(result.retry_after_seconds)

    raise HTTPException(
        status_code=http_status,
        detail=detail_payload,
        headers=headers if headers else None,
    )
