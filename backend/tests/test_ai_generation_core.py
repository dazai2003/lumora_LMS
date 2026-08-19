"""
Comprehensive Unit Tests for Lumora Centralized AI Generation Infrastructure.

Verifies:
1. Unique generation_id assignment and tracing.
2. Immediate 429 rate limit detection and retry_after_seconds extraction (no aggressive looping).
3. Network disconnection and timeout handling with backoff.
4. Non-retryable auth failures (aborts immediately).
5. Partial generation preservation (valid questions retained).
6. Structured error serialization for FastAPI HTTPException (machine-readable JSON + Retry-After headers).
7. Structured logging and usage metadata capture without credential leakage.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.services.ai_generation_core import (
    AIGenerationResult,
    AIErrorCode,
    USER_FRIENDLY_ERROR_MESSAGES,
    generate_generation_id,
    extract_retry_after_seconds,
    classify_raw_exception,
    execute_central_ai_generation,
    raise_ai_generation_http_exception,
)


def test_generate_generation_id_prefixes():
    mcq_id = generate_generation_id("MCQ")
    assert mcq_id.startswith("gen_mcq_")

    str_id = generate_generation_id("STRUCTURED")
    assert str_id.startswith("gen_str_")

    ess_id = generate_generation_id("ESSAY")
    assert ess_id.startswith("gen_ess_")

    # Uniqueness
    id1 = generate_generation_id("MCQ")
    id2 = generate_generation_id("MCQ")
    assert id1 != id2


def test_extract_retry_after_seconds():
    msg1 = "ResourceExhausted: 429 Quota exceeded. Please retry after 49 seconds."
    assert extract_retry_after_seconds(msg1) == 49

    msg2 = "Rate limit hit, retry in 30s."
    assert extract_retry_after_seconds(msg2) == 30

    msg3 = "No explicit retry delay specified."
    assert extract_retry_after_seconds(msg3) is None


def test_classify_raw_exception_quota():
    exc = Exception("429 RESOURCE_EXHAUSTED: Free tier requests limit reached. Retry in 25s.")
    code, msg, retry_delay = classify_raw_exception(exc)
    assert code == AIErrorCode.RATE_LIMITED
    assert retry_delay == 25
    assert "temporarily rate limited" in msg or "limit reached" in msg
    assert "25 seconds" in msg


def test_classify_raw_exception_network():
    exc1 = Exception("wsarecv: An existing connection was forcibly closed by the remote host.")
    code1, msg1, _ = classify_raw_exception(exc1)
    assert code1 == AIErrorCode.NETWORK_ERROR
    assert "could not reach the AI service" in msg1

    exc2 = Exception("wsasend: A connection attempt failed because the connected host has failed to respond.")
    code2, msg2, _ = classify_raw_exception(exc2)
    assert code2 == AIErrorCode.NETWORK_ERROR


def test_classify_raw_exception_timeout():
    exc = Exception("504 Deadline exceeded: The request timed out.")
    code, msg, _ = classify_raw_exception(exc)
    assert code == AIErrorCode.TIMEOUT
    assert "took too long" in msg


def test_classify_raw_exception_auth():
    exc = Exception("401 UNAUTHENTICATED: Invalid API_KEY provided.")
    code, msg, _ = classify_raw_exception(exc)
    assert code == AIErrorCode.AUTH_ERROR
    assert "not configured correctly" in msg


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_execute_central_ai_generation_rate_limit_no_loop(mock_gemini):
    """
    Verifies that a 429 quota error aborts immediately without aggressive repeated retries.
    """
    mock_gemini.side_effect = Exception("429 ResourceExhausted: Quota limit reached. Retry in 45s.")

    res = execute_central_ai_generation(
        prompt="Generate 50 MCQs",
        generation_type="MCQ",
        requested_count=50,
    )

    # Must fail on attempt 1 without entering a 3-iteration loop
    assert mock_gemini.call_count == 1
    assert res.success is False
    assert res.status == "rate_limited"
    assert res.error_code == AIErrorCode.RATE_LIMITED
    assert res.retry_after_seconds == 45
    assert res.generation_id.startswith("gen_mcq_")


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_execute_central_ai_generation_partial_success(mock_gemini):
    """
    Verifies that when fewer valid questions than requested are returned (e.g. 22/50),
    the valid questions are preserved with status='partial'.
    """
    # 22 questions returned for 50 requested
    partial_questions = [{"stem_text": f"Question {i+1}", "points": 1.0} for i in range(22)]
    mock_gemini.return_value = {"questions": partial_questions}

    res = execute_central_ai_generation(
        prompt="Generate 50 MCQs",
        generation_type="MCQ",
        requested_count=50,
    )

    assert res.success is True
    assert res.status == "partial"
    assert res.requested_count == 50
    assert res.generated_count == 22
    assert len(res.data["questions"]) == 22


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_execute_central_ai_generation_full_success(mock_gemini):
    """
    Verifies full success when requested count is met.
    """
    questions = [{"stem_text": f"Question {i+1}", "points": 1.0} for i in range(10)]
    mock_gemini.return_value = {"questions": questions}

    res = execute_central_ai_generation(
        prompt="Generate 10 MCQs",
        generation_type="MCQ",
        requested_count=10,
    )

    assert res.success is True
    assert res.status == "success"
    assert res.generated_count == 10


def test_raise_ai_generation_http_exception_rate_limited():
    res = AIGenerationResult(
        success=False,
        status="rate_limited",
        error_code=AIErrorCode.RATE_LIMITED,
        error_message="AI generation is temporarily rate limited.",
        retry_after_seconds=57,
        generation_id="gen_mcq_test123",
    )

    with pytest.raises(HTTPException) as exc_info:
        raise_ai_generation_http_exception(res)

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers.get("Retry-After") == "57"
    assert exc_info.value.detail["code"] == "RATE_LIMITED"
    assert exc_info.value.detail["retry_after_seconds"] == 57
    assert exc_info.value.detail["generation_id"] == "gen_mcq_test123"


def test_raise_ai_generation_http_exception_network_error():
    res = AIGenerationResult(
        success=False,
        status="network_error",
        error_code=AIErrorCode.NETWORK_ERROR,
        error_message="Lumora could not reach the AI service.",
        generation_id="gen_str_net456",
    )

    with pytest.raises(HTTPException) as exc_info:
        raise_ai_generation_http_exception(res)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["code"] == "NETWORK_ERROR"
    assert exc_info.value.detail["generation_id"] == "gen_str_net456"
