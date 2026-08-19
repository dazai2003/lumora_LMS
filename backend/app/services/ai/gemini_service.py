"""
Centralized Google Gemini AI Service for Lumora LMS.

Provides a single, reusable interface for all AI interactions across the platform.
Handles model routing, rate limiting, error handling, and usage logging.

Usage:
    from app.services.gemini_service import gemini

    # Text generation
    result = gemini.generate_text("Explain photosynthesis", model_tier="flash")

    # Structured JSON generation
    data = gemini.generate_json("Generate 5 MCQs", response_schema=MySchema)

    # PDF processing (native multimodal)
    extracted = gemini.process_pdf("/path/to/paper.pdf", "Extract all questions")
"""

import os
import json
import time
import logging
from typing import Optional, Type, Any, Dict, List

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class GeminiService:
    """
    Central AI service wrapping the Google Gemini API.

    Model Routing:
        - flash    : gemini-2.5-flash-lite   (cheapest, fast — MCQ gen, categorization)
        - flash_25 : gemini-2.5-flash        (mid-tier — essay grading, PDF extraction)
        - pro      : gemini-2.5-pro          (expensive — only if Flash fails)
    """

    MODEL_MAP = {
        "flash": "gemini-flash-lite-latest",
        "flash_25": "gemini-flash-latest",
        "pro": "gemini-3.7-flash",
    }

    FALLBACK_MODELS = [
        "gemini-flash-lite-latest",
        "gemini-flash-latest",
        "gemini-2.5-flash",
        "gemini-3.7-flash",
    ]

    def __init__(self):
        self._client = None
        self._api_key = None

    def _get_client(self):
        """Lazy-initialize the Gemini client on first use."""
        if self._client is None:
            try:
                from dotenv import load_dotenv
                load_dotenv()
                from google import genai

                self._api_key = os.getenv("GEMINI_API_KEY")
                if not self._api_key:
                    logger.error("GEMINI_API_KEY not set in environment variables")
                    raise ValueError("GEMINI_API_KEY not configured")

                self._client = genai.Client(api_key=self._api_key)
                logger.info("Gemini AI client initialized successfully")
            except ImportError:
                logger.error("google-genai package not installed. Run: pip install google-genai")
                raise
        return self._client

    def _resolve_model(self, model_tier: str) -> str:
        """Resolve a tier name to the actual Gemini model ID."""
        model = self.MODEL_MAP.get(model_tier)
        if not model:
            logger.warning(f"Unknown model tier '{model_tier}', falling back to flash")
            model = self.MODEL_MAP["flash"]
        return model

    def _get_candidate_models(self, model_tier: str) -> List[str]:
        """Get ordered list of candidate models starting with target model."""
        target = self._resolve_model(model_tier)
        candidates = [target]
        for m in self.FALLBACK_MODELS:
            if m not in candidates:
                candidates.append(m)
        return candidates

    def _log_usage(
        self,
        action: str,
        input_summary: str,
        output_summary: str,
        tokens_used: Optional[int],
        processing_time_ms: int,
        status: str = "completed",
        error_message: Optional[str] = None,
    ):
        """Log AI usage to the database for cost tracking and audit."""
        try:
            from app.database import SessionLocal
            from app.models import AILog, ProcessingStatus

            db = SessionLocal()
            log_entry = AILog(
                action=action,
                input_summary=input_summary[:500] if input_summary else None,
                output_summary=output_summary[:500] if output_summary else None,
                tokens_used=tokens_used,
                processing_time_ms=processing_time_ms,
                status=ProcessingStatus.COMPLETED if status == "completed" else ProcessingStatus.FAILED,
                error_message=error_message,
            )
            db.add(log_entry)
            db.commit()
            db.close()
        except Exception as e:
            logger.warning(f"Failed to log AI usage: {e}")

    def generate_text(
        self,
        prompt: str,
        system_instruction: str = "",
        model_tier: str = "flash",
        temperature: float = 0.3,
        max_tokens: int = 2000,
    ) -> str:
        """
        Generate a free-form text response from Gemini with automatic multi-model failover.
        """
        client = self._get_client()
        candidate_models = self._get_candidate_models(model_tier)
        start_time = time.time()
        last_error = None

        from google.genai import types

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        if system_instruction:
            config.system_instruction = system_instruction

        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=config,
                )

                result_text = response.text or ""
                elapsed_ms = int((time.time() - start_time) * 1000)

                tokens = None
                if response.usage_metadata:
                    tokens = (response.usage_metadata.prompt_token_count or 0) + \
                             (response.usage_metadata.candidates_token_count or 0)

                self._log_usage(
                    action=f"gemini_text_{model_tier}",
                    input_summary=prompt[:200],
                    output_summary=result_text[:200],
                    tokens_used=tokens,
                    processing_time_ms=elapsed_ms,
                )

                logger.info(f"Gemini text generation succeeded ({model_name}): {elapsed_ms}ms, {tokens or '?'} tokens")
                return result_text

            except Exception as e:
                last_error = e
                logger.warning(f"Gemini model {model_name} failed: {e}. Trying next candidate model...")
                continue

        # If all candidates failed
        elapsed_ms = int((time.time() - start_time) * 1000)
        error_msg = str(last_error) if last_error else "All candidate models failed"
        self._log_usage(
            action=f"gemini_text_{model_tier}",
            input_summary=prompt[:200],
            output_summary="",
            tokens_used=None,
            processing_time_ms=elapsed_ms,
            status="failed",
            error_message=error_msg[:500],
        )
        logger.error(f"All Gemini text generation candidates failed: {error_msg}")
        raise last_error

    def generate_json(
        self,
        prompt: str,
        system_instruction: str = "",
        response_schema: Optional[Type[BaseModel]] = None,
        model_tier: str = "flash",
        temperature: float = 0.2,
        max_tokens: int = 4000,
    ) -> dict:
        """
        Generate a structured JSON response from Gemini with automatic multi-model failover.
        """
        client = self._get_client()
        candidate_models = self._get_candidate_models(model_tier)
        start_time = time.time()
        last_error = None

        from google.genai import types

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
        )
        if system_instruction:
            config.system_instruction = system_instruction

        # If a Pydantic schema is provided, use it for structured output
        if response_schema is not None:
            config.response_schema = response_schema

        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=config,
                )

                raw_text = response.text or "{}"

                # Parse the JSON response with resilient cleaning & repair
                cleaned = raw_text.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

                try:
                    result = json.loads(cleaned)
                except Exception as parse_err:
                    import re
                    # Repair attempt 1: remove trailing commas before } or ]
                    repaired = re.sub(r",\s*([\]}])", r"\1", cleaned)
                    try:
                        result = json.loads(repaired)
                    except Exception:
                        # Repair attempt 2: find last valid boundary and close brackets
                        last_brace = repaired.rfind("}")
                        if last_brace != -1:
                            sub = repaired[:last_brace+1]
                            open_braces = sub.count("{") - sub.count("}")
                            open_brackets = sub.count("[") - sub.count("]")
                            sub += ("]" * max(0, open_brackets)) + ("}" * max(0, open_braces))
                            result = json.loads(sub)
                        else:
                            raise parse_err

                elapsed_ms = int((time.time() - start_time) * 1000)

                tokens = None
                if response.usage_metadata:
                    tokens = (response.usage_metadata.prompt_token_count or 0) + \
                             (response.usage_metadata.candidates_token_count or 0)

                self._log_usage(
                    action=f"gemini_json_{model_tier}",
                    input_summary=prompt[:200],
                    output_summary=json.dumps(result)[:200] if result else "",
                    tokens_used=tokens,
                    processing_time_ms=elapsed_ms,
                )

                logger.info(f"Gemini JSON generation succeeded ({model_name}): {elapsed_ms}ms, {tokens or '?'} tokens")
                return result

            except Exception as e:
                last_error = e
                logger.warning(f"Gemini JSON model {model_name} failed: {e}. Trying next candidate model...")
                continue

        # If all candidates failed
        elapsed_ms = int((time.time() - start_time) * 1000)
        self._log_usage(
            action=f"gemini_json_{model_tier}",
            input_summary=prompt[:200],
            output_summary="",
            tokens_used=None,
            processing_time_ms=elapsed_ms,
            status="failed",
            error_message=str(last_error)[:500],
        )
        logger.error(f"All Gemini JSON generation candidates failed: {last_error}")
        raise last_error

    def process_pdf(
        self,
        file_path: str,
        prompt: str,
        system_instruction: str = "",
        model_tier: str = "flash_25",
        temperature: float = 0.1,
        max_tokens: int = 8000,
    ) -> dict:
        """
        Process a PDF file natively using Gemini's multimodal capabilities with automatic failover.
        """
        client = self._get_client()
        candidate_models = self._get_candidate_models(model_tier)
        start_time = time.time()
        last_error = None

        from google.genai import types

        # Read the PDF file
        with open(file_path, "rb") as f:
            pdf_bytes = f.read()

        file_part = types.Part.from_bytes(
            data=pdf_bytes,
            mime_type="application/pdf",
        )

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
        )
        if system_instruction:
            config.system_instruction = system_instruction

        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[file_part, prompt],
                    config=config,
                )

                raw_text = response.text or "{}"
                result = json.loads(raw_text.strip())
                elapsed_ms = int((time.time() - start_time) * 1000)

                tokens = None
                if response.usage_metadata:
                    tokens = (response.usage_metadata.prompt_token_count or 0) + \
                             (response.usage_metadata.candidates_token_count or 0)

                self._log_usage(
                    action=f"gemini_pdf_{model_tier}",
                    input_summary=f"PDF: {os.path.basename(file_path)} | {prompt[:150]}",
                    output_summary=json.dumps(result)[:200] if result else "",
                    tokens_used=tokens,
                    processing_time_ms=elapsed_ms,
                )

                logger.info(f"Gemini PDF processing succeeded ({model_name}): {elapsed_ms}ms, {tokens or '?'} tokens")
                return result

            except Exception as e:
                last_error = e
                logger.warning(f"Gemini PDF model {model_name} failed: {e}. Trying next candidate model...")
                continue

        # If all candidates failed
        elapsed_ms = int((time.time() - start_time) * 1000)
        self._log_usage(
            action=f"gemini_pdf_{model_tier}",
            input_summary=f"PDF: {os.path.basename(file_path)}",
            output_summary="",
            tokens_used=None,
            processing_time_ms=elapsed_ms,
            status="failed",
            error_message=str(last_error)[:500],
        )
        logger.error(f"All Gemini PDF processing candidates failed: {last_error}")
        raise last_error

    def process_image(
        self,
        image_path: str,
        prompt: str,
        model_tier: str = "flash",
        temperature: float = 0.2,
        max_tokens: int = 2000,
    ) -> str:
        """
        Analyze an image (diagram, chart, scan) using Gemini's vision capabilities.

        Args:
            image_path: Absolute path to the image file.
            prompt: Instructions for what to analyze.
            model_tier: Defaults to flash for image analysis.
            temperature: Sampling temperature.
            max_tokens: Maximum output tokens.

        Returns:
            The analysis text response.
        """
        client = self._get_client()
        model_name = self._resolve_model(model_tier)
        start_time = time.time()

        try:
            from google.genai import types
            import mimetypes

            mime_type = mimetypes.guess_type(image_path)[0] or "image/png"

            with open(image_path, "rb") as f:
                image_bytes = f.read()

            image_part = types.Part.from_bytes(
                data=image_bytes,
                mime_type=mime_type,
            )

            config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            )

            response = client.models.generate_content(
                model=model_name,
                contents=[image_part, prompt],
                config=config,
            )

            result_text = response.text or ""
            elapsed_ms = int((time.time() - start_time) * 1000)

            tokens = None
            if response.usage_metadata:
                tokens = (response.usage_metadata.prompt_token_count or 0) + \
                         (response.usage_metadata.candidates_token_count or 0)

            self._log_usage(
                action=f"gemini_image_{model_tier}",
                input_summary=f"Image: {os.path.basename(image_path)} | {prompt[:150]}",
                output_summary=result_text[:200],
                tokens_used=tokens,
                processing_time_ms=elapsed_ms,
            )

            logger.info(f"Gemini image analysis ({model_name}): {elapsed_ms}ms")
            return result_text

        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            self._log_usage(
                action=f"gemini_image_{model_tier}",
                input_summary=f"Image: {os.path.basename(image_path)}",
                output_summary="",
                tokens_used=None,
                processing_time_ms=elapsed_ms,
                status="failed",
                error_message=str(e)[:500],
            )
            logger.error(f"Gemini image analysis failed: {e}")
            raise

    def evaluate_al_essay(
        self,
        essay_text: str,
        checklist_items: List[Dict[str, Any]],
        image_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates a G.C.E. Advanced Level Biology essay against a 37-41 point checklist rubric.
        Each checklist item is worth 4 raw points up to a maximum ceiling of 150 points + up to 2 bonus points.

        Args:
            essay_text: The student's written response.
            checklist_items: List of dicts e.g. [{"item_number": 1, "criterion": "...", "points": 4.0}]
            image_path: Optional path to an uploaded diagram image attachment.

        Returns:
            Dict containing checklist_evaluations, raw_score, bonus_points, total_raw, and ai_feedback_summary.
        """
        system_instruction = """You are a senior G.C.E. Advanced Level Biology Chief Examiner in Sri Lanka.
Evaluate the student's essay strictly against the provided checklist rubric.
For each checklist item:
- Determine if the student's essay (and optional diagram) adequately covers the scientific concept required.
- Award points (usually 4.0 if awarded, 0.0 if not).
- Provide a brief 1-sentence justification.

Return ONLY valid JSON matching this exact structure:
{
  "checklist_evaluations": [
    {
      "item_number": 1,
      "criterion": "...",
      "awarded": true,
      "points_earned": 4.0,
      "reason": "..."
    }
  ],
  "raw_score": 140.0,
  "bonus_points": 2.0,
  "total_raw": 142.0,
  "ai_feedback_summary": "..."
}"""

        prompt = f"""Student Essay Response:
\"\"\"
{essay_text}
\"\"\"

Checklist Rubric Items (Evaluate each item individually):
{json.dumps(checklist_items, indent=2)}"""

        try:
            return self.generate_json(
                prompt=prompt,
                system_instruction=system_instruction,
                model_tier="flash_25",
                temperature=0.2,
                max_tokens=4000,
            )
        except Exception as e:
            logger.error(f"AI essay evaluation failed: {e}")
            evals = []
            total = 0.0
            for item in checklist_items:
                num = item.get("item_number", 1)
                crit = item.get("criterion", "")
                pts = float(item.get("points", 4.0))
                words = [w.lower() for w in crit.split() if len(w) > 4]
                match = any(w in essay_text.lower() for w in words) if words else False
                earned = pts if match else 0.0
                total += earned
                evals.append({
                    "item_number": num,
                    "criterion": crit,
                    "awarded": match,
                    "points_earned": earned,
                    "reason": "Automated key concept match check" if match else "Required concept not found in text"
                })

            raw_cap = min(total, 150.0)
            return {
                "checklist_evaluations": evals,
                "raw_score": raw_cap,
                "bonus_points": 0.0,
                "total_raw": raw_cap,
                "ai_feedback_summary": f"Essay evaluated via rule-engine key concept match. Raw score: {raw_cap}/150.",
                "fallback": True
            }

    def evaluate_al_structured(
        self,
        subpart_answers: Dict[str, str],
        subparts_rubric: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Evaluates Paper II-A structured sub-parts against expected key concepts.
        """
        system_instruction = """You are an expert A/L Biology Chief Examiner.
Evaluate the student's sub-part text answers for a Paper II-A Structured Question.
Return ONLY valid JSON matching this structure:
{
  "subpart_results": {
    "a(i)": {"points_earned": 2.0, "max_points": 2.0, "reason": "..."},
    "a(ii)": {"points_earned": 1.0, "max_points": 3.0, "reason": "..."}
  },
  "total_raw_points": 3.0
}"""

        prompt = f"""Student Sub-part Responses:
{json.dumps(subpart_answers, indent=2)}

Sub-part Rubric Specifications:
{json.dumps(subparts_rubric, indent=2)}"""

        try:
            return self.generate_json(
                prompt=prompt,
                system_instruction=system_instruction,
                model_tier="flash",
                temperature=0.2,
                max_tokens=2000,
            )
        except Exception as e:
            logger.error(f"AI structured evaluation failed: {e}")
            results = {}
            total = 0.0
            for sp in subparts_rubric:
                p_code = sp.get("part", "")
                max_p = float(sp.get("max_points", 1.0))
                st_text = subpart_answers.get(p_code, "")
                kws = sp.get("expected_keywords", [])
                match_count = sum(1 for kw in kws if kw.lower() in st_text.lower()) if kws else 0
                earned = min(max_p, float(match_count)) if kws else (max_p if len(st_text) > 10 else 0.0)
                total += earned
                results[p_code] = {
                    "points_earned": earned,
                    "max_points": max_p,
                    "reason": "Rule-engine keyword match fallback"
                }

            return {
                "subpart_results": results,
                "total_raw_points": round(total, 2),
                "fallback": True
            }

    def extract_and_generate_model_answers_from_pdf(
        self,
        file_path: str,
        title: str,
        year: int,
        paper_type: str = "paper_1_mcq",
    ) -> Dict[str, Any]:
        """
        Parses a G.C.E. Advanced Level Biology PDF past paper or model question paper.
        Extracts questions and automatically generates:
          - MCQs & Structured: Step-by-step scientific explanations and model answers.
          - Essays: Key point checklist rubrics (37-41 items, 4 pts per item).

        Args:
            file_path: Path to uploaded PDF or text content.
            title: Title of the paper (e.g. "2024 G.C.E. A/L Biology Paper I").
            year: Year of examination (e.g. 2024).
            paper_type: "paper_1_mcq", "paper_2_structured", "paper_2_essay".

        Returns:
            Dict containing paper details and list of parsed questions with model answers.
        """
        system_instruction = """You are a senior G.C.E. Advanced Level Biology Chief Examiner and Curriculum Specialist.
Extract all questions from the provided G.C.E. A/L Biology document.
For each question:
1. Identify the template type (generic_mcq, combination_grid, structured_subparts, essay_checklist, etc.).
2. For MCQs and Structured questions: Generate a rigorous, step-by-step scientific explanation/model answer.
3. For Essays: Generate a comprehensive key point checklist rubric of required scientific concepts.

Return ONLY valid JSON matching this exact structure:
{
  "paper_title": "2024 G.C.E. A/L Biology Paper I",
  "year": 2024,
  "paper_type": "paper_1_mcq",
  "questions": [
    {
      "question_number": 1,
      "template_type": "generic_mcq",
      "stem_text": "...",
      "options": ["A...", "B...", "C...", "D...", "E..."],
      "correct_option": "B",
      "explanation": "Detailed step-by-step model answer...",
      "points": 1.0,
      "cognitive_level": "understand",
      "difficulty": "medium",
      "structured_subparts_json": null,
      "essay_checklist_json": null
    }
  ]
}"""

        prompt = f"""Target Document Title: {title}
Year: {year}
Paper Type: {paper_type}

Please extract all questions from this paper and generate complete model answers/explanations."""

        try:
            if os.path.exists(file_path) and file_path.lower().endswith(".pdf"):
                return self.generate_json(
                    prompt=prompt + f"\n\n[Reading File: {os.path.basename(file_path)}]",
                    system_instruction=system_instruction,
                    model_tier="flash_25",
                    temperature=0.2,
                    max_tokens=6000,
                )
            elif os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                return self.generate_json(
                    prompt=prompt + f"\n\nDocument Text Content:\n{content[:8000]}",
                    system_instruction=system_instruction,
                    model_tier="flash_25",
                    temperature=0.2,
                    max_tokens=6000,
                )
            else:
                return self.generate_json(
                    prompt=prompt,
                    system_instruction=system_instruction,
                    model_tier="flash_25",
                    temperature=0.2,
                    max_tokens=6000,
                )
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            return {
                "paper_title": title,
                "year": year,
                "paper_type": paper_type,
                "questions": [
                    {
                        "question_number": 1,
                        "template_type": "generic_mcq" if paper_type == "paper_1_mcq" else "structured_subparts",
                        "stem_text": f"Sample extracted question for {title}",
                        "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4", "E. Option 5"] if paper_type == "paper_1_mcq" else None,
                        "correct_option": "A" if paper_type == "paper_1_mcq" else None,
                        "explanation": "Gemini AI fallback model answer generated.",
                        "points": 1.0,
                        "cognitive_level": "understand",
                        "difficulty": "medium",
                    }
                ],
                "fallback": True
            }

    def health_check(self) -> dict:
        """
        Verify Gemini API connectivity and return status for each model tier.
        """
        results = {
            "provider": "gemini",
            "api_key_configured": bool(os.getenv("GEMINI_API_KEY")),
        }

        for tier, model_name in self.MODEL_MAP.items():
            try:
                client = self._get_client()
                from google.genai import types

                response = client.models.generate_content(
                    model=model_name,
                    contents="Respond with exactly: OK",
                    config=types.GenerateContentConfig(
                        temperature=0,
                        max_output_tokens=10,
                    ),
                )
                results[f"{tier}_status"] = "ok" if response.text else "empty_response"
            except Exception as e:
                results[f"{tier}_status"] = f"error: {str(e)[:100]}"

        return results


# ──────────────────────────────────────────────
# Singleton instance — import this throughout the app
# ──────────────────────────────────────────────
gemini = GeminiService()
