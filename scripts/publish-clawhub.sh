#!/usr/bin/env bash
#
# Publish skills to ClawHub registry.
#
# Usage:
#   ./scripts/publish-clawhub.sh <skill-dir> <version>     # publish one skill
#   ./scripts/publish-clawhub.sh --all <bump>              # publish all skills
#
# Examples:
#   ./scripts/publish-clawhub.sh skills/crypto-market-rank 1.0.0
#   ./scripts/publish-clawhub.sh --all patch
#   ./scripts/publish-clawhub.sh --all minor --dry-run
#
# Options:
#   --dry-run    Preview what would be published without actually publishing
#   --no-prefix  Don't add "aurehub-" prefix to slug (use skill name as-is)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/skills"
PREFIX="aurehub-"
DRY_RUN=false
NO_PREFIX=false

# ── helpers ──────────────────────────────────────────────────────────────────

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }

die() { red "Error: $*" >&2; exit 1; }

check_clawhub() {
  if ! command -v clawhub &>/dev/null; then
    die "clawhub CLI not found. Install with: npm i -g clawhub"
  fi
}

# Extract field from SKILL.md YAML frontmatter
extract_field() {
  local file="$1" field="$2"
  sed -n '/^---$/,/^---$/p' "$file" | grep "^${field}:" | head -1 | sed "s/^${field}:[[:space:]]*//" | sed 's/^["'\'']\(.*\)["'\''"]$/\1/'
}

# Build the slug: prefix + skill name
make_slug() {
  local name="$1"
  if [ "$NO_PREFIX" = true ]; then
    echo "$name"
  else
    echo "${PREFIX}${name}"
  fi
}

# ── publish one skill ────────────────────────────────────────────────────────

publish_one() {
  local skill_path="$1"
  local version="$2"

  # Resolve to absolute path
  if [[ "$skill_path" != /* ]]; then
    skill_path="$REPO_ROOT/$skill_path"
  fi

  local skill_md="$skill_path/SKILL.md"
  [ -f "$skill_md" ] || die "SKILL.md not found in $skill_path"

  local name description slug
  name="$(extract_field "$skill_md" "name")"
  description="$(extract_field "$skill_md" "description")"
  slug="$(make_slug "$name")"

  [ -n "$name" ] || die "Missing 'name' in $skill_md frontmatter"
  [ -n "$version" ] || die "Version is required"

  echo ""
  yellow "Publishing: $name"
  echo "  Slug:    $slug"
  echo "  Version: $version"
  echo "  Path:    $skill_path"

  if [ "$DRY_RUN" = true ]; then
    yellow "  [DRY RUN] Skipping actual publish"
    return 0
  fi

  clawhub publish "$skill_path" \
    --slug "$slug" \
    --name "$name" \
    --version "$version" \
    --tags latest

  green "  Published $slug@$version"
}

# ── publish all skills ───────────────────────────────────────────────────────

publish_all() {
  local bump="$1"
  local count=0 failed=0

  echo ""
  yellow "Scanning $SKILLS_DIR for skills..."

  for skill_dir in "$SKILLS_DIR"/*/; do
    [ -d "$skill_dir" ] || continue

    local skill_md="$skill_dir/SKILL.md"
    [ -f "$skill_md" ] || continue

    local name
    name="$(extract_field "$skill_md" "name")"
    [ -n "$name" ] || continue

    # Skip example-skill
    if [ "$name" = "example-skill" ]; then
      yellow "  Skipping example-skill"
      continue
    fi

    local slug
    slug="$(make_slug "$name")"

    echo ""
    yellow "Publishing: $name -> $slug"

    if [ "$DRY_RUN" = true ]; then
      yellow "  [DRY RUN] Would publish $skill_dir with --bump $bump"
      count=$((count + 1))
      continue
    fi

    if clawhub publish "$skill_dir" \
      --slug "$slug" \
      --name "$name" \
      --bump "$bump" \
      --tags latest; then
      green "  Published $slug"
      count=$((count + 1))
    else
      red "  Failed to publish $slug"
      failed=$((failed + 1))
    fi
  done

  echo ""
  green "Done. Published: $count, Failed: $failed"
}

# ── main ─────────────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage:
  ./scripts/publish-clawhub.sh <skill-dir> <version>     Publish one skill
  ./scripts/publish-clawhub.sh --all <bump>              Publish all skills (bump: patch|minor|major)

Options:
  --dry-run    Preview without publishing
  --no-prefix  Don't add "aurehub-" prefix to slug

Examples:
  ./scripts/publish-clawhub.sh skills/crypto-market-rank 1.0.0
  ./scripts/publish-clawhub.sh --all patch
  ./scripts/publish-clawhub.sh --all minor --dry-run
EOF
  exit 1
}

# Parse flags
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=true ;;
    --no-prefix) NO_PREFIX=true ;;
    *)           ARGS+=("$arg") ;;
  esac
done

[ ${#ARGS[@]} -ge 1 ] || usage

check_clawhub

if [ "${ARGS[0]}" = "--all" ]; then
  bump="${ARGS[1]:-patch}"
  [[ "$bump" =~ ^(patch|minor|major)$ ]] || die "Invalid bump type: $bump (use patch|minor|major)"
  publish_all "$bump"
else
  [ ${#ARGS[@]} -ge 2 ] || usage
  publish_one "${ARGS[0]}" "${ARGS[1]}"
fi
