import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.services.al_structured_generator import generate_structured_candidate_questions
from app.services.al_essay_generator import generate_essay_candidate_questions


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_structured_generator_quota_error_handling(mock_gemini):
    """
    Verifies that a 429 quota error from Gemini is converted into a clean,
    human-readable 429 HTTPException with machine-readable detail without leaking stack traces.
    """
    mock_gemini.side_effect = Exception("429 ResourceExhausted: Quota exceeded for quota metric 'Generate Content API requests'")

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = []

    with pytest.raises(HTTPException) as exc_info:
        generate_structured_candidate_questions(
            db=db_mock,
            question_count=1,
            custom_blueprints=[{"question_number": 1, "points": 40.0, "structured_subparts_json": [{"id": "n1", "label": "A", "points": 40.0}]}]
        )

    assert exc_info.value.status_code == 429
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail["code"] == "RATE_LIMITED"
    assert "rate limited" in detail["message"] or "limit reached" in detail["message"]
    assert "ResourceExhausted" not in detail["message"]
    assert detail["generation_id"].startswith("gen_str_")


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_essay_generator_quota_error_handling(mock_gemini):
    """
    Verifies that an essay generation quota limit error raises a clean 429.
    """
    mock_gemini.side_effect = Exception("429 RESOURCE_EXHAUSTED: Free tier requests limit reached.")

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = []

    with pytest.raises(HTTPException) as exc_info:
        generate_essay_candidate_questions(
            db=db_mock,
            question_count=1,
            custom_blueprints=[{"question_number": 5, "structure_format": "single_complete", "points": 150.0}]
        )

    assert exc_info.value.status_code == 429
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail["code"] == "RATE_LIMITED"
    assert "rate limited" in detail["message"] or "limit reached" in detail["message"]
    assert detail["generation_id"].startswith("gen_ess_")


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_essay_generator_network_error_handling(mock_gemini):
    """
    Verifies that a network disconnection error raises a clean 503 connection error.
    """
    mock_gemini.side_effect = Exception("wsarecv: A connection attempt failed because the connected party did not properly respond.")

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = []

    with pytest.raises(HTTPException) as exc_info:
        generate_essay_candidate_questions(
            db=db_mock,
            question_count=1,
            custom_blueprints=[{"question_number": 5, "structure_format": "single_complete", "points": 150.0}]
        )

    assert exc_info.value.status_code == 503
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail["code"] == "NETWORK_ERROR"
    assert "could not reach the AI service" in detail["message"] or "connection" in detail["message"].lower()


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_essay_generator_zero_questions_handling(mock_gemini):
    """
    Verifies that returning an empty question list raises a clean 422/502 error with INVALID_RESPONSE code.
    """
    mock_gemini.return_value = {"questions": []}

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = []

    with pytest.raises(HTTPException) as exc_info:
        generate_essay_candidate_questions(
            db=db_mock,
            question_count=1,
            custom_blueprints=[{"question_number": 5, "structure_format": "single_complete", "points": 150.0}]
        )

    assert exc_info.value.status_code in [422, 502]
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail["code"] == "INVALID_RESPONSE"

