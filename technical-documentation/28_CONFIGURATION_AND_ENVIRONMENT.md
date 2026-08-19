# 28. Configuration and Environment

## 1. Environment Variables by Name (Secrets Redacted)

All sensitive secrets, database connection passwords, and third-party AI keys are managed via environment variables loaded via `python-dotenv`. Values below are strictly redacted (`[REDACTED]`) in compliance with security guidelines.

### 1.1. Backend Environment Configuration (`backend/.env`)

| Variable Name | Purpose / Operational Context | Default / Example Setting |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | PostgreSQL connection string using `pg8000` driver. | `postgresql+pg8000://postgres:[REDACTED]@localhost:5432/fdp_db` |
| **`SECRET_KEY`** | Cryptographic key used to sign and verify JWT access tokens. | `[REDACTED]` |
| **`ALGORITHM`** | JWT token hashing algorithm. | `HS256` |
| **`ACCESS_TOKEN_EXPIRE_MINUTES`** | Token lifetime before expiration. | `60` |
| **`GEMINI_API_KEY`** | Google GenAI SDK API key for Gemini 2.0 Flash / Pro inference. | `[REDACTED]` |
| **`GROQ_API_KEY`** | Groq SDK API key for LLaMA-3.3 high-speed fallback inference. | `[REDACTED]` |
| **`FRONTEND_URL`** | Allowed frontend origin for CORS policies. | `http://localhost:3000` |
| **`UPLOAD_DIR`** | Directory path for static file storage. | `uploads` |

### 1.2. Frontend Environment Configuration (`frontend/.env.local`)

| Variable Name | Purpose / Operational Context | Default / Example Setting |
| :--- | :--- | :--- |
| **`NEXT_PUBLIC_API_URL`** | Base URL pointing to the FastAPI backend service. | `http://127.0.0.1:8000` |

---

## 2. Local Development & Deployment Commands

### 2.1. Dual-Stack Startup Script (`start_lumora.bat`)
Launches both services in dedicated terminals:
```cmd
@echo off
start "Lumora Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000"
start "Lumora Frontend" cmd /k "cd frontend && npm run dev"
```

### 2.2. Manual Development Execution
- **Backend**:
  ```powershell
  cd backend
  .\venv\Scripts\activate
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```
- **Frontend**:
  ```powershell
  cd frontend
  npm run dev
  ```

### 2.3. Production Build & Docker Deployment
- **Frontend Production Build**:
  ```powershell
  cd frontend
  npm run build
  npm start
  ```
- **Docker Compose Multi-Container Orchestration**:
  ```powershell
  docker-compose up --build -d
  ```
