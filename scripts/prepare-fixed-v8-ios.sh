#!/usr/bin/env bash
set -euo pipefail

RUNTIME_ROOT="${1:?usage: prepare-fixed-v8-ios.sh <napi-ios-runtime-root>}"
PACKAGE_JSON="$RUNTIME_ROOT/package.json"
CMAKE_FILE="$RUNTIME_ROOT/NativeScript/CMakeLists.txt"
MARKER_DIR="$RUNTIME_ROOT/Frameworks"

# The current napi-ios V8 bridge is pinned to the older V8 14.3 API. Replacing
# only its binary/headers with NativeScript's fixed V8 14.9 build is not ABI/API
# compatible: 14.9 adds typed external/embedder pointers and many other API
# changes. Rather than carrying a partial V8 migration in this app, build the
# runtime with napi-ios' first-class JavaScriptCore engine on Apple platforms.
# JSC uses the same NativeScript direct FFI/native interop backend and avoids
# V8's iOS virtual-address-space/JIT constraints entirely.

test -f "$PACKAGE_JSON"
test -f "$CMAKE_FILE"
test -f "$RUNTIME_ROOT/NativeScript/napi/jsc/jsr.cpp"
test -f "$RUNTIME_ROOT/NativeScript/ffi/jsc/NativeApiJSC.mm"

grep -F -- '--jsc' "$RUNTIME_ROOT/scripts/build_nativescript.sh" >/dev/null
grep -F 'TARGET_ENGINE_JSC' "$CMAKE_FILE" >/dev/null
grep -F 'FFI_JSC_DIRECT_SOURCE_FILES' "$CMAKE_FILE" >/dev/null

python3 - "$PACKAGE_JSON" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
data = json.loads(path.read_text())
scripts = data.setdefault('scripts', {})
# Keep the produced npm package as @nativescript/ios so the NativeScript CLI's
# existing --framework-path flow remains unchanged; only swap the embedded JS
# engine used to build NativeScript.framework.
scripts['build-ios'] = './scripts/build_all_ios.sh --jsc'
path.write_text(json.dumps(data, indent=2) + '\n')
PY

mkdir -p "$MARKER_DIR"
rm -rf "$MARKER_DIR/libv8_monolith.xcframework"
printf '%s\n' 'jsc' > "$MARKER_DIR/RUNTIME_ENGINE"
# ci-ios.yml from the earlier V8 experiment still cats this marker. Keep it as
# a compatibility marker until the workflow is simplified in a later cleanup.
printf '%s\n' 'V8 disabled; using JavaScriptCore' > "$MARKER_DIR/V8_FIXED_RELEASE"

{
  echo 'Runtime engine: JavaScriptCore (JSC)'
  echo 'NativeScript FFI backend: direct (auto for TARGET_ENGINE_JSC)'
  echo 'V8 replacement/migration: disabled'
  echo 'Reason: napi-ios V8 bridge is API-incompatible with V8 14.9 headers'
  echo 'Patched build command:'
  node -e "console.log(require('$PACKAGE_JSON').scripts['build-ios'])"
}
