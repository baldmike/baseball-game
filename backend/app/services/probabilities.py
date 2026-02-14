"""MLB-realistic probability tables for the baseball game."""

import random

# Pitch selection weights for CPU pitcher
CPU_PITCH_WEIGHTS = {
    "fastball": 50,
    "slider": 20,
    "curveball": 15,
    "changeup": 15,
}

# CPU swing probability (roughly 60% of pitches swung at)
CPU_SWING_PROBABILITY = 0.60

# Outcomes when the batter SWINGS, keyed by pitch type.
# Weights are roughly MLB-realistic.
SWING_OUTCOMES = {
    "fastball": {
        "strike_swinging": 25,
        "foul": 20,
        "groundout": 15,
        "flyout": 12,
        "lineout": 5,
        "single": 12,
        "double": 5,
        "triple": 1,
        "homerun": 5,
    },
    "curveball": {
        "strike_swinging": 35,
        "foul": 15,
        "groundout": 15,
        "flyout": 10,
        "lineout": 5,
        "single": 10,
        "double": 4,
        "triple": 1,
        "homerun": 5,
    },
    "slider": {
        "strike_swinging": 30,
        "foul": 18,
        "groundout": 16,
        "flyout": 10,
        "lineout": 5,
        "single": 11,
        "double": 4,
        "triple": 1,
        "homerun": 5,
    },
    "changeup": {
        "strike_swinging": 28,
        "foul": 17,
        "groundout": 17,
        "flyout": 11,
        "lineout": 5,
        "single": 11,
        "double": 5,
        "triple": 1,
        "homerun": 5,
    },
}

# Outcomes when the batter TAKES (doesn't swing), keyed by pitch type.
TAKE_OUTCOMES = {
    "fastball": {
        "strike_looking": 55,
        "ball": 45,
    },
    "curveball": {
        "strike_looking": 35,
        "ball": 65,
    },
    "slider": {
        "strike_looking": 40,
        "ball": 60,
    },
    "changeup": {
        "strike_looking": 40,
        "ball": 60,
    },
}


def weighted_choice(weights: dict[str, int]) -> str:
    """Pick a random outcome from a weighted dict."""
    outcomes = list(weights.keys())
    w = list(weights.values())
    return random.choices(outcomes, weights=w, k=1)[0]


def determine_outcome(pitch_type: str, swings: bool, player_stats: dict | None = None) -> str:
    """Given a pitch type and whether the batter swings, return the outcome.

    If player_stats is provided, swing outcomes are adjusted based on the
    batter's real stats vs league averages.
    """
    if swings:
        table = dict(SWING_OUTCOMES[pitch_type])
        if player_stats:
            from app.services.stats_calculator import calculate_adjusted_outcomes
            table = calculate_adjusted_outcomes(table, player_stats)
    else:
        table = TAKE_OUTCOMES[pitch_type]
    return weighted_choice(table)


def cpu_decides_swing() -> bool:
    """CPU batter decides whether to swing."""
    return random.random() < CPU_SWING_PROBABILITY


def cpu_picks_pitch() -> str:
    """CPU pitcher picks a pitch type."""
    return weighted_choice(CPU_PITCH_WEIGHTS)
