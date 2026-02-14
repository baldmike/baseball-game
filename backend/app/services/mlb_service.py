"""
mlb_service.py — MLB Stats API integration service.

This module is the sole interface between our game and the real MLB data.
It uses the `statsapi` Python package (a wrapper around MLB's Stats API)
to fetch:
  - Today's real game schedule (for the live scores feature).
  - Detailed box scores and play-by-play data for real games.
  - Team rosters for constructing lineups.
  - Individual player hitting and pitching stats.

Key design decisions:
  - All functions return plain dicts/lists (not Pydantic models) because
    they're consumed internally by the game engine, not directly by the API.
  - Every function has a try/except fallback to league-average defaults,
    so the game can work even if the MLB API is down or a player has no stats.
  - Stats are fetched per-player individually. This is slow (~1-2 seconds per
    player) but simple. A production system would batch these or cache them.

Lineup construction strategy (get_team_lineup):
  - Fetch the active roster and filter out pitchers.
  - Fetch hitting stats for each position player.
  - Build a 9-player lineup by first filling one player per defensive position
    (choosing the best OPS at each position), then filling remaining spots
    with the highest-OPS players available.
  - Sort the final lineup by OPS descending, so the best hitters bat first.
  - OPS (On-base Plus Slugging) is used because it's the single best
    commonly-available stat for measuring overall offensive production.
"""

import statsapi
from datetime import date
import random


def get_todays_games():
    """
    Fetch today's MLB schedule with scores and game status.

    Used by the frontend's "live scores" page to show real games in progress.
    Returns a list of dicts with game_pk (unique game ID), team names,
    current score, inning, and game status (e.g., "In Progress", "Final").
    """
    # Format today's date as MM/DD/YYYY, which is what the statsapi expects
    today = date.today().strftime("%m/%d/%Y")
    schedule = statsapi.schedule(date=today)
    return [
        {
            "game_pk": game["game_id"],
            "away_team": game["away_name"],
            "home_team": game["home_name"],
            "status": game["status"],
            # .get() with default 0 handles pre-game states where scores aren't set
            "away_score": game.get("away_score", 0),
            "home_score": game.get("home_score", 0),
            "inning": game.get("current_inning", ""),
            "inning_state": game.get("inning_state", ""),
        }
        for game in schedule
    ]


def get_game_detail(game_pk: int):
    """
    Fetch detailed box score data for a specific game.

    Returns team names and batter lists for both teams.
    Used by the frontend to show a detailed view of a real MLB game.
    The game_pk is the unique identifier from MLB's system.
    """
    boxscore = statsapi.boxscore_data(game_pk)
    return {
        "game_pk": game_pk,
        # Navigate the nested boxscore structure to extract team names
        "away_team": boxscore.get("teamInfo", {}).get("away", {}).get("teamName", ""),
        "home_team": boxscore.get("teamInfo", {}).get("home", {}).get("teamName", ""),
        # Batter arrays contain per-player box score lines
        "away_batters": boxscore.get("awayBatters", []),
        "home_batters": boxscore.get("homeBatters", []),
    }


def get_play_by_play(game_pk: int):
    """
    Fetch complete play-by-play data for a specific game.

    Returns every at-bat with its individual pitches, including pitch type,
    speed, location, and the result. This is the most granular data available
    from the MLB API.

    Each play includes:
    - at_bat_index: Sequential index of this at-bat in the game.
    - inning/half_inning: When the at-bat occurred.
    - batter/pitcher: Player names.
    - result/event: What happened (e.g., "Strikeout", "Home Run").
    - pitches: List of individual pitches with type, speed, and call.
    """
    # Use the low-level statsapi.get() to access the playByPlay endpoint
    data = statsapi.get("game_playByPlay", {"gamePk": game_pk})
    plays = []
    for play in data.get("allPlays", []):
        result = play.get("result", {})
        about = play.get("about", {})
        matchup = play.get("matchup", {})

        # Extract individual pitch data from each play's events.
        # We filter for isPitch=True because playEvents can also include
        # non-pitch events like pickoff attempts, stolen bases, etc.
        pitch_events = []
        for event in play.get("playEvents", []):
            if event.get("isPitch"):
                details = event.get("details", {})
                pitch_data = event.get("pitchData", {})
                pitch_events.append({
                    "pitch_type": details.get("type", {}).get("description", ""),
                    "speed": pitch_data.get("startSpeed"),
                    "call": details.get("description", ""),
                    # Strike zone boundaries for rendering pitch location
                    "strike_zone_top": pitch_data.get("strikeZoneTop"),
                    "strike_zone_bottom": pitch_data.get("strikeZoneBottom"),
                    # x/y coordinates for plotting the pitch location
                    "coordinates": pitch_data.get("coordinates", {}),
                    # Ball/strike count at the time of this pitch
                    "count": event.get("count", {}),
                })

        plays.append({
            "at_bat_index": about.get("atBatIndex"),
            "inning": about.get("inning"),
            "half_inning": about.get("halfInning"),
            "batter": matchup.get("batter", {}).get("fullName", ""),
            "pitcher": matchup.get("pitcher", {}).get("fullName", ""),
            "result": result.get("description", ""),
            "event": result.get("event", ""),
            "pitches": pitch_events,
        })

    return {"game_pk": game_pk, "plays": plays}


