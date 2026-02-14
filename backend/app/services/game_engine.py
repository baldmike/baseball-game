"""
game_engine.py — Core game logic and state management.

This is the heart of the baseball simulation. It manages:
  - Game state initialization (creating a fresh game with teams and rosters).
  - Pitch processing (when the player pitches to a CPU batter).
  - At-bat processing (when a CPU pitcher throws to the player's batter).
  - Full game simulation (CPU vs CPU, used for auto-play / fast-forward).
  - All baseball rules: ball/strike counts, outs, base running, scoring,
    half-inning transitions, extra innings, walk-offs, and game ending.

Design decisions:
  - Game state is stored as a plain dict (not a class) for easy JSON
    serialization and because the state shape matches the API response model.
  - The player is always the home team. In the top of the inning, the player
    pitches (defense); in the bottom, the player bats (offense).
  - Bases are represented as [bool, bool, bool] for [1st, 2nd, 3rd].
    We don't track individual runner identities — only whether a base is
    occupied — because the simplified base-running rules don't need it.
"""

import uuid

from app.services import game_store, mlb_service
from app.services.probabilities import (
    cpu_decides_swing,
    cpu_picks_pitch,
    determine_outcome,
)

# Standard baseball: 9 innings per game.
# Games tied after 9 go to extra innings (handled by extending score arrays).
TOTAL_INNINGS = 9

# These sets categorize outcomes for easy membership checks.
# Used in _apply_outcome to route to the correct handler (_record_hit vs _record_out).
HIT_TYPES = {"single", "double", "triple", "homerun"}
OUT_TYPES = {"groundout", "flyout", "lineout"}


def _empty_state() -> dict:
    """
    Create a blank game state dict with all fields initialized to defaults.

    This serves as the template for every new game. Key design notes:
    - inning starts at 1 (1-indexed to match baseball convention).
    - is_top starts True because games begin at the top of the 1st inning.
    - bases is [False, False, False] representing empty 1st, 2nd, 3rd bases.
      Using booleans keeps the logic simple: True = runner present, False = empty.
    - away_score and home_score are lists of per-inning run totals, initialized
      to 9 zeros (one per inning). Extra-inning entries are appended as needed.
    - player_role starts as "pitching" because the player is the home team,
      and in the top of the 1st inning the away team bats (so the player pitches).
    - Separate batter indices (away_batter_idx, home_batter_idx) track each
      team's position in their lineup independently, so the lineup order
      persists across innings (just like real baseball).
    """
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
        # Top of 1st: away team bats, so the player (home team) is pitching
        "player_role": "pitching",
        "game_status": "active",
        "play_log": [],
        "last_play": "",
        # Team and lineup data — populated during game creation from MLB API
        "away_team": None,
        "home_team": None,
        "away_abbreviation": None,
        "home_abbreviation": None,
        "away_lineup": None,
        "home_lineup": None,
        # Batter indices track where each team is in their batting order.
        # These persist across innings so a team picks up where they left off.
        "away_batter_idx": 0,
        "home_batter_idx": 0,
        # These are convenience fields sent to the frontend so it can
        # highlight the current batter without re-computing from the index.
        "current_batter_index": 0,
        "current_batter_name": "",
        # Pitcher data — one pitcher per team for the whole game
        # (no bullpen management in this simplified simulation)
        "home_pitcher": None,
        "away_pitcher": None,
    }


