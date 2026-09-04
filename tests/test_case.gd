class_name TestCase
extends RefCounted

## Tiny assertion helper. No third-party test framework: the whole suite runs
## under `godot --headless res://tests/tests.tscn` and exits non-zero on failure.

var name: String = ""
var failures: Array[String] = []
var checks: int = 0


func _init(test_name: String) -> void:
	name = test_name


func ok(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)


func eq(actual: Variant, expected: Variant, message: String) -> void:
	checks += 1
	if actual != expected:
		failures.append("%s (got %s, expected %s)" % [message, str(actual), str(expected)])


func approx(actual: float, expected: float, tolerance: float, message: String) -> void:
	checks += 1
	if absf(actual - expected) > tolerance:
		failures.append("%s (got %f, expected %f +/- %f)"
				% [message, actual, expected, tolerance])


func between(actual: float, low: float, high: float, message: String) -> void:
	checks += 1
	if actual < low or actual > high:
		failures.append("%s (got %f, expected within [%f, %f])"
				% [message, actual, low, high])
