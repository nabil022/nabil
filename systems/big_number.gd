class_name BigNumber
extends RefCounted

## Mantissa + exponent number, used for Flux and Flux/sec (spec 8.4).
##
## Value == mantissa * 10 ^ exponent, with the mantissa normalised into
## [1.0, 10.0) for every non-zero value. Zero is stored as (0.0, 0).
## Negative values are supported (mantissa carries the sign) because the
## economy subtracts Rift costs from Flux.
##
## All arithmetic returns NEW instances; instances are never mutated in place
## except through the explicit `_set` helpers used by the in-place fast paths
## (`add_in_place`, `mul_scalar_in_place`) that the per-frame tick uses to
## avoid allocating on every frame.

const MAX_EXPONENT := 4096  ## Hard ceiling; nothing in the game should approach it.

var mantissa: float = 0.0
var exponent: int = 0


func _init(m: float = 0.0, e: int = 0) -> void:
	mantissa = m
	exponent = e
	_normalise()


# --- construction -----------------------------------------------------------

static func zero() -> BigNumber:
	return BigNumber.new(0.0, 0)


static func one() -> BigNumber:
	return BigNumber.new(1.0, 0)


## Builds from a plain float. Safe for anything a double can hold.
static func from_float(v: float) -> BigNumber:
	return BigNumber.new(v, 0)


## Builds from an explicit mantissa/exponent pair (used by save loading).
static func from_parts(m: float, e: int) -> BigNumber:
	return BigNumber.new(m, e)


func duplicate_value() -> BigNumber:
	return BigNumber.new(mantissa, exponent)


# --- normalisation ----------------------------------------------------------

func _normalise() -> void:
	if not is_finite(mantissa):
		# Never let an inf/NaN escape into the economy.
		mantissa = 0.0
		exponent = 0
		return
	if mantissa == 0.0:
		exponent = 0
		return
	var sign_f := signf(mantissa)
	var abs_m := absf(mantissa)
	var shift := int(floor(log(abs_m) / log(10.0)))
	if shift != 0:
		abs_m /= pow(10.0, float(shift))
		exponent += shift
	# log() rounding can leave the mantissa a hair outside [1, 10).
	while abs_m >= 10.0:
		abs_m /= 10.0
		exponent += 1
	while abs_m < 1.0:
		abs_m *= 10.0
		exponent -= 1
	mantissa = sign_f * abs_m
	if exponent > MAX_EXPONENT:
		exponent = MAX_EXPONENT
		mantissa = sign_f * 9.999999
	elif exponent < -MAX_EXPONENT:
		mantissa = 0.0
		exponent = 0


func _set_parts(m: float, e: int) -> void:
	mantissa = m
	exponent = e
	_normalise()


# --- predicates -------------------------------------------------------------

func is_zero() -> bool:
	return mantissa == 0.0


func is_negative() -> bool:
	return mantissa < 0.0


# --- arithmetic -------------------------------------------------------------

func add(other: BigNumber) -> BigNumber:
	var r := duplicate_value()
	r.add_in_place(other)
	return r


## In-place addition. Used by the economy tick so a running game does not
## allocate a BigNumber every frame.
func add_in_place(other: BigNumber) -> void:
	if other.mantissa == 0.0:
		return
	if mantissa == 0.0:
		mantissa = other.mantissa
		exponent = other.exponent
		return
	var diff := exponent - other.exponent
	if diff > 17:
		return  # `other` is below our precision floor; adding it changes nothing.
	if diff < -17:
		mantissa = other.mantissa
		exponent = other.exponent
		return
	if diff >= 0:
		_set_parts(mantissa + other.mantissa / pow(10.0, float(diff)), exponent)
	else:
		_set_parts(other.mantissa + mantissa / pow(10.0, float(-diff)), other.exponent)


func sub(other: BigNumber) -> BigNumber:
	var negated := BigNumber.new(-other.mantissa, other.exponent)
	return add(negated)


func sub_in_place(other: BigNumber) -> void:
	add_in_place(BigNumber.new(-other.mantissa, other.exponent))


func mul(other: BigNumber) -> BigNumber:
	if mantissa == 0.0 or other.mantissa == 0.0:
		return BigNumber.zero()
	return BigNumber.new(mantissa * other.mantissa, exponent + other.exponent)


func mul_scalar(f: float) -> BigNumber:
	if f == 0.0 or mantissa == 0.0:
		return BigNumber.zero()
	return BigNumber.new(mantissa * f, exponent)


func mul_scalar_in_place(f: float) -> void:
	if f == 0.0 or mantissa == 0.0:
		mantissa = 0.0
		exponent = 0
		return
	_set_parts(mantissa * f, exponent)


func div(other: BigNumber) -> BigNumber:
	if other.mantissa == 0.0:
		push_error("BigNumber.div: division by zero")
		return BigNumber.zero()
	if mantissa == 0.0:
		return BigNumber.zero()
	return BigNumber.new(mantissa / other.mantissa, exponent - other.exponent)


