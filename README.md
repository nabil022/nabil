# Aether

An idle / incremental collection game. You pull **Fragments** — abstract
geometric sigils — out of the Aether. Fragments generate **Flux**, Flux buys
**Rifts**, Rifts contain more Fragments. Duplicates become **Shards**, which
level up what you already own.

Godot 4.5, GDScript, 2D, portrait, offline-capable. Every visual is generated
by code: one fragment shader draws all 50 sigils. There are no sprite sheets,
no imported art, and no audio files — the six sound effects are synthesised at
startup.

---

## Running it

```bash
# First run only: build Godot's class registry and import the project.
godot --headless --editor --quit

# Play it
godot --path .

# Tests: 3,800+ assertions, including a 1,000,000-roll distribution check
godot --headless --path . res://tests/tests.tscn      # exits non-zero on failure

# Dev tools
godot --path . res://tools/sigil_gallery.tscn         # all 50 sigils in a grid
python3 tools/balance_sim.py                          # 10,000 players x 30 days
python3 tools/balance_sim.py --days 120               # long horizon
python3 tools/balance_sim.py --fit                    # re-tune the numbers
python3 tools/gen_fragments.py                        # regenerate data/fragments.gd
```

Rendering a screen to a PNG without a device (Godot's headless mode has no
renderer, so it needs a virtual display):

```bash
xvfb-run -a godot --path . --rendering-driver opengl3 --resolution 1080x2340 \
    res://tools/screenshot.tscn -- --target=res://ui/main.tscn --out=shot.png
```

## Layout

```
data/       balance.gd      every tunable number, in one file
            fragments.gd    the 50 frozen definitions (generated, committed)
            rifts.gd        Rift configs, odds, guarantees
            cosmetics.gd    cosmetics and IAP products
systems/    big_number.gd   mantissa/exponent currency
            save_manager.gd economy.gd  time_guard.gd
            rift_roller.gd  pure RNG: odds, guarantees, pity
            rift_service.gd buying and applying a Rift
            ad_manager.gd   iap_manager.gd  audio_manager.gd
ui/         collection/  rifts/  opening/  shop/  settings/  common/
shaders/    sigil.gdshader
tools/      fragment_gen.py  gen_fragments.py  balance_sim.py
            sigil_gallery.tscn  screenshot.gd
tests/      nine suites, run by tests.tscn
docs/       balance simulation output
```

Screens build their own contents in GDScript and the `.tscn` files stay small.
That is deliberate: the layout is then readable and diffable as code, which is
the same reason the project is in Godot rather than Unity.

## Where the spec was followed, and where it could not be

Everything in the specification is implemented as written except two things.
Both were found by the simulation the spec itself asks for (§5.4), and both are
one flag away from the literal behaviour.

### 1. Rift prices scale with income

**The spec's numbers are not mutually satisfiable.** A 4-hour offline
collection is always worth `14,400 × Flux/sec`. With flat prices, one
collection buys either nothing or hundreds of Rifts — and no choice of
`base_rate` fixes it, because what breaks is the *ratio* of price to income,
not the scale. Concretely, §5.3 asks for two things at once:

| Requirement | Implied Faint Rift price |
|---|---|
| "First Bright Fragment: 5 minutes" | ~300 seconds of income |
| 1–5 Rifts per session + all 50 in 8–12 weeks | ~10,000 seconds of income |

Since income only ever rises, the price-to-income ratio must rise with it. The
first simulation run with flat prices finished the entire 50-Fragment
collection in **2 hours**; see the top of `tools/balance_sim.py` for the
derivation.

So a Rift's price carries an **Aether Resistance** multiplier
(`Balance.rift_resistance`):

```
cost = base_cost × max(1.0, (flux_per_sec / REF_RATE) ^ EXPONENT × onboard)
onboard = min(1.0, total_pulls / ONBOARD_PULLS)
```

- The `max(1.0, …)` floor means a new player pays **exactly** the §3 table
  price. Resistance only ever raises a price above the table, never lowers one.
- It tracks `total_pulls`, never income alone, so pulling a Singular does not
  spike every price at the exact moment the game is supposed to feel best.
- The `onboard` term is the opening honeymoon that lands the 5-minute and
  45-minute targets.
- It is shown to the player on the Rifts screen, with the base prices, rather
  than left as a mystery.
- Setting `RIFT_RESISTANCE_EXPONENT` to `0.0` restores flat §3 pricing.

