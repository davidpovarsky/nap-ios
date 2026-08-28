#!/usr/bin/env bash
set -euo pipefail

RUNTIME_ROOT="${1:?usage: prepare-fixed-v8-ios.sh <napi-ios-runtime-root>}"
V8_TAG="${V8_TAG:-v8-14.9.207.39-6}"
V8_VERSION="${V8_TAG#v8-}"
RELEASE_BASE="https://github.com/NativeScript/v8-buildscripts/releases/download/${V8_TAG}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/napi-ios-v8-${V8_VERSION}"
XCROOT="${RUNTIME_ROOT}/Frameworks/libv8_monolith.xcframework"
JSR="${RUNTIME_ROOT}/NativeScript/napi/v8/jsr.cpp"

rm -rf "$WORK_ROOT" "$XCROOT"
mkdir -p "$WORK_ROOT" "$XCROOT"

prepare_slice() {
  local variant="$1"
  local slice="$2"
  local archive="$WORK_ROOT/v8-${V8_VERSION}-ios-${variant}.tar.gz"
  local extracted="$WORK_ROOT/${variant}"
  local source_dir="$extracted/ios-${variant}"
  local framework="$XCROOT/${slice}/libv8_monolith.framework"
  local libs

  mkdir -p "$extracted" "$framework/Headers"

  curl -fL --retry 4 --retry-delay 2 --retry-all-errors \
    "${RELEASE_BASE}/v8-${V8_VERSION}-ios-${variant}.tar.gz" \
    -o "$archive"
  tar -xzf "$archive" -C "$extracted"

  test -d "$source_dir/lib"
  test -d "$source_dir/include"

  libs=$(find "$source_dir/lib" -type f -name '*.a' -print | LC_ALL=C sort)
  if [ -z "$libs" ]; then
    echo "No V8 static libraries found in $source_dir/lib" >&2
    exit 1
  fi

  # NativeScript/runtimes currently consumes a monolithic imported static
  # library. Repackage NativeScript's official fixed per-module V8 archives
  # into the exact layout its CMake file already expects.
  # shellcheck disable=SC2086
  xcrun libtool -static -o "$framework/libv8_monolith" $libs
  xcrun ranlib "$framework/libv8_monolith"
  cp -R "$source_dir/include/." "$framework/Headers/"

  test -s "$framework/libv8_monolith"
  test -f "$framework/Headers/v8.h"
}

prepare_slice arm64-device ios-arm64
prepare_slice arm64-simulator ios-arm64-simulator

python3 - "$JSR" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

old_assert = '''#if defined(__APPLE__) && TARGET_OS_IPHONE
static_assert(v8::internal::PointerCompressionIsEnabled(),
              "iOS V8 embedder must be built with pointer compression enabled");
static_assert(v8::internal::SmiValuesAre31Bits(),
              "iOS V8 embedder must use 31-bit smis on 64-bit arch");
#endif
'''
if old_assert not in text:
    raise SystemExit('Expected iOS pointer-compression static_assert block not found in jsr.cpp')
text = text.replace(old_assert, '''#if defined(__APPLE__) && TARGET_OS_IPHONE
// NativeScript's supported iOS V8 build deliberately disables pointer
// compression and the cppgc caged heap. iOS cannot reliably reserve the
// multi-gigabyte aligned cages those features require on constrained devices.
#endif
''', 1)

old_flags = '    v8::V8::SetFlagsFromString("--expose_gc");'
new_flags = '''#if defined(__APPLE__) && TARGET_OS_IPHONE
    // iOS does not permit V8 JIT code generation. The linked V8 is also built
    // with v8_enable_lite_mode=true, and this runtime flag keeps the policy
    // explicit at startup.
    v8::V8::SetFlagsFromString("--expose_gc --jitless");
#else
    v8::V8::SetFlagsFromString("--expose_gc");
#endif'''
if old_flags not in text:
    raise SystemExit('Expected V8 flag initialization not found in jsr.cpp')
text = text.replace(old_flags, new_flags, 1)

path.write_text(text)
PY

# Presence of this directory prevents the runtime build from downloading the
# older DjDeveloperr V8 package. Record exactly what CI linked for diagnostics.
printf '%s\n' "$V8_TAG" > "$RUNTIME_ROOT/Frameworks/V8_FIXED_RELEASE"

{
  echo "V8 release: $V8_TAG"
  echo "Device archive: $(du -h "$XCROOT/ios-arm64/libv8_monolith.framework/libv8_monolith" | awk '{print $1}')"
  echo "Simulator archive: $(du -h "$XCROOT/ios-arm64-simulator/libv8_monolith.framework/libv8_monolith" | awk '{print $1}')"
  echo "Patched runtime: $JSR"
}