def _get_current_batter(state: dict) -> dict | None:
    """
    Get the current batter based on which half of the inning it is.

    Why we check is_top: In the top of the inning, the away team is batting,
    so we pull from the away lineup. In the bottom, the home team bats,
    so we use the home lineup.

    We use modulo (%) on the index so the lineup wraps around — after the
    9th batter, we go back to the 1st (the "batting around" scenario).

    This also updates the state's current_batter_index and current_batter_name
    as a side effect, so the frontend always has the latest batter info.
    """
    if state["is_top"]:
        # Top of inning: away team is batting
        lineup = state.get("away_lineup")
        idx = state.get("away_batter_idx", 0)
    else:
        # Bottom of inning: home team is batting
        lineup = state.get("home_lineup")
        idx = state.get("home_batter_idx", 0)

    # If no lineup is loaded (e.g., fallback game without MLB data), return None
    if not lineup:
        return None

    # Modulo ensures we wrap around the lineup (9 batters, then back to #1)
    batter = lineup[idx % len(lineup)]
    # Update state so the frontend knows which batter is up
    state["current_batter_index"] = idx % len(lineup)
    state["current_batter_name"] = batter.get("name", "")
    return batter


def _advance_batter(state: dict) -> None:
    """
    Move to the next batter in the current batting team's lineup.

    This is called after every completed at-bat (hit, out, walk).
    The batter index for the appropriate team is incremented, and modulo
    ensures it wraps around the 9-player lineup. Each team's index is
    tracked independently, just like in real baseball.
    """
    if state["is_top"]:
        # Away team is batting — advance their batter index
        lineup = state.get("away_lineup")
        if lineup:
            state["away_batter_idx"] = (state.get("away_batter_idx", 0) + 1) % len(lineup)
    else:
        # Home team is batting — advance their batter index
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
    """
    Initialize a new game with teams, lineups, and pitchers.

    This function:
    1. Creates a blank state with a unique game ID (UUID).
    2. If a home_team_id is provided, fetches real MLB data:
       a. Looks up the home team info from all 30 MLB teams.
       b. Picks an opponent (either the specified away_team_id or random).
       c. Fetches rosters and constructs 9-player lineups sorted by OPS.
       d. Fetches starting pitchers (specified or best-available by ERA).
    3. Falls back to a generic "you're the home team" game if MLB API fails.

    The try/except around the entire MLB data section ensures the game can
    always be created, even if the external API is down. The player just
    won't have real team names or stat-adjusted probabilities.
    """
    state = _empty_state()
    # Generate a unique game ID so multiple games can coexist in memory
    state["game_id"] = str(uuid.uuid4())

    if home_team_id:
        try:
            # Get home team info by searching the full list of MLB teams
            teams = mlb_service.get_all_teams()
            home_team = next((t for t in teams if t["id"] == home_team_id), None)

            if home_team:
                # Determine the opponent: use the specified away team, or pick randomly
                if away_team_id:
                    opponent = next((t for t in teams if t["id"] == away_team_id), None)
                    # If the specified away_team_id doesn't match any team, fall back to random
                    if not opponent:
                        opponent = mlb_service.get_random_opponent(home_team_id)
                else:
                    # No opponent specified — pick a random team (excluding the home team)
                    opponent = mlb_service.get_random_opponent(home_team_id)

                # Allow the away team to use a different season's roster.
                # This enables fun matchups like "2024 Yankees vs 2023 Dodgers".
                opp_season = away_season or season

                # Store team names and abbreviations for display in the frontend
                state["home_team"] = home_team["name"]
                state["home_abbreviation"] = home_team["abbreviation"]
                state["away_team"] = opponent["name"]
                state["away_abbreviation"] = opponent["abbreviation"]

                # Fetch lineups: each team uses its own season for roster/stats lookup.
                # The lineup construction (in mlb_service) picks the best 9 position
                # players by OPS and sorts them in descending OPS order.
                state["home_lineup"] = mlb_service.get_team_lineup(home_team_id, season=season)
                state["away_lineup"] = mlb_service.get_team_lineup(opponent["id"], season=opp_season)

                # Fetch home starting pitcher.
                # If the player specified a pitcher, look them up on the roster.
                # If not found (or not specified), use the best available (lowest ERA).
                if home_pitcher_id:
                    pitchers = mlb_service.get_team_pitchers(home_team_id, season=season)
                    chosen = next((p for p in pitchers if p["id"] == home_pitcher_id), None)
                    state["home_pitcher"] = chosen or mlb_service.get_team_pitcher(home_team_id, season=season)
                else:
                    state["home_pitcher"] = mlb_service.get_team_pitcher(home_team_id, season=season)

                # Fetch away starting pitcher (same logic as home pitcher)
                if away_pitcher_id:
                    pitchers = mlb_service.get_team_pitchers(opponent["id"], season=opp_season)
                    chosen = next((p for p in pitchers if p["id"] == away_pitcher_id), None)
                    state["away_pitcher"] = chosen or mlb_service.get_team_pitcher(opponent["id"], season=opp_season)
                else:
                    state["away_pitcher"] = mlb_service.get_team_pitcher(opponent["id"], season=opp_season)

                # Initialize the first batter (away team leads off at the top of the 1st)
                _get_current_batter(state)

                # Set the opening message for the play log
                msg = f"Play Ball! You're the {home_team['name']} vs the {opponent['name']}!"
                state["play_log"].append(msg)
                state["last_play"] = msg
                game_store.save_game(state["game_id"], state)
                return state
        except Exception:
            # If anything goes wrong with the MLB API (network error, bad data, etc.),
            # fall through to the default game creation below.
            # This ensures the player can always start a game.
            pass

    # Fallback: create a generic game without real MLB data.
    # No real lineups or pitchers — the probability engine will use league averages.
    state["play_log"].append("Play Ball! You're the home team.")
    state["last_play"] = "Play Ball! You're the home team."
    game_store.save_game(state["game_id"], state)
    return state