def get_all_teams():
    """
    Return list of all 30 MLB teams with id, name, and abbreviation.

    Uses sportIds=1 to filter for Major League Baseball only (the API also
    has minor league teams under different sport IDs).

    The league field is derived from the team's league name:
    - "AL" for American League teams
    - "NL" for National League teams
    - "" if the league can't be determined

    Results are sorted alphabetically by team name for consistent display
    in the frontend's team-selection dropdown.
    """
    # sportIds=1 means Major League Baseball (as opposed to minor leagues)
    data = statsapi.get("teams", {"sportIds": 1})
    teams = []
    for team in data.get("teams", []):
        league = team.get("league", {})
        league_name = league.get("name", "")
        teams.append({
            "id": team["id"],
            "name": team["name"],
            "abbreviation": team.get("abbreviation", ""),
            # Determine AL/NL by checking if the league name contains
            # "American" or "National"
            "league": "AL" if "American" in league_name else "NL" if "National" in league_name else "",
        })
    # Sort alphabetically so the dropdown is easy to navigate
    teams.sort(key=lambda t: t["name"])
    return teams


def get_player_hitting_stats(player_id: int, season: int = 2024) -> dict:
    """
    Fetch a player's hitting stats for a given season.

    Returns a dict with four key stats used by the probability engine:
    - avg: Batting average (hits / at-bats). League average ~.245.
    - slg: Slugging percentage (total bases / at-bats). League average ~.395.
    - k_rate: Strikeout rate (strikeouts / plate appearances). League average ~.230.
    - hr_rate: Home run rate (home runs / at-bats). League average ~.030.

    These stats are used to adjust the outcome probability tables:
    - A high-avg batter gets more singles/doubles.
    - A high-k_rate batter strikes out more often.
    - A high-hr_rate batter hits more home runs.

    Falls back to league-average defaults if:
    - The player has fewer than 50 at-bats (small sample = unreliable stats).
    - The API call fails for any reason.
    - The player's stats aren't found for the requested season.
    """
    # League-average defaults — used as fallback for missing/unreliable data
    defaults = {"avg": 0.245, "slg": 0.395, "k_rate": 0.230, "hr_rate": 0.030}
    try:
        stats = statsapi.player_stat_data(
            player_id, group="hitting", type="season", sportId=1, season=season
        )
        for stat_group in stats.get("stats", []):
            # Find the hitting stats for the specific season we want
            if stat_group.get("group") == "hitting" and stat_group.get("season") == str(season) and stat_group.get("stats"):
                s = stat_group["stats"]
                at_bats = int(s.get("atBats", 0))
                plate_appearances = int(s.get("plateAppearances", 0))
                # Require at least 50 at-bats for statistical reliability.
                # Players with fewer ABs (e.g., September call-ups) can have
                # wildly skewed stats that would distort the simulation.
                if at_bats < 50:
                    return defaults
                return {
                    "avg": float(s.get("avg", defaults["avg"])),
                    "slg": float(s.get("slg", defaults["slg"])),
                    # K-rate: strikeouts divided by plate appearances (not at-bats)
                    # because walks and HBP that lead to strikeouts don't count as ABs
                    "k_rate": (
                        int(s.get("strikeOuts", 0)) / plate_appearances
                        if plate_appearances > 0
                        else defaults["k_rate"]
                    ),
                    # HR-rate: home runs divided by at-bats
                    "hr_rate": (
                        int(s.get("homeRuns", 0)) / at_bats
                        if at_bats > 0
                        else defaults["hr_rate"]
                    ),
                }
    except Exception:
        # Silently fall through to defaults if the API fails.
        # This is intentional — we'd rather use league averages than crash.
        pass
    return defaults


