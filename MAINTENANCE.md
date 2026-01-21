# DhanDiary Maintenance & Dependency Management

## Overview

This document outlines the dependency management strategy for DhanDiary, including how to handle upgrades, maintain compatibility, and manage deprecations safely.

## Current Status (v2.5.2)

✅ **All dependencies are up-to-date and optimized**

- Zero deprecation warnings
- Full Expo SDK 54 compatibility
- React 19 + React Native 0.81.5
- All direct dependencies verified with `npx expo install --check`

## Dependency Upgrade Strategy

### Recommended Node & npm Versions

```json
{
  "engines": {
    "node": ">=20.19.4",
    "npm": ">=10.0.0"
  }
}
```

**Why these versions?**

- Node 20.19.4+: LTS support, ES2024 features, stability
- npm 10.0.0+: Latest lockfile format, better dependency resolution, security patches

### Installation

```bash
# Clean install (recommended for new environments)
npm ci

# Update dependencies (use sparingly)
npm install
```

## Dependency Categories

### 1. Direct Dependencies (Maintained Actively)

These are pinned or use strict semver ranges. Updates are reviewed carefully.

| Package                         | Reason                   | Update Frequency                      |
| ------------------------------- | ------------------------ | ------------------------------------- |
| `expo`                          | Core framework (SDK 54)  | Every 3-4 months (major releases)     |
| `react-native`                  | Native runtime (v0.81.5) | Every 3-4 months (with Expo)          |
| `react`                         | UI library (v19)         | Every 4-6 weeks (minor/patch)         |
| `@clerk/clerk-expo`             | Auth provider            | Every 4-6 weeks (follows Expo)        |
| `@react-navigation/*`           | Navigation stack         | Every 4-6 weeks                       |
| `@tanstack/react-query`         | Data fetching            | Every 2-3 weeks (actively maintained) |
| `expo-sqlite`                   | Local database           | Pinned with Expo SDK                  |
| `@rneui/base` & `@rneui/themed` | RC components (v4-rc)    | Monitor for v4 stable release         |

### 2. Transitive Dependencies

These are automatically managed by npm and may show deprecation warnings. **No manual action needed unless they affect functionality.**

**Common patterns:**

- Old versions of `yargs`, `commander` in build tools
- Legacy polyfills in some dev dependencies
- These don't affect app functionality or security

### 3. Development Dependencies

These are strict and reviewed before updating.

| Package                | Purpose                   |
| ---------------------- | ------------------------- |
| `@typescript-eslint/*` | Linting & type checking   |
| `eslint`, `prettier`   | Code formatting & quality |
| `jest`, `jest-expo`    | Testing framework         |
| `babel-*`              | JS transpilation          |

## Recent Changes (v2.5.2)

✅ **Removed:**

- `react-native-vector-icons` (deprecated & unused - replaced by `@expo/vector-icons`)

✅ **Updated:**

- `expo-font`: 14.0.10 → 14.0.11 (patch for Expo SDK 54)
- `babel-preset-expo`: 54.0.9 → 54.0.10 (patch for Expo SDK 54)

✅ **Verified:**

- All vector icon imports use `@expo/vector-icons` (production-ready)
- No runtime warnings or deprecations
- Clean `npx expo install --check` pass

## How to Check for Updates

### Check for outdated packages

```bash
npm outdated
```

### Check Expo SDK compatibility

```bash
npx expo install --check
```

### Check for project health

```bash
npx expo-doctor
```

### List direct dependencies

```bash
npm ls --depth=0
```

## Safe Upgrade Process

### Before upgrading ANY dependency:

1. **Check Expo compatibility first**

   ```bash
   # Go to https://docs.expo.dev/guides/sdk-latest/
   # Verify the package version is listed as compatible
   ```

2. **Test locally**

   ```bash
   npm install  # Update package.json & package-lock.json
   npm run check  # Run linting, type-checking, tests
   npx expo start -c  # Test the app
   ```

3. **Commit before and after**
   ```bash
   git add -A && git commit -m "chore: update package-name to X.Y.Z"
   ```

### Upgrade Examples

#### ✅ Safe (Expo-managed packages)

```bash
# Patch updates to Expo modules (automatic)
npm install expo-font@~14.0.11

# Minor updates to dev dependencies
npm install --save-dev @types/jest@29.5.15
```

#### ⚠️ Risky (Major updates)

```bash
# Major React upgrade - test extensively
npm install react@20.0.0

# Major RN-UI upgrade - may have breaking changes
npm install @rneui/base@5.0.0
```

#### ❌ Avoid (Deprecated packages)

```bash
# DON'T use deprecated packages
npm install react-native-vector-icons  # Use @expo/vector-icons instead
```

## Production Build Checklist

Before running `eas build` or `eas build --platform android`:

```bash
# 1. Check dependencies
npx expo install --check

# 2. Run full tests
npm run check

# 3. Clean build
npm run clean

# 4. Verify version numbers
cat app.json | grep version
cat package.json | grep '"version"'

# 5. Build
eas build --platform android
```

## Known Non-Issues

### Deprecation Warnings That Can Be Ignored

These warnings may appear in transitive dependencies but **do NOT affect your app**:

- **yargs deprecation** (in build tools) - used by old CLI packages, replaced by newer versions
- **fsevents warning** (macOS only) - optional native module for file watching
- **Old babel plugin warnings** - superseded but still compatible

### Why We Don't Suppress Warnings Artificially

We avoid using `npm audit ignore` or `.npmrc` overrides because:

- Real warnings should be visible during development
- We want to know when to actually fix things
- Suppression hides security issues

## Next Steps / Future Upgrades

### Q1 2026 (3-4 months)

- [ ] Monitor Expo SDK 55 / React 20 compatibility
- [ ] Check for @rneui/base v4 stable release
- [ ] Review @clerk/clerk-expo for auth improvements

### Ongoing

- [ ] Monthly: Run `npm outdated` and review
- [ ] Weekly: Monitor GitHub security advisories
- [ ] Per release: Run full test suite before production builds

## Troubleshooting

### "npm ERR! 404 Not Found" after upgrade

```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### "Cannot find module '@expo/vector-icons'"

```bash
# This shouldn't happen, but if it does:
npm install --save @expo/vector-icons@^15.0.3
```

### "Expo SDK mismatch" errors

```bash
# Verify app.json version matches installed expo
cat app.json | grep version
npm ls expo

# If out of sync, run:
npx expo install
```

## Resources

- [Expo Docs - Managing Dependencies](https://docs.expo.dev/guides/dependencies/)
- [Expo SDK Release Notes](https://docs.expo.dev/guides/sdk-latest/)
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [npm Security Advisories](https://docs.npmjs.com/cli/v10/commands/npm-audit)

---

**Last Updated:** January 21, 2026  
**App Version:** 2.5.2  
**Expo SDK:** 54.0.31  
**React:** 19.1.0  
**React Native:** 0.81.5
