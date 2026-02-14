"""Core game logic and state management."""

import uuid

from app.services import game_store, mlb_service
from app.services.probabilities import (
    cpu_decides_swing,
    cpu_picks_pitch,
    determine_outcome,
)

TOTAL_INNINGS = 9

HIT_TYPES = {"single", "double", "triple", "homerun"}
OUT_TYPES = {"groundout", "flyout", "lineout"}


def _empty_state() -> dict:
    return {
        "game_id": "",
        "inning": 1,
        "is_top": True,
        "outs": 0,
        "balls": 0,
        "strikes": 0,
        "bases": [False, False, False],  # 1st, 2nd, 3rd
        "away_score": [0] * TOTAL_INNINGS,
        "home_score": [0] * TOTAL_INNINGS,
        "away_total": 0,
        "home_total": 0,
        "player_role": "pitching",  # top of 1st: away bats, player pitches (home)
        "game_status": "active",
        "play_log": [],
        "last_play": "",
        # Team and lineup data
        "away_team": None,
        "home_team": None,
        "away_abbreviation": None,
        "home_abbreviation": None,
        "away_lineup": None,
        "home_lineup": None,
        "away_batter_idx": 0,
        "home_batter_idx": 0,
        "current_batter_index": 0,
        "current_batter_name": "",
        # Pitcher data
        "home_pitcher": None,
        "away_pitcher": None,
    }


def _get_current_batter(state: dict) -> dict | None:
    """Get the current batter based on which half of the inning it is."""
    if state["is_top"]:
        lineup = state.get("away_lineup")
        idx = state.get("away_batter_idx", 0)
    else:
        lineup = state.get("home_lineup")
        idx = state.get("home_batter_idx", 0)

    if not lineup:
        return None

    batter = lineup[idx % len(lineup)]
    state["current_batter_index"] = idx % len(lineup)
    state["current_batter_name"] = batter.get("name", "")
    return batter


def _advance_batter(state: dict) -> None:
    """Move to the next batter in the lineup."""
    if state["is_top"]:
        lineup = state.get("away_lineup")
        if lineup:
            state["away_batter_idx"] = (state.get("away_batter_idx", 0) + 1) % len(lineup)
    else:
        lineup = state.get("home_lineup")
        if lineup:
            state["home_batter_idx"] = (state.get("home_batter_idx", 0) + 1) % len(lineup)


def create_new_game(
    home_team_id: int | None = None,
    season: int = 2024,
    home_pitcher_id: int | None = None,
    away_team_id: int | None = None,
    away_season: int | None = None,
    away_pitcher_id: int | None = None,
) -> dict:
    state = _empty_state()
    state["game_id"] = str(uuid.uuid4())

    if home_team_id:
        try:
            # Get home team info
            teams = mlb_service.get_all_teams()
            home_team = next((t for t in teams if t["id"] == home_team_id), None)

            if home_team:
                # Use chosen opponent or pick random
                if away_team_id:
                    opponent = next((t for t in teams if t["id"] == away_team_id), None)
                    if not opponent:
                        opponent = mlb_service.get_random_opponent(home_team_id)
                else:
                    opponent = mlb_service.get_random_opponent(home_team_id)

                opp_season = away_season or season

                state["home_team"] = home_team["name"]
                state["home_abbreviation"] = home_team["abbreviation"]
                state["away_team"] = opponent["name"]
                state["away_abbreviation"] = opponent["abbreviation"]

                # Fetch lineups (each team uses its own season)
                state["home_lineup"] = mlb_service.get_team_lineup(home_team_id, season=season)
                state["away_lineup"] = mlb_service.get_team_lineup(opponent["id"], season=opp_season)

                # Fetch home starting pitcher
                if home_pitcher_id:
                    pitchers = mlb_service.get_team_pitchers(home_team_id, season=season)
                    chosen = next((p for p in pitchers if p["id"] == home_pitcher_id), None)
                    state["home_pitcher"] = chosen or mlb_service.get_team_pitcher(home_team_id, season=season)
                else:
                    state["home_pitcher"] = mlb_service.get_team_pitcher(home_team_id, season=season)

                # Fetch away starting pitcher
                if away_pitcher_id:
                    pitchers = mlb_service.get_team_pitchers(opponent["id"], season=opp_season)
                    chosen = next((p for p in pitchers if p["id"] == away_pitcher_id), None)
                    state["away_pitcher"] = chosen or mlb_service.get_team_pitcher(opponent["id"], season=opp_season)
                else:
                    state["away_pitcher"] = mlb_service.get_team_pitcher(opponent["id"], season=opp_season)

                # Set initial batter
                _get_current_batter(state)

                msg = f"Play Ball! You're the {home_team['name']} vs the {opponent['name']}!"
                state["play_log"].append(msg)
                state["last_play"] = msg
                game_store.save_game(state["game_id"], state)
                return state
        except Exception:
            # Fall through to default game creation
            pass

    state["play_log"].append("Play Ball! You're the home team.")
    state["last_play"] = "Play Ball! You're the home team."
    game_store.save_game(state["game_id"], state)
    return state


