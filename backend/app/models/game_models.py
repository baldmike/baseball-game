"""
game_models.py — Pydantic models for game API requests and responses.

Pydantic models serve two purposes here:
  1. Request validation: FastAPI automatically validates incoming JSON against
     these models and returns 422 errors if the shape doesn't match.
  2. Response serialization: FastAPI serializes the response dict/object into
     JSON matching the model's schema, which also generates accurate OpenAPI docs.

These models define the contract between the frontend and backend.
The frontend sends requests shaped like PitchRequest, BatActionRequest, etc.,
and receives responses shaped like GameStateResponse or SimulationResponse.
"""

from pydantic import BaseModel


class PitchRequest(BaseModel):
    """
    Request body sent when the player (as pitcher) throws a pitch.

    The frontend presents four pitch buttons; the player picks one.
    Valid pitch types: fastball, curveball, slider, changeup.
    The game engine uses this to determine the pitch outcome
    combined with the CPU batter's decision to swing or take.
    """
    pitch_type: str  # fastball, curveball, slider, changeup


class BatActionRequest(BaseModel):
    """
    Request body sent when the player (as batter) chooses to swing or take.

    The CPU pitcher has already chosen a pitch type behind the scenes;
    the player only decides whether to swing at it or let it pass.
    Valid actions: "swing" or "take".
    """
    action: str  # swing or take


class TeamSelectionRequest(BaseModel):
    """
    Request body sent when creating a new game.

    The frontend's team-selection screen sends this to configure the matchup.
    - team_id: The MLB team the player wants to play as (home team).
    - season: Which season's roster/stats to use (defaults to 2024).
    - home_pitcher_id: Optional specific pitcher to start for the home team.
      If omitted, the engine picks the best available (lowest ERA).
    - away_team_id: Optional specific opponent. If omitted, a random opponent
      is chosen from the other 29 MLB teams.
    - away_season: Optional separate season for the away team's roster.
      This lets you pit, say, the 2024 Yankees against the 2023 Dodgers.
    - away_pitcher_id: Optional specific pitcher for the away team.
    """
    team_id: int
    season: int = 2024
    home_pitcher_id: int | None = None
    away_team_id: int | None = None
    away_season: int | None = None
    away_pitcher_id: int | None = None


class PitcherInfo(BaseModel):
    """
    Represents a pitcher returned from the /pitchers endpoint.

    Used by the frontend to populate the pitcher-selection dropdown.
    The `stats` dict contains pitching stats like ERA, K/9, BB/9
    that the probabilities engine uses to adjust outcomes.
    """
    id: int
    name: str
    position: str       # Usually "P", "SP", or "RP"
    stats: dict         # {"era": float, "k_per_9": float, "bb_per_9": float}


class MLBTeam(BaseModel):
    """
    Represents an MLB team returned from the /teams endpoint.

    Used by the frontend to populate the team-selection dropdown.
    The league field ("AL" or "NL") can be used for filtering or display.
    """
    id: int
    name: str
    abbreviation: str   # e.g., "NYY", "LAD", "CHC"
    league: str = ""    # "AL" or "NL" — empty string if unknown


class PlayerInfo(BaseModel):
    """
    Represents a position player (batter) in a team's lineup.

    The `stats` dict contains hitting stats like AVG, SLG, K rate, HR rate
    that the probabilities engine uses to adjust at-bat outcomes.
    """
    id: int
    name: str
    position: str       # e.g., "SS", "CF", "1B", "DH"
    stats: dict         # {"avg": float, "slg": float, "k_rate": float, "hr_rate": float}


class GameStateResponse(BaseModel):
    """
    The complete game state returned by every game-related endpoint.

    This is the core data structure the frontend uses to render the entire
    game UI: the scoreboard, the diamond, the count, the play log, etc.

    Field explanations:
    - game_id: UUID string identifying this game in the in-memory store.
    - inning: Current inning number (1-indexed; can exceed 9 for extras).
    - is_top: True if it's the top of the inning (away team batting).
              False for the bottom (home team batting).
    - outs: Number of outs in the current half-inning (0-2; resets at 3).
    - balls: Current ball count for this at-bat (0-3; walk at 4).
    - strikes: Current strike count for this at-bat (0-2; strikeout at 3).
    - bases: A 3-element boolean list representing [1st, 2nd, 3rd].
             True means a runner is on that base. This simple representation
             works because we don't track individual runner identities —
             we only care about which bases are occupied for run-scoring logic.
    - away_score: Per-inning run totals for the away team, e.g. [0,0,1,0,...].
                  The frontend uses this to render the line score.
    - home_score: Per-inning run totals for the home team.
    - away_total: Sum of all away runs (cached for quick access).
    - home_total: Sum of all home runs (cached for quick access).
    - player_role: Either "pitching" or "batting" — tells the frontend which
                   set of controls to show (pitch buttons vs swing/take).
    - game_status: "active" or "final". The frontend checks this to know
                   whether to show game controls or the final score screen.
    - play_log: Full history of play descriptions, shown in a scrollable log.
    - last_play: The most recent play description, shown prominently.
    - away_team / home_team: Full team names (e.g., "New York Yankees").
    - away_abbreviation / home_abbreviation: Short team codes (e.g., "NYY").
    - away_lineup / home_lineup: Lists of player dicts for each team's lineup.
    - current_batter_index: Index into the current batting team's lineup,
                            so the frontend can highlight the active batter.
    - current_batter_name: Name of the batter currently at the plate.
    - home_pitcher / away_pitcher: Dicts with the starting pitcher info.
    """
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
    """
    Extended game state returned by the /simulate endpoint.

    Inherits all fields from GameStateResponse, plus:
    - snapshots: A list of game-state dicts captured after every single pitch
      during the simulation. The frontend uses these snapshots to "replay"
      the simulated game pitch-by-pitch with animations, rather than just
      jumping to the final score. Each snapshot is a lightweight copy of
      the game state at that moment (no lineup data, just the changing fields).

    The snapshot approach is essential because simulation runs the entire game
    server-side in one request. Without snapshots, the frontend would only
    see the final score and have no way to show the game progression.
    """
    snapshots: list[dict] = []
