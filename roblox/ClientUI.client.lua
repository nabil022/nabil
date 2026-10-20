-- ClientUI (LocalScript)
-- Put in: StarterPlayer > StarterPlayerScripts  (name it "ClientUI")
-- Builds the whole interface in code: coin counter, click button, shop,
-- rebirth menu, obby menu, obby timer/leave button and notifications.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local Debris = game:GetService("Debris")

local Config = require(ReplicatedStorage:WaitForChild("GameConfig"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local player = Players.LocalPlayer

local FONT = Enum.Font.FredokaOne
local COLORS = {
	Panel = Color3.fromRGB(28, 30, 46),
	Row = Color3.fromRGB(44, 47, 70),
	Text = Color3.fromRGB(235, 235, 245),
	SubText = Color3.fromRGB(170, 175, 200),
	Gold = Color3.fromRGB(255, 205, 50),
	Green = Color3.fromRGB(70, 200, 100),
	Red = Color3.fromRGB(230, 70, 70),
	Gray = Color3.fromRGB(90, 92, 110),
	Blue = Color3.fromRGB(70, 140, 255),
	Purple = Color3.fromRGB(170, 90, 255),
	Orange = Color3.fromRGB(255, 140, 40),
}

local state = nil

---------------------------------------------------------------------------
-- UI helpers
---------------------------------------------------------------------------
local function new(className, props, children)
	local inst = Instance.new(className)
	for key, value in pairs(props or {}) do
		if key ~= "Parent" then
			inst[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = inst
	end
	if props and props.Parent then
		inst.Parent = props.Parent
	end
	return inst
end

local function corner(radius)
	return new("UICorner", { CornerRadius = radius or UDim.new(0, 12) })
end

local function stroke(thickness, color)
	return new("UIStroke", {
		Thickness = thickness or 2,
		Color = color or Color3.new(0, 0, 0),
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

local function textOutline()
	return new("UIStroke", { Thickness = 1.5, Color = Color3.new(0, 0, 0), Transparency = 0.3 })
end

local function label(props)
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or FONT
	props.TextColor3 = props.TextColor3 or COLORS.Text
	if props.TextScaled == nil then
		props.TextScaled = true
	end
	return new("TextLabel", props, { textOutline() })
end

local function button(props, color)
	props.BackgroundColor3 = color or COLORS.Green
	props.Font = props.Font or FONT
	props.TextColor3 = props.TextColor3 or Color3.new(1, 1, 1)
	props.TextScaled = true
	props.AutoButtonColor = true
	local b = new("TextButton", props, { corner(), stroke(2, Color3.new(0, 0, 0)), textOutline() })
	new("UIPadding", {
		PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6),
		PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4),
		Parent = b,
	})
	return b
end

local coinSound = new("Sound", { SoundId = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.35 })
local function playCoinSound(pitch)
	local s = coinSound:Clone()
	s.PlaybackSpeed = pitch or 1
	s.Parent = SoundService
	s:Play()
	Debris:AddItem(s, 2)
end

local function pop(guiObject)
	local scale = guiObject:FindFirstChildOfClass("UIScale") or new("UIScale", { Parent = guiObject })
	scale.Scale = 1.12
	TweenService:Create(scale, TweenInfo.new(0.15, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

---------------------------------------------------------------------------
-- Screen
---------------------------------------------------------------------------
local gui = new("ScreenGui", {
	Name = "ObbyCoinRushUI",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = player:WaitForChild("PlayerGui"),
})

-- Coin counter -------------------------------------------------------------
local topBar = new("Frame", {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 8),
	Size = UDim2.fromOffset(340, 72),
	BackgroundColor3 = COLORS.Panel,
	BackgroundTransparency = 0.1,
	Parent = gui,
}, { corner(UDim.new(0, 16)), stroke(3, COLORS.Gold) })

local coinsLabel = label({
	Position = UDim2.fromOffset(10, 4),
	Size = UDim2.new(1, -20, 0, 42),
	Text = "💰 0",
	TextColor3 = COLORS.Gold,
	Parent = topBar,
})

local statsLabel = label({
	Position = UDim2.fromOffset(10, 46),
	Size = UDim2.new(1, -20, 0, 20),
	Text = "Loading...",
	TextColor3 = COLORS.SubText,
	Parent = topBar,
})

-- Boost bar ---------------------------------------------------------------
local boostFrame = new("Frame", {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 88),
	Size = UDim2.fromOffset(280, 34),
	BackgroundColor3 = COLORS.Purple,
	Visible = false,
	Parent = gui,
}, { corner(), stroke(2, Color3.new(1, 1, 1)) })
local boostLabel = label({ Size = UDim2.new(1, -12, 1, -6), Position = UDim2.fromOffset(6, 3), Text = "", Parent = boostFrame })

-- Obby HUD ----------------------------------------------------------------
local obbyFrame = new("Frame", {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 130),
	Size = UDim2.fromOffset(420, 46),
	BackgroundColor3 = COLORS.Panel,
	BackgroundTransparency = 0.1,
	Visible = false,
	Parent = gui,
}, { corner(), stroke(2, COLORS.Blue) })
local obbyLabel = label({ Position = UDim2.fromOffset(10, 6), Size = UDim2.new(1, -120, 1, -12), Text = "", Parent = obbyFrame })
local leaveButton = button({
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -6, 0.5, 0),
	Size = UDim2.fromOffset(100, 34),
	Text = "🏠 Leave",
	Parent = obbyFrame,
}, COLORS.Red)
leaveButton.Activated:Connect(function()
	Remotes.LeaveObby:FireServer()
end)

-- Notifications -----------------------------------------------------------
local toastHolder = new("Frame", {
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -10, 0, 10),
	Size = UDim2.fromOffset(320, 400),
	BackgroundTransparency = 1,
	Parent = gui,
}, {
	new("UIListLayout", {
		Padding = UDim.new(0, 6),
		HorizontalAlignment = Enum.HorizontalAlignment.Right,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}),
})
local toastOrder = 0