def get_team_lineup(team_id: int, season: int = 2024) -> list[dict]:
    """
    Fetch a team's roster and return 9 position players with hitting stats.

    Returns list of dicts: {id, name, position, stats}.

    Lineup construction strategy (OPS-based):
    1. Fetch the team's active roster for the given season.
    2. Filter out all pitchers (we only want position players / batters).
    3. Fetch individual hitting stats for each position player.
    4. FIRST PASS — Fill one player per defensive position to ensure
       positional coverage. At each position, pick the player with the
       highest OPS (on-base + slugging). Outfield positions (LF, CF, RF)
       are normalized to "OF" since we need 3 outfielders but don't care
       which specific OF position they play.
    5. SECOND PASS — Fill any remaining lineup spots (up to 9) with the
       highest-OPS players not yet selected.
    6. Sort the final 9-player lineup by OPS descending, so the best
       hitters bat near the top of the order. This mirrors real baseball
       strategy where the best hitters bat 1st-4th.
    7. If we can't fill 9 spots (small roster), pad with placeholder players
       using league-average stats.

    Why OPS? OPS (On-base Plus Slugging) is widely considered the best
    single stat for measuring offensive value. It correlates highly with
    run production and is readily available from the MLB API.
    """
    try:
        # Fetch the team's active roster for the specified season
        roster_data = statsapi.get(
            "team_roster", {"teamId": team_id, "rosterType": "active", "season": season}
        )
        position_players = []
        for entry in roster_data.get("roster", []):
            person = entry.get("person", {})
            position = entry.get("position", {})
            pos_type = position.get("type", "")
            pos_abbr = position.get("abbreviation", "")
            # Skip pitchers — we only want position players for the lineup
            if pos_type == "Pitcher":
                continue
            position_players.append({
                "id": person.get("id"),
                "name": person.get("fullName", "Unknown"),
                "position": pos_abbr,
            })

        # Fetch individual hitting stats for all position players so we can
        # rank them by OPS and pick the best 9 for the lineup.
        # This is the slowest part of game creation — each player requires
        # a separate API call (~1-2 seconds per player).
        defaults = {"avg": 0.245, "slg": 0.395, "k_rate": 0.230, "hr_rate": 0.030}
        for player in position_players:
            if player["id"]:
                player["stats"] = get_player_hitting_stats(player["id"], season)
            else:
                player["stats"] = dict(defaults)

        def _ops(p):
            """Calculate OPS (On-base Plus Slugging) for lineup sorting.

            We approximate OBP with AVG here (real OBP includes walks/HBP),
            but AVG + SLG is a reasonable approximation that uses the stats
            we have readily available.
            """
            return p["stats"]["avg"] + p["stats"]["slg"]

        # FIRST PASS: Fill one player per defensive position, choosing the
        # best OPS at each position. This ensures positional diversity.
        # target_positions lists the 9 positions we need to fill.
        # "OF" appears 3 times because we need 3 outfielders.
        target_positions = ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "DH"]
        lineup = []
        used_ids = set()
        for target in target_positions:
            # Find candidates: players at this position who aren't already picked.
            # For outfielders, accept any OF variant (LF, CF, RF, OF).
            candidates = [
                p for p in position_players
                if p["id"] not in used_ids
                and (p["position"] == target
                     or (target == "OF" and p["position"] in ("OF", "LF", "CF", "RF")))
            ]
            if candidates:
                # Pick the candidate with the highest OPS at this position
                best = max(candidates, key=_ops)
                lineup.append(best)
                used_ids.add(best["id"])

        # SECOND PASS: If we still have fewer than 9 players (e.g., not enough
        # at each position), fill the remaining spots with the best available
        # players by OPS, regardless of position.
        remaining = [p for p in position_players if p["id"] not in used_ids]
        remaining.sort(key=_ops, reverse=True)
        for player in remaining:
            if len(lineup) >= 9:
                break
            lineup.append(player)

        # Sort the final lineup by OPS descending — best hitters bat first.
        # In real baseball, the batting order is more nuanced (leadoff guy
        # should have high OBP, cleanup hitter should have power, etc.),
        # but sorting by OPS is a reasonable simplification.
        lineup.sort(key=_ops, reverse=True)

        # If we STILL don't have 9 players (very small roster edge case),
        # pad with placeholder players using league-average stats.
        while len(lineup) < 9:
            lineup.append({
                "id": 0,
                "name": f"Player {len(lineup) + 1}",
                "position": "UT",  # UT = utility player (no specific position)
                "stats": dict(defaults),
            })

        return lineup
    except Exception:
        # If anything goes wrong with the API, return a full placeholder lineup.
        # This ensures the game can always be created, even without real data.
        return [
            {
                "id": 0,
                "name": f"Player {i + 1}",
                "position": "UT",
                "stats": {"avg": 0.245, "slg": 0.395, "k_rate": 0.230, "hr_rate": 0.030},
            }
            for i in range(9)
        ]


