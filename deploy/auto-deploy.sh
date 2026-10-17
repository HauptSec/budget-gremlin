#!/usr/bin/env bash
# Inspired by HauptSec/kanban-calendar's polling deployer.
# This checkout is deploy-only; tracked local edits are replaced by origin/main.
set -Eeuo pipefail

# Parse the function before resetting the checkout, which can replace this script.
main() {
  local force="${1:-}" target deployed container
  if [[ $# -gt 1 || ( -n "$force" && "$force" != --force ) ]]; then
    echo 'Usage: auto-deploy.sh [--force]' >&2
    return 2
  fi
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  umask 077
  exec 9>.git/budget-gremlin-deploy.lock
  flock -n 9 || return 0
  export GIT_TERMINAL_PROMPT=0
  git fetch --quiet origin main
  target=$(git rev-parse origin/main)
  deployed=$(cat .git/budget-gremlin-deployed 2>/dev/null || true)
  if [[ "$target" == "$deployed" && "$force" != --force ]]; then
    return 0
  fi

  # Public repository: no GitHub token or inbound webhook is required.
  # Fail closed on API errors; wait for a successful Verify run for this exact SHA.
  if ! curl --fail --silent --show-error --max-time 30 \
    "https://api.github.com/repos/HauptSec/budget-gremlin/actions/workflows/ci.yml/runs?head_sha=${target}&event=push&per_page=1" |
    python3 -c 'import json,sys; runs=json.load(sys.stdin).get("workflow_runs", []); sys.exit(0 if runs and runs[0]["head_sha"] == sys.argv[1] and runs[0]["conclusion"] == "success" else 1)' "$target"; then
    echo "Waiting for successful GitHub verification of $target; keeping current deployment."
    return 0
  fi

  echo "Deploying $target"
  git reset --quiet --hard "$target"
  # Keep the project name stable so updates reuse existing financial data volumes.
  local -a compose=(docker compose --project-name budget-gremlin -f compose.yaml)
  "${compose[@]}" config --quiet
  # Build before touching the running service. A failed build leaves it running.
  "${compose[@]}" build app
  container=$("${compose[@]}" ps --status running -q app)
  if [[ -n "$container" ]]; then
    "${compose[@]}" exec -T app npm run backup
  fi
  "${compose[@]}" up -d --no-build --wait --wait-timeout 180
  "${compose[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  # Record success only after health checks; failures retry on the next timer tick.
  printf '%s\n' "$target" > .git/budget-gremlin-deployed.tmp
  mv .git/budget-gremlin-deployed.tmp .git/budget-gremlin-deployed
  echo "Deployment healthy: $target"
}
main "$@"