local function toast(text, color)
	toastOrder += 1
	local frame = new("Frame", {
		Size = UDim2.fromOffset(320, 44),
		BackgroundColor3 = COLORS.Panel,
		BackgroundTransparency = 0.1,
		LayoutOrder = toastOrder,
		Parent = toastHolder,
	}, { corner(UDim.new(0, 10)), stroke(2, color or Color3.new(1, 1, 1)) })
	local l = label({
		Position = UDim2.fromOffset(8, 4),
		Size = UDim2.new(1, -16, 1, -8),
		Text = text,
		TextColor3 = color or COLORS.Text,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = frame,
	})
	pop(frame)
	task.delay(4, function()
		if not frame.Parent then
			return -- already pushed off by newer toasts
		end
		local info = TweenInfo.new(0.4)
		TweenService:Create(frame, info, { BackgroundTransparency = 1 }):Play()
		TweenService:Create(l, info, { TextTransparency = 1 }):Play()
		frame:FindFirstChildOfClass("UIStroke").Enabled = false
		task.wait(0.4)
		frame:Destroy()
	end)
	-- keep at most 6 on screen
	local toasts = {}
	for _, child in ipairs(toastHolder:GetChildren()) do
		if child:IsA("Frame") then
			table.insert(toasts, child)
		end
	end
	table.sort(toasts, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	for i = 1, #toasts - 6 do
		toasts[i]:Destroy()
	end
end

Remotes.Notify.OnClientEvent:Connect(toast)

-- Floating "+N" text --------------------------------------------------------
local function floatText(text, position, color)
	local l = label({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = position,
		Size = UDim2.fromOffset(160, 40),
		Text = text,
		TextColor3 = color or COLORS.Gold,
		ZIndex = 10,
		Parent = gui,
	})
	local info = TweenInfo.new(0.9, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(l, info, { Position = position - UDim2.fromOffset(0, 90), TextTransparency = 1 }):Play()
	TweenService:Create(l:FindFirstChildOfClass("UIStroke"), info, { Transparency = 1 }):Play()
	Debris:AddItem(l, 1)
end

-- Click button ------------------------------------------------------------
local clickButton = button({
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -20),
	Size = UDim2.fromOffset(130, 130),
	Text = "💰\nCLICK!",
	Parent = gui,
}, COLORS.Gold)
clickButton:FindFirstChildOfClass("UICorner").CornerRadius = UDim.new(1, 0)
clickButton:FindFirstChildOfClass("UIStroke").Thickness = 4
new("UIGradient", {
	Color = ColorSequence.new(Color3.fromRGB(255, 240, 140), Color3.fromRGB(255, 170, 0)),
	Rotation = 90,
	Parent = clickButton,
})

local function currentClickValue()
	if not state then
		return 0
	end
	local boost = state.BoostEnd > workspace:GetServerTimeNow() and state.BoostMult or 1
	return Config.GetClickValue(state, boost)
end

clickButton.Activated:Connect(function()
	Remotes.Click:FireServer()
	pop(clickButton)
	playCoinSound(1 + math.random() * 0.2)
	local offset = UDim2.fromOffset(math.random(-50, 50), -150)
	floatText("+" .. Config.FormatNumber(currentClickValue()), UDim2.new(0.5, 0, 1, 0) + offset)
end)

Remotes.Reward.OnClientEvent:Connect(function(amount, kind)
	playCoinSound(kind == "obby" and 0.8 or 1.2)
	floatText("+" .. Config.FormatNumber(amount), UDim2.new(0.5, math.random(-60, 60), 0, 110),
		kind == "obby" and COLORS.Orange or COLORS.Gold)
	pop(topBar)
end)

---------------------------------------------------------------------------
-- Panels
---------------------------------------------------------------------------
local panels = {}

local function makePanel(name, title, color)
	local frame = new("Frame", {
		Name = name,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.9, 0.7),
		BackgroundColor3 = COLORS.Panel,
		Visible = false,
		ZIndex = 5,
		Parent = gui,
	}, {
		corner(UDim.new(0, 18)),
		stroke(3, color),
		new("UISizeConstraint", { MaxSize = Vector2.new(500, 430) }),
	})
	label({
		Position = UDim2.fromOffset(16, 8),
		Size = UDim2.new(1, -80, 0, 40),
		Text = title,
		TextColor3 = color,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = frame,
	})
	local close = button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 10),
		Size = UDim2.fromOffset(40, 36),
		Text = "X",
		Parent = frame,
	}, COLORS.Red)
	close.Activated:Connect(function()
		frame.Visible = false
	end)
	local content = new("ScrollingFrame", {
		Position = UDim2.fromOffset(10, 56),
		Size = UDim2.new(1, -20, 1, -66),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 6,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		Parent = frame,
	}, {
		new("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
		new("UIPadding", { PaddingRight = UDim.new(0, 8) }),
	})
	panels[name] = frame
	return frame, content
end

local refreshers = {}

local function togglePanel(name)
	for otherName, frame in pairs(panels) do
		if otherName ~= name then
			frame.Visible = false
		end
	end
	local frame = panels[name]
	frame.Visible = not frame.Visible
	if frame.Visible then
		pop(frame)
		if refreshers[name] then
			refreshers[name]()
		end
	end
end

local function row(parent, order, height)
	return new("Frame", {
		Size = UDim2.new(1, 0, 0, height or 78),
		BackgroundColor3 = COLORS.Row,
		LayoutOrder = order,
		Parent = parent,
	}, { corner(UDim.new(0, 10)) })
end

-- Shop --------------------------------------------------------------------
local _, shopContent = makePanel("Shop", "🛒 Upgrades", COLORS.Green)
local shopRows = {}

for i, id in ipairs(Config.UpgradeOrder) do
	local def = Config.Upgrades[id]
	local r = row(shopContent, i)
	local title = label({
		Position = UDim2.fromOffset(10, 6), Size = UDim2.new(1, -150, 0, 30),
		Text = def.Name, TextXAlignment = Enum.TextXAlignment.Left, Parent = r,
	})
	label({
		Position = UDim2.fromOffset(10, 40), Size = UDim2.new(1, -150, 0, 28),
		Text = def.Description, TextColor3 = COLORS.SubText, TextXAlignment = Enum.TextXAlignment.Left, Parent = r,
	})
	local buy = button({
		AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -10, 0.5, 0), Size = UDim2.fromOffset(125, 50),
		Text = "...", Parent = r,
	})
	buy.Activated:Connect(function()
		local ok, message = Remotes.BuyUpgrade:InvokeServer(id)
		toast(message, ok and COLORS.Green or COLORS.Red)
		if ok then
			playCoinSound(1.5)
		end
	end)
	shopRows[id] = { Title = title, Buy = buy }