def get_player_pitching_stats(player_id: int, season: int = 2024) -> dict:
    """
    Fetch a player's pitching stats for a given season.

    Returns a dict with three key stats used by the probability engine:
    - era: Earned Run Average (earned runs per 9 innings). League average ~4.30.
      A lower ERA means a better pitcher. Used to adjust how often batters get hits.
    - k_per_9: Strikeouts per 9 innings. League average ~8.20.
      Higher K/9 means the pitcher strikes out more batters.
    - bb_per_9: Walks per 9 innings (bases on balls). League average ~3.20.
      Higher BB/9 means the pitcher issues more walks (bad for the pitcher).

    Falls back to league-average defaults if:
    - The pitcher has fewer than 20 innings pitched (small sample).
    - The API call fails for any reason.
    - The pitcher's stats aren't found for the requested season.
    """
    # League-average defaults for pitching stats
    defaults = {"era": 4.30, "k_per_9": 8.20, "bb_per_9": 3.20}
    try:
        stats = statsapi.player_stat_data(
            player_id, group="pitching", type="season", sportId=1, season=season
        )
        for stat_group in stats.get("stats", []):
            # Find the pitching stats for the specific season we want
            if stat_group.get("group") == "pitching" and stat_group.get("season") == str(season) and stat_group.get("stats"):
                s = stat_group["stats"]
                # Parse innings pitched — the API returns it as a string like "150.2"
                # where .2 means 2/3 of an inning. We just check if it's enough to be reliable.
                innings = float(s.get("inningsPitched", "0").replace(".", "")) if s.get("inningsPitched") else 0
                # Require at least 20 innings for statistical reliability
                if innings < 20:
                    return defaults
                return {
                    "era": float(s.get("era", defaults["era"])),
                    "k_per_9": float(s.get("strikeoutsPer9Inn", defaults["k_per_9"])),
                    "bb_per_9": float(s.get("walksPer9Inn", defaults["bb_per_9"])),
                }
    except Exception:
        # Silently fall through to defaults if the API fails
        pass
    return defaults


def get_team_pitchers(team_id: int, season: int = 2024) -> list[dict]:
    """
    Fetch all pitchers from a team's roster with their pitching stats.

    Returns list of dicts: {id, name, position, stats}.

    The returned list is sorted by ERA (ascending), so the best pitcher
    (lowest ERA) is first. This makes it easy to:
    - Default to the team's ace (index 0) when no specific pitcher is chosen.
    - Display pitchers in quality order in the frontend's pitcher picker.
    """
    default_stats = {"era": 4.30, "k_per_9": 8.20, "bb_per_9": 3.20}
    try:
        # Fetch the team's active roster for the specified season
        roster_data = statsapi.get(
            "team_roster", {"teamId": team_id, "rosterType": "active", "season": season}
        )
        pitchers = []
        for entry in roster_data.get("roster", []):
            person = entry.get("person", {})
            position = entry.get("position", {})
            # Only include pitchers (skip position players)
            if position.get("type") == "Pitcher":
                pitcher_id = person.get("id")
                pitcher = {
                    "id": pitcher_id,
                    "name": person.get("fullName", "Unknown"),
                    "position": position.get("abbreviation", "P"),
                    # Fetch individual pitching stats; fall back to defaults if no ID
                    "stats": get_player_pitching_stats(pitcher_id, season) if pitcher_id else dict(default_stats),
                }
                pitchers.append(pitcher)

        # Sort by ERA so the best pitcher is first (lowest ERA = best)
        pitchers.sort(key=lambda p: p["stats"].get("era", 99))
        return pitchers
    except Exception:
        # Return empty list if the API fails — the caller handles the fallback
        return []


def get_team_pitcher(team_id: int, season: int = 2024) -> dict:
    """
    Fetch the best starting pitcher from the team's roster (lowest ERA).

    Returns dict: {id, name, position, stats}.

    This is a convenience function that calls get_team_pitchers() and returns
    the first one (already sorted by ERA). If no pitchers are found (e.g.,
    API failure), returns a placeholder pitcher with league-average stats.
    """
    default_pitcher = {
        "id": 0,
        "name": "Unknown Pitcher",
        "position": "P",
        "stats": {"era": 4.30, "k_per_9": 8.20, "bb_per_9": 3.20},
    }
    pitchers = get_team_pitchers(team_id, season)
    if pitchers:
        # Already sorted by ERA, so index 0 is the best pitcher
        return pitchers[0]
    return default_pitcher


def get_random_opponent(exclude_team_id: int) -> dict:
    """
    Pick a random team that isn't the player's team.

    Used when the player doesn't specify an opponent — we randomly select
    from the other 29 MLB teams to create an unpredictable matchup.
    The exclude_team_id ensures the player doesn't end up playing against
    themselves.
    """
    teams = get_all_teams()
    # Filter out the player's own team
    opponents = [t for t in teams if t["id"] != exclude_team_id]
    return random.choice(opponents)
