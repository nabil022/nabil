"""Economy simulation (spec 5.4).

Runs virtual players through the real economy -- the rarity table, Rift
guarantees, pity counter, duplicate/Shard conversion, levelling curve, set
bonuses and the 4h offline cap -- and reports median time to every milestone in
spec 5.3, the Flux/sec curve, duplicate rate per tier, and the share of players
holding a Singular by day 7.

    python3 tools/balance_sim.py                    # 10,000 players x 30 days
    python3 tools/balance_sim.py --days 120         # long horizon
    python3 tools/balance_sim.py --fit              # search the tunables

Tune data/balance.gd against THIS, never against intuition (spec 5.4).

WHY RIFT PRICES SCALE
---------------------
A 4h offline collection is always worth 14,400 x Flux/sec. With flat prices,
one collection therefore buys either nothing or hundreds of Rifts, and no
choice of base_rate fixes it -- the ratio, not the scale, is what breaks. Every
milestone in spec 5.3 past the first hour is a statement about how many pulls a
player makes per day, so Rift prices must be denominated in seconds of income.
`Config.resistance` does that; `max(1.0, ...)` means a new player still pays
exactly the spec 3 prices, and prices only ever rise above the table.
"""

from __future__ import annotations

import argparse
import math
import random
import statistics
from dataclasses import dataclass, field

import fragment_gen as fg

DAY = 86400.0

# --- rift definitions (spec 3) ---------------------------------------------

RIFT_FRAGMENTS = {"faint": 3, "stable": 5, "deep": 5, "singularity": 7}
RIFT_GUARANTEE = {"faint": 0, "stable": 3, "deep": 4, "singularity": 5}
RIFT_ORDER = ["faint", "stable", "deep", "singularity"]
BIG_RIFTS = ["singularity", "deep", "stable"]

PITY_THRESHOLD = 150
LEVEL_MAX = 25
LEVEL_STEP = 0.15
SET_BONUS = 0.15
ALL_SETS_BONUS = 0.50
OFFLINE_CAP = 4 * 3600

# Session start times (seconds into the day). Every gap exceeds the 4h cap, so
# a player on this cadence banks 4 x 4h = 16h of income per day.
SESSION_TIMES = [8 * 3600, 12 * 3600 + 1800, 17 * 3600, 22 * 3600]
# Day 0: a new player stays in the app while the novelty holds, then checks
# back a few times before settling into the normal cadence.
FIRST_ACTIVE_SECONDS = 900
FIRST_ACTIVE_STEP = 10
EARLY_CHECKINS = [45 * 60, 2 * 3600, 4 * 3600, 6 * 3600]


@dataclass
class Config:
    income_scale: float = 1.0           # multiplies every base_rate
    resistance_ref_rate: float = 0.05   # Flux/sec at which spec 3 prices hold
    resistance_exponent: float = 1.0
    resistance_onboard_pulls: float = 500.0   # honeymoon length, in pulls
    save_fraction: float = 0.35          # share of income banked for big Rifts
    save_horizon_days: float = 4.0       # how far past a Rift a player will hold out
    faint_cost: float = 500.0            # spec 3 headline price
    stable_mult: float = 8.0             # cost as a multiple of the Faint Rift
    deep_mult: float = 16.0
    singularity_mult: float = 28.0

    def base_cost(self, rift: str) -> float:
        return self.faint_cost * {
            "faint": 1.0,
            "stable": self.stable_mult,
            "deep": self.deep_mult,
            "singularity": self.singularity_mult,
        }[rift]

    def resistance(self, income: float, total_pulls: int) -> float:
        if self.resistance_exponent <= 0.0:
            return 1.0
        scaled = (income / self.resistance_ref_rate) ** self.resistance_exponent
        onboard = min(1.0, total_pulls / self.resistance_onboard_pulls)
        return max(1.0, scaled * onboard)

    def rift_cost(self, rift: str, income: float, total_pulls: int) -> float:
        return self.base_cost(rift) * self.resistance(income, total_pulls)


# --- pull tables ------------------------------------------------------------

TIER_CUM: list[tuple[float, int]] = []
_acc = 0.0
for _t in sorted(fg.TIER_CHANCE):
    _acc += fg.TIER_CHANCE[_t]
    TIER_CUM.append((_acc, _t))

FRAGMENTS = fg.build_fragments()
BY_TIER: dict[int, list[int]] = {t: [] for t in fg.TIER_COUNTS}
for _i, _f in enumerate(FRAGMENTS):
    BY_TIER[_f.tier].append(_i)