end

refreshers.Shop = function()
	if not state then
		return
	end
	for id, ui in pairs(shopRows) do
		local def = Config.Upgrades[id]
		local level = state.Upgrades[id] or 0
		ui.Title.Text = string.format("%s  (Lv %d/%d)", def.Name, level, def.Max)
		if level >= def.Max then
			ui.Buy.Text = "MAX"
			ui.Buy.BackgroundColor3 = COLORS.Purple
		else
			local cost = Config.GetUpgradeCost(id, level)
			ui.Buy.Text = "💰 " .. Config.FormatNumber(cost)
			ui.Buy.BackgroundColor3 = state.Coins >= cost and COLORS.Green or COLORS.Gray
		end
	end
end

-- Rebirth -----------------------------------------------------------------
local _, rebirthContent = makePanel("Rebirth", "🔁 Rebirth", COLORS.Purple)
local rebirthInfo = label({
	Size = UDim2.new(1, 0, 0, 60),
	TextScaled = true,
	Text = "Rebirth resets your coins and upgrades, but gives a PERMANENT coin multiplier and unlocks harder obbies!",
	TextColor3 = COLORS.SubText,
	LayoutOrder = 1,
	Parent = rebirthContent,
})
rebirthInfo.TextWrapped = true
local rebirthStats = label({ Size = UDim2.new(1, 0, 0, 40), Text = "", LayoutOrder = 2, Parent = rebirthContent })
local rebirthUnlock = label({ Size = UDim2.new(1, 0, 0, 30), Text = "", TextColor3 = COLORS.Orange, LayoutOrder = 3, Parent = rebirthContent })
local rebirthButton = button({ Size = UDim2.new(1, 0, 0, 60), Text = "", LayoutOrder = 4, Parent = rebirthContent }, COLORS.Purple)

