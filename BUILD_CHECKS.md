Build checks and recommendations — DhanDiary

Goal
----
Prevent build failures when producing Android APKs on expo.dev/EAS by running local prebuild checks and keeping ProGuard/R8 rules updated.

Local pre-build checklist (run before `eas build`)
-------------------------------------------------
1. Run lint, tests, typecheck (this project uses the `prebuild` npm script):

```bash
npm run prebuild
```

This fails fast on JS/TS problems that commonly cause build-time crashes.

2. Confirm the `proguard-rules.pro` file exists at project root and contains rules for native libs (we added conservative rules for Coil/OkHttp and javax.lang.model). If you see R8 missing-class errors during an EAS build, download the generated `missing_rules.txt` from the build logs and append those rules to `proguard-rules.pro`.

3. Ensure environment variables for web-only SDKs (LogRocket APP ID) are set only for web builds; do not set them for native builds unless intended.

4. If you use heavy native libs (Skia, Sentry), verify their versions are compatible with your target RN and Expo SDK. Often upgrading/downgrading a single native lib resolves R8 issues.

5. For debugging a failing EAS build, enable more verbose Gradle logs by adding the `--log-level debug` flag to the EAS build command and inspect the `missing_rules.txt` at:

```
android/app/build/outputs/mapping/release/missing_rules.txt
```

CI integration
--------------
- Add a CI job that runs `npm run prebuild` on every PR and main branch push. This prevents code that would fail at build time from being merged.

When R8 fails with missing classes
---------------------------------
1. Inspect the build log for references to missing classes and the generated `missing_rules.txt` file.
2. Add targeted `-keep` or `-dontwarn` rules to `proguard-rules.pro` and re-run the build.
3. If the missing classes are part of an annotation processor or JDK-only package (e.g., `javax.lang.model`), prefer `-dontwarn javax.lang.model.**` rather than trying to include such JVM-only classes.

If you want me to maintain builds for you
----------------------------------------
I can:
- Add a CI (GitHub Actions) workflow that runs `npm run prebuild` on PRs and tags and optionally triggers an EAS preview build for approved PRs (requires EAS credentials).
- Add automation that downloads `missing_rules.txt` from failing builds and opens a PR to append required rules (semi-automated).

Contact me which of these you'd like automated.
