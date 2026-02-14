"""
game_store.py — Simple in-memory game storage.

This module provides a lightweight key-value store for game state dicts,
keyed by game_id (a UUID string). It's essentially a Python dict wrapped
in functions for clarity and encapsulation.

Why in-memory (not a database)?
  - This is a teaching/demo codebase — no persistence needed.
  - Game state is small (a few KB per game) and short-lived.
  - No setup required: no database server, no migrations, no ORM.
  - The tradeoff: all games are lost when the server restarts.

In a production app, you'd replace this with Redis (for fast reads/writes
with optional persistence) or a database (PostgreSQL, etc.) if you need
long-term game history.

Thread safety note: Python's GIL makes dict operations atomic for simple
get/set, and FastAPI with uvicorn in single-worker mode doesn't have
true concurrency issues. For multi-worker deployments, you'd need an
external store like Redis.
"""

# The global dict that holds all active game states.
# Keys are game_id strings (UUIDs), values are game state dicts.
_games: dict[str, dict] = {}


def save_game(game_id: str, state: dict) -> None:
    """
    Save (or overwrite) a game state in the store.

    Called after every state change: game creation, pitch, at-bat, simulation.
    Since we store a reference to the dict (not a copy), mutations to the
    state dict after saving are reflected in the store. This is intentional —
    the game engine mutates the state in place and then saves it.
    """
    _games[game_id] = state


def get_game(game_id: str) -> dict | None:
    """
    Retrieve a game state by its ID.

    Returns None if the game_id doesn't exist (e.g., invalid UUID, or the
    server was restarted and the in-memory store was cleared).
    The router layer converts None into a 404 HTTP response.
    """
    return _games.get(game_id)


def delete_game(game_id: str) -> None:
    """
    Remove a game from the store.

    Uses dict.pop with a default of None so it doesn't raise KeyError
    if the game_id doesn't exist. Currently not called by any endpoint,
    but available for cleanup or future "forfeit" functionality.
    """
    _games.pop(game_id, None)
