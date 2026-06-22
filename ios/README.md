# Garde-Manger iOS

This is a lightweight SwiftUI/WKWebView wrapper for the Garde-Manger web app.

## Run in Xcode

1. Open `ios/GardeManger.xcodeproj`.
2. Select the `GardeManger` target.
3. Pick an iPhone simulator or a connected device.
4. Press Run.

By default, the app bundles the local web files and uses native OpenAI bridges for scans and recipe generation. These AI features require an API key in the iOS target build settings.

## Configure AI Features

Set these build settings on the `GardeManger` target:

- `GARDE_OPENAI_API_KEY`: your OpenAI API key for scans and recipe generation
- `GARDE_OPENAI_MODEL`: model name, defaults to `gpt-5.5`
- `GARDE_OPENAI_RECIPE_MODEL`: optional recipe-only model override; use this to pick a faster model for the Generate button while keeping scan quality unchanged

Command-line example:

```bash
xcodebuild \
  -project ios/GardeManger.xcodeproj \
  -scheme GardeManger \
  -sdk iphonesimulator \
  -configuration Debug \
  GARDE_OPENAI_API_KEY=sk-your-key \
  GARDE_OPENAI_MODEL=gpt-5.5 \
  GARDE_OPENAI_RECIPE_MODEL=gpt-5.5 \
  build
```

Direct keys in an app bundle are visible to determined testers. This is fine for a quick prototype, but use a backend or ephemeral-token service before production.

## Use a Hosted Web Build

If you want the iOS shell to load a deployed web build instead of the bundled local files, deploy the Node app over HTTPS and set the `GARDE_WEB_URL` build setting to that deployed URL.

Command-line example:

```bash
xcodebuild \
  -project ios/GardeManger.xcodeproj \
  -target GardeManger \
  -sdk iphonesimulator \
  -configuration Debug \
  GARDE_WEB_URL=https://your-gardemanger.example \
  build
```

## TestFlight Checklist

- Apple Developer account and signing team
- Production bundle identifier
- `GARDE_OPENAI_API_KEY` configured for direct prototype scans and recipe generation, or HTTPS backend URL configured with `GARDE_WEB_URL`
- Privacy policy URL
- Camera/photo permission purpose strings reviewed
- App Store privacy details matching the current data flow