def process_pitch(game_id: str, pitch_type: str) -> dict:
    """
    Player is pitching (defense). CPU batter decides whether to swing or take.

    This is called during the top of the inning when the away team is batting.
    Flow:
    1. Look up current batter from the away lineup (with their hitting stats).
    2. Get the home pitcher's stats (for pitcher-adjusted probabilities).
    3. CPU batter randomly decides to swing or take (60/40 split).
    4. The probability engine determines the outcome based on pitch type,
       swing decision, batter stats, and pitcher stats.
    5. The outcome is applied to the game state (count change, hit, out, etc.).
    """
    state = game_store.get_game(game_id)
    # Guard: bail out if the game doesn't exist or is already over
    if not state or state["game_status"] != "active":
        return state or {}
    # Guard: prevent calling pitch when the player should be batting
    if state["player_role"] != "pitching":
        state["last_play"] = "You're batting right now, not pitching!"
        return state

    # Get current batter's stats for adjusted outcomes.
    # The batter's AVG, SLG, K-rate, and HR-rate shift the probability tables
    # so that good hitters get more hits and bad hitters strike out more.
    batter = _get_current_batter(state)
    player_stats = batter.get("stats") if batter else None
    batter_name = batter.get("name", "Batter") if batter else "Batter"

    # In the top of the inning, the home pitcher faces away batters.
    # We use the home pitcher's stats to adjust outcomes (better pitchers
    # generate more strikeouts, fewer walks, etc.).
    pitcher = state.get("home_pitcher")
    pitcher_stats = pitcher.get("stats") if pitcher else None

    # CPU batter randomly decides whether to swing (60% chance) or take
    swings = cpu_decides_swing()
    # Determine the outcome using probability tables adjusted by real stats
    outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
    # Build a human-readable play description for the play log
    action_str = "swings" if swings else "takes"
    msg = f"You throw a {pitch_type}. {batter_name} {action_str}: {_format_outcome(outcome)}!"
    # Apply the outcome to game state (update count, record hit/out, advance runners, etc.)
    _apply_outcome(state, outcome, msg)
    # Persist the updated state
    game_store.save_game(game_id, state)
    return state


