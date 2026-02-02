# src/api/main.py

import os

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from src.api.routes import router as runs_router
from src.api.agent_routes import router as agent_router
from src.api.security import SecurityHeadersMiddleware

# CORS configuration from environment
# Format: comma-separated list of origins, e.g., "http://localhost:3000,https://app.example.com"
# If not set, defaults to common localhost ports for development
_CORS_ORIGINS_RAW = os.getenv("RED_COUNCIL_CORS_ORIGINS", "")
if _CORS_ORIGINS_RAW.strip():
    CORS_ORIGINS = [origin.strip() for origin in _CORS_ORIGINS_RAW.split(",")]
else:
    # Default development origins
    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:3001",
        "http://localhost:3003",
        "http://localhost:8001",
    ]

app = FastAPI(
    title="The Red Council API",
    description="API for orchestrating adversarial testing campaigns.",
    version="0.1.0",
)

# Security headers middleware (runs first, wraps response)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(runs_router)
app.include_router(agent_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
