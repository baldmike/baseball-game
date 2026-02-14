import statsapi
from datetime import date
import random


def get_todays_games():
    today = date.today().strftime("%m/%d/%Y")
    schedule = statsapi.schedule(date=today)
    return [
        {
            "game_pk": game["game_id"],
            "away_team": game["away_name"],
            "home_team": game["home_name"],
            "status": game["status"],
            "away_score": game.get("away_score", 0),
            "home_score": game.get("home_score", 0),
            "inning": game.get("current_inning", ""),
            "inning_state": game.get("inning_state", ""),
        }
        for game in schedule
    ]


def get_game_detail(game_pk: int):
    boxscore = statsapi.boxscore_data(game_pk)
    return {
        "game_pk": game_pk,
        "away_team": boxscore.get("teamInfo", {}).get("away", {}).get("teamName", ""),
        "home_team": boxscore.get("teamInfo", {}).get("home", {}).get("teamName", ""),
        "away_batters": boxscore.get("awayBatters", []),
        "home_batters": boxscore.get("homeBatters", []),
    }


def get_play_by_play(game_pk: int):
    data = statsapi.get("game_playByPlay", {"gamePk": game_pk})
    plays = []
    for play in data.get("allPlays", []):
        result = play.get("result", {})
        about = play.get("about", {})
        matchup = play.get("matchup", {})

        pitch_events = []
        for event in play.get("playEvents", []):
            if event.get("isPitch"):
                details = event.get("details", {})
                pitch_data = event.get("pitchData", {})
                pitch_events.append({
                    "pitch_type": details.get("type", {}).get("description", ""),
                    "speed": pitch_data.get("startSpeed"),
                    "call": details.get("description", ""),
                    "strike_zone_top": pitch_data.get("strikeZoneTop"),
                    "strike_zone_bottom": pitch_data.get("strikeZoneBottom"),
                    "coordinates": pitch_data.get("coordinates", {}),
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
    """Return list of all 30 MLB teams with id, name, and abbreviation."""
    data = statsapi.get("teams", {"sportIds": 1})
    teams = []
    for team in data.get("teams", []):
        teams.append({
            "id": team["id"],
            "name": team["name"],
            "abbreviation": team.get("abbreviation", ""),
        })
    teams.sort(key=lambda t: t["name"])
    return teams


def get_player_hitting_stats(player_id: int, season: int = 2024) -> dict:
    """Fetch a player's hitting stats for a given season.

    Returns dict with avg, slg, k_rate, hr_rate.
    Falls back to league averages if stats are missing.
    """
    defaults = {"avg": 0.245, "slg": 0.395, "k_rate": 0.230, "hr_rate": 0.030}
    try:
        stats = statsapi.player_stat_data(
            player_id, group="hitting", type="season", sportId=1, season=season
        )
        for stat_group in stats.get("stats", []):
            if stat_group.get("group") == "hitting" and stat_group.get("season") == str(season) and stat_group.get("stats"):
                s = stat_group["stats"]
                at_bats = int(s.get("atBats", 0))
                plate_appearances = int(s.get("plateAppearances", 0))
                if at_bats < 50:
                    return defaults
                return {
                    "avg": float(s.get("avg", defaults["avg"])),
                    "slg": float(s.get("slg", defaults["slg"])),
                    "k_rate": (
                        int(s.get("strikeOuts", 0)) / plate_appearances
                        if plate_appearances > 0
                        else defaults["k_rate"]
                    ),
                    "hr_rate": (
                        int(s.get("homeRuns", 0)) / at_bats
                        if at_bats > 0
                        else defaults["hr_rate"]
                    ),
                }
    except Exception:
        pass
    return defaults


def get_team_lineup(team_id: int, season: int = 2024) -> list[dict]:
    """Fetch a team's roster and return 9 position players with hitting stats.

    Returns list of dicts: {id, name, position, stats}.
    """
    try:
        roster_data = statsapi.get(
            "team_roster", {"teamId": team_id, "rosterType": "active", "season": season}
        )
        position_players = []
        for entry in roster_data.get("roster", []):
            person = entry.get("person", {})
            position = entry.get("position", {})
            pos_type = position.get("type", "")
            pos_abbr = position.get("abbreviation", "")
            # Skip pitchers
            if pos_type == "Pitcher":
                continue
            position_players.append({
                "id": person.get("id"),
                "name": person.get("fullName", "Unknown"),
                "position": pos_abbr,
            })

        # Take up to 9 position players
        lineup = position_players[:9]

        # If we don't have enough, pad with placeholders
        while len(lineup) < 9:
            lineup.append({
                "id": 0,
                "name": f"Player {len(lineup) + 1}",
                "position": "UT",
            })

        # Fetch stats for each player
        for player in lineup:
            if player["id"]:
                player["stats"] = get_player_hitting_stats(player["id"], season)
            else:
                player["stats"] = {"avg": 0.245, "slg": 0.395, "k_rate": 0.230, "hr_rate": 0.030}

        return lineup
    except Exception:
        # Return a default lineup if API fails
        return [
            {
                "id": 0,
                "name": f"Player {i + 1}",
                "position": "UT",
                "stats": {"avg": 0.245, "slg": 0.395, "k_rate": 0.230, "hr_rate": 0.030},
            }
            for i in range(9)
        ]


def get_random_opponent(exclude_team_id: int) -> dict:
    """Pick a random team that isn't the player's team."""
    teams = get_all_teams()
    opponents = [t for t in teams if t["id"] != exclude_team_id]
    return random.choice(opponents)
