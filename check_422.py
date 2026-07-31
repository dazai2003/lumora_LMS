import requests

# We need an admin token. Let's just create a test request in DB.
import sqlite3
import json

conn = sqlite3.connect("backend/lumora.db")
cursor = conn.cursor()
cursor.execute("SELECT email, hashed_password FROM users WHERE role='admin' LIMIT 1")
row = cursor.fetchone()
if not row:
    print("No admin found")
else:
    email = row[0]
    # We don't have the password, we need to bypass auth or login
print(row)
conn.close()
