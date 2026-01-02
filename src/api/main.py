# src/api/main.py

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from src.api.routes import router as runs_router

app = FastAPI(
    title="The Red Council API",
    description="API for orchestrating adversarial testing campaigns.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:8000", 
        "http://localhost:3001",
        "http://localhost:3003",
        "http://localhost:8001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
