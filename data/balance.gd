class_name Balance
extends RefCounted

## EVERY tunable number in the game lives here (spec 8.2).
##
## Nothing outside this file may contain a gameplay magic number. The values in
## sections 1-4 are the balance spine from spec 2.1 / 4 / 6 and must not be
## changed without re-running tools/balance_sim.py (spec 5.4).

# ---------------------------------------------------------------------------
# 1. Rarity tiers (spec 2.1)
# ---------------------------------------------------------------------------

enum Tier { DIM = 1, LIT = 2, BRIGHT = 3, RADIANT = 4, SINGULAR = 5 }

const TIER_MIN := 1
const TIER_MAX := 5

const TIER_NAMES := {
	1: "Dim",
	2: "Lit",
	3: "Bright",
	4: "Radiant",
	5: "Singular",
}

## How many of the 50 Fragments sit in each tier. Sums to 50.
const TIER_COUNTS := {1: 15, 2: 13, 3: 10, 4: 8, 5: 4}

## Pull chance per tier, in percent. Sums to exactly 100.
const TIER_CHANCE := {1: 60.0, 2: 25.0, 3: 11.0, 4: 3.5, 5: 0.5}

## Income multiplier applied on top of a Fragment's base_rate.
const TIER_MULTIPLIER := {1: 1.0, 2: 3.0, 3: 10.0, 4: 40.0, 5: 200.0}

## Shards granted when a duplicate of this tier is pulled (spec 4).
const TIER_SHARDS_PER_DUPLICATE := {1: 1, 2: 4, 3: 15, 4: 60, 5: 400}

## Tier colour roles (spec 2.1). Hue is seeded per Fragment but clamped into
## these bands so rarity is readable at a glance; saturation/value are clamped
## so a Singular can never be mistaken for a Dim.
const TIER_HUE_RANGE := {
	1: [0.545, 0.625],  # desaturated grey-blue
	2: [0.330, 0.430],  # cool green
	3: [0.520, 0.605],  # electric blue
	4: [0.740, 0.880],  # violet / magenta
	5: [0.095, 0.145],  # gold
}
const TIER_SATURATION := {1: 0.20, 2: 0.55, 3: 0.80, 4: 0.88, 5: 0.92}
const TIER_VALUE := {1: 0.50, 2: 0.72, 3: 0.92, 4: 1.00, 5: 1.00}
## Tiers 4-5 add a pulsing glow and orbiting particles (spec 2.3).
const TIER_GLOW := {1: 0.00, 2: 0.10, 3: 0.28, 4: 0.62, 5: 1.00}
const TIER_ORBIT_PARTICLES := {1: 0, 2: 0, 3: 0, 4: 6, 5: 12}

# ---------------------------------------------------------------------------
# 2. Levelling (spec 4)
# ---------------------------------------------------------------------------

const LEVEL_MIN := 1
const LEVEL_MAX := 25
const LEVEL_INCOME_STEP := 0.15  ## Additive, not compounding.
const LEVEL_COST_BASE := 3.0
const LEVEL_COST_GROWTH := 1.55


## Shards to go from level L to L+1: ceil(3 * 1.55^(L-1)).
static func level_cost(level: int) -> int:
	if level < LEVEL_MIN or level >= LEVEL_MAX:
		return -1  # No level to buy.
	return int(ceil(LEVEL_COST_BASE * pow(LEVEL_COST_GROWTH, float(level - 1))))


## Total Shards spent to bring a Fragment from level 1 to `level`.
static func level_cost_total(level: int) -> int:
	var total := 0
	for l in range(LEVEL_MIN, level):
		total += level_cost(l)
	return total


static func level_multiplier(level: int) -> float:
	return 1.0 + LEVEL_INCOME_STEP * float(level - LEVEL_MIN)


# ---------------------------------------------------------------------------
# 3. Sets (spec 2.4)
# ---------------------------------------------------------------------------