def process_at_bat(game_id: str, action: str) -> dict:
    """
    Player is batting (offense). CPU pitches, player swings or takes.

    This is called during the bottom of the inning when the home team is batting.
    Flow:
    1. Look up current batter from the home lineup (with their hitting stats).
    2. Get the away pitcher's stats (for pitcher-adjusted probabilities).
    3. CPU pitcher randomly selects a pitch type (weighted: ~50% fastball, etc.).
    4. The player's action ("swing" or "take") determines the outcome table used.
    5. The probability engine determines the outcome and it's applied to game state.
    """
    state = game_store.get_game(game_id)
    # Guard: bail out if the game doesn't exist or is already over
    if not state or state["game_status"] != "active":
        return state or {}
    # Guard: prevent calling bat when the player should be pitching
    if state["player_role"] != "batting":
        state["last_play"] = "You're pitching right now, not batting!"
        return state

    # Get current batter (player's batter) stats for adjusted outcomes.
    # Even though the player chose swing/take, the batter's stats still affect
    # the probability of each outcome (e.g., a .300 hitter gets more singles).
    batter = _get_current_batter(state)
    player_stats = batter.get("stats") if batter else None

    # In the bottom of the inning, the away pitcher faces home batters.
    # We use the away pitcher's stats to adjust outcomes.
    pitcher = state.get("away_pitcher")
    pitcher_stats = pitcher.get("stats") if pitcher else None

    # CPU pitcher picks a pitch type using weighted random selection
    pitch_type = cpu_picks_pitch()
    # Convert the player's action to a boolean for the probability engine
    swings = action == "swing"
    # Determine the outcome using probability tables adjusted by real stats
    outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
    # Build a human-readable play description
    action_str = "swing" if swings else "take"
    msg = f"Pitcher throws a {pitch_type}. You {action_str}: {_format_outcome(outcome)}!"
    # Apply the outcome to game state
    _apply_outcome(state, outcome, msg)
    # Persist the updated state
    game_store.save_game(game_id, state)
    return state


def _format_outcome(outcome: str) -> str:
    """
    Convert an outcome string like 'strike_swinging' to 'Strike Swinging'.

    This is purely cosmetic — makes the play log messages look nicer
    by replacing underscores with spaces and title-casing the words.
    """
    return outcome.replace("_", " ").title()


def _apply_outcome(state: dict, outcome: str, msg: str) -> None:
    """
    Apply a pitch outcome to the game state.

    This is the central dispatcher that routes each outcome type to the
    appropriate handler. Possible outcomes and their handlers:

    - "ball": Increment ball count. If 4 balls, issue a walk.
    - "strike_looking" / "strike_swinging": Increment strike count.
      If 3 strikes, record a strikeout.
    - "foul": Increment strikes only if count is below 2.
      In real baseball, foul balls with 2 strikes don't add a strike
      (you can't foul out — only foul-tip into the catcher's mitt for strike 3,
      but we don't model that nuance).
    - Outs (groundout, flyout, lineout): Record an out directly.
    - Hits (single, double, triple, homerun): Advance runners and score runs.
    """
    # Log the play description
    state["play_log"].append(msg)
    state["last_play"] = msg

    if outcome == "ball":
        state["balls"] += 1
        # Four balls = walk (batter takes first base, runners may advance if forced)
        if state["balls"] >= 4:
            _walk(state)
    elif outcome in ("strike_looking", "strike_swinging"):
        state["strikes"] += 1
        # Three strikes = strikeout (batter is out)
        if state["strikes"] >= 3:
            _record_out(state, "Strikeout!")
    elif outcome == "foul":
        # Foul balls only add a strike if the count is below 2 strikes.
        # Once at 2 strikes, fouls keep the count the same (can't strike out on a foul).
        if state["strikes"] < 2:
            state["strikes"] += 1
        # fouls with 2 strikes don't add a strike
    elif outcome in OUT_TYPES:
        # Batted-ball outs: the ball was put in play but fielded for an out
        _record_out(state, _format_outcome(outcome) + "!")
    elif outcome in HIT_TYPES:
        # Hits: advance runners based on hit type and score any runs
        _record_hit(state, outcome)


