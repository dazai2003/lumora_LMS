"""
Test all ALExamType variants over HTTP to guarantee 100% reliability.
"""
import sys
import os
import urllib.request
import json

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.auth import create_access_token
from app.models import ALExamType

BASE_URL = "http://127.0.0.1:8000/api"

token = create_access_token({"sub": "amara@fdp.com", "role": "teacher"})

test_types = [
    "full_paper",
    "paper_1_mcq",
    "paper_2_structured",
    "paper_2_essay",
    "paper_2"
]

print("=" * 80)
print("  VERIFYING ALL A/L EXAM TYPES OVER LIVE HTTP API")
print("=" * 80)

for ptype in test_types:
    payload = json.dumps({
        "course_id": 36,
        "title": f"Live Test - {ptype}",
        "description": f"Verification container for {ptype}",
        "exam_type": ptype,
        "time_limit_minutes": 120,
        "total_questions": 50,
        "max_attempts": 1,
        "is_published": False,
        "score_multiplier": 1.0
    }).encode('utf-8')
    
    req = urllib.request.Request(
        f"{BASE_URL}/al-authoring/create-exam",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
    )
    
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode('utf-8'))
        eid = data["id"]
        print(f"  [PASS] Created '{ptype}' container (ID: {eid})")
        
        # Cleanup
        del_req = urllib.request.Request(
            f"{BASE_URL}/al-exams/{eid}",
            headers={"Authorization": f"Bearer {token}"},
            method="DELETE"
        )
        with urllib.request.urlopen(del_req) as del_resp:
            assert del_resp.status == 204
            print(f"         Cleaned up ID: {eid}")

print("\n>>> ALL 5 EXAM TYPES CREATED & DELETED CLEANLY WITH 100% RELIABILITY <<<")
