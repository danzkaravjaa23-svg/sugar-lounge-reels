#!/bin/bash
# Mac програм (Sugar Lounge Reels.app) бүтээж, Desktop дээр суулгана.
#
#   scripts/build-mac-app.sh                 # бүтээх + ~/Desktop-д суулгах
#   scripts/build-mac-app.sh /Applications   # өөр хавтсанд суулгах
#   scripts/build-mac-app.sh --no-install    # зөвхөн dist/-д бүтээх
#
# recipe.js эсвэл бусад вэб файл өөрчлөгдсөн бүрт дахин ажиллуулна —
# програм вэб файлуудын хуулбарыг өөр дотроо агуулдаг.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Sugar Lounge Reels"
EXEC_NAME="SugarLoungeReels"
BUNDLE_ID="mn.sugarlounge.reels"
MIN_MACOS="12.0"
DIST="$ROOT/dist"
APP="$DIST/$APP_NAME.app"

INSTALL_DIR="$HOME/Desktop"
if [[ "${1:-}" == "--no-install" ]]; then
  INSTALL_DIR=""
elif [[ -n "${1:-}" ]]; then
  INSTALL_DIR="$1"
fi

VERSION="$(sed -nE 's/^[[:space:]]*version:[[:space:]]*([0-9]+),.*/\1/p' "$ROOT/js/recipe.js" | head -1)"
VERSION="0.${VERSION:-0}"
BUILD="$(date +%Y%m%d%H%M)"

echo "▸ Бүтээж байна: $APP_NAME $VERSION ($BUILD)"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

# Apple Silicon + Intel хоёуланд ажиллах universal binary
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for ARCH in arm64 x86_64; do
  swiftc -O -target "$ARCH-apple-macos$MIN_MACOS" \
    -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
    "$ROOT/mac/ReelsApp.swift" -o "$TMP/$EXEC_NAME-$ARCH"
done
lipo -create "$TMP/$EXEC_NAME-arm64" "$TMP/$EXEC_NAME-x86_64" -output "$APP/Contents/MacOS/$EXEC_NAME"

# Вэб файлууд (туршилт, баримт бичиг, скрипт орохгүй)
for ITEM in index.html manifest.webmanifest css js icons assets; do
  cp -R "$ROOT/$ITEM" "$APP/Contents/Resources/web/"
done
cp "$ROOT/mac/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>mn</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleExecutable</key><string>$EXEC_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD</string>
  <key>LSMinimumSystemVersion</key><string>$MIN_MACOS</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.video</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHumanReadableCopyright</key><string>Sugar Lounge · Dining · KTV · Ent</string>
</dict>
</plist>
PLIST
plutil -lint "$APP/Contents/Info.plist" >/dev/null

# Finder-ийн tag зэрэг xattr үлдвэл codesign "detritus not allowed" гээд унадаг
xattr -cr "$APP"

# Apple Silicon дээр гарын үсэггүй програм ажилладаггүй — ad-hoc гарын үсэг
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
echo "✓ Бүтээгдлээ: $APP"

if [[ -n "$INSTALL_DIR" ]]; then
  # Нээлттэй програмыг хүчээр хаахгүй — хадгалаагүй видео алдагдаж болно
  RUNNING=0
  if pgrep -x "$EXEC_NAME" >/dev/null; then RUNNING=1; fi
  DEST="$INSTALL_DIR/$APP_NAME.app"
  rm -rf "$DEST"
  ditto "$APP" "$DEST"
  # Finder icon-ыг шууд шинэчлэх
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST" || true
  touch "$DEST"
  echo "✓ Суулгагдлаа: $DEST"
  if [[ $RUNNING == 1 ]]; then
    echo "⚠ $APP_NAME нээлттэй байна — шинэ хувилбарыг ажиллуулахын тулд цонхоо хаагаад дахин нээнэ үү."
  fi
fi
