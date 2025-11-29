ANDROID BUILD AUDIT — DhanDiary

## Summary

I reviewed the project for Android build-size concerns and produced safe, minimal changes and recommendations. I changed the production EAS build to produce an Android App Bundle (`.aab`) instead of an `apk` (Play Store will deliver device-optimized APKs, reducing download size). I also added a safe `proguard-rules.pro` and a set of recommendations you can apply gradually.

## What increases APK size in this repo

- Heavy native libraries:
  - `@shopify/react-native-skia` — Skia is powerful but adds native code and large native libraries.
  - `@sentry/react-native` — Sentry brings native instrumentation and mapping; keep for crash reporting but ensure ProGuard/R8 rules and mapping upload are configured.
  - `react-native-reanimated` / `react-native-skia` / `react-native-svg` — each adds native binaries.
- Native modules with multiple ABIs: many native deps include prebuilt `.so` for `armeabi-v7a`, `arm64-v8a`, `x86`, etc. If you ship a single universal APK that contains all ABIs, size grows quickly.
- Unused Expo modules and assets: `expo-updates`, some large images in `assets/`, and any unused font/vector assets.
- Debug symbols and native libraries not stripped: large `.so` files and native debug symbols can inflate APK.

## What is already configured well

- `app.json` contains `expo-build-properties` with:
  - `enableHermes: true` — Hermes is enabled (good for JS size and speed).
  - `enableProguardInReleaseBuilds: true`, `minifyEnabled: true`, `shrinkResources: true` — ProGuard/R8 and resource shrinking are enabled.

## Changes I made

- `eas.json`: switched `production.android.buildType` to `app-bundle` so production builds produce an Android App Bundle (`.aab`) instead of a single universal APK. This reduces Play Store delivered sizes for end users.
- `proguard-rules.pro`: added a conservative ProGuard/R8 rules file to keep essential RN, Sentry, and native loader classes while allowing R8 to strip unused code. This file is safe to include; the build system will use it when native project is present.

## Safe recommendations and next steps (non-breaking)

1. Keep Hermes enabled (already true). Hermes reduces JS bytecode size and startup overhead.

2. Use App Bundles for production (done). App Bundles let Google Play deliver device-specific APKs and strips unused ABIs and resources automatically.

3. Enable ABI splits if you want standalone APKs per architecture (optional):
   - If you still need APKs, configure Gradle `splits` to produce `arm64-v8a`, `armeabi-v7a` APKs. This is done in `android/app/build.gradle` (or via `expo-build-properties` if you prebuild). Example snippet:

   ```gradle
   android {
     splits {
       abi {
         enable true
         reset()
         include 'armeabi-v7a', 'arm64-v8a'
         universalApk false
       }
     }
   }
   ```

   This is safe but will create multiple APK outputs and is only necessary if you cannot use App Bundle.

4. Strip native debug symbols (NDK) for release builds: set `debugSymbolLevel` to `NONE` or `SYMBOL_TABLE` in Gradle/EAS config. This reduces the size of `.so` files.

5. Keep ProGuard/R8 rules minimal and upload mapping files (for Sentry) after build. The included `proguard-rules.pro` is conservative and should not break the app. If R8 removes something needed, the app crashes and logs will show missing classes — easy to fix by adding `-keep` rules.

6. Remove or replace heavy deps where possible:
   - Evaluate whether `@shopify/react-native-skia` is required — it's large. If only used for cosmetic charts or effects, consider replacing with `react-native-svg` (lighter) or render on server.
   - Review `@sentry/react-native` — keep for production crash reporting but ensure Sentry's native parts are only included when you need them.
   - Remove `react-native-worklets`/`worklets-core` if not in active use (these add native code).

7. Optimize assets:
   - Compress and downscale PNG/JPEG images under `assets/` (use WebP where possible).
   - Remove any unused image/font files.
   - Use `expo-asset` to manage large assets and consider using remote assets.

8. Confirm `expo-updates` configuration: if you use Over-the-Air updates and do not need full native updates, keep it; otherwise evaluate necessity.

9. EAS build profile tuning (recommended):
   - Use `app-bundle` for production (done).
   - Keep preview builds as APK if you need quick internal installs.

## Example app.json / expo-build-properties snippets

(Apply these only if you prebuild / eject or via `expo-build-properties` plugin)

```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "enableHermes": true,
            "enableProguardInReleaseBuilds": true,
            "minifyEnabled": true,
            "shrinkResources": true,
            "gradleProperties": {
              "android.enableR8": "true",
              "org.gradle.jvmargs": "-Xmx4096m"
            },
            "ndk": {
              "debugSymbolLevel": "NONE"
            }
          }
        }
      ]
    ]
  }
}
```

If you want, I can apply these `gradleProperties` and `ndk` settings to `app.json` using the `expo-build-properties` plugin. They are low-risk, but they affect native build behavior so I will only add them if you confirm.

## How I validated changes

- Ran unit tests and TypeScript checks locally. No code changes were required in JS to enable the audit.

## What's next (pick one):

- I can implement the `expo-build-properties` `gradleProperties` and `ndk.debugSymbolLevel` additions in `app.json` (low risk).
- I can add Gradle `splits` config to `android/app/build.gradle` (requires prebuild / bare workflow or `expo prebuild`).
- I can create a small script to scan `assets/` for large files and optionally compress them.
- I can produce an EAS build (preview) and provide the resulting APK/AAB sizes and a breakdown of native libs (requires EAS credentials and network).

Tell me which of the above you'd like me to apply and I'll implement it next.