SET_MEMBERS: dict[int, list[int]] = {}
for _i, _f in enumerate(FRAGMENTS):
    SET_MEMBERS.setdefault(_f.set_index, []).append(_i)
FRAG_SET = [f.set_index for f in FRAGMENTS]
FRAG_TIER = [f.tier for f in FRAGMENTS]
FRAG_BASE = [f.base_rate * fg.TIER_MULTIPLIER[f.tier] for f in FRAGMENTS]
LEVEL_COSTS = [0] + [math.ceil(3.0 * 1.55 ** (l - 1)) for l in range(1, LEVEL_MAX)]


def roll_tier(rng: random.Random) -> int:
    r = rng.random() * 100.0
    for cum, tier in TIER_CUM:
        if r < cum:
            return tier
    return 5


class Player:
    __slots__ = (
        "rng", "cfg", "flux", "savings", "banked", "shards", "levels", "owned_count",
        "pulls_since_singular", "total_pulls", "income", "sets_done", "all_sets",
        "dupes", "news", "milestones", "rifts_bought", "pity_fires",
    )

    def __init__(self, rng: random.Random, cfg: Config) -> None:
        self.rng = rng
        self.cfg = cfg
        self.flux = 0.0
        self.savings = 0.0
        self.banked = 0.0     # cumulative banked Flux, for affordability metrics
        self.shards = 0
        self.levels = [0] * 50           # 0 == not owned, else level 1..25
        self.owned_count = 0
        self.pulls_since_singular = 0
        self.total_pulls = 0
        self.income = 0.0
        self.sets_done: set[int] = set()
        self.all_sets = False
        self.dupes = {t: 0 for t in fg.TIER_COUNTS}
        self.news = {t: 0 for t in fg.TIER_COUNTS}
        self.milestones: dict[str, float] = {}
        self.rifts_bought = {r: 0 for r in RIFT_ORDER}
        self.pity_fires = 0

    # --- income ------------------------------------------------------------

    def recompute_income(self) -> None:
        gb = (1.0 + ALL_SETS_BONUS) if self.all_sets else 1.0
        total = 0.0
        for i, lvl in enumerate(self.levels):
            if lvl == 0:
                continue
            sb = (1.0 + SET_BONUS) if FRAG_SET[i] in self.sets_done else 1.0
            total += FRAG_BASE[i] * (1.0 + LEVEL_STEP * (lvl - 1)) * sb * gb
        self.income = total * self.cfg.income_scale

    def _refresh_sets(self) -> None:
        before = len(self.sets_done)
        for sid, members in SET_MEMBERS.items():
            if sid not in self.sets_done and all(self.levels[i] > 0 for i in members):
                self.sets_done.add(sid)
        if len(self.sets_done) != before:
            self.all_sets = len(self.sets_done) == fg.SET_COUNT

    # --- pulls -------------------------------------------------------------

    def _grant(self, idx: int, t: float) -> None:
        tier = FRAG_TIER[idx]
        self.total_pulls += 1
        if self.levels[idx] == 0:
            self.levels[idx] = 1
            self.owned_count += 1
            self.news[tier] += 1
            self.milestones.setdefault(f"first_tier{tier}", t)
            if self.owned_count == 50:
                self.milestones.setdefault("all_50", t)
            self._refresh_sets()
        else:
            self.dupes[tier] += 1
            self.shards += fg.TIER_SHARDS[tier]

    def _roll_slot(self) -> int:
        """One pull. The pity counter advances per PULL, not per Rift -- rolling
        a whole Rift first would fire pity on every slot at once."""
        if self.pulls_since_singular >= PITY_THRESHOLD:
            self.pity_fires += 1
            tier = 5
        else:
            tier = roll_tier(self.rng)
        self.pulls_since_singular = 0 if tier == 5 else self.pulls_since_singular + 1
        return tier

    def open_rift(self, rift: str, t: float, rig_tier: int = 0) -> None:
        tiers = [self._roll_slot() for _ in range(RIFT_FRAGMENTS[rift])]
        guarantee = max(RIFT_GUARANTEE[rift], rig_tier)
        if guarantee and max(tiers) < guarantee:
            tiers[-1] = guarantee
            if guarantee == 5:
                self.pulls_since_singular = 0
        for tier in tiers:
            self._grant(self.rng.choice(BY_TIER[tier]), t)
        self.rifts_bought[rift] += 1
        self.recompute_income()

    # --- spending ----------------------------------------------------------

    def cost(self, rift: str) -> float:
        return self.cfg.rift_cost(rift, self.income, self.total_pulls)

    def buy_rifts(self, t: float) -> None:
        """A realistic player: Faint Rifts for volume, savings for a big Rift.

        Per Flux spent the Faint Rift is the most pull-efficient purchase -- the
        bigger Rifts sell a guarantee at a small premium -- so the modelled
        player spends most Flux on Faint Rifts and banks the rest. When the pot
        covers a big Rift they buy it, unless the next one up is within
        `save_horizon_days` of further saving, in which case they hold out.
        """
        affordable = [r for r in BIG_RIFTS if self.savings >= self.cost(r)]
        if affordable:
            target = affordable[0]  # BIG_RIFTS is most expensive first
            rate = self.income * self.cfg.save_fraction * 4 * OFFLINE_CAP  # per day
            idx = BIG_RIFTS.index(target)
            if idx > 0 and rate > 0.0:
                nxt = BIG_RIFTS[idx - 1]
                if (self.cost(nxt) - self.savings) / rate <= self.cfg.save_horizon_days:
                    target = None  # hold out for the better Rift
            if target is not None:
                self.savings -= self.cost(target)
                self.milestones.setdefault(f"first_{target}_rift", t)
                self.open_rift(target, t)
        guard = 0
        while self.flux >= self.cost("faint") and guard < 200000:
            guard += 1
            self.flux -= self.cost("faint")
            self.open_rift("faint", t)

    def spend_shards(self) -> None:
        """Greedy: always buy the level with the best income gain per Shard."""
        gb = (1.0 + ALL_SETS_BONUS) if self.all_sets else 1.0
        while True:
            best_i, best_ratio, best_cost = -1, 0.0, 0
            for i, lvl in enumerate(self.levels):
                if lvl == 0 or lvl >= LEVEL_MAX:
                    continue
                cost = LEVEL_COSTS[lvl]
                if cost > self.shards:
                    continue
                sb = (1.0 + SET_BONUS) if FRAG_SET[i] in self.sets_done else 1.0
                ratio = FRAG_BASE[i] * LEVEL_STEP * sb * gb / cost
                if ratio > best_ratio:
                    best_i, best_ratio, best_cost = i, ratio, cost
            if best_i < 0:
                return
            self.shards -= best_cost
            self.levels[best_i] += 1
            self.recompute_income()

    def accrue(self, seconds: float) -> float:
        gained = self.income * min(seconds, OFFLINE_CAP)
        self.savings += gained * self.cfg.save_fraction
        self.banked += gained * self.cfg.save_fraction
        self.flux += gained * (1.0 - self.cfg.save_fraction)
        return gained

    def note_affordability(self, t: float) -> None:
        """"Affordable regularly": a saving player could cover this Rift by now."""
        for rift in BIG_RIFTS:
            if self.banked >= self.cost(rift):
                self.milestones.setdefault(f"{rift}_regular", t)