rebirthButton.Activated:Connect(function()
	local ok, message = Remotes.Rebirth:InvokeServer()
	toast(message, ok and COLORS.Purple or COLORS.Red)
	if ok then
		playCoinSound(0.6)
		panels.Rebirth.Visible = false
	end
end)

refreshers.Rebirth = function()
	if not state then
		return
	end
	local current = Config.GetRebirthMultiplier(state.Rebirths)
	local nextMult = Config.GetRebirthMultiplier(state.Rebirths + 1)
	local cost = Config.GetRebirthCost(state.Rebirths)
	rebirthStats.Text = string.format("Rebirths: %d   •   Coins x%.1f ➜ x%.1f", state.Rebirths, current, nextMult)
	local unlock = ""
	for _, def in ipairs(Config.Obbies) do
		if def.RebirthsRequired == state.Rebirths + 1 then
			unlock = "🔓 Unlocks: " .. def.Name
		end
	end
	rebirthUnlock.Text = unlock
	rebirthButton.Text = string.format("REBIRTH  (💰 %s)", Config.FormatNumber(cost))
	rebirthButton.BackgroundColor3 = state.Coins >= cost and COLORS.Purple or COLORS.Gray
end

-- Obbies ------------------------------------------------------------------
local _, obbyContent = makePanel("Obbies", "🏁 Obbies", COLORS.Blue)
local obbyRows = {}

for i, def in ipairs(Config.Obbies) do
	local r = row(obbyContent, i, 96)
	new("Frame", { Size = UDim2.new(0, 6, 1, -16), Position = UDim2.fromOffset(6, 8), BackgroundColor3 = def.Color, Parent = r }, { corner() })
	label({
		Position = UDim2.fromOffset(20, 6), Size = UDim2.new(1, -160, 0, 30),
		Text = def.Name, TextColor3 = def.Color, TextXAlignment = Enum.TextXAlignment.Left, Parent = r,
	})
	local reward = label({
		Position = UDim2.fromOffset(20, 38), Size = UDim2.new(1, -160, 0, 24),
		Text = "", TextXAlignment = Enum.TextXAlignment.Left, Parent = r,
	})
	local record = label({
		Position = UDim2.fromOffset(20, 64), Size = UDim2.new(1, -160, 0, 22),
		Text = "", TextColor3 = COLORS.SubText, TextXAlignment = Enum.TextXAlignment.Left, Parent = r,
	})
	local play = button({
		AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -10, 0.5, 0), Size = UDim2.fromOffset(125, 54),
		Text = "▶ PLAY", Parent = r,
	}, COLORS.Blue)
	play.Activated:Connect(function()
		if state and state.Rebirths >= def.RebirthsRequired then
			Remotes.JoinObby:FireServer(def.Id)
			panels.Obbies.Visible = false
		else
			toast(string.format("🔒 Needs %d rebirth(s)", def.RebirthsRequired), COLORS.Red)
		end
	end)
	obbyRows[def.Id] = { Reward = reward, Record = record, Play = play }
