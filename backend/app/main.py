"""
main.py — FastAPI application entry point for the Baseball Game API.

This file is the root of the backend server. It:
  1. Creates the FastAPI application instance.
  2. Configures CORS (Cross-Origin Resource Sharing) middleware so that
     the frontend dev server (Vite on ports 5173/5174) can make requests
     to this backend without being blocked by the browser's same-origin policy.
  3. Registers the API routers that define all the endpoints the frontend calls.
  4. Provides a simple health-check root endpoint.

The application is designed to be run with `uvicorn app.main:app`.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import the two routers:
#   - `games` handles real MLB game lookups (today's schedule, box scores, etc.)
#   - `game` handles the interactive baseball game simulation
from app.routers import games, game

# Create the FastAPI app instance with a descriptive title.
# The title shows up in the auto-generated /docs (Swagger) page.
app = FastAPI(title="Baseball Game API")

# CORS middleware configuration.
# Without this, browsers will block requests from the frontend (localhost:5173/5174)
# to the backend (localhost:8000) because they are on different origins.
# We explicitly whitelist only the Vite dev server ports to keep it reasonably secure
# during development. In production, you'd replace these with the real domain.
app.add_middleware(
    CORSMiddleware,
    # Only allow requests from these specific frontend origins
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    # Allow cookies and auth headers to be sent cross-origin
    allow_credentials=True,
    # Allow all HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_methods=["*"],
    # Allow all headers (Content-Type, Authorization, etc.)
    allow_headers=["*"],
)

# Mount the routers under the /api prefix.
# This means all endpoints in `games.router` and `game.router` will be
# accessible at /api/games/... and /api/game/... respectively.
# The `games` router is for real MLB data lookups.
# The `game` router is for the interactive baseball game simulation.
app.include_router(games.router, prefix="/api")
app.include_router(game.router, prefix="/api")


@app.get("/")
def root():
    """
    Root health-check endpoint.

    The frontend doesn't call this directly — it's useful for quickly verifying
    the server is running (e.g., `curl http://localhost:8000/`).
    Returns a simple JSON message confirming the API is alive.
    """
    return {"message": "Baseball Game API"}