const SET_COUNT := 8
const SET_COMPLETE_BONUS := 0.15   ## +15% income to Fragments in that set.
const ALL_SETS_BONUS := 0.50       ## +50% global income for completing all 8.

# ---------------------------------------------------------------------------
# 4. Rifts (spec 3)
# ---------------------------------------------------------------------------

## Base Flux cost per Rift, tuned against tools/balance_sim.py (spec 5.4).
## Faint and Stable are exactly the spec 3 table. Deep and Singularity are
## tuned down from 30,000 / 250,000 because Rift prices now scale with income
## (see RIFT_RESISTANCE_* below), which the flat spec 3 figures predate.
const RIFT_COSTS := {
	"faint": 500.0,
	"stable": 4000.0,
	"deep": 8000.0,
	"singularity": 14000.0,
}

## --- Aether Resistance: why Rift prices scale ---
##
## A 4h offline collection is always worth 14,400 x Flux/sec. With flat prices
## one collection therefore buys either nothing or hundreds of Rifts, and NO
## choice of base_rate fixes it -- the ratio breaks, not the scale. Every spec
## 5.3 milestone past the first hour is really a statement about pulls per day,
## so a Rift has to cost a roughly fixed number of seconds of income.
##
##   cost = base_cost * max(1.0, (flux_per_sec / REF_RATE) ^ EXPONENT * onboard)
##   onboard = min(1.0, total_pulls / ONBOARD_PULLS)
##
## The max(1.0, ..) floor means a new player pays EXACTLY the table price above;
## resistance only ever raises a price, never lowers one. `onboard` is the
## opening honeymoon that lands the 5-minute and 45-minute targets in spec 5.3.
## Resistance tracks total_pulls and never income alone, so pulling a Singular
## does not spike every price at the exact moment the game should feel best.
##
## Set RIFT_RESISTANCE_EXPONENT to 0.0 to disable scaling and restore the
## literal flat spec 3 prices. tools/balance_sim.py shows what that does.
const RIFT_RESISTANCE_REF_RATE := 0.05     ## Flux/sec at which table prices hold.
const RIFT_RESISTANCE_EXPONENT := 1.0
const RIFT_RESISTANCE_ONBOARD_PULLS := 500.0

const RIFT_BULK_ID := "faint"   ## Only the Faint Rift offers "Open x10".
const RIFT_BULK_COUNT := 10

## Pity (spec 3): force a Singular after this many pulls without one.
const PITY_THRESHOLD := 150
## Show the pity counter in the UI once it passes this (spec 3, 6.2).
const PITY_VISIBLE_FROM := 75

# ---------------------------------------------------------------------------
# 5. Offline earnings & time guard (spec 5.2)
# ---------------------------------------------------------------------------

const OFFLINE_CAP_SECONDS := 4 * 3600            ## Do not raise it (spec 5.2).
const OFFLINE_CAP_SECONDS_AD_EXTENDED := 8 * 3600
const OFFLINE_RATE := 1.0                        ## 100% of current Flux/sec.
const OFFLINE_MIN_SECONDS := 60                  ## Below this, skip the collect screen.
## Deltas above this are treated as absurd and earn nothing (spec 5.2).
const OFFLINE_ABSURD_DELTA_SECONDS := 72 * 3600
## Time sources tried in order; first success wins (spec 5.2).
const TRUSTED_TIME_URLS := [
	"https://www.cloudflare.com/cdn-cgi/trace",
	"https://worldtimeapi.org/api/timezone/Etc/UTC",
]
const TRUSTED_TIME_TIMEOUT_SECONDS := 5.0
## Device clock may run this far ahead of the trusted clock before we distrust it.
const TRUSTED_TIME_TOLERANCE_SECONDS := 120

# ---------------------------------------------------------------------------
# 6. Ads (spec 7.3) — rewarded video only. No interstitials, no banners.
# ---------------------------------------------------------------------------