end

refreshers.Obbies = function()
	if not state then
		return
	end
	for _, def in ipairs(Config.Obbies) do
		local ui = obbyRows[def.Id]
		local clears = state.ObbyClears[def.Id] or 0
		local coins = Config.GetObbyReward(def, state)
		local first = clears == 0 and string.format(" (x%d first!)", Config.FirstClearBonus) or ""
		ui.Reward.Text = string.format("💰 %s%s  ⚡ x%d / %ds", Config.FormatNumber(coins), first, def.BoostMultiplier, def.BoostDuration)
		local best = state.ObbyBest[def.Id]
		ui.Record.Text = string.format("Best: %s   •   Clears: %d", best and Config.FormatTimePrecise(best) or "--", clears)
		local unlocked = state.Rebirths >= def.RebirthsRequired
		ui.Play.Text = unlocked and "▶ PLAY" or string.format("🔒 %d 🔁", def.RebirthsRequired)
		ui.Play.BackgroundColor3 = unlocked and COLORS.Blue or COLORS.Gray
	end
end

-- Menu buttons ------------------------------------------------------------
local menu = new("Frame", {
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0, 10, 0.5, 0),
	Size = UDim2.fromOffset(130, 190),
	BackgroundTransparency = 1,
	Parent = gui,
}, { new("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }) })

for i, entry in ipairs({
	{ "Shop", "🛒 Shop", COLORS.Green },
	{ "Rebirth", "🔁 Rebirth", COLORS.Purple },
	{ "Obbies", "🏁 Obbies", COLORS.Blue },
}) do
	local b = button({ Size = UDim2.fromOffset(130, 50), Text = entry[2], LayoutOrder = i, Parent = menu }, entry[3])
	b.Activated:Connect(function()
		togglePanel(entry[1])
	end)
end

---------------------------------------------------------------------------
-- State
---------------------------------------------------------------------------
local function applyState(newState)
	local oldCoins = state and state.Coins
	state = newState

	coinsLabel.Text = "💰 " .. Config.FormatNumber(state.Coins)
	if oldCoins and state.Coins > oldCoins then
		pop(coinsLabel)
	end

	obbyFrame.Visible = state.Obby ~= nil
	clickButton.Visible = state.Obby == nil

	for name, refresh in pairs(refreshers) do
		if panels[name].Visible then
			refresh()
		end
	end
end

Remotes.State.OnClientEvent:Connect(applyState)
task.spawn(function()
	local initial = Remotes.GetState:InvokeServer()
	if initial and not state then
		applyState(initial)
	end
end)

RunService.RenderStepped:Connect(function()
	if not state then
		return
	end
	local now = workspace:GetServerTimeNow()

	local remaining = state.BoostEnd - now
	boostFrame.Visible = remaining > 0
	if remaining > 0 then
		boostLabel.Text = string.format("⚡ x%d COIN BOOST  %s", state.BoostMult, Config.FormatTime(remaining))
	end

	statsLabel.Text = string.format("+%s per click   •   🔁 %d (x%.1f)",
		Config.FormatNumber(currentClickValue()), state.Rebirths, Config.GetRebirthMultiplier(state.Rebirths))

	if state.Obby then
		local def = Config.GetObby(state.Obby)
		obbyLabel.Text = string.format("%s  •  CP %d/%d  •  ⏱ %s", def.Name, state.Checkpoint, state.CheckpointCount,
			Config.FormatTimePrecise(now - state.ObbyStart))
		obbyLabel.TextColor3 = def.Color
	end
end)