def process_pitch(game_id: str, pitch_type: str) -> dict:
    """Player is pitching (defense). CPU batter decides swing/take."""
    state = game_store.get_game(game_id)
    if not state or state["game_status"] != "active":
        return state or {}
    if state["player_role"] != "pitching":
        state["last_play"] = "You're batting right now, not pitching!"
        return state

    # Get current batter's stats for adjusted outcomes
    batter = _get_current_batter(state)
    player_stats = batter.get("stats") if batter else None
    batter_name = batter.get("name", "Batter") if batter else "Batter"

    # Home pitcher faces away batters in top of inning
    pitcher = state.get("home_pitcher")
    pitcher_stats = pitcher.get("stats") if pitcher else None

    swings = cpu_decides_swing()
    outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
    action_str = "swings" if swings else "takes"
    msg = f"You throw a {pitch_type}. {batter_name} {action_str}: {_format_outcome(outcome)}!"
    _apply_outcome(state, outcome, msg)
    game_store.save_game(game_id, state)
    return state


def process_at_bat(game_id: str, action: str) -> dict:
    """Player is batting (offense). CPU pitches, player swings or takes."""
    state = game_store.get_game(game_id)
    if not state or state["game_status"] != "active":
        return state or {}
    if state["player_role"] != "batting":
        state["last_play"] = "You're pitching right now, not batting!"
        return state

    # Get current batter (player's batter) stats for adjusted outcomes
    batter = _get_current_batter(state)
    player_stats = batter.get("stats") if batter else None

    # Away pitcher faces home batters in bottom of inning
    pitcher = state.get("away_pitcher")
    pitcher_stats = pitcher.get("stats") if pitcher else None

    pitch_type = cpu_picks_pitch()
    swings = action == "swing"
    outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
    action_str = "swing" if swings else "take"
    msg = f"Pitcher throws a {pitch_type}. You {action_str}: {_format_outcome(outcome)}!"
    _apply_outcome(state, outcome, msg)
    game_store.save_game(game_id, state)
    return state


def _format_outcome(outcome: str) -> str:
    return outcome.replace("_", " ").title()


def _apply_outcome(state: dict, outcome: str, msg: str) -> None:
    state["play_log"].append(msg)
    state["last_play"] = msg

    if outcome == "ball":
        state["balls"] += 1
        if state["balls"] >= 4:
            _walk(state)
    elif outcome in ("strike_looking", "strike_swinging"):
        state["strikes"] += 1
        if state["strikes"] >= 3:
            _record_out(state, "Strikeout!")
    elif outcome == "foul":
        if state["strikes"] < 2:
            state["strikes"] += 1
        # fouls with 2 strikes don't add a strike
    elif outcome in OUT_TYPES:
        _record_out(state, _format_outcome(outcome) + "!")
    elif outcome in HIT_TYPES:
        _record_hit(state, outcome)


def _walk(state: dict) -> None:
    msg = "Ball four — batter walks!"
    state["play_log"].append(msg)
    state["last_play"] = msg
    runs = _advance_runners_walk(state["bases"])
    _score_runs(state, runs)
    _reset_count(state)
    _advance_batter(state)
    _get_current_batter(state)


def _advance_runners_walk(bases: list[bool]) -> int:
    """Walk: push runners forward only if forced."""
    runs = 0
    if bases[0] and bases[1] and bases[2]:
        runs = 1  # bases loaded walk scores a run
    if bases[0] and bases[1]:
        bases[2] = True
    if bases[0]:
        bases[1] = True
    bases[0] = True
    return runs


def _record_out(state: dict, description: str) -> None:
    state["play_log"].append(description)
    state["last_play"] = description
    state["outs"] += 1
    _reset_count(state)
    _advance_batter(state)
    if state["outs"] >= 3:
        _end_half_inning(state)
    else:
        _get_current_batter(state)


def _record_hit(state: dict, hit_type: str) -> None:
    runs = _advance_runners_hit(state["bases"], hit_type)
    _score_runs(state, runs)
    _reset_count(state)
    _advance_batter(state)
    _get_current_batter(state)
    if runs > 0:
        state["play_log"].append(f"{runs} run(s) score!")
        state["last_play"] += f" {runs} run(s) score!"


def _advance_runners_hit(bases: list[bool], hit_type: str) -> int:
    runs = 0
    if hit_type == "single":
        if bases[2]:
            runs += 1
            bases[2] = False
        if bases[1]:
            bases[2] = True
            bases[1] = False
        if bases[0]:
            bases[1] = True
            bases[0] = False
        bases[0] = True
    elif hit_type == "double":
        if bases[2]:
            runs += 1
        if bases[1]:
            runs += 1
        if bases[0]:
            bases[2] = True
            bases[0] = False
        else:
            bases[2] = False
        bases[1] = True
    elif hit_type == "triple":
        for i in range(3):
            if bases[i]:
                runs += 1
                bases[i] = False
        bases[2] = True
    elif hit_type == "homerun":
        for i in range(3):
            if bases[i]:
                runs += 1
                bases[i] = False
        runs += 1  # batter scores too
    return runs