def simulate_player(seed: int, cfg: Config, days: int) -> Player:
    rng = random.Random(seed)
    p = Player(rng, cfg)

    # First launch: a free Faint Rift, rigged to contain a Lit (spec 5.3).
    p.open_rift("faint", 0.0, rig_tier=2)

    t = 0.0
    while t < FIRST_ACTIVE_SECONDS:
        t += FIRST_ACTIVE_STEP
        p.accrue(FIRST_ACTIVE_STEP)
        p.note_affordability(t)
        p.buy_rifts(t)
        p.spend_shards()

    last_seen = t
    checkpoints = set(EARLY_CHECKINS)
    for day in range(days):
        for st in SESSION_TIMES:
            checkpoints.add(day * DAY + st)
    next_snapshot = 0
    for when in sorted(checkpoints):
        if when <= last_seen:
            continue
        while next_snapshot * DAY <= when and next_snapshot <= days:
            p.milestones[f"_income_day{next_snapshot}"] = p.income
            p.milestones[f"_owned_day{next_snapshot}"] = float(p.owned_count)
            p.milestones[f"_pulls_day{next_snapshot}"] = float(p.total_pulls)
            next_snapshot += 1
        p.accrue(when - last_seen)
        last_seen = when
        p.note_affordability(when)
        p.buy_rifts(when)
        p.spend_shards()
    return p


