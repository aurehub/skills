#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_ROOT="$REPO_ROOT/skills"

extract_skill_version() {
  local skill_md="$1"
  awk '
    BEGIN { in_frontmatter=0; frontmatter_seen=0; in_metadata=0 }
    $0 == "---" {
      frontmatter_seen++
      if (frontmatter_seen == 1) { in_frontmatter=1; next }
      if (frontmatter_seen == 2) { in_frontmatter=0 }
    }
    in_frontmatter {
      if ($0 ~ /^metadata:[[:space:]]*$/) { in_metadata=1; next }
      if (in_metadata && $0 ~ /^[^[:space:]]/) { in_metadata=0 }
      if (in_metadata && $0 ~ /^[[:space:]]+version:[[:space:]]*/) {
        line=$0
        sub(/^[[:space:]]+version:[[:space:]]*/, "", line)
        gsub(/^"|"$/, "", line)
        gsub(/^\x27|\x27$/, "", line)
        print line
        exit
      }
    }
  ' "$skill_md"
}

extract_package_json_version() {
  local package_json="$1"
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$package_json" | head -1
}

is_semver() {
  local version="$1"
  printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
}

validate_skill_dir() {
  local skill_dir="$1"
  local skill_md="$skill_dir/SKILL.md"
  local package_json="$skill_dir/scripts/package.json"

  if [ ! -f "$skill_md" ]; then
    echo "[skip] $skill_dir (no SKILL.md)"
    return 0
  fi

  local skill_version
  skill_version="$(extract_skill_version "$skill_md")"

  if [ -z "$skill_version" ]; then
    echo "[error] $skill_md missing metadata.version"
    return 1
  fi

  if ! is_semver "$skill_version"; then
    echo "[error] $skill_md metadata.version is not valid semver: $skill_version"
    return 1
  fi

  if [ -f "$package_json" ]; then
    local package_version
    package_version="$(extract_package_json_version "$package_json")"

    if [ -z "$package_version" ]; then
      echo "[error] $package_json missing version"
      return 1
    fi

    if ! is_semver "$package_version"; then
      echo "[error] $package_json version is not valid semver: $package_version"
      return 1
    fi

    if [ "$skill_version" != "$package_version" ]; then
      echo "[error] version mismatch in $skill_dir"
      echo "        SKILL.md metadata.version: $skill_version"
      echo "        scripts/package.json version: $package_version"
      return 1
    fi
  fi

  echo "[ok] $skill_dir version: $skill_version"
  return 0
}

collect_targets() {
  if [ "$#" -gt 0 ]; then
    for input in "$@"; do
      if [ -d "$input" ]; then
        (cd "$input" && pwd)
      elif [ -d "$REPO_ROOT/$input" ]; then
        (cd "$REPO_ROOT/$input" && pwd)
      else
        echo "[error] skill directory not found: $input" >&2
        return 1
      fi
    done
    return 0
  fi

  find "$SKILLS_ROOT" -mindepth 1 -maxdepth 1 -type d | sort
}

main() {
  local failures=0
  local targets
  targets="$(collect_targets "$@")" || exit 1

  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    if ! validate_skill_dir "$dir"; then
      failures=$((failures + 1))
    fi
  done <<< "$targets"

  if [ "$failures" -gt 0 ]; then
    echo "[fail] skill version check failed: $failures skill(s)"
    exit 1
  fi

  echo "[pass] all skill versions are valid"
}

main "$@"
