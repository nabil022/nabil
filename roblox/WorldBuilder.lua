-- WorldBuilder (ModuleScript)
-- Put in: ServerScriptService  (name it exactly "WorldBuilder")
-- Builds the whole map in code: the hub, the click orb, coin pickups, portals
-- and every obby course. GameServer requires this and handles the gameplay.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("GameConfig"))

local World = {}

local KILL_COLOR = Color3.fromRGB(255, 40, 40)
local HUB_SIZE = 240
local COURSE_HEIGHT = 120
local COURSE_START_Z = 150
local COURSE_SPACING_X = 120

-- Animated things, updated every frame
local movers = {} -- [part] = { Base, Axis, Amplitude, Speed, Phase }
local spinners = {} -- [part] = { Pivot, Speed, Offset }
local movingKillers = {} -- [part] = true

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function part(parent, size, cframe, color, material, extra)
	local p = Instance.new("Part")
	p.Anchored = true
	p.Size = size
	p.CFrame = cframe
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if extra then
		for key, value in pairs(extra) do
			p[key] = value
		end
	end
	p.Parent = parent
	return p
end

local function humanoidFromHit(hit)
	local model = hit:FindFirstAncestorOfClass("Model")
	if not model then
		return nil
	end
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return nil
	end
	return humanoid, Players:GetPlayerFromCharacter(model)
end

-- Calls fn(player) when a living player touches the part, with a per-player cooldown
local function onPlayerTouch(p, cooldown, fn)
	local last = setmetatable({}, { __mode = "k" })
	p.Touched:Connect(function(hit)
		local humanoid, player = humanoidFromHit(hit)
		if not player or humanoid.Health <= 0 then
			return
		end
		local now = os.clock()
		if last[player] and now - last[player] < cooldown then
			return
		end
		last[player] = now
		fn(player)
	end)
end

local function killFromHit(hit)
	local humanoid = humanoidFromHit(hit)
	if humanoid and humanoid.Health > 0 then
		humanoid.Health = 0
	end
end

local function makeKill(p)
	p.Color = KILL_COLOR
	p.Material = Enum.Material.Neon
	p.Touched:Connect(killFromHit)
	return p
end

local function addMover(p, axis, amplitude, speed, phase)
	movers[p] = { Base = p.CFrame, Axis = axis, Amplitude = amplitude, Speed = speed, Phase = phase or 0 }
end

local function addSpinner(p, pivot, speed, offset)
	spinners[p] = { Pivot = pivot, Speed = speed, Offset = offset or CFrame.identity }
end

local function makeFading(p, fadeTime)
	local busy = false
	p.Touched:Connect(function(hit)
		if busy or not humanoidFromHit(hit) then
			return
		end
		busy = true
		task.spawn(function()
			local steps = 10
			for i = 1, steps do
				p.Transparency = i / steps * 0.8
				task.wait(fadeTime / steps)
			end
			p.CanCollide = false
			p.Transparency = 1
			task.wait(2.5)
			p.CanCollide = true
			p.Transparency = 0
			busy = false
		end)
	end)
end

local function billboard(adornee, lines, color, width, height, offsetY)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromScale(width, height) -- in studs
	gui.StudsOffset = Vector3.new(0, offsetY or 3, 0)
	gui.MaxDistance = 250
	gui.Adornee = adornee
	gui.Parent = adornee

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = color or Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0
	label.Text = lines
	label.Parent = gui
	return label
end

---------------------------------------------------------------------------
-- Obby stages
-- Every stage gets `pos` = top-centre of where the previous section ENDS
-- (courses run along +Z) and returns the same for its own end.
---------------------------------------------------------------------------
local Stages = {}

local function clampX(ctx, x)
	return math.clamp(x, ctx.LaneX - 14, ctx.LaneX + 14)
end

local function tint(ctx, i)
	local h, s, v = ctx.Color:ToHSV()
	return Color3.fromHSV(h, s * 0.65, i % 2 == 0 and v or v * 0.8)
end