def _walk(state: dict) -> None:
    """
    Handle a base on balls (walk).

    When the batter draws 4 balls:
    1. Log the walk message.
    2. Advance runners who are forced (only runners with all bases behind them occupied).
    3. Score any runs that result from the advancing (e.g., bases-loaded walk scores 1).
    4. Reset the ball/strike count for the next batter.
    5. Advance to the next batter in the lineup.
    """
    msg = "Ball four — batter walks!"
    state["play_log"].append(msg)
    state["last_play"] = msg
    # Advance forced runners and get the number of runs scored
    runs = _advance_runners_walk(state["bases"])
    _score_runs(state, runs)
    # Reset the count for the next at-bat
    _reset_count(state)
    # Move to the next batter in the lineup
    _advance_batter(state)
    # Update the current batter info for the frontend
    _get_current_batter(state)


def _advance_runners_walk(bases: list[bool]) -> int:
    """
    Walk: push runners forward only if forced.

    In baseball, a walk only forces runners to advance if every base behind
    them is occupied. The logic works backwards from 3rd base:
    - If ALL three bases are loaded (1st, 2nd, 3rd), the runner on 3rd is
      forced home and scores a run.
    - If 1st and 2nd are occupied, the runner on 2nd moves to 3rd.
    - If 1st is occupied, the runner on 1st moves to 2nd.
    - The batter always takes 1st base.

    Note: this simplified model doesn't handle rare cases like a runner
    on 3rd only (no force) — in that case the runner stays put, which
    this code handles correctly because the if-conditions aren't met.
    """
    runs = 0
    if bases[0] and bases[1] and bases[2]:
        # Bases loaded: runner on 3rd is forced home — scores a run
        runs = 1
    if bases[0] and bases[1]:
        # Runners on 1st and 2nd: runner on 2nd is forced to 3rd
        bases[2] = True
    if bases[0]:
        # Runner on 1st is forced to 2nd
        bases[1] = True
    # Batter always takes 1st base on a walk
    bases[0] = True
    return runs


def _record_out(state: dict, description: str) -> None:
    """
    Record an out (strikeout, groundout, flyout, or lineout).

    Increments the out count and checks if the half-inning is over (3 outs).
    If 3 outs are reached, we transition to the next half-inning.
    Otherwise, we just set up the next batter.

    Note: we advance the batter BEFORE checking if the half-inning ends,
    because _end_half_inning resets the bases and transitions the game state.
    The batter index needs to be incremented regardless, so the lineup
    picks up at the right spot next time this team bats.
    """
    state["play_log"].append(description)
    state["last_play"] = description
    state["outs"] += 1
    # Reset ball/strike count (the at-bat is over)
    _reset_count(state)
    # Advance lineup index for next time this batter comes up
    _advance_batter(state)
    if state["outs"] >= 3:
        # Three outs: end the half-inning and transition
        _end_half_inning(state)
    else:
        # Still batting: update current batter info for the frontend
        _get_current_batter(state)


def _record_hit(state: dict, hit_type: str) -> None:
    """
    Record a hit (single, double, triple, or homerun).

    Advances runners based on the hit type, scores any runs, resets the count,
    and moves to the next batter. If runs scored, appends a scoring message
    to both the play log and the last_play field.
    """
    # Advance runners and calculate how many runs scored
    runs = _advance_runners_hit(state["bases"], hit_type)
    _score_runs(state, runs)
    # Reset ball/strike count for the next at-bat
    _reset_count(state)
    # Advance to the next batter in the lineup
    _advance_batter(state)
    # Update current batter info for the frontend
    _get_current_batter(state)
    # If runs scored, add an extra log message so it's visible in the play log
    if runs > 0:
        state["play_log"].append(f"{runs} run(s) score!")
        state["last_play"] += f" {runs} run(s) score!"


