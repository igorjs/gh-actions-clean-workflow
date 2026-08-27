#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Shared assertion helpers for the integration test suite. Sourced by each
# "Verify ..." step in action.yml rather than duplicated per scenario.
set -euo pipefail

# assert_nonneg_int <label> <value>
# Fails if value is empty or not a well-formed non-negative integer. An
# unset action output surfaces here as an empty string, which fails this
# check instead of silently comparing equal to itself like a bare echo would.
assert_nonneg_int() {
  local label="$1" value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "::error::${label} is not a well-formed non-negative integer: '${value}'"
    exit 1
  fi
}

# assert_eq <label> <actual> <expected>
assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" != "$expected" ]; then
    echo "::error::${label} expected '${expected}' but got '${actual}'"
    exit 1
  fi
}