-- Gaps between floating platforms
function Stages.Jumps(ctx, pos)
	local d, rng = ctx.Difficulty, ctx.Rng
	local size = 9 - d * 1.25
	for i = 1, rng:NextInteger(3, 5) do
		local gap = rng:NextNumber(2.5 + d, 4.5 + d)
		local top = pos.Y + rng:NextNumber(-1, 1.5)
		local x = clampX(ctx, pos.X + rng:NextNumber(-4, 4))
		local z = pos.Z + gap + size / 2
		part(ctx.Folder, Vector3.new(size, 1, size), CFrame.new(x, top - 0.5, z), tint(ctx, i))
		pos = Vector3.new(x, top, z + size / 2)
	end
	return pos
end

-- A floor covered in lava strips to hop over
function Stages.KillFloor(ctx, pos)
	local d = ctx.Difficulty
	local length = 28 + d * 4
	local z0 = pos.Z + 3
	part(ctx.Folder, Vector3.new(12, 1, length), CFrame.new(pos.X, pos.Y - 0.5, z0 + length / 2),
		Color3.fromRGB(70, 70, 80), Enum.Material.Concrete)
	local strips = 2 + d
	local spacing = length / (strips + 1)
	for i = 1, strips do
		local depth = 1 + d * 0.4
		makeKill(part(ctx.Folder, Vector3.new(12, 1.2, depth), CFrame.new(pos.X, pos.Y + 0.6, z0 + spacing * i), KILL_COLOR))
	end
	return Vector3.new(pos.X, pos.Y, z0 + length)
end

-- Moving platforms across a big gap
function Stages.Mover(ctx, pos)
	local d, rng = ctx.Difficulty, ctx.Rng
	local gap = 20 + d * 4
	local size = 8 - d * 0.75
	if rng:NextNumber() < 0.5 then
		-- one platform sliding forward and back
		local p = part(ctx.Folder, Vector3.new(size, 1, size), CFrame.new(pos.X, pos.Y - 0.5, pos.Z + gap / 2),
			ctx.Color, Enum.Material.Neon)
		addMover(p, Vector3.zAxis, gap / 2 - size / 2 - 2, 6 + d * 2, rng:NextNumber(0, math.pi * 2))
	else
		-- two platforms sliding side to side, out of sync
		for i = 1, 2 do
			local p = part(ctx.Folder, Vector3.new(size, 1, size), CFrame.new(pos.X, pos.Y - 0.5, pos.Z + gap * i / 3),
				ctx.Color, Enum.Material.Neon)
			addMover(p, Vector3.xAxis, 8, 5 + d * 2, i * math.pi)
		end
	end
	part(ctx.Folder, Vector3.new(8, 1, 8), CFrame.new(pos.X, pos.Y - 0.5, pos.Z + gap + 4), tint(ctx, 0))
	return Vector3.new(pos.X, pos.Y, pos.Z + gap + 8)
end

