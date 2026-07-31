import requests

# Login as student
login_res = requests.post('http://localhost:8000/api/auth/login', data={'username': 'student1@fdp.com', 'password': 'student123'})
token = login_res.json().get('access_token')
print("Token:", token[:10] if token else None)

# Ask teacher
headers = {'Authorization': f'Bearer {token}'}
res = requests.post('http://localhost:8000/api/qa/ask-teacher', json={'course_id': 1, 'question_text': 'Hello teacher', 'tag': 'General Question'}, headers=headers)
print(res.status_code)
print(res.text)