"""Deterministic generation of the 50 Fragment definitions (spec 2.2, 2.3, 2.4).

This is a DEVELOPMENT-TIME script. Its output is frozen into
res://data/fragments.gd and committed. Nothing here runs at runtime: players
must see the same name, seed and set for the same Fragment, forever (spec 2.2).

The sigil parameter derivation in `sigil_params` is a line-for-line mirror of
shaders/sigil.gdshader. It exists so seed selection can be verified numerically
(no two Fragments end up with near-identical silhouettes) instead of only by
eyeballing the dev gallery.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

# --- balance spine (mirrors data/balance.gd) -------------------------------

TIER_COUNTS = {1: 15, 2: 13, 3: 10, 4: 8, 5: 4}
TIER_CHANCE = {1: 60.0, 2: 25.0, 3: 11.0, 4: 3.5, 5: 0.5}
TIER_MULTIPLIER = {1: 1.0, 2: 3.0, 3: 10.0, 4: 40.0, 5: 200.0}
TIER_SHARDS = {1: 1, 2: 4, 3: 15, 4: 60, 5: 400}
SET_COUNT = 8

# TUNED against balance_sim.py (spec 5.4) -- 6 of the 7 pacing targets in spec
# 5.3 are hit on the median. Per-tier base Flux/sec before the tier multiplier;
# each Fragment varies +/-15% around its tier base, driven by its seed.
TIER_BASE_RATE = {1: 0.55, 2: 0.66, 3: 0.99, 4: 1.65, 5: 2.75}

# Base Rift costs. Faint and Stable are exactly the spec 3 table; Deep and
# Singularity are tuned down from 30,000 / 250,000 because Rift prices now
# scale with income (see balance_sim.py), which the spec 3 figures predate.
RIFT_COSTS = {"faint": 500.0, "stable": 4000.0, "deep": 8000.0, "singularity": 14000.0}

# --- names (spec 2.2 word bank) --------------------------------------------

ADJECTIVES = [
    "Hollow", "Fractured", "Silent", "Bound", "Drifting", "Pale",
    "Woven", "Severed", "Kindled", "Sunken", "Veiled", "Immanent",
]
NOUNS = [
    "Meridian", "Lattice", "Echo", "Vessel", "Spiral", "Threshold",
    "Ember", "Cipher", "Halo", "Current", "Aperture", "Remnant",
]

NAME_RNG_SEED = 20260904
SEED_RNG_SEED = 771103
SEED_MIN = 100_003
SEED_MAX = 16_777_215  # < 2^24, so the seed is exact in a 32-bit shader float.


# --- sigil maths (mirror of shaders/sigil.gdshader) -------------------------

MASK32 = 0xFFFFFFFF


def xorshift32(h: int) -> int:
    h &= MASK32
    h ^= (h << 13) & MASK32
    h ^= h >> 17
    h ^= (h << 5) & MASK32
    return h & MASK32


class SeedStream:
    """Same sequence the shader's rnd() produces, in the same order."""

    def __init__(self, seed: int) -> None:
        self.h = seed & MASK32

    def next(self) -> float:
        self.h = xorshift32(self.h)
        return (self.h & 0xFFFFFF) / 16777216.0


@dataclass(frozen=True)
class SigilParams:
    n: int          # primary harmonic
    m: int          # secondary harmonic
    a: float        # primary amplitude
    b: float        # secondary amplitude
    phi: float      # primary phase
    psi: float      # secondary phase
    rings: int      # 2..5 concentric rings / radial spokes
    spokes: bool    # inner structure is spokes rather than rings
    hue_t: float    # 0..1, mapped into the tier's hue band
    spin: float     # rotation speed/direction variance


