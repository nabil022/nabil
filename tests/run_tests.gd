extends Node

## Test runner. Autoloads are live here, so tests can exercise Save, Economy,
## TimeGuard and the real scenes.
##
##     godot --headless --path . res://tests/tests.tscn
##
## Exits non-zero when anything fails, so CI can gate on it.

const SUITES := {
	"balance": preload("res://tests/test_balance.gd"),
	"fragments": preload("res://tests/test_fragments.gd"),
	"big_number": preload("res://tests/test_big_number.gd"),
	"rift_roller": preload("res://tests/test_rift_roller.gd"),
	"rift_service": preload("res://tests/test_rift_service.gd"),
	"economy": preload("res://tests/test_economy.gd"),
	"time_guard": preload("res://tests/test_time_guard.gd"),
	"save": preload("res://tests/test_save.gd"),
	"monetisation": preload("res://tests/test_monetisation.gd"),
	"scenes": preload("res://tests/test_scenes.gd"),
}


func _ready() -> void:
	await get_tree().process_frame
	var failed := 0
	var total_checks := 0
	var started := Time.get_ticks_msec()

	print("\n=== AETHER test suite ===")
	for suite_name in SUITES:
		var case := TestCase.new(String(suite_name))
		var suite: RefCounted = SUITES[suite_name].new()
		var suite_started := Time.get_ticks_msec()
		print("  ....  %s" % suite_name)
		suite.call("run", case)
		total_checks += case.checks
		var elapsed := Time.get_ticks_msec() - suite_started
		if case.failures.is_empty():
			print("  PASS  %-14s %5d checks  %6d ms" % [suite_name, case.checks, elapsed])
		else:
			failed += case.failures.size()
			print("  FAIL  %-14s %5d checks  %6d ms" % [suite_name, case.checks, elapsed])
			for failure in case.failures:
				print("          - %s" % failure)

	print("---")
	print("%d checks, %d failures, %d ms" % [total_checks, failed, Time.get_ticks_msec() - started])
	print("RESULT: %s\n" % ("PASS" if failed == 0 else "FAIL"))
	get_tree().quit(0 if failed == 0 else 1)
