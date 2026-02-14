"""Simple in-memory game storage."""

_games: dict[str, dict] = {}


def save_game(game_id: str, state: dict) -> None:
    _games[game_id] = state


def get_game(game_id: str) -> dict | None:
    return _games.get(game_id)


def delete_game(game_id: str) -> None:
    _games.pop(game_id, None)