const AD_OFFLINE_MULTIPLIER := 2.0        ## x2 the offline amount, per collection.
const AD_FREE_RIFT_COOLDOWN_SECONDS := 4 * 3600
const AD_FREE_RIFT_ID := "faint"
const AD_SURGE_MULTIPLIER := 2.0          ## x2 income...
const AD_SURGE_DURATION_SECONDS := 15 * 60  ## ...for 15 minutes.
const AD_SURGE_DAILY_CAP := 3
const AD_SHARD_MULTIPLIER := 2.0          ## x2 Shards from the next opening.
const AD_SHARD_DAILY_CAP := 2

# ---------------------------------------------------------------------------
# 7. Opening animation (spec 3, 6.3)
# ---------------------------------------------------------------------------

const OPEN_DURATION_SECONDS := 2.5          ## Hard maximum. Always skippable.
const OPEN_DURATION_FAST_SECONDS := 0.4     ## "Fast Open" setting.
const OPEN_REVEAL_MIN_GAP := 0.06           ## Floor per-card gap for big pulls.

# ---------------------------------------------------------------------------
# 8. First launch (spec 5.3)
# ---------------------------------------------------------------------------

const FIRST_LAUNCH_FREE_RIFT := "faint"
## The first pull is rigged to contain at least one Lit Fragment: a first pull
## of three greys is a bad first impression.
const FIRST_PULL_GUARANTEED_TIER := 2

# ---------------------------------------------------------------------------
# 9. Runtime (spec 8)
# ---------------------------------------------------------------------------

const ECONOMY_TICK_SECONDS := 0.1     ## Flux accrual step while the app is open.
const UI_REFRESH_SECONDS := 0.1       ## Counter refresh rate.
const AUTOSAVE_SECONDS := 20.0        ## Plus every meaningful state change.

# ---------------------------------------------------------------------------
# 10. Prisms & cosmetics (spec 5.1, 7.4) — cosmetic only, never income.
# ---------------------------------------------------------------------------

const PRISM_MILESTONE_PER_SET := 25       ## Prisms for completing a set.
const PRISM_MILESTONE_FIRST_SINGULAR := 50
const PRISM_MILESTONE_PER_10_COLLECTED := 15


## Aether Resistance multiplier on every Rift price. See RIFT_RESISTANCE_*.
static func rift_resistance(flux_per_sec: float, total_pulls: int) -> float:
	if RIFT_RESISTANCE_EXPONENT <= 0.0:
		return 1.0
	var scaled := pow(maxf(flux_per_sec, 0.0) / RIFT_RESISTANCE_REF_RATE, RIFT_RESISTANCE_EXPONENT)
	var onboard := minf(1.0, float(total_pulls) / RIFT_RESISTANCE_ONBOARD_PULLS)
	return maxf(1.0, scaled * onboard)


static func tier_name(tier: int) -> String:
	return TIER_NAMES.get(tier, "Unknown")


static func tier_multiplier(tier: int) -> float:
	return float(TIER_MULTIPLIER.get(tier, 1.0))


static func shards_for_duplicate(tier: int) -> int:
	return int(TIER_SHARDS_PER_DUPLICATE.get(tier, 1))


## Sanity check run by the test suite: the balance spine must stay consistent.
static func validate() -> Array[String]:
	var errors: Array[String] = []
	var chance_sum := 0.0
	var count_sum := 0
	for t in range(TIER_MIN, TIER_MAX + 1):
		chance_sum += float(TIER_CHANCE[t])
		count_sum += int(TIER_COUNTS[t])
	if not is_equal_approx(chance_sum, 100.0):
		errors.append("Tier chances sum to %f, expected 100.0" % chance_sum)
	if count_sum != 50:
		errors.append("Tier counts sum to %d, expected 50" % count_sum)
	if OFFLINE_CAP_SECONDS != 4 * 3600:
		errors.append("Offline cap must stay at 4 hours (spec 5.2)")
	return errors
