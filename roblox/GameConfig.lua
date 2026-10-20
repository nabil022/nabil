-- GameConfig (ModuleScript)
-- Put in: ReplicatedStorage  (name it exactly "GameConfig")
-- Shared by the server and the client. Tweak numbers here to balance the game.

local Config = {}

Config.GameName = "Obby Coin Rush"
Config.DataStoreName = "ObbyCoinRush_v1"
Config.AutosaveInterval = 60

-- Clicking ----------------------------------------------------------------
Config.MaxClicksPerSecond = 12 -- anti auto-clicker cap (server side)

-- Rebirths ----------------------------------------------------------------
Config.RebirthBaseCost = 5000
Config.RebirthCostGrowth = 3
Config.RebirthMultiplier = 0.5 -- each rebirth adds +50% to ALL coin gains

-- Character stats ---------------------------------------------------------
Config.BaseWalkSpeed = 16
Config.WalkSpeedPerLevel = 2
Config.BaseJumpPower = 50
Config.JumpPowerPerLevel = 4

-- Coins that randomly spawn around the hub
Config.CoinPickup = {
	MaxOnMap = 25,
	SpawnInterval = 2,
	ClickValueMultiplier = 5, -- a pickup is worth 5 clicks
}

-- Obby rewards ------------------------------------------------------------
Config.FirstClearBonus = 3 -- first time you beat an obby: x3 coins
Config.ObbyBonusPerLevel = 0.25 -- "Obby Bonus" upgrade: +25% per level
Config.BoostTimePerLevel = 0.15 -- "Longer Boosts" upgrade: +15% per level

-- Upgrades ----------------------------------------------------------------
Config.UpgradeOrder = { "ClickPower", "AutoClicker", "ObbyBonus", "BoostTime", "WalkSpeed", "JumpPower" }

Config.Upgrades = {
	ClickPower = {
		Name = "👆 Click Power",
		Description = "+1 coin per click",
		BaseCost = 25,
		CostGrowth = 1.45,
		Max = 200,
	},
	AutoClicker = {
		Name = "🤖 Auto Clicker",
		Description = "Clicks for you once per second",
		BaseCost = 400,
		CostGrowth = 1.9,
		Max = 15,
	},
	ObbyBonus = {
		Name = "🏁 Obby Bonus",
		Description = "+25% coins from beating obbies",
		BaseCost = 250,
		CostGrowth = 1.7,
		Max = 40,
	},
	BoostTime = {
		Name = "⏳ Longer Boosts",
		Description = "+15% obby boost duration",
		BaseCost = 500,
		CostGrowth = 1.8,
		Max = 10,
	},
	WalkSpeed = {
		Name = "👟 Speed",
		Description = "+2 walk speed (great for obbies!)",
		BaseCost = 150,
		CostGrowth = 1.8,
		Max = 10,
	},
	JumpPower = {
		Name = "🦘 Jump",
		Description = "+4 jump power (great for obbies!)",
		BaseCost = 300,
		CostGrowth = 2,
		Max = 5,
	},
}

-- Obbies ------------------------------------------------------------------
-- Beating an obby gives coins AND a temporary click multiplier ("boost").
-- Courses are generated from Seed, so the same seed = the same course.
Config.Obbies = {
	{
		Id = "Easy",
		Name = "Easy Obby",
		Color = Color3.fromRGB(80, 200, 95),
		Difficulty = 1,
		Stages = 8,
		CheckpointEvery = 2,
		Reward = 150,
		BoostMultiplier = 2,
		BoostDuration = 60,
		RebirthsRequired = 0,
		MinTime = 15, -- anti-cheat: can't finish faster than this
		Seed = 101,
	},
	{
		Id = "Medium",
		Name = "Medium Obby",
		Color = Color3.fromRGB(60, 150, 255),
		Difficulty = 2,
		Stages = 10,
		CheckpointEvery = 2,
		Reward = 600,
		BoostMultiplier = 3,
		BoostDuration = 90,
		RebirthsRequired = 0,
		MinTime = 25,
		Seed = 202,
	},
	{
		Id = "Hard",
		Name = "Hard Obby",
		Color = Color3.fromRGB(255, 140, 40),
		Difficulty = 3,
		Stages = 12,
		CheckpointEvery = 3,
		Reward = 2500,
		BoostMultiplier = 5,
		BoostDuration = 120,
		RebirthsRequired = 1,
		MinTime = 40,
		Seed = 303,
	},
	{
		Id = "Extreme",
		Name = "Extreme Obby",
		Color = Color3.fromRGB(200, 60, 255),
		Difficulty = 4,
		Stages = 14,
		CheckpointEvery = 3,
		Reward = 10000,
		BoostMultiplier = 10,
		BoostDuration = 180,
		RebirthsRequired = 3,
		MinTime = 60,
		Seed = 404,
	},
}

local obbyById = {}
for _, def in ipairs(Config.Obbies) do
	obbyById[def.Id] = def
end

function Config.GetObby(id)
	return obbyById[id]
end

-- Formulas ----------------------------------------------------------------
function Config.GetUpgradeCost(id, level)
	local def = Config.Upgrades[id]
	return math.floor(def.BaseCost * def.CostGrowth ^ level)
end

function Config.GetRebirthCost(rebirths)
	return math.floor(Config.RebirthBaseCost * Config.RebirthCostGrowth ^ rebirths)
end

function Config.GetRebirthMultiplier(rebirths)
	return 1 + rebirths * Config.RebirthMultiplier
end

-- data = { Upgrades = {...}, Rebirths = n }
function Config.GetClickValue(data, boostMultiplier)
	local clickPower = data.Upgrades.ClickPower or 0
	return (1 + clickPower) * Config.GetRebirthMultiplier(data.Rebirths) * (boostMultiplier or 1)
end

function Config.GetObbyReward(def, data)
	local bonus = 1 + Config.ObbyBonusPerLevel * (data.Upgrades.ObbyBonus or 0)
	return def.Reward * Config.GetRebirthMultiplier(data.Rebirths) * bonus
end

-- Formatting --------------------------------------------------------------
local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc" }

function Config.FormatNumber(n)
	n = math.floor(n)
	if n < 0 then
		return "-" .. Config.FormatNumber(-n)
	end
	if n < 1000 then
		return tostring(n)
	end
	local i = 1
	local v = n
	while v >= 1000 and i < #SUFFIXES do
		v = v / 1000
		i += 1
	end
	if v < 10 then
		return string.format("%.2f%s", v, SUFFIXES[i])
	elseif v < 100 then
		return string.format("%.1f%s", v, SUFFIXES[i])
	end
	return string.format("%.0f%s", v, SUFFIXES[i])
end

function Config.FormatTime(seconds)
	seconds = math.max(0, seconds)
	return string.format("%d:%02d", math.floor(seconds / 60), math.floor(seconds % 60))
end

function Config.FormatTimePrecise(seconds)
	seconds = math.max(0, seconds)
	return string.format("%d:%04.1f", math.floor(seconds / 60), seconds % 60)
end

return Config
