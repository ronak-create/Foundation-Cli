import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const MAIN_PY = `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="<%= projectName %>", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
`;

const REQUIREMENTS_TXT = `fastapi>=0.111.0
uvicorn[standard]>=0.29.0
python-dotenv>=1.0.1
pydantic>=2.7.1
`;

const ENV_EXAMPLE = `# FastAPI Server
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000
`;

const GITIGNORE_PY = `__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
.env
`;

export const fastapiModule: PluginDefinition = {
  manifest: {
    id: "backend-fastapi",
    name: "FastAPI (Python)",
    version: "1.0.0",
    description: "FastAPI Python backend with async support, CORS, and Pydantic validation",
    category: "backend",
    dependencies: [],
    files: [
      { relativePath: "app/main.py", content: MAIN_PY },
      { relativePath: "requirements.txt", content: REQUIREMENTS_TXT },
      { relativePath: ".env.example", content: ENV_EXAMPLE },
      { relativePath: ".gitignore", content: GITIGNORE_PY },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            dev: "uvicorn app.main:app --reload --port 3001",
            start: "uvicorn app.main:app --host 0.0.0.0 --port 3001",
            install: "pip install -r requirements.txt",
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["backend-express", "backend-nestjs", "backend-django"],
    },
  },
};