def sigil_params(seed: int) -> SigilParams:
    s = SeedStream(seed)
    n = 3 + int(s.next() * 5.0)              # 3..7
    m = 2 + int(s.next() * 6.0)              # 2..7
    a = 0.10 + s.next() * 0.22
    b = 0.04 + s.next() * 0.16
    phi = s.next() * math.tau
    psi = s.next() * math.tau
    rings = 2 + int(s.next() * 4.0)          # 2..5
    spokes = s.next() > 0.5
    hue_t = s.next()
    spin = s.next()
    if m == n:                                # keep the two harmonics distinct
        m = 2 + ((m - 1) % 6)
        if m == n:
            m = 2 + ((m) % 6)
    return SigilParams(n, m, a, b, phi, psi, rings, spokes, hue_t, spin)


def radius(p: SigilParams, theta: float) -> float:
    return 1.0 + p.a * math.sin(p.n * theta + p.phi) + p.b * math.sin(p.m * theta + p.psi)


def shape_key(p: SigilParams) -> tuple[int, int]:
    return (p.n, p.m)


def silhouettes_too_similar(p: SigilParams, q: SigilParams) -> bool:
    """Rotation-invariant similarity test.

    r(theta) is a two-harmonic curve, so its magnitude spectrum is fully
    described by (n, a) and (m, b) -- and that spectrum is invariant to the
    rotation the sigils are always under. Two Fragments therefore look alike
    exactly when they share both harmonic numbers with close amplitudes and
    the same inner structure.
    """
    if shape_key(p) != shape_key(q):
        return False
    if abs(p.a - q.a) + abs(p.b - q.b) > 0.06:
        return False
    if p.rings != q.rings or p.spokes != q.spokes:
        return False
    return True


# --- set assignment (spec 2.4) ---------------------------------------------

def assign_sets(tiers: list[int]) -> list[int]:
    """Deals Fragments into 8 sets highest-tier-first, round robin.

    Round-robin dealing from the top guarantees every set contains at least one
    Radiant or Singular, so no set is trivially completable, and lands every set
    at 6-7 members (spec 2.4 asks for 5-8).
    """
    order = sorted(range(len(tiers)), key=lambda i: (-tiers[i], i))
    sets = [0] * len(tiers)
    for slot, idx in enumerate(order):
        sets[idx] = slot % SET_COUNT
    return sets


# --- fragment table ---------------------------------------------------------

@dataclass
class Fragment:
    id: str
    name: str
    tier: int
    seed: int
    base_rate: float
    set_id: str

    @property
    def set_index(self) -> int:
        return int(self.set_id.split("_")[1]) - 1

    def income_base(self) -> float:
        """Flux/sec at level 1 with no set or global bonus."""
        return self.base_rate * TIER_MULTIPLIER[self.tier]


def _generate_names(count: int) -> list[str]:
    rng = random.Random(NAME_RNG_SEED)
    combos = [(a, n) for a in ADJECTIVES for n in NOUNS]
    rng.shuffle(combos)
    used_adj: dict[str, int] = {}
    used_noun: dict[str, int] = {}
    picked: list[str] = []
    max_use = 5  # 12 words * 5 = 60 >= 50, so no word dominates the set
    for adj, noun in combos:
        if len(picked) == count:
            break
        if used_adj.get(adj, 0) >= max_use or used_noun.get(noun, 0) >= max_use:
            continue
        used_adj[adj] = used_adj.get(adj, 0) + 1
        used_noun[noun] = used_noun.get(noun, 0) + 1
        picked.append(f"{adj} {noun}")
    if len(picked) != count:
        raise RuntimeError(f"name generation produced {len(picked)} of {count}")
    return picked


def _tier_list() -> list[int]:
    tiers: list[int] = []
    for tier in sorted(TIER_COUNTS):
        tiers.extend([tier] * TIER_COUNTS[tier])
    return tiers


