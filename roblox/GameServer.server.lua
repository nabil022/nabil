-- GameServer (Script)
-- Put in: ServerScriptService  (name it "GameServer")
-- Handles player data, coins, upgrades, rebirths, obby runs and rewards.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage:WaitForChild("GameConfig"))
local World = require(script.Parent:WaitForChild("WorldBuilder"))

Players.RespawnTime = 2

local GREEN = Color3.fromRGB(90, 255, 120)
local RED = Color3.fromRGB(255, 90, 90)
local GOLD = Color3.fromRGB(255, 210, 60)
local PURPLE = Color3.fromRGB(200, 120, 255)

---------------------------------------------------------------------------
-- Remotes
---------------------------------------------------------------------------
local Remotes = Instance.new("Folder")
Remotes.Name = "Remotes"

local function remote(className, name)
	local r = Instance.new(className)
	r.Name = name
	r.Parent = Remotes
	return r
end

local ClickEvent = remote("RemoteEvent", "Click")
local JoinObbyEvent = remote("RemoteEvent", "JoinObby")
local LeaveObbyEvent = remote("RemoteEvent", "LeaveObby")
local StateEvent = remote("RemoteEvent", "State")
local NotifyEvent = remote("RemoteEvent", "Notify")
local RewardEvent = remote("RemoteEvent", "Reward")
local GetStateFn = remote("RemoteFunction", "GetState")
local BuyUpgradeFn = remote("RemoteFunction", "BuyUpgrade")
local RebirthFn = remote("RemoteFunction", "Rebirth")

Remotes.Parent = ReplicatedStorage

---------------------------------------------------------------------------
-- Data
---------------------------------------------------------------------------
local dataStore
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.DataStoreName)
	end)
	if ok then
		dataStore = result
	else
		warn("[ObbyCoinRush] DataStores unavailable, progress will not save:", result)
	end
end

local function defaultData()
	return {
		Coins = 0,
		TotalCoins = 0,
		Rebirths = 0,
		Upgrades = {},
		ObbyBest = {},
		ObbyClears = {},
	}
end

local function reconcile(data)
	local base = defaultData()
	if type(data) ~= "table" then
		return base
	end
	for key, value in pairs(base) do
		if data[key] == nil then
			data[key] = value
		end
	end
	return data
end

local function dataKey(player)
	return "Player_" .. player.UserId
end

-- returns data, loadedOk
local function loadData(player)
	if not dataStore then
		return defaultData(), false
	end
	for attempt = 1, 3 do
		local ok, result = pcall(function()
			return dataStore:GetAsync(dataKey(player))
		end)
		if ok then
			return reconcile(result), true
		end
		warn("[ObbyCoinRush] Load failed for", player.Name, result)
		if RunService:IsStudio() then
			break -- usually "API access disabled", retrying won't help
		end
		task.wait(attempt)
	end
	return defaultData(), false
end

local profiles = {}

local function saveData(player)
	local profile = profiles[player]
	if not profile or not profile.CanSave or not dataStore then
		return
	end
	local data = profile.Data
	local ok, err = pcall(function()
		dataStore:UpdateAsync(dataKey(player), function()
			return data
		end)
	end)
	if not ok then
		warn("[ObbyCoinRush] Save failed for", player.Name, err)
	end
end

---------------------------------------------------------------------------
-- State helpers
---------------------------------------------------------------------------
local courses, hubSpawn -- filled in once the world is built

local function now()
	return workspace:GetServerTimeNow()
end

local function notify(player, text, color)
	NotifyEvent:FireClient(player, text, color or Color3.new(1, 1, 1))
end

local function getBoost(profile)
	if profile.Boost.End > now() then
		return profile.Boost.Mult
	end
	return 1
end

local function clickValue(profile)
	return Config.GetClickValue(profile.Data, getBoost(profile))
end

