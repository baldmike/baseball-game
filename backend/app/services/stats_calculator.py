"""Adjust outcome probabilities based on real MLB player stats."""

# League average baselines (approximate MLB averages)
LEAGUE_AVG = 0.245
LEAGUE_SLG = 0.395
LEAGUE_K_RATE = 0.230

# League average pitching baselines
LEAGUE_ERA = 4.30
LEAGUE_K_PER_9 = 8.20
LEAGUE_BB_PER_9 = 3.20

# Maximum adjustment factor (±50%)
MAX_ADJ = 0.50

HIT_OUTCOMES = {"single", "double", "triple", "homerun"}
STRIKEOUT_OUTCOMES = {"strike_swinging"}
OUT_OUTCOMES = {"groundout", "flyout", "lineout"}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def calculate_adjusted_outcomes(
    base_outcomes: dict[str, int],
    player_stats: dict,
    pitcher_stats: dict | None = None,
) -> dict[str, int]:
    """Scale swing-outcome weights based on a batter's stats vs league averages,
    with an optional second layer of pitcher adjustments.

    player_stats keys: avg, slg, k_rate (all floats).
    pitcher_stats keys: era, k_per_9, bb_per_9 (all floats, optional).
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

    # Pitcher adjustments (second layer on top of batter adjustments)
    if pitcher_stats:
        era = pitcher_stats.get("era", LEAGUE_ERA)
        k_per_9 = pitcher_stats.get("k_per_9", LEAGUE_K_PER_9)
        bb_per_9 = pitcher_stats.get("bb_per_9", LEAGUE_BB_PER_9)

        # High ERA → easier to hit (increase hit weights)
        era_mult = _clamp(era / LEAGUE_ERA, 1 - MAX_ADJ, 1 + MAX_ADJ) if LEAGUE_ERA else 1.0
        # High K/9 → more strikeouts
        k9_mult = _clamp(k_per_9 / LEAGUE_K_PER_9, 1 - MAX_ADJ, 1 + MAX_ADJ) if LEAGUE_K_PER_9 else 1.0

        for outcome in adjusted:
            if outcome in STRIKEOUT_OUTCOMES:
                adjusted[outcome] *= k9_mult
            elif outcome in HIT_OUTCOMES or outcome == "homerun":
                # Bad pitcher (high ERA) = easier to hit
                adjusted[outcome] *= era_mult

    # Normalize to preserve total probability weight
    adjusted_total = sum(adjusted.values())
    if adjusted_total > 0:
        scale = total_original / adjusted_total
        adjusted = {k: max(1, round(v * scale)) for k, v in adjusted.items()}

    return adjusted


def calculate_adjusted_take_outcomes(
    base_outcomes: dict[str, int],
    pitcher_stats: dict,
) -> dict[str, int]:
    """Adjust take-outcome weights based on pitcher's BB/9.

    High BB/9 → more balls (wild pitcher).
    """
    bb_per_9 = pitcher_stats.get("bb_per_9", LEAGUE_BB_PER_9)
    bb_mult = _clamp(bb_per_9 / LEAGUE_BB_PER_9, 1 - MAX_ADJ, 1 + MAX_ADJ) if LEAGUE_BB_PER_9 else 1.0

    total_original = sum(base_outcomes.values())
    adjusted = {}

    for outcome, weight in base_outcomes.items():
        if outcome == "ball":
            adjusted[outcome] = weight * bb_mult
        else:
            # Strike looking scales inversely
            adjusted[outcome] = weight * _clamp(1 / bb_mult, 1 - MAX_ADJ, 1 + MAX_ADJ)

    adjusted_total = sum(adjusted.values())
    if adjusted_total > 0:
        scale = total_original / adjusted_total
        adjusted = {k: max(1, round(v * scale)) for k, v in adjusted.items()}

    return adjusted