def _advance_runners_hit(bases: list[bool], hit_type: str) -> int:
    """
    Advance runners based on the type of hit.

    This is a simplified model of base running:
    - Single: Each runner advances one base. Runner on 3rd scores.
      The batter takes 1st.
    - Double: Runners on 2nd and 3rd score. Runner on 1st goes to 3rd.
      The batter takes 2nd.
    - Triple: All runners score. The batter takes 3rd.
    - Homerun: All runners score AND the batter scores.

    Real baseball has more complex base-running (runners can advance
    extra bases on certain hits, get thrown out, etc.), but this simplified
    model captures the essential scoring mechanics.

    The bases list is mutated in-place: bases[0]=1st, bases[1]=2nd, bases[2]=3rd.
    """
    runs = 0
    if hit_type == "single":
        # Runner on 3rd scores
        if bases[2]:
            runs += 1
            bases[2] = False
        # Runner on 2nd advances to 3rd
        if bases[1]:
            bases[2] = True
            bases[1] = False
        # Runner on 1st advances to 2nd
        if bases[0]:
            bases[1] = True
            bases[0] = False
        # Batter takes 1st base
        bases[0] = True
    elif hit_type == "double":
        # Runner on 3rd scores
        if bases[2]:
            runs += 1
        # Runner on 2nd scores
        if bases[1]:
            runs += 1
        # Runner on 1st advances to 3rd (not home — realistic for a double)
        if bases[0]:
            bases[2] = True
            bases[0] = False
        else:
            # No runner on 1st, so 3rd base is only occupied if someone was already there
            # (but they scored above), so clear it
            bases[2] = False
        # Batter takes 2nd base
        bases[1] = True
    elif hit_type == "triple":
        # All runners score
        for i in range(3):
            if bases[i]:
                runs += 1
                bases[i] = False
        # Batter takes 3rd base
        bases[2] = True
    elif hit_type == "homerun":
        # All runners score
        for i in range(3):
            if bases[i]:
                runs += 1
                bases[i] = False
        # Batter also scores (rounds all the bases)
        runs += 1
    return runs


def _score_runs(state: dict, runs: int) -> None:
    """
    Add runs to the appropriate team's score.

    We check is_top to determine which team is batting (and therefore scoring):
    - Top of inning (is_top=True): away team is batting, so runs go to away.
    - Bottom of inning (is_top=False): home team is batting, so runs go to home.

    We update both the per-inning score array (for the line score display)
    and the running total (for quick score comparisons).
    """
    if runs <= 0:
        return
    # Convert 1-indexed inning to 0-indexed array position
    inning_idx = state["inning"] - 1
    if state["is_top"]:
        # Away team is batting — add runs to their score
        state["away_score"][inning_idx] += runs
        state["away_total"] += runs
    else:
        # Home team is batting — add runs to their score
        state["home_score"][inning_idx] += runs
        state["home_total"] += runs


def _reset_count(state: dict) -> None:
    """
    Reset the ball/strike count to 0-0 for a new at-bat.

    Called after every completed at-bat (hit, out, walk, strikeout).
    """
    state["balls"] = 0
    state["strikes"] = 0


