import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

# Candidate passwords to try for user postgres
PASSWORDS = ["Wakemeup12345", "postgres", "admin", "root", "123456", "password", ""]

def test_connection():
    try:
        import pg8000.native
    except ImportError:
        print("[ERROR] pg8000 not installed yet.")
        return None

    working_pwd = None
    for pwd in PASSWORDS:
        try:
            print(f"Trying PostgreSQL connection with user 'postgres' and password '{pwd}'...")
            conn = pg8000.native.Connection(
                user="postgres",
                password=pwd,
                host="localhost",
                port=5432,
                database="postgres"
            )
            print(f"[SUCCESS] Connected to PostgreSQL with password: '{pwd}'")
            working_pwd = pwd
            
            # Check if fdp_db database exists
            res = conn.run("SELECT 1 FROM pg_database WHERE datname = 'fdp_db';")
            if not res:
                print("Database 'fdp_db' does not exist. Creating 'fdp_db'...")
                conn.run("CREATE DATABASE fdp_db;")
                print("[SUCCESS] Database 'fdp_db' created.")
            else:
                print("[INFO] Database 'fdp_db' already exists.")
            
            conn.close()
            break
        except Exception as e:
            print(f"Failed with '{pwd}': {e}")

    return working_pwd

if __name__ == "__main__":
    pwd = test_connection()
    if pwd is not None:
        print(f"\nWORKING_PASSWORD={pwd}")
    else:
        print("\nCould not connect with any candidate passwords.")
