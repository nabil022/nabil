extends RefCounted

## Offline accrual and time-cheat protection (spec 5.2).

const HOUR := 3600

func run(t: TestCase) -> void:
	var cap := Balance.OFFLINE_CAP_SECONDS

	var normal := TimeGuard.offline_seconds(1000, 1000 + 2 * HOUR, cap)
	t.eq(int(normal["granted"]), 2 * HOUR, "two hours away pays two hours")
	t.eq(String(normal["reason"]), "ok", "uncapped")

	var capped := TimeGuard.offline_seconds(1000, 1000 + 10 * HOUR, cap)
	t.eq(int(capped["granted"]), cap, "beyond the cap pays exactly the cap")
	t.eq(String(capped["reason"]), "capped", "flagged as capped")

	# The clock moving backward clamps elapsed time to zero for that session.
	var backward := TimeGuard.offline_seconds(1000 + HOUR, 1000, cap)
	t.eq(int(backward["granted"]), 0, "a backward clock pays nothing")
	t.eq(String(backward["reason"]), "clock_moved_backward", "flagged as a backward clock")

	# Never grant for an absurd delta.
	var absurd := TimeGuard.offline_seconds(1000, 1000 + 100 * HOUR, cap)
	t.eq(int(absurd["granted"]), 0, "an absurd delta pays nothing")
	t.eq(String(absurd["reason"]), "absurd_delta", "flagged as absurd")
	var edge := TimeGuard.offline_seconds(
			0 + 1, 1 + Balance.OFFLINE_ABSURD_DELTA_SECONDS, cap)
	t.eq(int(edge["granted"]), cap, "exactly 72 hours is still paid, at the cap")

	var tiny := TimeGuard.offline_seconds(1000, 1000 + 5, cap)
	t.eq(int(tiny["granted"]), 0, "a five-second gap is not an offline session")

	var first := TimeGuard.offline_seconds(0, 1000000, cap)
	t.eq(int(first["granted"]), 0, "first launch has nothing to collect")

	# The ad-extended cap pays more, and still nothing more than 8 hours.
	var extended := TimeGuard.offline_seconds(1000, 1000 + 10 * HOUR,
			Balance.OFFLINE_CAP_SECONDS_AD_EXTENDED)
	t.eq(int(extended["granted"]), Balance.OFFLINE_CAP_SECONDS_AD_EXTENDED,
			"the ad reward extends the cap to 8 hours")
	t.ok(Balance.OFFLINE_CAP_SECONDS_AD_EXTENDED == 2 * Balance.OFFLINE_CAP_SECONDS,
			"the extended cap is double the standard cap")

	# Trusted-time parsing, for both supported endpoints.
	t.eq(TimeGuard._parse_time("fl=1f2\nh=cloudflare.com\nts=1788000000.123\nvisit_scheme=https"),
			1788000000, "parses the Cloudflare trace format")
	t.eq(TimeGuard._parse_time('{"unixtime":1788000123,"utc_offset":"+00:00"}'),
			1788000123, "parses the worldtimeapi format")
	t.eq(TimeGuard._parse_time("<html>503</html>"), 0, "an unusable body yields no time")

	t.ok(TimeGuard.now_utc() > 1600000000, "the clock returns a plausible UTC time")
