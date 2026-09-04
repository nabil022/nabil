extends RefCounted

## BigNumber (spec 8.4). Flux exceeds 2^53 in the late game, so the currency is
## a mantissa/exponent pair from day one.

func run(t: TestCase) -> void:
	t.ok(BigNumber.zero().is_zero(), "zero is zero")
	t.eq(BigNumber.from_float(0.0).format(), "0", "zero formats as 0")

	var a := BigNumber.from_float(1234.0)
	t.approx(a.mantissa, 1.234, 1e-9, "mantissa is normalised into [1, 10)")
	t.eq(a.exponent, 3, "exponent")

	# Arithmetic
	t.approx(BigNumber.from_float(10.0).add(BigNumber.from_float(5.0)).to_float(),
			15.0, 1e-9, "add")
	t.approx(BigNumber.from_float(10.0).sub(BigNumber.from_float(4.0)).to_float(),
			6.0, 1e-9, "sub")
	t.approx(BigNumber.from_float(10.0).mul(BigNumber.from_float(20.0)).to_float(),
			200.0, 1e-9, "mul")
	t.approx(BigNumber.from_float(10.0).mul_scalar(2.5).to_float(), 25.0, 1e-9, "mul_scalar")
	t.approx(BigNumber.from_float(10.0).div(BigNumber.from_float(4.0)).to_float(),
			2.5, 1e-9, "div")
	t.ok(BigNumber.from_float(5.0).sub(BigNumber.from_float(8.0)).is_negative(),
			"subtracting past zero goes negative")

	# Beyond a double's integer precision, which is the whole point.
	var huge := BigNumber.from_parts(1.0, 300)
	var huger := huge.mul(BigNumber.from_parts(1.0, 300))
	t.eq(huger.exponent, 600, "1e300 * 1e300 == 1e600, no overflow to inf")
	t.ok(is_finite(huger.mantissa), "mantissa stays finite past a double's range")
	var e400 := BigNumber.from_parts(5.0, 400)
	t.ok(e400.gt(BigNumber.from_parts(4.999, 400)), "compares at extreme exponents")

	# Adding a value far below the precision floor must not corrupt the total.
	var big := BigNumber.from_parts(1.0, 40)
	big.add_in_place(BigNumber.from_float(1.0))
	t.eq(big.exponent, 40, "adding a negligible value leaves the exponent alone")
	t.approx(big.mantissa, 1.0, 1e-9, "adding a negligible value leaves the mantissa alone")

	# Comparison
	t.ok(BigNumber.from_float(100.0).gt(BigNumber.from_float(99.0)), "gt")
	t.ok(BigNumber.from_float(99.0).lt(BigNumber.from_float(100.0)), "lt")
	t.ok(BigNumber.from_float(50.0).eq(BigNumber.from_float(50.0)), "eq")
	t.ok(BigNumber.from_float(50.0).gte(BigNumber.from_float(50.0)), "gte on equal")
	t.ok(BigNumber.from_float(-5.0).lt(BigNumber.zero()), "negative < zero")
	t.ok(BigNumber.zero().gt(BigNumber.from_float(-5.0)), "zero > negative")
	t.ok(BigNumber.from_float(-2.0).gt(BigNumber.from_float(-9.0)), "negatives order correctly")

	# Display: 1.24K / 3.8M / 942B / 1.20e15 (spec 8.4)
	t.eq(BigNumber.from_float(1240.0).format(), "1.24K", "1.24K")
	t.eq(BigNumber.from_float(3800000.0).format(), "3.8M", "3.8M")
	t.eq(BigNumber.from_float(942000000000.0).format(), "942B", "942B")
	t.eq(BigNumber.from_parts(1.2, 15).format(), "1.20e15", "scientific from 1e15")
	t.eq(BigNumber.from_float(1240000.0).format(), "1.24M", "1.24M")
	t.eq(BigNumber.from_float(999.0).format(), "999", "plain integers below 1000")
	t.eq(BigNumber.from_float(12400.0).format(), "12.4K", "three significant digits")
	t.eq(BigNumber.from_float(-1240.0).format(), "-1.24K", "negatives keep the sign")
	t.eq(BigNumber.from_float(5.0).format_rate(), "5/s", "rate suffix")

	# Save round-trip, including the far end of the range.
	var mid := BigNumber.from_float(128400.5)
	t.approx(BigNumber.from_save(mid.to_save()).to_float(), 128400.5, 1e-6,
			"round-trips as a plain JSON number")
	var far := BigNumber.from_parts(3.25, 900)
	var back := BigNumber.from_save(far.to_save())
	t.eq(back.exponent, 900, "round-trips past a double's range")
	t.approx(back.mantissa, 3.25, 1e-9, "mantissa survives the round trip")
	t.ok(BigNumber.from_save(null).is_zero(), "garbage in the save reads as zero")

	# Ratios for progress bars, where both sides may be astronomical.
	t.approx(BigNumber.from_float(50.0).ratio_clamped(BigNumber.from_float(100.0)),
			0.5, 1e-6, "ratio")
	t.approx(BigNumber.from_parts(1.0, 60).ratio_clamped(BigNumber.from_float(10.0)),
			1.0, 1e-6, "ratio clamps at 1")
	t.approx(BigNumber.zero().ratio_clamped(BigNumber.from_float(10.0)), 0.0, 1e-9,
			"zero ratio")