local function buildState(profile)
	local session = profile.Session
	local course = session.Obby and courses[session.Obby]
	local data = profile.Data
	return {
		Coins = data.Coins,
		TotalCoins = data.TotalCoins,
		Rebirths = data.Rebirths,
		Upgrades = data.Upgrades,
		ObbyBest = data.ObbyBest,
		ObbyClears = data.ObbyClears,
		BoostMult = profile.Boost.Mult,
		BoostEnd = profile.Boost.End,
		Obby = session.Obby,
		Checkpoint = session.Checkpoint,
		CheckpointCount = course and #course.Checkpoints or 0,
		ObbyStart = session.StartTime,
	}
end

local function sendState(player)
	local profile = profiles[player]
	if not profile then
		return
	end
	profile.Dirty = false
	StateEvent:FireClient(player, buildState(profile))
end

local function addCoins(player, amount)
	local profile = profiles[player]
	if not profile then
		return 0
	end
	amount = math.floor(amount)
	profile.Data.Coins += amount
	if amount > 0 then
		profile.Data.TotalCoins += amount
	end
	profile.Leaderstats.Coins.Value = profile.Data.Coins
	profile.Dirty = true
	return amount
end

local function applyStats(player)
	local profile = profiles[player]
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not profile or not humanoid then
		return
	end
	local upgrades = profile.Data.Upgrades
	humanoid.WalkSpeed = Config.BaseWalkSpeed + Config.WalkSpeedPerLevel * (upgrades.WalkSpeed or 0)
	humanoid.UseJumpPower = true
	humanoid.JumpPower = Config.BaseJumpPower + Config.JumpPowerPerLevel * (upgrades.JumpPower or 0)
end

local function teleport(player, cframe)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return
	end
	root.AssemblyLinearVelocity = Vector3.zero
	character:PivotTo(cframe + Vector3.new(0, 4, 0))
end

local function checkpointCFrame(obbyId, index)
	local course = courses[obbyId]
	return course.Checkpoints[index] or course.Start
end

---------------------------------------------------------------------------
-- Clicking
---------------------------------------------------------------------------
local function handleClick(player)
	local profile = profiles[player]
	if not profile then
		return nil
	end
	local t = os.clock()
	if t - profile.ClickWindowStart >= 1 then
		profile.ClickWindowStart = t
		profile.ClickCount = 0
	end
	profile.ClickCount += 1
	if profile.ClickCount > Config.MaxClicksPerSecond then
		return nil
	end
	return addCoins(player, clickValue(profile))
end

ClickEvent.OnServerEvent:Connect(handleClick)

---------------------------------------------------------------------------
-- Shop / rebirth
---------------------------------------------------------------------------
BuyUpgradeFn.OnServerInvoke = function(player, id)
	local profile = profiles[player]
	local def = type(id) == "string" and Config.Upgrades[id]
	if not profile or not def then
		return false, "Unknown upgrade"
	end
	local level = profile.Data.Upgrades[id] or 0
	if level >= def.Max then
		return false, "Already max level!"
	end
	local cost = Config.GetUpgradeCost(id, level)
	if profile.Data.Coins < cost then
		return false, "Not enough coins! Need 💰" .. Config.FormatNumber(cost)
	end
	addCoins(player, -cost)
	profile.Data.Upgrades[id] = level + 1
	applyStats(player)
	sendState(player)
	return true, def.Name .. " is now level " .. (level + 1) .. "!"
end

RebirthFn.OnServerInvoke = function(player)
	local profile = profiles[player]
	if not profile then
		return false, "Still loading..."
	end
	local data = profile.Data
	local cost = Config.GetRebirthCost(data.Rebirths)
	if data.Coins < cost then
		return false, "You need 💰" .. Config.FormatNumber(cost) .. " to rebirth!"
	end
	data.Coins = 0
	data.Upgrades = {}
	data.Rebirths += 1
	profile.Leaderstats.Coins.Value = 0
	profile.Leaderstats.Rebirths.Value = data.Rebirths
	applyStats(player)
	sendState(player)
	return true, string.format("🔁 REBIRTH %d! All coins are now x%.1f", data.Rebirths, Config.GetRebirthMultiplier(data.Rebirths))
