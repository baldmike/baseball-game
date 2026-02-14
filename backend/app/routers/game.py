"""
game.py — API router for the interactive baseball game.

This router defines all the HTTP endpoints that the frontend calls during
gameplay. It acts as a thin controller layer: it validates inputs, looks up
game state, delegates to the game engine for logic, and returns responses.

Endpoint summary (all prefixed with /api/game):
  GET  /teams              — List all 30 MLB teams for team selection.
  GET  /pitchers           — List pitchers on a team for pitcher selection.
  POST /new                — Create a new game with selected teams/pitchers.
  POST /{game_id}/simulate — Run an entire game (CPU vs CPU) for replay.
  GET  /{game_id}          — Fetch the current state of an existing game.
  POST /{game_id}/pitch    — Player throws a pitch (player is on defense).
  POST /{game_id}/bat      — Player swings or takes (player is on offense).

Error handling:
  - 404 if a game_id doesn't exist in the in-memory store.
  - 400 if the client sends an invalid pitch type or bat action.
  - 502 if the external MLB Stats API is unreachable or returns an error.
"""

from fastapi import APIRouter, HTTPException

from app.models.game_models import (
    BatActionRequest,
    GameStateResponse,
    MLBTeam,
    PitcherInfo,
    PitchRequest,
    SimulationResponse,
    TeamSelectionRequest,
)
from app.services.game_engine import create_new_game, process_at_bat, process_pitch, simulate_game
from app.services.game_store import get_game
from app.services import mlb_service

# All routes in this file are grouped under /api/game and tagged "game"
# for organization in the auto-generated Swagger docs.
router = APIRouter(prefix="/game", tags=["game"])


@router.get("/teams", response_model=list[MLBTeam])
def get_teams():
    """
    Return all 30 MLB teams.

    Called by the frontend's team-selection screen to populate the dropdown.
    Delegates to mlb_service which calls the MLB Stats API.
    We wrap in try/except because the external API may be down or rate-limited;
    returning a 502 tells the frontend it's an upstream issue, not our bug.
    """
    try:
        return mlb_service.get_all_teams()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")


@router.get("/pitchers", response_model=list[PitcherInfo])
def get_pitchers(team_id: int, season: int = 2024):
    """
    Return all pitchers on a team's roster for a given season.

    Called by the frontend after the user selects a team, so they can
    optionally pick a specific starting pitcher. The list is sorted by ERA
    (best first) so the default selection is the team's ace.
    """
    try:
        return mlb_service.get_team_pitchers(team_id, season)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")


@router.post("/new", response_model=GameStateResponse)
def new_game(req: TeamSelectionRequest | None = None):
    """
    Create a new game and return the initial game state.

    The frontend sends a TeamSelectionRequest with the player's chosen
    home team, season, optional pitcher, and optional opponent.
    We extract each field with fallbacks (None / 2024) so the game can
    still be created even with minimal input.

    The created game is stored in the in-memory game store, keyed by
    a UUID game_id that the frontend uses for all subsequent requests.
    """
    # Extract fields from the request, using sensible defaults if not provided.
    # This defensive pattern allows the endpoint to work even if `req` is None
    # (though in practice the frontend always sends the full request).
    team_id = req.team_id if req else None
    season = req.season if req else 2024
    home_pitcher_id = req.home_pitcher_id if req else None
    away_team_id = req.away_team_id if req else None
    away_season = req.away_season if req else None
    away_pitcher_id = req.away_pitcher_id if req else None

    # Delegate all the heavy lifting (roster fetching, lineup construction,
    # pitcher selection, state initialization) to the game engine.
    state = create_new_game(
        home_team_id=team_id,
        season=season,
        home_pitcher_id=home_pitcher_id,
        away_team_id=away_team_id,
        away_season=away_season,
        away_pitcher_id=away_pitcher_id,
    )
    return state


@router.post("/{game_id}/simulate", response_model=SimulationResponse)
def simulate(game_id: str):
    """
    Simulate an entire game (CPU vs CPU) and return the result with snapshots.

    The frontend calls this when the player wants to "auto-play" the game.
    The engine runs every pitch/at-bat automatically, capturing a snapshot
    of the game state after each play. The frontend then animates through
    these snapshots to show the game progressing in fast-forward.

    Returns a SimulationResponse which includes all GameStateResponse fields
    plus a `snapshots` list for replay.
    """
    # Verify the game exists before attempting simulation
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")

    # Run the full simulation — this may take a moment as it processes
    # hundreds of pitches, but it's all in-memory so it's fast.
    result = simulate_game(game_id)
    return result


@router.get("/{game_id}", response_model=GameStateResponse)
def get_game_state(game_id: str):
    """
    Fetch the current state of an existing game.

    The frontend calls this on page load or refresh to restore the game UI.
    Since games are stored in-memory, they persist only as long as the
    server is running — a server restart loses all games.
    """
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    return state


@router.post("/{game_id}/pitch", response_model=GameStateResponse)
def pitch(game_id: str, req: PitchRequest):
    """
    Player throws a pitch (player is on defense, i.e., top of inning).

    The frontend sends the pitch type the player chose. The game engine
    then has the CPU batter decide whether to swing or take, determines
    the outcome using the probability tables, and updates the game state.

    We validate the pitch type here at the API layer to reject garbage input
    before it reaches the game engine. The four valid pitch types correspond
    to the buttons shown in the frontend's pitching UI.
    """
    # Look up the game and verify it exists
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")

    # Validate pitch type — only four types are supported.
    # This prevents the client from sending arbitrary strings that could
    # cause KeyErrors in the probability tables.
    if req.pitch_type not in ("fastball", "curveball", "slider", "changeup"):
        raise HTTPException(status_code=400, detail="Invalid pitch type")

    # Delegate to the game engine to process the pitch and update state
    updated = process_pitch(game_id, req.pitch_type)
    return updated


@router.post("/{game_id}/bat", response_model=GameStateResponse)
def bat(game_id: str, req: BatActionRequest):
    """
    Player swings or takes (player is on offense, i.e., bottom of inning).

    The CPU pitcher has already chosen a pitch type (randomly, weighted by
    realistic pitch-mix probabilities). The player only decides whether
    to swing at it or let it pass ("take").

    We validate the action here — only "swing" and "take" are valid.
    """
    # Look up the game and verify it exists
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")

    # Validate action — only "swing" and "take" are allowed
    if req.action not in ("swing", "take"):
        raise HTTPException(status_code=400, detail="Invalid action")

    # Delegate to the game engine to process the at-bat and update state
    updated = process_at_bat(game_id, req.action)
    return updated