def _end_half_inning(state: dict) -> None:
    """
    Transition between half-innings (top <-> bottom) or end the game.

    This function handles the most complex part of baseball game flow:

    1. Reset outs, bases, and count for the new half-inning.
    2. If we were in the top half (away batting), switch to bottom (home batting).
       - WALK-OFF CHECK: If it's the 9th inning or later and the home team is
         already ahead, the game is over. The home team doesn't need to bat
         because they've already won. This is the "walk-off" scenario.
    3. If we were in the bottom half (home batting), switch to top of next inning.
       - END-OF-GAME CHECK: After a complete inning (9th or later), if the score
         is NOT tied, the game is over. We only continue if tied (extras).
       - EXTRA INNINGS: If the game continues past 9 innings, extend the
         per-inning score arrays to accommodate the extra frames.
    4. Update the current batter for the new half-inning.
    """
    # Reset the field: no outs, empty bases, fresh count
    state["outs"] = 0
    state["bases"] = [False, False, False]
    _reset_count(state)

    if state["is_top"]:
        # Moving from top to bottom of the same inning — player now bats
        state["is_top"] = False
        state["player_role"] = "batting"
        half = f"Bottom of inning {state['inning']}"

        # WALK-OFF CHECK: After the top of the 9th (or later), if the home team
        # is already ahead, they don't need to bat. The game ends immediately.
        # This is called a "walk-off" because the home team walks off the field
        # as winners without needing their final at-bats.
        if state["inning"] >= TOTAL_INNINGS and state["home_total"] > state["away_total"]:
            _end_game(state)
            return
    else:
        # Moving from bottom to top of the NEXT inning — player now pitches
        state["inning"] += 1
        state["is_top"] = True
        state["player_role"] = "pitching"
        half = f"Top of inning {state['inning']}"

        # END-OF-GAME CHECK: After completing a full inning (both halves) in the
        # 9th inning or later, if the score is NOT tied, the game is over.
        # If tied, we continue to extra innings.
        # Note: inning was already incremented above, so `> TOTAL_INNINGS` means
        # we just finished at least the 9th inning.
        if state["inning"] > TOTAL_INNINGS and state["home_total"] != state["away_total"]:
            _end_game(state)
            return

        # EXTRA INNINGS: Extend the per-inning score arrays if we've gone
        # beyond the initial 9 innings. This ensures we have a slot to record
        # runs for the new inning.
        if state["inning"] > len(state["away_score"]):
            state["away_score"].append(0)
            state["home_score"].append(0)

    # Update current batter for new half-inning.
    # Each team's lineup picks up where it left off from their last at-bat.
    _get_current_batter(state)

    # Log the half-inning transition
    msg = f"--- {half} ---"
    state["play_log"].append(msg)
    state["last_play"] = msg


def _snapshot(state: dict) -> dict:
    """
    Capture a snapshot of the current game state for simulation replay.

    During simulation (CPU vs CPU auto-play), we need to record the state
    after every single pitch so the frontend can replay the game step-by-step
    with animations. Without snapshots, the frontend would only see the
    final score and miss the entire progression of the game.

    We create a shallow copy of the changing fields (using list() for arrays
    to avoid aliasing). We intentionally exclude the full lineup data from
    snapshots to keep the payload size small — the lineups don't change
    during the game, so the frontend can use the ones from the final state.

    Each snapshot is a lightweight dict containing just the fields that change
    pitch-to-pitch: score, count, bases, outs, inning, play log, etc.
    """
    return {
        "inning": state["inning"],
        "is_top": state["is_top"],
        "outs": state["outs"],
        "balls": state["balls"],
        "strikes": state["strikes"],
        # list() creates a copy so the snapshot isn't affected by later mutations
        "bases": list(state["bases"]),
        "away_score": list(state["away_score"]),
        "home_score": list(state["home_score"]),
        "away_total": state["away_total"],
        "home_total": state["home_total"],
        "player_role": state["player_role"],
        "game_status": state["game_status"],
        "last_play": state["last_play"],
        # Copy the play log list so it captures the log at this moment in time
        "play_log": list(state["play_log"]),
        "current_batter_name": state.get("current_batter_name", ""),
        "current_batter_index": state.get("current_batter_index", 0),
        # Include pitcher/team info in each snapshot so the frontend can
        # display them during replay without needing the full state
        "home_pitcher": state.get("home_pitcher"),
        "away_pitcher": state.get("away_pitcher"),
        "away_team": state.get("away_team"),
        "home_team": state.get("home_team"),
        "away_abbreviation": state.get("away_abbreviation"),
        "home_abbreviation": state.get("home_abbreviation"),
    }


