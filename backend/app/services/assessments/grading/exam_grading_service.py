"""
Lumora Assessment Grading & Pre-Marking Service.

Handles automated evaluation of student examination submissions across Paper I, Paper II-A, and Paper II-B.

Key Design Decisions & Notes:
1. 4-Tier Score Hierarchy:
   - auto_score: Deterministic machine scoring computed instantly for MCQs (<10ms).
   - ai_score: Gemini pre-grading recommendation for written structured subparts & essay rubrics.
   - teacher_score: Human teacher overrides entered in the Marking Studio workstation.
   - final_score: Certified active score (defaults to teacher_score if reviewed, else fallback).
2. Human-in-the-Loop & Ethical AI:
   - AI is deliberately positioned as a pre-marking assistant, never the final authority.
   - Teachers retain 100% control to adjust subpart points, add custom criteria, and certify grades.
3. Fallback Resilience:
   - If Gemini is unreachable or rate-limited, returns is_fallback=True with 0.0 suggested score
     and logs an error so the teacher can grade manually without breaking the submission lifecycle.
"""

import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.services.gemini_service import gemini

logger = logging.getLogger(__name__)

# Pydantic Schemas for AI Structured Output Validation
class AICriterionResult(BaseModel):
    criterion_id: str
    description: str
    awarded: float = Field(ge=0.0)
    maximum: float = Field(ge=0.0)
    evidence: Optional[str] = None
    feedback: Optional[str] = None

class AIPreMarkingResult(BaseModel):
    suggested_score: float = Field(ge=0.0)
    maximum_score: float = Field(ge=0.0)
    confidence: float = Field(ge=0.0, le=1.0, default=0.90)
    criteria: List[AICriterionResult] = []
    feedback: Optional[str] = None
    is_fallback: bool = False

# Strict system instruction reinforcing human-in-the-loop ethical AI governance
SYSTEM_PRE_MARKING_PROMPT = """You are an assessment pre-marking assistant.
You are NOT the final examiner.
Evaluate the student's response only against the supplied frozen question and marking criteria.
Do not invent criteria.
Do not award marks above the maximum.
Do not assume information that is not present in the student's answer.
Provide evidence for each suggested mark.
When uncertain, explain the uncertainty and lower confidence.
Your output is a recommendation for a teacher to review.
"""