def _score_runs(state: dict, runs: int) -> None:
    if runs <= 0:
        return
    inning_idx = state["inning"] - 1
    if state["is_top"]:
        state["away_score"][inning_idx] += runs
        state["away_total"] += runs
    else:
        state["home_score"][inning_idx] += runs
        state["home_total"] += runs


def _reset_count(state: dict) -> None:
    state["balls"] = 0
    state["strikes"] = 0


def _end_half_inning(state: dict) -> None:
    state["outs"] = 0
    state["bases"] = [False, False, False]
    _reset_count(state)

    if state["is_top"]:
        # Moving to bottom of inning — player bats
        state["is_top"] = False
        state["player_role"] = "batting"
        half = f"Bottom of inning {state['inning']}"
        # Walk-off check: if home team ahead after top of 9th+, game over
        if state["inning"] >= TOTAL_INNINGS and state["home_total"] > state["away_total"]:
            _end_game(state)
            return
    else:
        # Moving to top of next inning — player pitches
        state["inning"] += 1
        state["is_top"] = True
        state["player_role"] = "pitching"
        half = f"Top of inning {state['inning']}"

        # Check if game is over after a full inning (9+)
        if state["inning"] > TOTAL_INNINGS and state["home_total"] != state["away_total"]:
            _end_game(state)
            return

        # Extend score arrays for extra innings
        if state["inning"] > len(state["away_score"]):
            state["away_score"].append(0)
            state["home_score"].append(0)

    # Update current batter for new half-inning
    _get_current_batter(state)

    msg = f"--- {half} ---"
    state["play_log"].append(msg)
    state["last_play"] = msg


def _snapshot(state: dict) -> dict:
    """Capture a snapshot of the current game state for simulation replay."""
    return {
        "inning": state["inning"],
        "is_top": state["is_top"],
        "outs": state["outs"],
        "balls": state["balls"],
        "strikes": state["strikes"],
        "bases": list(state["bases"]),
        "away_score": list(state["away_score"]),
        "home_score": list(state["home_score"]),
        "away_total": state["away_total"],
        "home_total": state["home_total"],
        "player_role": state["player_role"],
        "game_status": state["game_status"],
        "last_play": state["last_play"],
        "play_log": list(state["play_log"]),
        "current_batter_name": state.get("current_batter_name", ""),
        "current_batter_index": state.get("current_batter_index", 0),
        "home_pitcher": state.get("home_pitcher"),
        "away_pitcher": state.get("away_pitcher"),
        "away_team": state.get("away_team"),
        "home_team": state.get("home_team"),
        "away_abbreviation": state.get("away_abbreviation"),
        "home_abbreviation": state.get("home_abbreviation"),
    }


def simulate_game(game_id: str) -> dict:
    """Simulate an entire game (CPU vs CPU) and return snapshots at each play."""
    state = game_store.get_game(game_id)
    if not state or state["game_status"] != "active":
        return state or {}

    snapshots = []
    # Capture initial state
    snapshots.append(_snapshot(state))

    max_iterations = 500
    iteration = 0

    while state["game_status"] == "active" and iteration < max_iterations:
        iteration += 1

        if state["player_role"] == "pitching":
            # CPU pitching: pick a pitch, CPU batter decides
            batter = _get_current_batter(state)
            player_stats = batter.get("stats") if batter else None
            batter_name = batter.get("name", "Batter") if batter else "Batter"
            pitcher = state.get("home_pitcher")
            pitcher_stats = pitcher.get("stats") if pitcher else None

            pitch_type = cpu_picks_pitch()
            swings = cpu_decides_swing()
            outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
            action_str = "swings" if swings else "takes"
            msg = f"You throw a {pitch_type}. {batter_name} {action_str}: {_format_outcome(outcome)}!"
            _apply_outcome(state, outcome, msg)
        else:
            # CPU batting: CPU pitcher throws, CPU batter decides
            batter = _get_current_batter(state)
            player_stats = batter.get("stats") if batter else None
            pitcher = state.get("away_pitcher")
            pitcher_stats = pitcher.get("stats") if pitcher else None

            pitch_type = cpu_picks_pitch()
            swings = cpu_decides_swing()
            outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
            action_str = "swing" if swings else "take"
            msg = f"Pitcher throws a {pitch_type}. You {action_str}: {_format_outcome(outcome)}!"
            _apply_outcome(state, outcome, msg)

        snapshots.append(_snapshot(state))

    game_store.save_game(game_id, state)

    result = dict(state)
    result["snapshots"] = snapshots
    return result


def _end_game(state: dict) -> None:
    state["game_status"] = "final"
    home_name = state.get("home_team") or "Home"
    away_name = state.get("away_team") or "Away"
    if state["home_total"] > state["away_total"]:
        winner = "You win!"
    else:
        winner = "You lose!"
    msg = f"Game Over! Final: {home_name} {state['home_total']} - {away_name} {state['away_total']}. {winner}"
    state["play_log"].append(msg)
    state["last_play"] = msg
