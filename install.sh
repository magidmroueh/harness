#!/bin/bash
set -euo pipefail

REPO="magidmroueh/harness"
APP_NAME="Harness"
INSTALL_DIR="/Applications"

info()  { printf "\033[0;34m%s\033[0m\n" "$*"; }
error() { printf "\033[0;31m%s\033[0m\n" "$*" >&2; exit 1; }

# --- Checks ---
[[ "$(uname -s)" == "Darwin" ]] || error "Harness is currently macOS only."
command -v curl >/dev/null || error "curl is required."

# --- Detect architecture ---
ARCH="$(uname -m)"
case "$ARCH" in
  arm64)  PATTERN="arm64.dmg" ;;
  x86_64) PATTERN="x64.dmg" ;;
  *)      error "Unsupported architecture: $ARCH" ;;
esac

# --- Find latest release ---
info "Fetching latest release..."
RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASE_JSON="$(curl -fsSL "$RELEASE_URL")" || error "Failed to fetch release info. Make sure there is a published release."

DOWNLOAD_URL="$(echo "$RELEASE_JSON" | grep -o "\"browser_download_url\": *\"[^\"]*${PATTERN}\"" | head -1 | cut -d'"' -f4)"
VERSION="$(echo "$RELEASE_JSON" | grep -o "\"tag_name\": *\"[^\"]*\"" | head -1 | cut -d'"' -f4)"

if [[ -z "$DOWNLOAD_URL" ]]; then
  # Fallback: try universal DMG or any DMG
  DOWNLOAD_URL="$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*\.dmg"' | head -1 | cut -d'"' -f4)"
fi

[[ -n "$DOWNLOAD_URL" ]] || error "No DMG found in latest release. Visit https://github.com/${REPO}/releases"

info "Installing ${APP_NAME} ${VERSION} for ${ARCH}..."

# --- Download ---
TMP_DIR="$(mktemp -d)"
DMG_PATH="${TMP_DIR}/${APP_NAME}.dmg"
curl -fSL --progress-bar "$DOWNLOAD_URL" -o "$DMG_PATH" || error "Download failed."

# --- Mount & copy ---
info "Installing to ${INSTALL_DIR}..."
MOUNT_POINT="$(hdiutil attach -nobrowse -noautoopen "$DMG_PATH" 2>/dev/null | grep '/Volumes/' | awk -F'\t' '{print $NF}')"
[[ -n "$MOUNT_POINT" ]] || error "Failed to mount DMG."

APP_PATH="$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -print -quit)"
[[ -n "$APP_PATH" ]] || { hdiutil detach "$MOUNT_POINT" -quiet; error "No .app found in DMG."; }

# Remove old version if present
if [[ -d "${INSTALL_DIR}/${APP_NAME}.app" ]]; then
  info "Removing previous version..."
  rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
fi

cp -R "$APP_PATH" "${INSTALL_DIR}/" || { hdiutil detach "$MOUNT_POINT" -quiet; error "Failed to copy to ${INSTALL_DIR}. Try: sudo curl -fsSL ... | bash"; }

# --- Cleanup ---
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null
rm -rf "$TMP_DIR"

# --- Remove quarantine ---
xattr -dr com.apple.quarantine "${INSTALL_DIR}/${APP_NAME}.app" 2>/dev/null || true

info ""
info "${APP_NAME} ${VERSION} installed to ${INSTALL_DIR}/${APP_NAME}.app"
info "Run it from Spotlight or: open -a ${APP_NAME}"
