"""Pydantic models for game API requests and responses."""

from pydantic import BaseModel


class PitchRequest(BaseModel):
    pitch_type: str  # fastball, curveball, slider, changeup


class BatActionRequest(BaseModel):
    action: str  # swing or take


class TeamSelectionRequest(BaseModel):
    team_id: int
    season: int = 2024
    home_pitcher_id: int | None = None
    away_team_id: int | None = None
    away_season: int | None = None
    away_pitcher_id: int | None = None


class PitcherInfo(BaseModel):
    id: int
    name: str
    position: str
    stats: dict


class MLBTeam(BaseModel):
    id: int
    name: str
    abbreviation: str


class PlayerInfo(BaseModel):
    id: int
    name: str
    position: str
    stats: dict


class GameStateResponse(BaseModel):
    game_id: str
    inning: int
    is_top: bool
    outs: int
    balls: int
    strikes: int
    bases: list[bool]
    away_score: list[int]
    home_score: list[int]
    away_total: int
    home_total: int
    player_role: str
    game_status: str
    play_log: list[str]
    last_play: str
    away_team: str | None = None
    home_team: str | None = None
    away_abbreviation: str | None = None
    home_abbreviation: str | None = None
    away_lineup: list[dict] | None = None
    home_lineup: list[dict] | None = None
    current_batter_index: int = 0
    current_batter_name: str = ""
    home_pitcher: dict | None = None
    away_pitcher: dict | None = None


class SimulationResponse(GameStateResponse):
    snapshots: list[dict] = []
