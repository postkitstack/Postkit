#!/usr/bin/env bash

set -euo pipefail

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Configuration
BINARY_NAME="pgschema"
BUILD_DIR="build"
VERSION_FILE="internal/version/VERSION"

# Ensure we have a version file
if [[ ! -f "$VERSION_FILE" ]]; then
  echo "Error: $VERSION_FILE not found"
  exit 1
fi

VERSION=$(cat "$VERSION_FILE" | tr -d '\n')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Build flags
LDFLAGS="-w -s -X github.com/pgplex/pgschema/cmd.GitCommit=${GIT_COMMIT} -X 'github.com/pgplex/pgschema/cmd.BuildDate=${BUILD_DATE}'"

# Target Platforms (OS/Arch)
PLATFORMS=(
  "darwin/amd64"
  "darwin/arm64"
  "linux/amd64"
  "linux/arm64"
  "windows/amd64"
  "windows/arm64"
)

# Create build directory
mkdir -p "$BUILD_DIR"
rm -rf "${BUILD_DIR:?}/"*

echo "Building pgschema v$VERSION..."
echo "Commit: $GIT_COMMIT"
echo "Date: $BUILD_DATE"
echo "-----------------------------------"

for PLATFORM in "${PLATFORMS[@]}"; do
  OS="${PLATFORM%/*}"
  ARCH="${PLATFORM#*/}"
  
  OUTPUT_NAME="${BINARY_NAME}-${OS}-${ARCH}"
  if [[ "$OS" == "windows" ]]; then
    OUTPUT_NAME="${OUTPUT_NAME}.exe"
  fi
  
  echo "Building for $OS/$ARCH..."
  
  GOOS=$OS GOARCH=$ARCH go build \
    -ldflags="$LDFLAGS" \
    -o "$BUILD_DIR/$OUTPUT_NAME" \
    .
    
  echo "Created: $BUILD_DIR/$OUTPUT_NAME"
done

echo "-----------------------------------"
echo "Build complete! Binaries are in the $BUILD_DIR/ folder."
