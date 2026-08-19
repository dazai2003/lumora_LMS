"""
Live API Connectivity and Assessment Creation Verification
Tests POST /api/al-authoring/create-exam over HTTP and cleans up after test.
"""
import sys
import os
import urllib.request
import json

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.auth import create_access_token

BASE_URL = "http://127.0.0.1:8000/api"

print("--- TESTING BACKEND LIVE API ENDPOINTS ---")

# 1. Generate token for teacher Dr. Amara Perera
token = create_access_token({"sub": "amara@fdp.com", "role": "teacher"})
assert token, "Token generation failed!"
print("  [PASS] Teacher access token created successfully.")

# 2. Test POST /api/al-authoring/create-exam (Full Paper)
create_payload = json.dumps({
    "course_id": 36,
    "title": "API Test Full Paper Container",
    "description": "Temporary container for API verification",
    "exam_type": "full_paper",
    "time_limit_minutes": 300,
    "total_questions": 60,
    "max_attempts": 1,
    "is_published": False,
    "score_multiplier": 1.0
}).encode('utf-8')

create_req = urllib.request.Request(
    f"{BASE_URL}/al-authoring/create-exam",
    data=create_payload,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
)

created_exam_id = None
try:
    with urllib.request.urlopen(create_req) as response:
        assert response.status == 200, f"Expected status 200, got {response.status}"
        created_res = json.loads(response.read().decode('utf-8'))
        created_exam_id = created_res.get("id")
        assert created_exam_id, "No exam ID returned in creation response!"
        assert created_res.get("exam_type") == "full_paper", f"Exam type mismatch: {created_res.get('exam_type')}"
        print(f"  [PASS] POST /api/al-authoring/create-exam succeeded over HTTP! Created Exam ID: {created_exam_id}, Type: {created_res.get('exam_type')}")
except Exception as e:
    print(f"  [FAIL] Exam creation failed: {e}")
    raise

# 3. Clean up the temporary test container so database remains 100% clean
if created_exam_id:
    del_req = urllib.request.Request(
        f"{BASE_URL}/al-exams/{created_exam_id}",
        headers={"Authorization": f"Bearer {token}"},
        method="DELETE"
    )
    with urllib.request.urlopen(del_req) as del_response:
        print(f"  [PASS] Cleaned up temporary test exam container #{created_exam_id} (Status: {del_response.status}). Database is 100% pristine!")

print("\n>>> LIVE API CONNECTIVITY & ASSESSMENT CREATION FULLY VERIFIED OVER HTTP! <<<")
