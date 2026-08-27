# napi-ios Script Runner MVP

A small iOS proof-of-concept that imports a JavaScript/text file from the iOS document picker and executes it inside the NativeScript iOS runtime.

## App behavior

- Opens the native iOS document picker.
- Imports `.js`, `.mjs`, `.txt`, or generic UTF-8 data.
- Shows the selected source before execution.
- Runs only after tapping **Run Script**.
- Mirrors `console.log/info/warn/error` into an in-app console.
- Guest code executes in the NativeScript global runtime and can use native metadata symbols exposed by that runtime, such as UIKit/Foundation APIs.

`app/example.js` demonstrates a JavaScript-created native alert.

## Runtime integration

CI clones `NativeScript/napi-ios`, builds it with `npm run build-ios`, locates the generated embedded `.tgz`, and attaches that exact locally-built runtime using:

```bash
ns platform add ios --framework-path=/path/to/runtime.tgz
```

This follows the current NativeScript runtime development flow rather than silently using an unrelated preinstalled runtime.

## GitHub Actions

### `iOS CI - runtime, simulator, IPA`

Runs automatically on pushes to `main` and can also be started manually.

It:

1. Records Xcode, macOS, simulator and NativeScript diagnostics.
2. Builds the latest `NativeScript/napi-ios` runtime from source.
3. Prepares the application against that locally-built runtime.
4. Builds the simulator `.app`.
5. Boots an available iPhone Simulator.
6. Installs and launches the app in that simulator.
7. Captures a simulator screenshot and simulator/system logs.
8. Builds an unsigned device `.app` with code device build disabled.
9. Packages that device build as `NapiScriptRunner-unsigned.ipa`.
10. Uploads **all build logs, simulator logs, screenshot, simulator app ZIP, and ununsigned IPA** as one GitHub Actions artifact even when a later step fails.

The ununsigned IPA is useful as a CI/device-build proof, but **cannot be installed on a normal iPhone/iPad until it is signed**.

### `Ununsigned IPA`

Manual workflow for producing an installable unsigned IPA. It is already included, but requires these GitHub repository secrets:

- `APPLE_TEAM_ID`
- `IOS_CERTIFICATE_P12_BASE64`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`

The workflow imports the certificate/profile into a temporary keychain, archives the app, exports the IPA, and uploads the IPA plus device build/build/export logs.

## Bundle ID

`com.davidpovarsky.napiscriptrunner`

## Security warning

There is intentionally no sandbox in this MVP. Imported code runs with the native API surface exposed by the NativeScript runtime. Do not run untrusted scripts.
