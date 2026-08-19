"""
Analytics Normalization and Safe Math Utilities.
Provides robust division, option key parsing, cognitive categorization, and context extraction.
"""
from typing import Optional, Union, Any, Tuple
import re
import math


def safe_div(
    numerator: Optional[Union[int, float]],
    denominator: Optional[Union[int, float]],
    default: Optional[float] = None
) -> Optional[float]:
    """
    Safely divides numerator by denominator.
    Returns default (None by default) if denominator is zero or invalid.
    Prevents ZeroDivisionError and NaN / Infinity values.
    """
    if numerator is None or denominator is None:
        return default
    try:
        n = float(numerator)
        d = float(denominator)
        if abs(d) < 1e-9:
            return default
        res = n / d
        if math.isnan(res) or math.isinf(res):
            return default
        return res
    except (ValueError, TypeError, ZeroDivisionError):
        return default


def safe_percentage(
    part: Optional[Union[int, float]],
    whole: Optional[Union[int, float]],
    default: Optional[float] = None,
    decimals: int = 2
) -> Optional[float]:
    """
    Safely calculates percentage (part / whole * 100.0) rounded to given decimals.
    Returns default (None) if whole is 0 or numbers are invalid.
    """
    ratio = safe_div(part, whole, default=None)
    if ratio is None:
        return default
    pct = ratio * 100.0
    return round(pct, decimals)


def normalize_option_choice(val: Optional[Any]) -> Optional[str]:
    """
    Normalizes any MCQ student selection or correct answer representation
    (e.g., '1', '(1)', '1.', 'A', '(A)', 'a', 'b') to canonical uppercase 'A'-'E'.
    Returns None if empty or unrecognizable.
    """
    if val is None:
        return None
    
    s = str(val).strip().upper()
    if not s:
        return None
    
    # Strip brackets, parentheses, dots, commas
    cleaned = re.sub(r"[()\[\].\s,]", "", s)
    
    num_to_letter = {
        "1": "A",
        "2": "B",
        "3": "C",
        "4": "D",
        "5": "E"
    }
    
    if cleaned in num_to_letter:
        return num_to_letter[cleaned]
    
    if cleaned in ["A", "B", "C", "D", "E"]:
        return cleaned
    
    # Handle patterns like "OPTION A" or "CHOICE 1"
    match_letter = re.search(r"\b([A-E])\b", s)
    if match_letter:
        return match_letter.group(1)
        
    match_num = re.search(r"\b([1-5])\b", s)
    if match_num and match_num.group(1) in num_to_letter:
        return num_to_letter[match_num.group(1)]
        
    return cleaned if len(cleaned) <= 10 else cleaned[:10]


def normalize_cognitive_level(level: Optional[str]) -> str:
    """Normalizes cognitive level strings to canonical taxonomy values."""
    if not level:
        return "understand"
    lvl = str(level).strip().lower()
    if any(k in lvl for k in ["remember", "recall", "knowledge", "know"]):
        return "remember"
    elif any(k in lvl for k in ["understand", "comprehen", "explain"]):
        return "understand"
    elif any(k in lvl for k in ["apply", "application"]):
        return "apply"
    elif any(k in lvl for k in ["analyze", "analysis"]):
        return "analyze"
    elif any(k in lvl for k in ["evaluate", "evaluation"]):
        return "evaluate"
    elif any(k in lvl for k in ["create", "synthesis"]):
        return "create"
    return lvl


def normalize_difficulty(diff: Optional[str]) -> str:
    """Normalizes question difficulty to 'easy', 'medium', or 'hard'."""
    if not diff:
        return "medium"
    d = str(diff).strip().lower()
    if "easy" in d or "simple" in d:
        return "easy"
    elif "hard" in d or "difficult" in d or "challenging" in d:
        return "hard"
    return "medium"


def parse_context_location(context_str: Optional[str]) -> Tuple[str, Optional[str]]:
    """
    Parses a material flag context string into (context_type, context_value).
    Returns ("timestamp", "02:45") or ("pdf_page", "14") or ("full_document", None).
    """
    if not context_str or not context_str.strip():
        return ("full_document", None)
    
    c = context_str.strip()
    
    # Check for timestamps e.g. "04:12" or "Timestamp 04:12" or "1:23:45"
    ts_match = re.search(r"(?:timestamp\s*|time\s*|at\s*)?(\d{1,2}:\d{2}(?::\d{2})?)", c, re.IGNORECASE)
    if ts_match:
        return ("timestamp", ts_match.group(1))
    
    # Check for page numbers e.g. "Page 14" or "p. 14" or "pg 14"
    page_match = re.search(r"(?:page|pg|p\.?)\s*(\d+)", c, re.IGNORECASE)
    if page_match:
        return ("pdf_page", page_match.group(1))
        
    return ("section", c[:100])


def map_question_to_unit_index(question_number: int, template_type: Optional[str], exam_id: Optional[int], total_units: int = 10) -> int:
    """
    Maps an exam question (by question number, template type, and exam ID) to its syllabus unit index (0-based).
    Aligns with Sri Lankan G.C.E. Advanced Level Biology syllabus structure across Papers I, II-A, II-B.
    """
    if total_units <= 0:
        return 0

    t_str = str(template_type).lower() if template_type else ""
    q_num = question_number or 1

    # Paper II-A Structured Questions (4 questions mapped to key physiology/genetics units)
    if "structured" in t_str or exam_id == 212:
        str_map = {1: 1, 2: 3, 3: 4, 4: 5} # Units 2, 4, 5, 6
        return min(str_map.get(q_num, min(q_num - 1, total_units - 1)), total_units - 1)

    # Paper II-B Essay Questions (3 essay prompts mapped to major synthesis units)
    if "essay" in t_str or exam_id == 213:
        esy_map = {1: 3, 2: 4, 3: 5} # Units 4, 5, 6
        return min(esy_map.get(q_num, min(q_num - 1, total_units - 1)), total_units - 1)

    # Paper I MCQ (50 questions mapped sequentially through 10 syllabus units)
    if q_num <= 2: return 0    # Unit 1: Intro to Biology
    elif q_num <= 8: return 1  # Unit 2: Chemical & Cellular Basis
    elif q_num <= 15: return 2 # Unit 3: Evolution & Diversity
    elif q_num <= 22: return 3 # Unit 4: Plant Form & Function
    elif q_num <= 30: return 4 # Unit 5: Animal Form & Function
    elif q_num <= 38: return 5 # Unit 6: Genetics
    elif q_num <= 43: return 6 # Unit 7: Applied Microbiology
    elif q_num <= 47: return 7 # Unit 8: Environmental Biology
    elif q_num <= 49: return 8 # Unit 9: Biodiversity & Conservation
    elif q_num <= 50: return 9 # Unit 10: Applied Biology
    else: return (q_num - 1) % total_units
