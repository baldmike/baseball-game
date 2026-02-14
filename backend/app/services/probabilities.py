"""
probabilities.py — MLB-realistic probability tables for the baseball game.

This module defines the core probability system that determines what happens
on every pitch. It uses weighted random selection to produce outcomes that
feel realistic relative to actual MLB statistics.

Architecture overview:
  1. The CPU pitcher picks a pitch type using weighted probabilities
     (fastballs are thrown ~50% of the time, matching real MLB usage).
  2. The CPU batter decides to swing or take (~60% swing rate).
  3. Based on the pitch type and swing/take decision, an outcome is selected
     from weighted probability tables.
  4. If real player stats are available, the tables are adjusted so that
     good hitters get more hits, power hitters hit more home runs,
     strikeout-prone batters strike out more, etc.

The probability tables are structured as dicts mapping outcome names to
integer weights. These weights are NOT percentages — they're relative weights
used by random.choices(). For example, if "single" has weight 12 and the
total of all weights is 100, the probability of a single is 12%.

Pitch-specific outcomes reflect real baseball tendencies:
  - Fastballs: Lower swing-and-miss rate, higher contact rate (easier to see).
  - Curveballs: Higher swing-and-miss rate (harder to time the break).
  - Sliders: Moderate swing-and-miss, lots of fouls (batters often clip it).
  - Changeups: Moderate swing-and-miss, more groundouts (off-speed induces weak contact).

For TAKE (not swinging) outcomes, breaking balls (curveball, slider, changeup)
are more likely to be balls than fastballs, because:
  - Fastballs are thrown more often for strikes.
  - Breaking pitches move out of the zone more often.
"""

import random

# ── CPU Pitch Selection Weights ──────────────────────────────────────────────
# These weights determine how often the CPU pitcher throws each pitch type.
# Fastballs dominate (~50%) because that's realistic — MLB pitchers throw
# fastballs roughly half the time. Breaking pitches split the remainder.
CPU_PITCH_WEIGHTS = {
    "fastball": 50,
    "slider": 20,
    "curveball": 15,
    "changeup": 15,
}

# ── CPU Swing Probability ────────────────────────────────────────────────────
# The CPU batter swings at roughly 60% of pitches.
# In real MLB, the overall swing rate is about 46-50%, but we use a slightly
# higher rate to keep the game action-packed (more balls in play = more fun).
CPU_SWING_PROBABILITY = 0.60

