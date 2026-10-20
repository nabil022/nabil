# Obby Coin Rush (Roblox)

A **simulator + obby** hybrid. You click to earn coins in the hub, and the fastest way to get rich is to
beat obbies. Each obby pays a big coin reward **and** gives you a temporary **click boost** (x2 up to x10),
so you play obbies to make the simulator side go faster.

## Install (about 5 minutes)

1. Open **Roblox Studio** → **New** → **Baseplate**.
2. Create these 4 scripts. The names and locations must match exactly:

| File in this folder      | Create in Studio                                | Name it        |
|--------------------------|-------------------------------------------------|----------------|
| `GameConfig.lua`         | **ModuleScript** in `ReplicatedStorage`         | `GameConfig`   |
| `WorldBuilder.lua`       | **ModuleScript** in `ServerScriptService`       | `WorldBuilder` |
| `GameServer.server.lua`  | **Script** in `ServerScriptService`             | `GameServer`   |
| `ClientUI.client.lua`    | **LocalScript** in `StarterPlayer > StarterPlayerScripts` | `ClientUI` |

   For each one, delete the default `print("Hello world!")` and paste in the whole file.
3. To make progress save: **File → Game Settings → Security → Enable Studio Access to API Services**.
   You have to publish the place first (**File → Publish to Roblox**).
4. Press **Play**.

The scripts build the whole map when the server starts (hub, orb, portals, 4 obby courses), so you don't
need to build anything by hand. The default `SpawnLocation` is replaced with the game's own spawn.

## How to play

- **Earn coins:** click the 💰 button, click the giant gold orb, or pick up the spinning coins around the hub.
- **🛒 Shop:** Click Power, Auto Clicker, Obby Bonus, Longer Boosts, Speed and Jump. Speed and Jump make the obbies easier.
- **🏁 Obbies:** walk into a portal or use the Obbies menu. You need to touch every checkpoint to finish.
  Falling sends you back to your last checkpoint.
- **Rewards:** coins (x3 the first time you clear an obby) plus a click boost.
- **🔁 Rebirth:** resets coins and upgrades and gives +50% to all coin gains for good. It also unlocks the Hard obby (1 rebirth) and the Extreme obby (3 rebirths).

| Obby    | Reward | Boost         | Unlock      |
|---------|--------|---------------|-------------|
| Easy    | 150    | x2 for 60s    | —           |
| Medium  | 600    | x3 for 90s    | —           |
| Hard    | 2,500  | x5 for 120s   | 1 rebirth   |
| Extreme | 10,000 | x10 for 180s  | 3 rebirths  |

## Obstacle types

The courses are built from random stages (the seed is set in the config, so each course always comes out the same):
platform jumps, lava-strip floors, moving platforms, spinning laser bars, truss climbs, disappearing platforms
and narrow conveyor beams that push you backwards. They get harder with the obby's `Difficulty`.

## Customizing

Everything you'd want to balance is in **`GameConfig`**:
- `Config.Obbies` sets rewards, boosts, stage count, checkpoints, unlock requirements, and a `Seed`. Change the seed to get a new layout.
  To add a 5th obby, copy an entry and give it a new `Id`, and the game builds a portal and course for it.
- `Config.Upgrades` sets costs, growth and max levels.
- `RebirthBaseCost`, `RebirthCostGrowth` and `RebirthMultiplier` control rebirths.
- If you change the save format later, bump `DataStoreName` (for example to `_v2`) to start with fresh saves.

## Anti-cheat basics

- All coins are given by the server. Clicks are capped at 12 per second.
- To finish an obby you have to have touched every checkpoint, and you can't finish faster than the obby's `MinTime`.
- Upgrade and rebirth purchases are checked on the server.
