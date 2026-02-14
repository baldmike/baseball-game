"""Adjust outcome probabilities based on real MLB player stats."""

# League average baselines (approximate MLB averages)
LEAGUE_AVG = 0.245
LEAGUE_SLG = 0.395
LEAGUE_K_RATE = 0.230

# Maximum adjustment factor (±50%)
MAX_ADJ = 0.50

HIT_OUTCOMES = {"single", "double", "triple", "homerun"}
STRIKEOUT_OUTCOMES = {"strike_swinging"}
OUT_OUTCOMES = {"groundout", "flyout", "lineout"}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def calculate_adjusted_outcomes(base_outcomes: dict[str, int], player_stats: dict) -> dict[str, int]:
    """Scale swing-outcome weights based on a batter's stats vs league averages.

    player_stats keys: avg, slg, k_rate (all floats).
    Returns a new dict with adjusted integer weights that preserve total weight.
    """
    avg = player_stats.get("avg", LEAGUE_AVG)
    slg = player_stats.get("slg", LEAGUE_SLG)
    k_rate = player_stats.get("k_rate", LEAGUE_K_RATE)

    # Compute multipliers relative to league average, capped at ±50%
    hit_mult = _clamp(avg / LEAGUE_AVG, 1 - MAX_ADJ, 1 + MAX_ADJ) if LEAGUE_AVG else 1.0
    power_mult = _clamp(slg / LEAGUE_SLG, 1 - MAX_ADJ, 1 + MAX_ADJ) if LEAGUE_SLG else 1.0
    k_mult = _clamp(k_rate / LEAGUE_K_RATE, 1 - MAX_ADJ, 1 + MAX_ADJ) if LEAGUE_K_RATE else 1.0

    total_original = sum(base_outcomes.values())
    adjusted = {}

    for outcome, weight in base_outcomes.items():
        if outcome in STRIKEOUT_OUTCOMES:
            adjusted[outcome] = weight * k_mult
        elif outcome == "homerun":
            # Home runs scale with power (slugging)
            adjusted[outcome] = weight * power_mult
        elif outcome in HIT_OUTCOMES:
            # Other hits scale with batting average
            adjusted[outcome] = weight * hit_mult
        elif outcome in OUT_OUTCOMES:
            # Outs scale inversely with hitting ability
            out_mult = _clamp(1 / hit_mult, 1 - MAX_ADJ, 1 + MAX_ADJ) if hit_mult else 1.0
            adjusted[outcome] = weight * out_mult
        else:
            # Fouls and other outcomes stay the same
            adjusted[outcome] = float(weight)

    # Normalize to preserve total probability weight
    adjusted_total = sum(adjusted.values())
    if adjusted_total > 0:
        scale = total_original / adjusted_total
        adjusted = {k: max(1, round(v * scale)) for k, v in adjusted.items()}

    return adjusted