# --- targets (spec 5.3) -----------------------------------------------------

TARGETS = {
    "first_tier3": ("First Bright Fragment", 5 * 60, 60, 20 * 60),
    "first_tier4": ("First Radiant", 45 * 60, 20 * 60, 2 * 3600),
    "first_tier5": ("First Singular", 2.5 * DAY, 1.5 * DAY, 4.0 * DAY),
    "stable_regular": ("Stable Rifts affordable regularly", 1.0 * DAY, 0.2 * DAY, 2.0 * DAY),
    "deep_regular": ("Deep Rifts affordable regularly", 5.0 * DAY, 3.0 * DAY, 7.0 * DAY),
    "singularity_regular": ("First Singularity Rift", 17.5 * DAY, 12.0 * DAY, 24.0 * DAY),
    "all_50": ("All 50 collected", 70.0 * DAY, 52.0 * DAY, 90.0 * DAY),
}


def fmt_time(sec: float | None) -> str:
    if sec is None:
        return "never"
    if sec < 3600:
        return f"{sec / 60:.1f} min"
    if sec < 2 * DAY:
        return f"{sec / 3600:.1f} h"
    return f"{sec / DAY:.1f} d"


def run(cfg: Config, players: int, days: int, base_seed: int = 1) -> dict:
    results = [simulate_player(base_seed + i, cfg, days) for i in range(players)]
    out: dict = {"medians": {}, "reach": {}, "players": results, "horizon": days * DAY}
    for key in TARGETS:
        got = [p.milestones[key] for p in results if key in p.milestones]
        out["reach"][key] = len(got) / len(results)
        out["medians"][key] = statistics.median(got) if got else None
    out["singular_by_day7"] = sum(
        1 for p in results if p.milestones.get("first_tier5", 1e18) <= 7 * DAY
    ) / len(results)
    out["dupes"] = {t: statistics.mean([p.dupes[t] for p in results]) for t in sorted(fg.TIER_COUNTS)}
    out["news"] = {t: statistics.mean([p.news[t] for p in results]) for t in sorted(fg.TIER_COUNTS)}
    out["end_income"] = statistics.median([p.income for p in results])
    out["end_owned"] = statistics.median([p.owned_count for p in results])
    out["end_pulls"] = statistics.median([p.total_pulls for p in results])
    out["pity_fires"] = statistics.mean([p.pity_fires for p in results])
    out["rifts"] = {r: statistics.mean([p.rifts_bought[r] for p in results]) for r in RIFT_ORDER}
    return out


def score(cfg: Config, players: int, days: int) -> float:
    res = run(cfg, players, days)
    total = 0.0
    for key, (_label, target, _lo, _hi) in TARGETS.items():
        med = res["medians"][key]
        if med is None:
            med = res["horizon"] * 3.0
        total += math.log(med / target) ** 2
    return total