func div_scalar(f: float) -> BigNumber:
	if f == 0.0:
		push_error("BigNumber.div_scalar: division by zero")
		return BigNumber.zero()
	return BigNumber.new(mantissa / f, exponent)


# --- comparison -------------------------------------------------------------

## Returns -1 if self < other, 0 if equal, 1 if self > other.
func cmp(other: BigNumber) -> int:
	if mantissa == 0.0 and other.mantissa == 0.0:
		return 0
	var a_neg := mantissa < 0.0
	var b_neg := other.mantissa < 0.0
	if a_neg != b_neg:
		return -1 if a_neg else 1
	if mantissa == 0.0:
		return 1 if b_neg else -1
	if other.mantissa == 0.0:
		return -1 if a_neg else 1
	if exponent != other.exponent:
		var bigger_exp := exponent > other.exponent
		if a_neg:
			return -1 if bigger_exp else 1
		return 1 if bigger_exp else -1
	if is_equal_approx(mantissa, other.mantissa):
		return 0
	return 1 if mantissa > other.mantissa else -1


func gte(other: BigNumber) -> bool:
	return cmp(other) >= 0


func gt(other: BigNumber) -> bool:
	return cmp(other) > 0


func lt(other: BigNumber) -> bool:
	return cmp(other) < 0


func lte(other: BigNumber) -> bool:
	return cmp(other) <= 0


func eq(other: BigNumber) -> bool:
	return cmp(other) == 0


func max_of(other: BigNumber) -> BigNumber:
	return duplicate_value() if gte(other) else other.duplicate_value()


func min_of(other: BigNumber) -> BigNumber:
	return duplicate_value() if lte(other) else other.duplicate_value()


# --- conversion -------------------------------------------------------------

## Collapses to a double. Returns INF above ~1e308; only use for ratios and UI
## progress bars, never to store a currency.
func to_float() -> float:
	if mantissa == 0.0:
		return 0.0
	if exponent > 307:
		return INF if mantissa > 0.0 else -INF
	if exponent < -307:
		return 0.0
	return mantissa * pow(10.0, float(exponent))


## Ratio self/other as a plain float, clamped to [0, 1]. Used for progress bars
## where both sides may be astronomically large.
func ratio_clamped(other: BigNumber) -> float:
	if other.is_zero():
		return 1.0
	if is_zero():
		return 0.0
	var e_diff := exponent - other.exponent
	if e_diff > 3:
		return 1.0
	if e_diff < -12:
		return 0.0
	return clampf(mantissa / other.mantissa * pow(10.0, float(e_diff)), 0.0, 1.0)


# --- display ----------------------------------------------------------------

const SUFFIXES := ["", "K", "M", "B", "T"]
const SCIENTIFIC_FROM_EXPONENT := 15  ## 1.20e15 and above (spec 8.4).


## Human-readable form: 1.24K / 3.8M / 942B / 1.20e15 (spec 8.4).
func format() -> String:
	if mantissa == 0.0:
		return "0"
	var neg := mantissa < 0.0
	var body := _format_positive(absf(mantissa), exponent)
	return "-" + body if neg else body


static func _format_positive(m: float, e: int) -> String:
	if e < 0:
		# Sub-1 values only appear for very early Flux/sec readouts.
		var v := m * pow(10.0, float(e))
		return String.num(v, 2)
	if e >= SCIENTIFIC_FROM_EXPONENT:
		return "%.2fe%d" % [m, e]
	var group := e / 3
	var within := e % 3
	var scaled := m * pow(10.0, float(within))
	var suffix: String = SUFFIXES[group]
	var digits := 2 - within  # keep three significant digits: 1.24K / 12.4K / 124K
	if group == 0:
		# Plain numbers below 1000 read better without trailing noise.
		if within >= 2:
			return "%d" % int(scaled)
		return String.num(scaled, digits).trim_suffix(".0")
	return "%s%s" % [String.num(scaled, digits), suffix]


## Compact "per second" form used under the Flux counter.
func format_rate() -> String:
	return format() + "/s"


func _to_string() -> String:
	return "BigNumber(%s)" % format()


# --- serialisation ----------------------------------------------------------

## Save form. Plain JSON numbers while they are exactly representable (matching
## the schema in spec 8.3); a {"m", "e"} pair beyond that so late-game saves
## never round to infinity.
func to_save() -> Variant:
	if mantissa == 0.0:
		return 0.0
	if exponent >= -280 and exponent <= 280:
		return to_float()
	return {"m": mantissa, "e": exponent}


static func from_save(v: Variant) -> BigNumber:
	if v is float or v is int:
		return BigNumber.from_float(float(v))
	if v is Dictionary and v.has("m") and v.has("e"):
		return BigNumber.from_parts(float(v["m"]), int(v["e"]))
	if v is String:
		return BigNumber.from_float(float(v))
	return BigNumber.zero()
