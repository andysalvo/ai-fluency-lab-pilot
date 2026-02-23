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
  "00_CYCLE_01_SYSTEM_RATIONALE.md"
  "01_PRODUCT_SCOPE.md"
  "02_NOTION_FORM_SPEC.md"
  "03_SUPABASE_WAREHOUSE_SCHEMA.md"
  "04_INGEST_IDEMPOTENCY_AND_EMBEDDING.md"
  "05_OPERATOR_ANALYSIS_WORKFLOW.md"
  "06_SCALE_PLAN_3_TO_20.md"
  "07_ACCEPTANCE_TESTS.md"
  "08_RESEARCH_BASIS.md"
)

pack_dir="docs/warehouse"

if [ ! -d "$pack_dir" ]; then
  fail "missing required directory: $pack_dir"
else
  actual_list=$(find "$pack_dir" -maxdepth 1 -type f -name '*.md' | sed 's#^.*/##' | sort)
  expected_list=$(printf '%s\n' "${expected_files[@]}" | sort)

  if [ "$actual_list" != "$expected_list" ]; then
    fail "warehouse doc files do not match required set"
    echo "[verify] expected files:"
    printf '%s\n' "${expected_files[@]}"
    echo "[verify] actual files:"
    if [ -n "$actual_list" ]; then
      printf '%s\n' "$actual_list"
    else
      echo "(none)"
    fi
  else
    pass "warehouse docs have required file set"
  fi

  if [ -f "$pack_dir/00_CYCLE_01_SYSTEM_RATIONALE.md" ]; then
    if grep -qi 'How do we build sustained AI fluency inside a student population' "$pack_dir/00_CYCLE_01_SYSTEM_RATIONALE.md"; then
      pass "cycle rationale includes canonical focus question"
    else
      fail "cycle rationale missing canonical focus question"
    fi
  fi
fi

if [ -d "docs/legacy" ]; then
  pass "legacy archive directory exists"
else
  fail "missing docs/legacy archive"
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