end

GetStateFn.OnServerInvoke = function(player)
	local profile = profiles[player]
	return profile and buildState(profile) or nil
end

---------------------------------------------------------------------------
-- Obbies
---------------------------------------------------------------------------
local function startObby(player, id)
	local profile = profiles[player]
	local def = type(id) == "string" and Config.GetObby(id)
	if not profile or not def then
		return
	end
	if profile.Data.Rebirths < def.RebirthsRequired then
		notify(player, string.format("🔒 %s needs %d rebirth(s)!", def.Name, def.RebirthsRequired), RED)
		return
	end
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return
	end
	local session = profile.Session
	session.Obby = id
	session.Checkpoint = 0
	session.StartTime = now()
	teleport(player, courses[id].Start)
	notify(player, "🏁 " .. def.Name .. " started! Reach the gold finish pad.", def.Color)
	sendState(player)
end

local function leaveObby(player)
	local profile = profiles[player]
	if not profile or not profile.Session.Obby then
		return
	end
	profile.Session.Obby = nil
	profile.Session.Checkpoint = 0
	teleport(player, hubSpawn)
	sendState(player)
end

local function reachCheckpoint(player, id, index)
	local profile = profiles[player]
	if not profile or profile.Session.Obby ~= id or index <= profile.Session.Checkpoint then
		return
	end
	profile.Session.Checkpoint = index
	notify(player, string.format("✅ Checkpoint %d/%d", index, #courses[id].Checkpoints), GREEN)
	sendState(player)
end

local function finishObby(player, id)
	local profile = profiles[player]
	if not profile or profile.Session.Obby ~= id then
		return
	end
	local def = Config.GetObby(id)
	local session = profile.Session
	local t = now()

	if session.Checkpoint < #courses[id].Checkpoints then
		if t - session.LastWarn > 3 then
			session.LastWarn = t
			notify(player, "⚠️ You skipped a checkpoint! Touch them all to finish.", RED)
		end
		return
	end
	local elapsed = t - session.StartTime
	if elapsed < def.MinTime then
		return -- too fast to be legit
	end

	session.Obby = nil
	session.Checkpoint = 0

	-- Coins
	local data = profile.Data
	local firstClear = (data.ObbyClears[id] or 0) == 0
	local reward = Config.GetObbyReward(def, data)
	if firstClear then
		reward *= Config.FirstClearBonus
	end
	reward = addCoins(player, reward)
	data.ObbyClears[id] = (data.ObbyClears[id] or 0) + 1

	local best = data.ObbyBest[id]
	local newBest = best == nil or elapsed < best
	if newBest then
		data.ObbyBest[id] = elapsed
	end

	-- Click boost: a stronger boost replaces a weaker one, equal ones stack time
	local boost = profile.Boost
	local duration = def.BoostDuration * (1 + Config.BoostTimePerLevel * (data.Upgrades.BoostTime or 0))
	if boost.End <= t then
		boost.Mult = def.BoostMultiplier
		boost.End = t + duration
	elseif def.BoostMultiplier >= boost.Mult then
		boost.Mult = def.BoostMultiplier
		boost.End += duration
	else
		boost.End += duration * 0.5
	end

	notify(player, string.format("🏆 %s cleared in %s!%s", def.Name, Config.FormatTimePrecise(elapsed),
		newBest and " NEW BEST!" or ""), GOLD)
	notify(player, string.format("💰 +%s coins%s", Config.FormatNumber(reward),
		firstClear and string.format(" (FIRST CLEAR x%d!)", Config.FirstClearBonus) or ""), GOLD)
	notify(player, string.format("⚡ x%d click boost for %s!", boost.Mult, Config.FormatTime(boost.End - t)), PURPLE)
	RewardEvent:FireClient(player, reward, "obby")
	sendState(player)

	task.delay(2.5, function()
		local p = profiles[player]
		if p and p.Session.Obby == nil then
			teleport(player, hubSpawn)
		end
	end)
end

local function fellOff(player, id)
	local profile = profiles[player]
	if profile and profile.Session.Obby == id then
		teleport(player, checkpointCFrame(id, profile.Session.Checkpoint))
	else
		teleport(player, hubSpawn)
	end
end

JoinObbyEvent.OnServerEvent:Connect(startObby)
LeaveObbyEvent.OnServerEvent:Connect(leaveObby)

---------------------------------------------------------------------------
-- Build the world
---------------------------------------------------------------------------
local worldInfo = World.Build({
	Portal = startObby,
	Checkpoint = reachCheckpoint,
	Finish = finishObby,
	Void = fellOff,
	CoinPickup = function(player)
		local profile = profiles[player]
		if not profile then
			return
		end
		local amount = addCoins(player, clickValue(profile) * Config.CoinPickup.ClickValueMultiplier)
		RewardEvent:FireClient(player, amount, "pickup")
	end,
	OrbClick = function(player)
		local amount = handleClick(player)
		if amount then
			RewardEvent:FireClient(player, amount, "click")
		end
	end,
})
courses = worldInfo.Courses
hubSpawn = worldInfo.HubSpawn

---------------------------------------------------------------------------
-- Players
---------------------------------------------------------------------------
local function onCharacterAdded(player, character)
	character:WaitForChild("Humanoid", 10)
	character:WaitForChild("HumanoidRootPart", 10)
	applyStats(player)
	local profile = profiles[player]
	if profile and profile.Session.Obby then
		task.wait(0.1)
		teleport(player, checkpointCFrame(profile.Session.Obby, profile.Session.Checkpoint))
	end
end

local function onPlayerAdded(player)
	local data, loaded = loadData(player)
	if not player.Parent then
		return -- left while loading
	end

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = data.Coins
	coins.Parent = leaderstats
	local rebirths = Instance.new("IntValue")
	rebirths.Name = "Rebirths"
	rebirths.Value = data.Rebirths
	rebirths.Parent = leaderstats
	leaderstats.Parent = player

	profiles[player] = {
		Data = data,
		CanSave = loaded,
		Leaderstats = { Coins = coins, Rebirths = rebirths },
		Session = { Obby = nil, Checkpoint = 0, StartTime = 0, LastWarn = 0 },
		Boost = { Mult = 1, End = 0 },
		ClickCount = 0,
		ClickWindowStart = 0,
		Dirty = true,
	}

	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)
	if player.Character then
		task.spawn(onCharacterAdded, player, player.Character)
	end

	sendState(player)
	notify(player, "👋 Welcome to " .. Config.GameName .. "! Click for coins, beat obbies for big rewards + boosts!", GOLD)
	if not loaded then
		notify(player, "⚠️ Data couldn't load — progress won't save this session.", RED)
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	saveData(player)
	profiles[player] = nil
end)

game:BindToClose(function()
	for player in pairs(profiles) do
		task.spawn(saveData, player)
	end
	task.wait(RunService:IsStudio() and 1 or 3)
end)

---------------------------------------------------------------------------
-- Loops: auto clicker, state sync, autosave
---------------------------------------------------------------------------
task.spawn(function()
	local elapsed = 0
	while true do
		elapsed += task.wait(0.2)
		local autoTick = elapsed >= 1
		if autoTick then
			elapsed -= 1
		end
		for player, profile in pairs(profiles) do
			if autoTick then
				local level = profile.Data.Upgrades.AutoClicker or 0
				if level > 0 then
					addCoins(player, clickValue(profile) * level)
				end
			end
			if profile.Dirty then
				sendState(player)
			end
		end
	end
end)

task.spawn(function()
	while true do
		task.wait(Config.AutosaveInterval)
		for player in pairs(profiles) do
			task.spawn(saveData, player)
		end
	end
end)