class ALMarkingService:
    """Dedicated AI Pre-marking service with provider injection and robust fallback safety."""

    def evaluate_structured_question(
        self,
        student_subpart_answers: Dict[str, str],
        question_snapshot: Dict[str, Any]
    ) -> AIPreMarkingResult:
        """
        Pre-marks a Structured Question subparts against frozen snapshot rubric.
        """
        subparts_spec = question_snapshot.get("structured_subparts_json") or []
        stem_text = question_snapshot.get("stem_text", "")
        max_possible = sum(float(sp.get("max_points", 1.0)) for sp in subparts_spec) or 10.0

        if not student_subpart_answers or not any(str(v).strip() for v in student_subpart_answers.values() if v is not None):
            return AIPreMarkingResult(
                suggested_score=0.0,
                maximum_score=max_possible,
                confidence=1.0,
                criteria=[],
                feedback="No student answers were provided for this structured question.",
                is_fallback=False
            )

        prompt = f"""Question Stem: {stem_text}

Student Sub-part Text Answers:
{student_subpart_answers}

Frozen Sub-part Marking Rubrics:
{subparts_spec}

Evaluate each subpart. Return JSON with structure:
{{
  "suggested_score": float,
  "maximum_score": {max_possible},
  "confidence": 0.9,
  "criteria": [
    {{
      "criterion_id": "subpart_code",
      "description": "subpart prompt description",
      "awarded": float,
      "maximum": float,
      "evidence": "excerpt from student answer",
      "feedback": "brief note"
    }}
  ],
  "feedback": "overall summary note"
}}
"""
        try:
            raw_ai_res = gemini.generate_json(
                prompt=prompt,
                system_instruction=SYSTEM_PRE_MARKING_PROMPT,
                model_tier="flash",
                temperature=0.2,
                max_tokens=2000
            )

            # Validate against Pydantic model
            parsed = AIPreMarkingResult(**raw_ai_res)
            # Enforce max score cap
            parsed.suggested_score = min(parsed.suggested_score, max_possible)
            return parsed
        except Exception as e:
            logger.warning(f"AI Structured Pre-marking fallback triggered: {e}")
            # Safe Fallback Engine (Keyword & Length Matching)
            criteria_list = []
            total_earned = 0.0
            for sp in subparts_spec:
                code = sp.get("part", "a")
                max_pts = float(sp.get("max_points", 1.0))
                user_text = student_subpart_answers.get(code, "").strip()
                kws = [k.lower() for k in sp.get("expected_keywords", [])]

                match_count = sum(1 for kw in kws if kw in user_text.lower()) if kws else 0
                awarded = min(max_pts, float(match_count)) if kws else (max_pts if len(user_text) > 10 else 0.0)
                total_earned += awarded

                criteria_list.append(AICriterionResult(
                    criterion_id=code,
                    description=sp.get("prompt", f"Subpart {code}"),
                    awarded=awarded,
                    maximum=max_pts,
                    evidence=user_text[:120] if user_text else "No response",
                    feedback="Rule-engine key concept evaluation fallback"
                ))

            return AIPreMarkingResult(
                suggested_score=min(total_earned, max_possible),
                maximum_score=max_possible,
                confidence=0.75,
                criteria=criteria_list,
                feedback="AI service offline/fallback. Rule-engine key concept evaluation applied.",
                is_fallback=True
            )

    def evaluate_essay_question(
        self,
        student_essay_text: str,
        question_snapshot: Dict[str, Any],
        attachment_url: Optional[str] = None
    ) -> AIPreMarkingResult:
        """
        Pre-marks an Essay Question against frozen snapshot checklist rubric.
        """
        rubric_spec = question_snapshot.get("essay_checklist_json") or []
        stem_text = question_snapshot.get("stem_text", "")
        max_possible = float(question_snapshot.get("points") or 40.0)

        if isinstance(rubric_spec, dict):
            criteria_items = rubric_spec.get("criteria") or rubric_spec.get("answer_points") or rubric_spec.get("items") or []
        elif isinstance(rubric_spec, list):
            criteria_items = rubric_spec
        else:
            criteria_items = []

        if not student_essay_text or not student_essay_text.strip():
            return AIPreMarkingResult(
                suggested_score=0.0,
                maximum_score=max_possible,
                confidence=1.0,
                criteria=[],
                feedback="No essay text provided.",
                is_fallback=False
            )

        prompt = f"""Essay Question Prompt: {stem_text}

Student Essay Response:
\"\"\"{student_essay_text}\"\"\"

Attachment URL: {attachment_url or 'None'}

Frozen Checklist Rubric:
{rubric_spec}

Evaluate each rubric item independently. Return JSON matching:
{{
  "suggested_score": float,
  "maximum_score": {max_possible},
  "confidence": 0.9,
  "criteria": [
    {{
      "criterion_id": "item_number_str",
      "description": "criterion text",
      "awarded": float,
      "maximum": float,
      "evidence": "quote from student essay",
      "feedback": "brief evaluation note"
    }}
  ],
  "feedback": "overall essay pre-marking summary"
}}
"""
        try:
            raw_ai_res = gemini.generate_json(
                prompt=prompt,
                system_instruction=SYSTEM_PRE_MARKING_PROMPT,
                model_tier="flash_25",
                temperature=0.2,
                max_tokens=3500
            )

            parsed = AIPreMarkingResult(**raw_ai_res)
            parsed.suggested_score = min(parsed.suggested_score, max_possible)
            return parsed
        except Exception as e:
            logger.warning(f"AI Essay Pre-marking fallback triggered: {e}")
            criteria_list = []
            total_earned = 0.0

            for idx_r, r in enumerate(criteria_items, start=1):
                if isinstance(r, dict):
                    num_str = str(r.get("item_number", idx_r))
                    crit_desc = r.get("description") or r.get("criterion", f"Criterion #{num_str}")
                    pts = float(r.get("marks") or r.get("points", 4.0))
                else:
                    num_str = str(idx_r)
                    crit_desc = str(r)
                    pts = 4.0

                words = [w.lower() for w in crit_desc.split() if len(w) > 4]
                match = any(w in student_essay_text.lower() for w in words) if words else False
                earned = pts if match else 0.0
                total_earned += earned

                criteria_list.append(AICriterionResult(
                    criterion_id=num_str,
                    description=crit_desc,
                    awarded=earned,
                    maximum=pts,
                    evidence=f"Text search match: {match}",
                    feedback="Rule-engine key concept evaluation fallback"
                ))

            return AIPreMarkingResult(
                suggested_score=min(total_earned, max_possible),
                maximum_score=max_possible,
                confidence=0.70,
                criteria=criteria_list,
                feedback="AI service offline/fallback. Rule-engine key concept evaluation applied.",
                is_fallback=True
            )

# Global Marking Service Instance
al_marking_service = ALMarkingService()
