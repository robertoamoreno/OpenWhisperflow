# Release DMGs

OpenWhisperflow uses `electron-builder` for macOS DMG builds.

## Local Unsigned DMG

Use this for local QA only:

```bash
npm install
npm run rebuild:native
npm run dist:mac
```

The DMG is written to `release/`.

The local script sets `CSC_IDENTITY_AUTO_DISCOVERY=false`, so it creates an unsigned DMG even if no Apple Developer certificate is installed. Unsigned DMGs are useful for testing but are not recommended for public downloads.

By default, the build targets the current Mac architecture. To build a specific architecture:

```bash
npm run dist:mac -- --arm64
npm run dist:mac -- --x64
```

## Local Signed DMG

Install a valid **Developer ID Application** certificate in your macOS keychain, then run:

```bash
npm run build:hotkey-helper
npm run build
npx electron-builder --mac dmg
```

If Apple notarization credentials are available in the environment, `electron-builder` will notarize the build:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID12345"
npx electron-builder --mac dmg
```

## GitHub Release

The release workflow runs on tags matching `v*`.

```bash
npm version patch
git push origin main --follow-tags
```

or manually:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will build `release/OpenWhisperflow-<version>-<arch>.dmg`, upload it as a workflow artifact, and publish it to the GitHub Release.

## GitHub Secrets For Signed Releases

For public signed/notarized releases, configure these repository secrets:

- `MACOS_CERTIFICATE_BASE64`: Base64-encoded `.p12` Developer ID Application certificate.
- `MACOS_CERTIFICATE_PASSWORD`: Password for that `.p12` certificate.
- `APPLE_ID`: Apple ID email used for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

`GH_TOKEN` is provided automatically by GitHub Actions through `secrets.GITHUB_TOKEN`.

Without Apple signing secrets, the workflow can still build and publish an unsigned DMG. Mark those releases clearly as unsigned developer builds.
