"""API router for the interactive baseball game."""

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

router = APIRouter(prefix="/game", tags=["game"])


@router.get("/teams", response_model=list[MLBTeam])
def get_teams():
    try:
        return mlb_service.get_all_teams()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")


@router.get("/pitchers", response_model=list[PitcherInfo])
def get_pitchers(team_id: int, season: int = 2024):
    try:
        return mlb_service.get_team_pitchers(team_id, season)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")


@router.post("/new", response_model=GameStateResponse)
def new_game(req: TeamSelectionRequest | None = None):
    team_id = req.team_id if req else None
    season = req.season if req else 2024
    home_pitcher_id = req.home_pitcher_id if req else None
    away_team_id = req.away_team_id if req else None
    away_season = req.away_season if req else None
    away_pitcher_id = req.away_pitcher_id if req else None
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
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    result = simulate_game(game_id)
    return result


@router.get("/{game_id}", response_model=GameStateResponse)
def get_game_state(game_id: str):
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    return state


@router.post("/{game_id}/pitch", response_model=GameStateResponse)
def pitch(game_id: str, req: PitchRequest):
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    if req.pitch_type not in ("fastball", "curveball", "slider", "changeup"):
        raise HTTPException(status_code=400, detail="Invalid pitch type")
    updated = process_pitch(game_id, req.pitch_type)
    return updated


@router.post("/{game_id}/bat", response_model=GameStateResponse)
def bat(game_id: str, req: BatActionRequest):
    state = get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    if req.action not in ("swing", "take"):
        raise HTTPException(status_code=400, detail="Invalid action")
    updated = process_at_bat(game_id, req.action)
    return updated
