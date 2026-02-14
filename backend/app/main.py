from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import games, game

app = FastAPI(title="Baseball Game API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router, prefix="/api")
app.include_router(game.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "Baseball Game API"}
