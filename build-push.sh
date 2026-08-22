#!/usr/bin/env bash
#
# build-push.sh — one command to build (cross-arch) + package + push the image.
#
# Usage:
#   ./build-push.sh                     # tag = YYYYMMDD-<git short sha> + latest
#   ./build-push.sh 20260705            # explicit tag + latest
#   ./build-push.sh v1.2.3              # any tag + latest
#   IMAGE=my.reg/ns/app ./build-push.sh # override target image
#   PLATFORM=linux/arm64 ./build-push.sh  # if your server is arm64
#
# The chosen tag is ALSO embedded as the in-app version (About/status page):
# the script writes it to VERSION for the build, then restores VERSION on exit
# so your working tree ends unchanged (net-zero).
#
# Notes:
#   - Runs the whole build inside Docker (Go + web/default + web/classic),
#     so you don't need to pre-build anything.
#   - Uses your CURRENT default buildx builder. On this machine that is the
#     Docker Desktop "desktop-linux" builder, which (a) has the containerd
#     image store so it can cross-build and --push directly, and (b) uses the
#     daemon's registry mirrors so docker.io base images pull fast.
#     Do NOT `docker buildx create` a fresh docker-container builder in China:
#     it bypasses the mirror and times out pulling base images.
#   - Run `docker login <registry>` once beforehand.
#
set -euo pipefail

IMAGE="${IMAGE:-registry.cn-shanghai.aliyuncs.com/gongyong1/torchai}"
PLATFORM="${PLATFORM:-linux/amd64}"
REGISTRY="${IMAGE%%/*}"

# Build from the repo root so the Docker context is correct.
ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || dirname "${BASH_SOURCE[0]}")"
cd "$ROOT"

# Version = explicit arg, else YYYYMMDD-<short git sha>.
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
TAG="${1:-$(date +%Y%m%d)-${GIT_SHA}}"

# Soft login hint (non-fatal).
if ! grep -q "$REGISTRY" "${HOME}/.docker/config.json" 2>/dev/null; then
  echo "!! Might not be logged in to ${REGISTRY}. If push fails, run: docker login ${REGISTRY}" >&2
fi

echo ">> Repo:     $ROOT"
echo ">> Image:    $IMAGE"
echo ">> Platform: $PLATFORM"
echo ">> Tags:     $TAG, latest"
echo

# Embed the version into the app: write it to VERSION (read by the Dockerfile's
# ldflag + VITE_REACT_APP_VERSION), then restore VERSION on exit so the working
# tree is left unchanged even if the build fails or is interrupted.
VERSION_FILE="${ROOT}/VERSION"
VERSION_BACKUP="$(mktemp)"
if [[ -f "$VERSION_FILE" ]]; then had_version=1; cp "$VERSION_FILE" "$VERSION_BACKUP"; else had_version=0; fi
restore_version() {
  if [[ "$had_version" -eq 1 ]]; then cp "$VERSION_BACKUP" "$VERSION_FILE"; else rm -f "$VERSION_FILE"; fi
  rm -f "$VERSION_BACKUP"
}
trap restore_version EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s' "$TAG" > "$VERSION_FILE"

# Hand the host's Go module proxy to the builder. Without this the in-container
# build falls back to proxy.golang.org, which is unreachable from some networks
# and only shows up when a go.mod change invalidates the download layer.
build_args=()
goproxy="${GOPROXY:-$(go env GOPROXY 2>/dev/null || true)}"
if [[ -n "$goproxy" ]]; then
  echo ">> GOPROXY:  $goproxy"
  build_args+=(--build-arg "GOPROXY=${goproxy}")
fi

docker buildx build \
  --platform "$PLATFORM" \
  "${build_args[@]}" \
  -t "${IMAGE}:${TAG}" \
  -t "${IMAGE}:latest" \
  --push \
  .

echo
echo ">> Pushed. Remote manifest:"
docker buildx imagetools inspect "${IMAGE}:${TAG}" | grep -iE 'Name:|Platform:' | head -6 || true

cat <<EOF

>> Done:
   ${IMAGE}:${TAG}
   ${IMAGE}:latest

Deploy on the server:
   docker compose pull new-api && docker compose up -d new-api
EOF
