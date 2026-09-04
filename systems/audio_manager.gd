extends Node

## The ~6 simple SFX the spec allows (spec 11). Autoload name: Sfx.
##
## Synthesised at startup into AudioStreamWAV buffers -- there is no audio
## asset pipeline for the same reason there is no art pipeline. Every sound is
## a short shaped tone, so the whole set costs a few kilobytes of RAM.

const SAMPLE_RATE := 22050

const TAP := "tap"
const RIFT_OPEN := "rift_open"
const REVEAL := "reveal"
const REVEAL_RARE := "reveal_rare"
const REVEAL_SINGULAR := "reveal_singular"
const LEVEL_UP := "level_up"

var _streams: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _next_player := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_streams[TAP] = _tone([880.0, 1320.0], 0.05, 0.16, 0.0)
	_streams[RIFT_OPEN] = _tone([180.0, 240.0, 300.0], 0.55, 0.24, 1.0)
	_streams[REVEAL] = _tone([520.0, 780.0], 0.16, 0.20, 0.25)
	_streams[REVEAL_RARE] = _tone([660.0, 990.0, 1320.0], 0.34, 0.24, 0.5)
	_streams[REVEAL_SINGULAR] = _tone([523.0, 784.0, 1046.0, 1568.0], 0.9, 0.28, 0.75)
	_streams[LEVEL_UP] = _tone([440.0, 660.0], 0.22, 0.20, 0.5)
	for _i in 4:
		var player := AudioStreamPlayer.new()
		player.bus = "Master"
		add_child(player)
		_players.append(player)


## Builds one shaped tone: summed partials, exponential decay, optional upward
## glide. `glide` of 1.0 sweeps an octave over the sound's length.
func _tone(partials: Array, seconds: float, gain: float, glide: float) -> AudioStreamWAV:
	var frames := int(SAMPLE_RATE * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	var phases: Array[float] = []
	for _p in partials:
		phases.append(0.0)
	for i in frames:
		var t := float(i) / float(frames)
		var env := exp(-4.0 * t) * (1.0 - exp(-60.0 * t))  # fast attack, smooth tail
		var sample := 0.0
		for p in partials.size():
			var freq: float = float(partials[p]) * (1.0 + glide * t)
			phases[p] += TAU * freq / float(SAMPLE_RATE)
			sample += sin(phases[p]) / float(partials.size())
		var value := int(clampf(sample * env * gain, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, value)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	stream.data = data
	return stream


func play(id: String, volume_db: float = 0.0) -> void:
	if not bool(Save.get_setting("sound", true)):
		return
	var stream: AudioStreamWAV = _streams.get(id)
	if stream == null:
		return
	var player := _players[_next_player]
	_next_player = (_next_player + 1) % _players.size()
	player.stream = stream
	player.volume_db = volume_db
	player.play()


## Reveal sound scaled to how good the pull was.
func play_reveal(tier: int) -> void:
	if tier >= Balance.Tier.SINGULAR:
		play(REVEAL_SINGULAR)
	elif tier >= Balance.Tier.RADIANT:
		play(REVEAL_RARE)
	else:
		play(REVEAL, -4.0)


func haptic(duration_ms: int = 18) -> void:
	if not bool(Save.get_setting("haptics", true)):
		return
	if OS.get_name() == "Android" or OS.get_name() == "iOS":
		Input.vibrate_handheld(duration_ms)