def simulate_game(game_id: str) -> dict:
    """
    Simulate an entire game (CPU vs CPU) and return snapshots at each play.

    This runs the game to completion automatically, with both the pitching
    and batting decisions made by the CPU. After each pitch, a snapshot of
    the game state is captured so the frontend can replay the game with
    step-by-step animations.

    The simulation loop alternates between "pitching" and "batting" roles
    (which in simulation mode are both CPU-controlled), using the same
    outcome determination logic as the interactive game.

    A safety limit of 500 iterations prevents infinite loops in edge cases
    (though a typical 9-inning game has ~250-300 pitches).
    """
    state = game_store.get_game(game_id)
    # Guard: bail out if the game doesn't exist or is already over
    if not state or state["game_status"] != "active":
        return state or {}

    snapshots = []
    # Capture the initial state before any plays happen
    snapshots.append(_snapshot(state))

    # Safety limit to prevent runaway loops. A real 9-inning game typically
    # has 250-300 pitches, so 500 provides a generous buffer for extra innings.
    max_iterations = 500
    iteration = 0

    # Main simulation loop: keep playing until the game ends or we hit the safety limit
    while state["game_status"] == "active" and iteration < max_iterations:
        iteration += 1

        if state["player_role"] == "pitching":
            # Top of inning: home team pitching, away team batting.
            # In simulation, the CPU controls both sides.
            batter = _get_current_batter(state)
            player_stats = batter.get("stats") if batter else None
            batter_name = batter.get("name", "Batter") if batter else "Batter"
            # Home pitcher faces away batters
            pitcher = state.get("home_pitcher")
            pitcher_stats = pitcher.get("stats") if pitcher else None

            # CPU makes both decisions: what pitch to throw and whether to swing
            pitch_type = cpu_picks_pitch()
            swings = cpu_decides_swing()
            outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
            action_str = "swings" if swings else "takes"
            msg = f"You throw a {pitch_type}. {batter_name} {action_str}: {_format_outcome(outcome)}!"
            _apply_outcome(state, outcome, msg)
        else:
            # Bottom of inning: away team pitching, home team batting.
            # In simulation, the CPU controls both sides.
            batter = _get_current_batter(state)
            player_stats = batter.get("stats") if batter else None
            # Away pitcher faces home batters
            pitcher = state.get("away_pitcher")
            pitcher_stats = pitcher.get("stats") if pitcher else None

            # CPU makes both decisions
            pitch_type = cpu_picks_pitch()
            swings = cpu_decides_swing()
            outcome = determine_outcome(pitch_type, swings, player_stats, pitcher_stats)
            action_str = "swing" if swings else "take"
            msg = f"Pitcher throws a {pitch_type}. You {action_str}: {_format_outcome(outcome)}!"
            _apply_outcome(state, outcome, msg)

        # Capture the state after this play for the replay timeline
        snapshots.append(_snapshot(state))

    # Save the final state to the game store
    game_store.save_game(game_id, state)

    # Build the response: the full final state plus all the snapshots.
    # The frontend uses the final state for the scoreboard and the
    # snapshots list for the pitch-by-pitch replay animation.
    result = dict(state)
    result["snapshots"] = snapshots
    return result


def _end_game(state: dict) -> None:
    """
    Mark the game as finished and log the final score.

    Sets game_status to "final" which tells the frontend to stop showing
    game controls and display the final score screen instead.

    The win/loss message is from the player's perspective (home team):
    - If home_total > away_total: "You win!"
    - Otherwise: "You lose!"

    Note: ties can't happen here because _end_game is only called when
    the scores are different (the tie check in _end_half_inning sends
    tied games to extra innings instead).
    """
    state["game_status"] = "final"
    # Use team names if available, otherwise generic "Home"/"Away"
    home_name = state.get("home_team") or "Home"
    away_name = state.get("away_team") or "Away"
    # Determine winner from the player's (home team's) perspective
    if state["home_total"] > state["away_total"]:
        winner = "You win!"
    else:
        winner = "You lose!"
    msg = f"Game Over! Final: {home_name} {state['home_total']} - {away_name} {state['away_total']}. {winner}"
    state["play_log"].append(msg)
    state["last_play"] = msg
