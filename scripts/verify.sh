#!/usr/bin/env bash
set -u

status=0

echo "[verify] starting verification harness"

fail() {
  echo "[verify][FAIL] $1"
  status=1
}

pass() {
  echo "[verify][PASS] $1"
}

has_rg=0
if command -v rg >/dev/null 2>&1; then
  has_rg=1
fi

expected_files=(
  "00_INDEX_AND_READING_ORDER.md"
  "01_AGENT_CHARTER_AND_LOCKED_RULES.md"
  "02_OPERATOR_CONTRACT_AND_AUTONOMY_LEVEL.md"
  "03_ARCHITECTURE_DECISION_AND_RATIONALE.md"
  "04_NOTION_AS_CONTROL_PLANE.md"
  "05_TOOLING_CLI_AND_RUNBOOK.md"
  "06_VERIFICATION_HARNESS_AND_CI.md"
  "07_SECURITY_SECRETS_AND_ACCESS.md"
  "08_RELEASE_WORKFLOW_AND_EVIDENCE_BUNDLES.md"
  "09_COLLABORATION_AND_HANDOFF.md"
)

required_headers=(
  "## Intent"
  "## Canonical Inputs"
  "## Canonical Outputs"
  "## Normative Rules"
  "## State and Decision Logic"
  "## Failure Modes and Recovery"
  "## Verification"
  "## Evidence"
)

pack_dir="docs/agent_setup_pack"

if [ ! -d "$pack_dir" ]; then
  fail "missing required directory: $pack_dir"
else
  actual_list=$(find "$pack_dir" -maxdepth 1 -type f -name '*.md' | sed 's#^.*/##' | sort)
  expected_list=$(printf '%s\n' "${expected_files[@]}" | sort)

  if [ "$actual_list" != "$expected_list" ]; then
    fail "setup pack files do not match required exact 10-file set"
    echo "[verify] expected files:"
    printf '%s\n' "${expected_files[@]}"
    echo "[verify] actual files:"
    if [ -n "$actual_list" ]; then
      printf '%s\n' "$actual_list"
    else
      echo "(none)"
    fi
  else
    pass "setup pack has exact required 10 files"
  fi

  for file in "${expected_files[@]}"; do
    path="$pack_dir/$file"
    if [ ! -f "$path" ]; then
      fail "missing file: $path"
      continue
    fi

    h2_lines=()
    while IFS= read -r line; do
      h2_lines+=("$line")
    done < <(grep '^## ' "$path" || true)

    if [ ${#h2_lines[@]} -ne ${#required_headers[@]} ]; then
      fail "$path has ${#h2_lines[@]} H2 headers, expected ${#required_headers[@]}"
      continue
    fi

    header_ok=1
    for i in "${!required_headers[@]}"; do
      if [ "${h2_lines[$i]}" != "${required_headers[$i]}" ]; then
        header_ok=0
        fail "$path header order mismatch at position $((i + 1)): expected '${required_headers[$i]}', got '${h2_lines[$i]}'"
      fi
    done

    if [ "$header_ok" -eq 1 ]; then
      pass "$path has required H2 headers in exact order"
    fi
  done
fi

# Secret pattern scan (heuristic). Pointer format and TBD placeholders are allowed.
echo "[verify] running secret pattern scan"
secret_patterns=(
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'ghp_[A-Za-z0-9]{36}'
  'github_pat_[A-Za-z0-9_]{60,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'sk-[A-Za-z0-9]{32,}'
  '-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----'
  '(?i)(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_\-]{16,}'
)

secret_hits=""
for pattern in "${secret_patterns[@]}"; do
  if [ "$has_rg" -eq 1 ]; then
    hits=$(rg -n --hidden --glob '!.git/**' --glob '!supabase/.temp/**' --glob '!scripts/verify.sh' -e "$pattern" . || true)
  else
    hits=$(grep -RInE --exclude-dir=.git --exclude-dir=node_modules --exclude=scripts/verify.sh "$pattern" . || true)
  fi
  if [ -n "$hits" ]; then
    if [ "$has_rg" -eq 1 ]; then
      filtered=$(printf '%s\n' "$hits" | rg -v 'AI Fluency Lab Ops/|<Item>#<Field>|TBD|placeholder|example' || true)
    else
      filtered=$(printf '%s\n' "$hits" | grep -Ev 'AI Fluency Lab Ops/|<Item>#<Field>|TBD|placeholder|example' || true)
    fi
    if [ -n "$filtered" ]; then
      secret_hits+="$filtered"$'\n'
    fi
  fi
done

if [ -n "$secret_hits" ]; then
  fail "potential raw secret patterns detected"
  printf '%s\n' "$secret_hits"
else
  pass "no raw secret patterns detected"
fi

# Test runner detection and execution.
manager="npm"
if [ -f "pnpm-lock.yaml" ]; then
  manager="pnpm"
elif [ -f "yarn.lock" ]; then
  manager="yarn"
fi

echo "[verify] package manager preference: ${manager}"

has_test_script="no"
if [ -f "package.json" ]; then
  if command -v node >/dev/null 2>&1; then
    if node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));process.exit(pkg?.scripts?.test ? 0 : 1);" >/dev/null 2>&1; then
      has_test_script="yes"
    fi
  elif command -v rg >/dev/null 2>&1 && rg -q '"test"[[:space:]]*:' package.json; then
    has_test_script="yes"
  fi
fi

if [ "$has_test_script" = "yes" ]; then
  case "$manager" in
    pnpm) cmd=(pnpm test) ;;
    yarn) cmd=(yarn test) ;;
    *) cmd=(npm test) ;;
  esac

  echo "[verify] running: ${cmd[*]}"
  if command -v "${cmd[0]}" >/dev/null 2>&1; then
    "${cmd[@]}"
    test_status=$?
    if [ $test_status -eq 0 ]; then
      pass "test command passed"
    else
      fail "test command failed with exit $test_status"
    fi
  else
    fail "test runner command not found: ${cmd[0]}"
  fi
else
  echo "No test runner detected yet."
  pass "test phase skipped because package.json test script is absent"
fi

if [ $status -eq 0 ]; then
  echo "[verify] completed successfully"
else
  echo "[verify] completed with failures"
fi

exit $status