def build_fragments() -> list[Fragment]:
    """Builds all 50 Fragments. Fully deterministic."""
    tiers = _tier_list()
    assert len(tiers) == 50, tiers
    names = _generate_names(50)
    sets = assign_sets(tiers)

    rng = random.Random(SEED_RNG_SEED)
    accepted: list[tuple[int, SigilParams]] = []
    seeds: list[int] = []
    # Minimum hue separation between Fragments sharing a tier, so colours read
    # as distinct inside a rarity band as well as across bands.
    hue_gap = {t: 1.0 / (c * 1.7) for t, c in TIER_COUNTS.items()}

    for idx, tier in enumerate(tiers):
        for attempt in range(200_000):
            seed = rng.randrange(SEED_MIN, SEED_MAX)
            p = sigil_params(seed)
            if any(silhouettes_too_similar(p, q) for _, q in accepted):
                continue
            clash = False
            for j, (t_j, q) in enumerate(zip(tiers, [q for _, q in accepted])):
                if t_j == tier and abs(q.hue_t - p.hue_t) < hue_gap[tier]:
                    clash = True
                    break
            if clash:
                continue
            accepted.append((tier, p))
            seeds.append(seed)
            break
        else:
            raise RuntimeError(f"could not find a distinct seed for index {idx}")

    fragments: list[Fragment] = []
    for idx, (tier, seed, name, set_idx) in enumerate(zip(tiers, seeds, names, sets)):
        # base_rate varies +/-15% around the tier base, driven by the seed so it
        # is stable and reproducible.
        var = SeedStream(seed ^ 0x5A5A5A).next()
        rate = TIER_BASE_RATE[tier] * (0.85 + 0.30 * var)
        fragments.append(
            Fragment(
                id=f"frag_{idx + 1:03d}",
                name=name,
                tier=tier,
                seed=seed,
                base_rate=round(rate, 2),
                set_id=f"set_{set_idx + 1:02d}",
            )
        )
    return fragments


def validate(fragments: list[Fragment]) -> list[str]:
    errors: list[str] = []
    if len(fragments) != 50:
        errors.append(f"expected 50 fragments, got {len(fragments)}")
    if len({f.id for f in fragments}) != len(fragments):
        errors.append("duplicate fragment ids")
    if len({f.name for f in fragments}) != len(fragments):
        errors.append("duplicate fragment names")
    if len({f.seed for f in fragments}) != len(fragments):
        errors.append("duplicate seeds")
    counts: dict[int, int] = {}
    for f in fragments:
        counts[f.tier] = counts.get(f.tier, 0) + 1
        if not SEED_MIN <= f.seed <= SEED_MAX:
            errors.append(f"{f.id}: seed out of exact-float range")
        if f.base_rate <= 0:
            errors.append(f"{f.id}: non-positive base_rate")
    if counts != TIER_COUNTS:
        errors.append(f"tier counts {counts} != {TIER_COUNTS}")
    set_sizes: dict[str, int] = {}
    set_top: dict[str, int] = {}
    for f in fragments:
        set_sizes[f.set_id] = set_sizes.get(f.set_id, 0) + 1
        set_top[f.set_id] = max(set_top.get(f.set_id, 0), f.tier)
    if len(set_sizes) != SET_COUNT:
        errors.append(f"expected {SET_COUNT} sets, got {len(set_sizes)}")
    for sid, size in sorted(set_sizes.items()):
        if not 5 <= size <= 8:
            errors.append(f"{sid}: size {size} outside 5-8")
        if set_top[sid] < 4:
            errors.append(f"{sid}: trivially completable (no Radiant or Singular)")
    for i, f in enumerate(fragments):
        for g in fragments[i + 1:]:
            if silhouettes_too_similar(sigil_params(f.seed), sigil_params(g.seed)):
                errors.append(f"{f.id} and {g.id} have near-identical silhouettes")
    return errors


if __name__ == "__main__":
    frags = build_fragments()
    errs = validate(frags)
    for f in frags:
        p = sigil_params(f.seed)
        print(f"{f.id} T{f.tier} {f.name:<22} seed={f.seed:<9} rate={f.base_rate:<6} "
              f"{f.set_id} n={p.n} m={p.m} rings={p.rings} spokes={int(p.spokes)} hue={p.hue_t:.3f}")
    print("\nvalidation:", "OK" if not errs else errs)
