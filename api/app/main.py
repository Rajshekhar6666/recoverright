from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import events

app = FastAPI(title="RecoverRight API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)


@app.get("/health")
def health():
    return {"status": "ok"}