def report(cfg: Config, players: int, days: int) -> dict:
    res = run(cfg, players, days)
    print(f"\n=== AETHER economy simulation: {players} players x {days} days ===")
    print(f"income_scale={cfg.income_scale}  ref_rate={cfg.resistance_ref_rate}"
          f"  exponent={cfg.resistance_exponent}  onboard_pulls={cfg.resistance_onboard_pulls}")
    print(f"save_fraction={cfg.save_fraction}  save_horizon_days={cfg.save_horizon_days}")
    print("base Rift costs: " + ", ".join(f"{r}={cfg.base_cost(r):,.0f}" for r in RIFT_ORDER))
    print()
    print(f"{'milestone':<38} {'median':>10} {'target':>10} {'window':>20} {'reached':>9}")
    print("-" * 96)
    hits = 0
    for key, (label, target, lo, hi) in TARGETS.items():
        med = res["medians"][key]
        ok = med is not None and lo <= med <= hi
        hits += int(ok)
        print(f"{label:<38} {fmt_time(med):>10} {fmt_time(target):>10} "
              f"{fmt_time(lo) + ' - ' + fmt_time(hi):>20} {res['reach'][key] * 100:7.1f}%  "
              f"{'OK' if ok else 'off'}")
    print(f"\ntargets met: {hits}/{len(TARGETS)}")
    print(f"players with >=1 Singular by day 7 : {res['singular_by_day7'] * 100:.1f}%")
    print(f"median Flux/sec at horizon         : {res['end_income']:,.2f}")
    print(f"median Fragments owned at horizon  : {res['end_owned']:.0f} / 50")
    print(f"median total pulls at horizon      : {res['end_pulls']:,.0f}")
    print(f"mean pity activations              : {res['pity_fires']:.1f}")
    print("mean Rifts opened                  : "
          + ", ".join(f"{r}={res['rifts'][r]:,.1f}" for r in RIFT_ORDER))
    print("\nduplicates / new by tier (mean):")
    for t in sorted(fg.TIER_COUNTS):
        n, d = res["news"][t], res["dupes"][t]
        rate = d / (n + d) * 100 if (n + d) else 0.0
        print(f"  tier {t} ({fg.TIER_COUNTS[t]:>2} exist): new={n:5.1f}  dupes={d:8.1f}"
              f"  duplicate rate={rate:5.1f}%")
    print("\nFlux/sec curve (median across players):")
    print(f"  {'day':>4} {'owned':>6} {'flux/sec':>14} {'pulls':>9} {'pulls/day':>10} {'faint cost':>16}")
    for d in [0, 1, 2, 3, 5, 7, 14, 21, 30, 45, 60, 90, 120]:
        if d > days:
            continue
        inc = statistics.median([p.milestones.get(f"_income_day{d}", p.income) for p in res["players"]])
        owned = statistics.median([p.milestones.get(f"_owned_day{d}", float(p.owned_count)) for p in res["players"]])
        pulls = statistics.median([p.milestones.get(f"_pulls_day{d}", float(p.total_pulls)) for p in res["players"]])
        prev = statistics.median([p.milestones.get(f"_pulls_day{d - 1}", float(p.total_pulls)) for p in res["players"]]) if d else 0.0
        print(f"  {d:>4} {owned:>6.0f} {inc:>14,.2f} {pulls:>9,.0f} {pulls - prev:>10.1f}"
              f" {cfg.rift_cost('faint', inc, int(pulls)):>16,.0f}")
    return res


def fit(players: int, days: int) -> Config:
    cfg = Config()
    best = score(cfg, players, days)
    print(f"start score={best:.4f}")
    grids = {
        "income_scale": [0.4, 0.55, 0.7, 0.9],
        "resistance_ref_rate": [0.028, 0.034, 0.042, 0.05, 0.06, 0.072],
        "resistance_exponent": [0.96, 1.0, 1.04],
        "resistance_onboard_pulls": [150, 250, 400, 600, 900],
        "save_fraction": [0.25, 0.35, 0.45],
        "stable_mult": [4.0, 6.5, 9.0, 13.0],
        "deep_mult": [11.0, 16.0, 24.0, 34.0],
        "singularity_mult": [28.0, 40.0, 58.0, 80.0],
    }
    for sweep in range(4):
        improved = False
        for name, values in grids.items():
            local_best, local_val = best, getattr(cfg, name)
            for v in values:
                setattr(cfg, name, v)
                s = score(cfg, players, days)
                if s < local_best - 1e-9:
                    local_best, local_val = s, v
            setattr(cfg, name, local_val)
            if local_best < best - 1e-9:
                best, improved = local_best, True
            print(f"  sweep {sweep} {name:<26} -> {local_val:<8} score={best:.4f}", flush=True)
        if not improved:
            break
    print(f"\nfit: {cfg}\nscore={best:.4f}")
    return cfg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--players", type=int, default=10000)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--fit", action="store_true")
    ap.add_argument("--fit-players", type=int, default=60)
    ap.add_argument("--fit-days", type=int, default=90)
    for name in ("income-scale", "ref-rate", "exponent", "onboard-pulls", "save-fraction",
                 "stable-mult", "deep-mult", "singularity-mult"):
        ap.add_argument(f"--{name}", type=float)
    args = ap.parse_args()

    cfg = Config()
    mapping = {
        "income_scale": args.income_scale, "resistance_ref_rate": args.ref_rate,
        "resistance_exponent": args.exponent, "resistance_onboard_pulls": args.onboard_pulls,
        "save_fraction": args.save_fraction, "stable_mult": args.stable_mult,
        "deep_mult": args.deep_mult, "singularity_mult": args.singularity_mult,
    }
    for k, v in mapping.items():
        if v is not None:
            setattr(cfg, k, v)
    if args.fit:
        cfg = fit(args.fit_players, args.fit_days)
    report(cfg, args.players, args.days)


if __name__ == "__main__":
    main()