# ── Swing Outcome Tables ─────────────────────────────────────────────────────
# Outcomes when the batter SWINGS, keyed by pitch type.
# Each dict maps outcome names to integer weights (relative probabilities).
#
# Outcome categories:
#   - strike_swinging: Batter swings and misses entirely.
#   - foul: Batter makes contact but hits it foul (counts as strike if < 2 strikes).
#   - groundout/flyout/lineout: Ball put in play but fielded for an out.
#   - single/double/triple/homerun: Hits — batter reaches base safely.
#
# The weights are tuned to produce roughly MLB-realistic results:
#   ~25-35% whiff (swing and miss)
#   ~15-20% foul
#   ~25-35% batted-ball outs
#   ~15-23% hits (with singles most common, triples rarest)
#   ~5% home runs (slightly elevated for fun factor)
SWING_OUTCOMES = {
    "fastball": {
        # Fastballs are the easiest pitch to make contact with (lower whiff rate)
        # but also the most likely to be hit hard (higher HR and double rates).
        "strike_swinging": 25,
        "foul": 20,
        "groundout": 15,
        "flyout": 12,
        "lineout": 5,
        "single": 12,
        "double": 5,
        "triple": 1,       # Triples are rare in baseball (~2% of hits)
        "homerun": 5,
    },
    "curveball": {
        # Curveballs have the highest whiff rate because the break is hard to time.
        # Contact, when made, tends to produce weaker results (more outs, fewer hits).
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
        # Sliders generate lots of foul balls because batters often clip the
        # pitch as it breaks away from them. Moderate whiff rate.
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
        # Changeups generate more groundouts because the speed difference
        # causes batters to swing early and hit the top of the ball.
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

# ── Take Outcome Tables ──────────────────────────────────────────────────────
# Outcomes when the batter TAKES (doesn't swing), keyed by pitch type.
# Only two possible outcomes: called strike or ball.
#
# The strike/ball ratio varies by pitch type because:
#   - Fastballs are typically thrown for strikes more often (55% strike rate).
#     Pitchers use fastballs to get ahead in the count.
#   - Breaking balls (curveball, slider, changeup) are more likely to miss
#     the zone (35-40% strike rate) because the movement can carry them
#     out of the strike zone, especially when thrown to get a chase.
TAKE_OUTCOMES = {
    "fastball": {
        "strike_looking": 55,   # Fastballs hit the zone more reliably
        "ball": 45,
    },
    "curveball": {
        "strike_looking": 35,   # Curveballs break out of the zone most often
        "ball": 65,
    },
    "slider": {
        "strike_looking": 40,   # Sliders are between fastball and curveball
        "ball": 60,
    },
    "changeup": {
        "strike_looking": 40,   # Changeups have similar zone rates to sliders
        "ball": 60,
    },
}


def weighted_choice(weights: dict[str, int]) -> str:
    """
    Pick a random outcome from a weighted dict.

    Uses Python's random.choices() which accepts a list of weights and returns
    one selection. This is the core randomness function for the entire game —
    every pitch outcome, pitch selection, and swing decision flows through here.

    Example: weighted_choice({"single": 12, "homerun": 5, "groundout": 15})
    would return "groundout" 15/(12+5+15) = 46.9% of the time.
    """
    outcomes = list(weights.keys())
    w = list(weights.values())
    return random.choices(outcomes, weights=w, k=1)[0]


def determine_outcome(
    pitch_type: str,
    swings: bool,
    player_stats: dict | None = None,
    pitcher_stats: dict | None = None,
) -> str:
    """
    Given a pitch type and whether the batter swings, return the outcome.

    This is the main probability function called by the game engine on every pitch.
    It selects the appropriate outcome table (swing or take) for the pitch type,
    optionally adjusts the weights based on real player/pitcher stats, and then
    makes a weighted random selection.

    Stats adjustment flow:
    1. If BOTH batter stats and pitcher stats are provided:
       - The stats_calculator adjusts the swing outcome weights based on
         how the batter and pitcher compare to league averages.
       - e.g., a .300 hitter facing a 5.00 ERA pitcher gets boosted hit weights.
    2. If ONLY pitcher stats are provided (no batter stats):
       - League-average batter stats are used as a baseline, and only the
         pitcher's adjustments are applied.
       - This handles cases where we have pitcher data but no batter data.
    3. If ONLY batter stats are provided:
       - The batter adjustments are applied against a default pitcher baseline.
    4. If NO stats are provided:
       - The raw probability tables are used as-is.

    For TAKE outcomes, only pitcher stats matter (better pitchers throw more
    strikes), so we use calculate_adjusted_take_outcomes which only modifies
    the strike_looking/ball ratio based on the pitcher's BB/9 and K/9.

    If player_stats is provided, swing outcomes are adjusted based on the
    batter's real stats vs league averages.
    If pitcher_stats is provided, outcomes are further adjusted based on the
    pitcher's ERA, K/9, and BB/9.
    """
    if swings:
        # Start with a COPY of the base swing outcome weights for this pitch type.
        # We copy to avoid mutating the global table (which would affect all future pitches).
        table = dict(SWING_OUTCOMES[pitch_type])
        if player_stats:
            # Import here to avoid circular imports — stats_calculator depends on
            # other services, and importing at module level could create cycles.
            from app.services.stats_calculator import calculate_adjusted_outcomes
            # Adjust weights based on both batter and pitcher stats
            table = calculate_adjusted_outcomes(table, player_stats, pitcher_stats)
        elif pitcher_stats:
            from app.services.stats_calculator import calculate_adjusted_outcomes
            # No batter stats available, but we still want pitcher adjustments.
            # Use league-average batter stats so pitcher adjustments still apply.
            table = calculate_adjusted_outcomes(
                table,
                {"avg": 0.245, "slg": 0.395, "k_rate": 0.230},
                pitcher_stats,
            )
    else:
        # Batter is taking (not swinging) — only strike_looking or ball.
        # Copy the table to avoid mutating the global.
        table = dict(TAKE_OUTCOMES[pitch_type])
        if pitcher_stats:
            # Adjust the strike/ball ratio based on the pitcher's command.
            # A pitcher with low BB/9 throws more strikes; high BB/9 throws more balls.
            from app.services.stats_calculator import calculate_adjusted_take_outcomes
            table = calculate_adjusted_take_outcomes(table, pitcher_stats)
    # Make the weighted random selection and return the outcome string
    return weighted_choice(table)


def cpu_decides_swing() -> bool:
    """
    CPU batter decides whether to swing at the pitch.

    Returns True (swing) roughly 60% of the time, False (take) 40%.
    This is a simplified model — real batters adjust based on count,
    pitch location, game situation, etc. But for our simulation,
    a flat 60% swing rate produces realistic-feeling at-bats.
    """
    return random.random() < CPU_SWING_PROBABILITY


def cpu_picks_pitch() -> str:
    """
    CPU pitcher picks a pitch type using weighted random selection.

    Pitch distribution (~50% fastball, ~20% slider, ~15% curve, ~15% change)
    reflects real MLB pitch mix. In reality, pitchers adjust based on count,
    batter tendencies, and game situation, but this flat distribution produces
    a reasonable variety of pitches for the simulation.
    """
    return weighted_choice(CPU_PITCH_WEIGHTS)