-- A round platform with spinning laser bars to jump over
function Stages.Spinner(ctx, pos)
	local d = ctx.Difficulty
	local radius = 11
	local center = Vector3.new(pos.X, pos.Y, pos.Z + 3 + radius)
	part(ctx.Folder, Vector3.new(1, radius * 2, radius * 2),
		CFrame.new(center - Vector3.new(0, 0.5, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color3.fromRGB(60, 60, 70), Enum.Material.DiamondPlate, { Shape = Enum.PartType.Cylinder })
	local bars = d >= 3 and 2 or 1
	for i = 1, bars do
		local bar = part(ctx.Folder, Vector3.new(radius * 2 - 1, 1, 1), CFrame.new(center), KILL_COLOR, Enum.Material.Neon,
			{ CanCollide = false })
		addSpinner(bar, CFrame.new(center + Vector3.new(0, 1.5, 0)) * CFrame.Angles(0, i * math.pi / 2, 0), 1.2 + d * 0.4)
		movingKillers[bar] = true
	end
	return Vector3.new(pos.X, pos.Y, center.Z + radius)
end

-- Climb a truss up to a higher platform
function Stages.Truss(ctx, pos)
	local d = ctx.Difficulty
	local height = 2 * math.floor((10 + d * 4) / 2) -- truss sizes must be even
	part(ctx.Folder, Vector3.new(10, 1, 8), CFrame.new(pos.X, pos.Y - 0.5, pos.Z + 3 + 4), tint(ctx, 1))
	local trussZ = pos.Z + 3 + 8 + 1
	local truss = Instance.new("TrussPart")
	truss.Anchored = true
	truss.Size = Vector3.new(2, height, 2)
	truss.CFrame = CFrame.new(pos.X, pos.Y + height / 2, trussZ)
	truss.Color = Color3.fromRGB(120, 120, 130)
	truss.Parent = ctx.Folder
	local top = pos.Y + height
	part(ctx.Folder, Vector3.new(10, 1, 10), CFrame.new(pos.X, top - 0.5, trussZ + 1 + 5), tint(ctx, 2))
	return Vector3.new(pos.X, top, trussZ + 11)
end

-- Platforms that vanish shortly after you step on them
function Stages.Fading(ctx, pos)
	local d, rng = ctx.Difficulty, ctx.Rng
	local size = 7 - d * 0.5
	for _ = 1, rng:NextInteger(4, 6) do
		local gap = rng:NextNumber(2 + d * 0.5, 3.5 + d * 0.75)
		local x = clampX(ctx, pos.X + rng:NextNumber(-3, 3))
		local z = pos.Z + gap + size / 2
		local p = part(ctx.Folder, Vector3.new(size, 1, size), CFrame.new(x, pos.Y - 0.5, z),
			Color3.fromRGB(255, 180, 60), Enum.Material.Neon)
		makeFading(p, 1.4 - d * 0.2)
		pos = Vector3.new(x, pos.Y, z + size / 2)
	end
	part(ctx.Folder, Vector3.new(8, 1, 6), CFrame.new(pos.X, pos.Y - 0.5, pos.Z + 3 + 3), tint(ctx, 0))
	return Vector3.new(pos.X, pos.Y, pos.Z + 9)
end

-- A narrow conveyor beam that pushes you backwards
function Stages.Beam(ctx, pos)
	local d = ctx.Difficulty
	local length = 30 + d * 5
	local width = math.max(1.8, 5 - d * 0.8)
	local beam = part(ctx.Folder, Vector3.new(width, 1, length), CFrame.new(pos.X, pos.Y - 0.5, pos.Z + 3 + length / 2),
		Color3.fromRGB(90, 200, 255), Enum.Material.Glass)
	beam.AssemblyLinearVelocity = Vector3.new(0, 0, -(3 + d * 2)) -- acts like a conveyor
	return Vector3.new(pos.X, pos.Y, pos.Z + 3 + length)
end

local STAGE_POOL = { "Jumps", "KillFloor", "Mover", "Spinner", "Truss", "Fading", "Beam" }

---------------------------------------------------------------------------
-- Courses
---------------------------------------------------------------------------
local function buildCourse(parent, def, origin, callbacks)
	local folder = Instance.new("Folder")
	folder.Name = def.Id .. "Obby"
	folder.Parent = parent

	local ctx = {
		Folder = folder,
		Rng = Random.new(def.Seed),
		Difficulty = def.Difficulty,
		LaneX = origin.X,
		Color = def.Color,
	}

	-- Start platform
	local start = part(folder, Vector3.new(16, 1, 16), CFrame.new(origin - Vector3.new(0, 0.5, 0)),
		Color3.fromRGB(235, 235, 235), Enum.Material.Slate)
	billboard(start, def.Name .. "\nReach the gold pad!", def.Color, 16, 4, 6)
	local startCFrame = CFrame.lookAt(origin, origin + Vector3.zAxis)

	local checkpoints = {}
	local pos = Vector3.new(origin.X, origin.Y, origin.Z + 8)
	local previous
	for i = 1, def.Stages do
		local kind
		repeat
			kind = STAGE_POOL[ctx.Rng:NextInteger(1, #STAGE_POOL)]
		until kind ~= previous
		previous = kind
		pos = Stages[kind](ctx, pos)

		if i % def.CheckpointEvery == 0 and i < def.Stages then
			local index = #checkpoints + 1
			local center = Vector3.new(pos.X, pos.Y, pos.Z + 4 + 6)
			part(folder, Vector3.new(12, 1, 12), CFrame.new(center - Vector3.new(0, 0.5, 0)),
				Color3.fromRGB(220, 220, 220), Enum.Material.Slate)
			local pad = part(folder, Vector3.new(6, 0.4, 6), CFrame.new(center + Vector3.new(0, 0.2, 0)),
				Color3.fromRGB(60, 255, 120), Enum.Material.Neon)
			billboard(pad, "Checkpoint " .. index, Color3.fromRGB(120, 255, 150), 10, 2.5, 4)
			onPlayerTouch(pad, 1, function(player)
				callbacks.Checkpoint(player, def.Id, index)
			end)
			checkpoints[index] = CFrame.lookAt(center, center + Vector3.zAxis)
			pos = Vector3.new(pos.X, pos.Y, center.Z + 6)
		end
	end

	-- Finish
	local finishCenter = Vector3.new(pos.X, pos.Y, pos.Z + 4 + 10)
	part(folder, Vector3.new(20, 1, 20), CFrame.new(finishCenter - Vector3.new(0, 0.5, 0)),
		Color3.fromRGB(255, 215, 80), Enum.Material.Marble)
	local finishPad = part(folder, Vector3.new(10, 0.4, 10), CFrame.new(finishCenter + Vector3.new(0, 0.2, 0)),
		Color3.fromRGB(255, 200, 0), Enum.Material.Neon)
	billboard(finishPad, "🏆 FINISH 🏆", Color3.fromRGB(255, 220, 60), 14, 3.5, 6)
	onPlayerTouch(finishPad, 1, function(player)
		callbacks.Finish(player, def.Id)
	end)
	local pole = part(folder, Vector3.new(0.6, 14, 0.6), CFrame.new(finishCenter + Vector3.new(8, 7, 8)),
		Color3.fromRGB(230, 230, 230), Enum.Material.Metal)
	part(folder, Vector3.new(0.2, 4, 6), pole.CFrame * CFrame.new(0, 5, -3), def.Color, Enum.Material.Fabric)

	-- Invisible catcher under the course: falling sends you back to your checkpoint
	local length = finishCenter.Z - origin.Z
	local void = part(folder, Vector3.new(400, 6, length + 200), CFrame.new(origin.X, origin.Y - 50, origin.Z + length / 2),
		Color3.new(0, 0, 0), Enum.Material.SmoothPlastic, { Transparency = 1, CanCollide = false })
	onPlayerTouch(void, 1, function(player)
		callbacks.Void(player, def.Id)
	end)

	return {
		Start = startCFrame,
		Checkpoints = checkpoints,
		Finish = CFrame.new(finishCenter),
	}
end

---------------------------------------------------------------------------
-- Hub
---------------------------------------------------------------------------
local function buildPortal(parent, def, position, callbacks)
	local frameColor = Color3.fromRGB(55, 55, 65)
	part(parent, Vector3.new(18, 1, 10), CFrame.new(position + Vector3.new(0, 0.5, 0)), def.Color, Enum.Material.Slate)
	for _, side in ipairs({ -7, 7 }) do
		part(parent, Vector3.new(2, 16, 2), CFrame.new(position + Vector3.new(side, 9, 0)), frameColor, Enum.Material.Concrete)
	end
	local beam = part(parent, Vector3.new(16, 2, 2), CFrame.new(position + Vector3.new(0, 18, 0)), frameColor, Enum.Material.Concrete)
	local field = part(parent, Vector3.new(12, 16, 1), CFrame.new(position + Vector3.new(0, 9, 0)), def.Color, Enum.Material.Neon,
		{ Transparency = 0.45, CanCollide = false })

	local info = string.format("%s\n💰 %s  ⚡ x%d boost", def.Name, Config.FormatNumber(def.Reward), def.BoostMultiplier)
	if def.RebirthsRequired > 0 then
		info ..= string.format("\n🔒 Needs %d rebirth%s", def.RebirthsRequired, def.RebirthsRequired == 1 and "" or "s")
	end
	billboard(beam, info, def.Color, 16, def.RebirthsRequired > 0 and 6 or 4.5, 4)

	onPlayerTouch(field, 2, function(player)
		callbacks.Portal(player, def.Id)
	end)
end

local function buildHub(parent, callbacks)
	local floorTop = 0.5

	part(parent, Vector3.new(HUB_SIZE, 1, HUB_SIZE), CFrame.new(0, 0, 0), Color3.fromRGB(95, 185, 85), Enum.Material.Grass)
	part(parent, Vector3.new(1, 70, 70), CFrame.new(0, 0.05, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color3.fromRGB(200, 200, 205), Enum.Material.Slate, { Shape = Enum.PartType.Cylinder })

	-- Spawn
	for _, item in ipairs(workspace:GetDescendants()) do
		if item:IsA("SpawnLocation") then
			item:Destroy()
		end
	end
	local spawn = Instance.new("SpawnLocation")
	spawn.Anchored = true
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.CFrame = CFrame.new(0, floorTop, 40)
	spawn.Color = Color3.fromRGB(255, 255, 255)
	spawn.Material = Enum.Material.Neon
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = parent

	-- Click orb
	part(parent, Vector3.new(4, 12, 12), CFrame.new(0, floorTop + 2, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color3.fromRGB(70, 60, 50), Enum.Material.Marble, { Shape = Enum.PartType.Cylinder })
	local orb = part(parent, Vector3.new(12, 12, 12), CFrame.new(0, floorTop + 11, 0), Color3.fromRGB(255, 200, 30),
		Enum.Material.Neon, { Shape = Enum.PartType.Ball })
	addMover(orb, Vector3.yAxis, 1, 1)
	local light = Instance.new("PointLight")
	light.Color = orb.Color
	light.Range = 30
	light.Brightness = 2
	light.Parent = orb
	billboard(orb, "CLICK ME! 💰", Color3.fromRGB(255, 220, 60), 12, 3, 9)
	local detector = Instance.new("ClickDetector")
	detector.MaxActivationDistance = 60
	detector.Parent = orb
	detector.MouseClick:Connect(function(player)
		callbacks.OrbClick(player)
	end)

	-- Portals
	local count = #Config.Obbies
	for i, def in ipairs(Config.Obbies) do
		local x = (i - (count + 1) / 2) * 36
		buildPortal(parent, def, Vector3.new(x, floorTop, -60), callbacks)
	end

	-- Help sign
	local signPos = Vector3.new(32, 8, 28)
	local sign = part(parent, Vector3.new(20, 10, 1), CFrame.lookAt(signPos, Vector3.new(0, 8, 40)),
		Color3.fromRGB(40, 40, 55), Enum.Material.Wood)
	part(parent, Vector3.new(1, 8, 1), CFrame.new(signPos.X, 3.5, signPos.Z), Color3.fromRGB(90, 60, 40), Enum.Material.Wood)
	local surface = Instance.new("SurfaceGui")
	surface.Face = Enum.NormalId.Front
	surface.CanvasSize = Vector2.new(800, 400)
	surface.Parent = sign
	local text = Instance.new("TextLabel")
	text.Size = UDim2.fromScale(1, 1)
	text.BackgroundTransparency = 1
	text.Font = Enum.Font.FredokaOne
	text.TextScaled = true
	text.TextColor3 = Color3.new(1, 1, 1)
	text.Text = "🪙 " .. Config.GameName .. " 🪙\n\n💰 Click the orb or the button to earn coins\n"
		.. "🏁 Beat obbies for HUGE coins + click BOOSTS\n🛒 Buy upgrades  •  🔁 Rebirth for multipliers"
	text.Parent = surface

	-- Trees around the edge
	local rng = Random.new(7)
	for i = 1, 18 do
		local angle = i / 18 * math.pi * 2
		local radius = rng:NextNumber(92, 108)
		local base = Vector3.new(math.cos(angle) * radius, floorTop, math.sin(angle) * radius)
		local trunkHeight = rng:NextNumber(8, 14)
		part(parent, Vector3.new(2.5, trunkHeight, 2.5), CFrame.new(base + Vector3.new(0, trunkHeight / 2, 0)),
			Color3.fromRGB(110, 75, 45), Enum.Material.Wood)
		local leaves = rng:NextNumber(9, 14)
		part(parent, Vector3.new(leaves, leaves, leaves), CFrame.new(base + Vector3.new(0, trunkHeight + leaves / 3, 0)),
			Color3.fromRGB(50, 150 + rng:NextInteger(0, 50), 60), Enum.Material.Grass, { Shape = Enum.PartType.Ball })
	end

	return CFrame.lookAt(Vector3.new(0, floorTop + 1, 40), Vector3.new(0, floorTop + 1, 0))
end

local function startCoinSpawner(parent, callbacks)
	local folder = Instance.new("Folder")
	folder.Name = "Coins"
	folder.Parent = parent
	local count = 0
	local rng = Random.new()

	local function spawnCoin()
		local x, z
		repeat
			x = rng:NextNumber(-100, 100)
			z = rng:NextNumber(-35, 100)
		until math.abs(x) > 12 or math.abs(z) > 12 -- keep clear of the orb

		local coin = part(folder, Vector3.new(0.6, 3, 3), CFrame.new(x, 2.5, z), Color3.fromRGB(255, 205, 40),
			Enum.Material.Neon, { Shape = Enum.PartType.Cylinder, CanCollide = false })
		addSpinner(coin, CFrame.new(x, 2.5, z), 2)
		count += 1

		local collected = false
		coin.Touched:Connect(function(hit)
			if collected then
				return
			end
			local humanoid, player = humanoidFromHit(hit)
			if not player or humanoid.Health <= 0 then
				return
			end
			collected = true
			spinners[coin] = nil
			coin:Destroy()
			count -= 1
			callbacks.CoinPickup(player)
		end)
	end

	task.spawn(function()
		while true do
			if count < Config.CoinPickup.MaxOnMap then
				spawnCoin()
			end
			task.wait(Config.CoinPickup.SpawnInterval)
		end
	end)
end

local function startAnimations(ignoreFolder)
	RunService.Heartbeat:Connect(function()
		local t = os.clock()
		for p, m in pairs(movers) do
			local w = m.Speed / m.Amplitude -- so the top speed is m.Speed studs/s
			local angle = w * t + m.Phase
			p.CFrame = m.Base + m.Axis * (m.Amplitude * math.sin(angle))
			-- give the anchored part a velocity so players standing on it ride along
			p.AssemblyLinearVelocity = m.Axis * (m.Amplitude * w * math.cos(angle))
		end
		for p, s in pairs(spinners) do
			p.CFrame = s.Pivot * CFrame.Angles(0, t * s.Speed, 0) * s.Offset
		end
	end)

	-- Spinning lasers move into players, so check overlaps instead of relying on Touched
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { ignoreFolder }
	task.spawn(function()
		while true do
			task.wait(0.1)
			for killer in pairs(movingKillers) do
				for _, hit in ipairs(workspace:GetPartsInPart(killer, params)) do
					killFromHit(hit)
				end
			end
		end
	end)
end

---------------------------------------------------------------------------
-- Public
---------------------------------------------------------------------------
-- callbacks: Portal(player, id), Checkpoint(player, id, index), Finish(player, id),
--            Void(player, id), CoinPickup(player), OrbClick(player)
function World.Build(callbacks)
	Lighting.ClockTime = 14.5
	if not Lighting:FindFirstChildOfClass("Atmosphere") then
		local atmosphere = Instance.new("Atmosphere")
		atmosphere.Density = 0.25
		atmosphere.Parent = Lighting
	end

	local map = Instance.new("Folder")
	map.Name = "GameMap"
	map.Parent = workspace

	local hub = Instance.new("Folder")
	hub.Name = "Hub"
	hub.Parent = map
	local hubSpawn = buildHub(hub, callbacks)

	local obbies = Instance.new("Folder")
	obbies.Name = "Obbies"
	obbies.Parent = map
	local courses = {}
	local count = #Config.Obbies
	for i, def in ipairs(Config.Obbies) do
		local origin = Vector3.new((i - (count + 1) / 2) * COURSE_SPACING_X, COURSE_HEIGHT, COURSE_START_Z)
		courses[def.Id] = buildCourse(obbies, def, origin, callbacks)
	end

	startCoinSpawner(hub, callbacks)
	startAnimations(map)

	return {
		HubSpawn = hubSpawn,
		Courses = courses,
	}
end

return World
