# How to Run the F.D.P Project

This project consists of a Next.js frontend and a FastAPI backend. You need to run **both** concurrently for the application to work properly.

## Quick Start with Docker (Recommended)

The easiest way to run the entire application (Database, Backend, and Frontend) is using Docker Compose.

### Prerequisites
- **Docker** and **Docker Compose** installed (e.g., Docker Desktop).

### Running the Stack
1. Open a terminal and navigate to the root `F.D.P` directory.
2. Run the following command:
   ```bash
   docker-compose up --build
   ```
3. The services will start up:
   - **Frontend UI**: `http://localhost:3000`
   - **Backend API**: `http://localhost:8000/docs`
   - **Database**: PostgreSQL on port `5432`

To stop the application, press `Ctrl+C` in the terminal, or run `docker-compose down`.

---

## Manual Setup (Without Docker)

### Prerequisites

- **Python 3.11+** installed
- **Node.js 18+** installed
- **PostgreSQL 16** running with a database called `fdp_db`
  - Default user: `postgres`
  - Password: set in `backend/.env`

---

## 1. Running the Backend (FastAPI)

1. **Open a terminal** and navigate to the root `F.D.P` directory.

2. **Activate the virtual environment**:
   ```powershell
   .\.venv\Scripts\activate
   ```

3. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

4. **Install dependencies** (first time only):
   ```bash
   pip install -r requirements.txt
   ```

5. **Start the backend server**:
   ```bash
   python -m uvicorn main:app --reload
   ```

   The backend API will be available at `http://localhost:8000`.
   API docs: `http://localhost:8000/docs`

---

## 2. Running the Frontend (Next.js)

1. **Open a NEW, separate terminal** and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

   The frontend will be available at `http://localhost:3000`.

---

## 3. Test Accounts

| Role    | Email              | Password     |
|---------|-------------------|-------------|
| Admin   | admin@fdp.com     | admin123    |
| Teacher | teacher@fdp.com   | teacher123  |
| Student | student1@fdp.com  | student123  |
| Student | student2@fdp.com  | student123  |
| Student | student3@fdp.com  | student123  |

Or register a new student account at `http://localhost:3000/register`.

---

## Important Notes

- **Both servers** (backend + frontend) must be running at the same time.
- If login says "unexpected error", make sure the **backend is running** on port 8000.
- The `.env` file in `backend/` contains your database password and API keys — don't share it.