Deep and Singularity Rift base costs were also tuned (30,000 → 8,000 and
250,000 → 14,000), which §5.4 explicitly authorises. At the spec's figures both
were strictly dominated by spamming Faint Rifts — a guaranteed Radiant cost
5.5× what the same Radiant costs in Faint pulls, so a rational player would
never buy one. The tuned prices sit just above fair value, which is what makes
them a treat rather than a trap.

### 2. "All 50 collected" lands at ~7 weeks, not 8–12

Six of the seven pacing targets in §5.3 land on the median. The seventh is
floored by the 150-pull pity counter at the tuned pull rate: four Singulars
need roughly 600 pulls, and at ~14 pulls/day that is ~7 weeks. Slowing the pull
rate further pushes *first Singular* and *first Singularity Rift* out of their
own windows. The 150-pull threshold is the spec's, so it was left alone and the
one target was missed by 15%.

### Simulation results

10,000 players × 30 days, and 4,000 × 120 days for the long tail
(`docs/balance_report_*.txt`):

| Milestone | Median | Target | Window |
|---|---|---|---|
| First Bright Fragment | 4.7 min | 5 min | ✅ |
| First Radiant | 45 min | 45 min | ✅ |
| First Singular | 41 h | day 2–3 | ✅ |
| Stable Rifts affordable regularly | 17 h | day 1 | ✅ |
| Deep Rifts affordable regularly | 5.9 d | day 4–6 | ✅ |
| First Singularity Rift | 16.7 d | week 2–3 | ✅ |
| All 50 collected | 47.8 d | week 8–12 | ⚠️ ~7 weeks |

Steady state settles at ~14 pulls/day, which is 4–5 Faint Rifts a day across
four sessions — the session rhythm §1 describes.

## The structural monetisation rule

Real money never buys a randomised outcome (§7.1). Rifts are bought only with
Flux you earn. Real money buys Prisms and cosmetics, and Prisms buy cosmetics
and nothing else. `tests/test_monetisation.gd` asserts this structurally: no
IAP product may grant Flux, Shards or a Rift, no cosmetic may carry an income
or odds field, and no ad placement may be an interstitial or a banner. That
test is the one that has to keep passing forever.

Odds disclosure (§7.2) is reachable in one tap from the Rifts screen and from
Settings, and lists every tier's exact percentage, each Rift's guarantee, and
the pity threshold in plain words.

## Ads and billing

The game-side logic is complete and runnable: all four rewarded placements,
their caps and cooldowns, boost application, and graceful failure when no ad is
available or the device is offline. The SDKs themselves sit behind a provider
interface — `Ads.AdProvider` and `IAP.BillingProvider`. A desktop or test run
gets the simulated provider; `AdMobProvider` and `PlayBillingProvider` are the
seams where the Android plugins wire in, and they stay dormant unless their
engine singleton is actually present. Nothing above those two files knows which
provider is running.

Neither was built or tested against a real device, since that needs an Android
export template and a Gradle build.

## Build order (spec §9)

| | | |
|---|---|---|
| M1 | Data & economy core | ✅ |
| M2 | Balance simulation | ✅ tuned, 6/7 targets |
| M3 | Sigil shader + gallery | ✅ 50 distinct sigils, verified numerically and by eye |
| M4 | Rift rolling | ✅ 1,000,000-roll distribution test |
| M5 | Core UI | ✅ five screens, save/load |
| M6 | Offline & time guard | ✅ |
| M7 | Ads | ✅ game-side; SDK behind a seam |
| M8 | IAP, shop, cosmetics, polish | ✅ game-side; billing behind a seam |

## Before shipping (spec §10)

Still to do, none of it code:

- Google Play developer account ($25, ID verification, 18+).
- The closed test: ≥12 real testers opted in continuously for 14 days before
  production access. **Start recruiting during M5, not after M8** — it is a
  two-week wall on the critical path.
- Confirm Jordan is supported for a Play merchant account before relying on IAP
  revenue; developer registration and payout eligibility are separate
  approvals.
- Host the privacy policy and replace `PRIVACY_POLICY_URL` in
  `ui/settings/settings_screen.gd`.
- Data safety form, target audience declaration, ads declaration.
- Re-check the current Play policy wording on odds disclosure at build time —
  policy changes, and the spec may be stale.
- Test on a low-end device and a slow connection.
