# 📘 DhanDiary – Simple Personal Finance Tracker

**DhanDiary** is a clean, fast, and offline-first **income & expense manager** built using **React Native (Expo)**.  
Manage your daily finances effortlessly with a beautiful dashboard, history tracking, categories, and secure cloud backup.

<div align="center">

<a href="https://sourceforge.net/projects/dhandiary/files/latest/download">
  <img alt="Download DhanDiary" src="https://a.fsdn.com/con/app/sf-download-button" width=276 height=48>
</a>

</div>

---

## ✨ Features

- 🧾 **Smart Tracking:** Track income & expenses with notes.
- 📊 **Analytics:** Clean analytics & spending overview.
-- 💾 **Offline-First:** Works fully offline using local storage (SQLite / AsyncStorage).
-- 🔐 **Secure:** Local encrypted storage for user data; cloud backup was optional and has been removed in this offline build.
- 📚 **History:** Full transaction history log.
- ⚡ **Performance:** Lightweight, smooth & beginner-friendly UI.

---

## 🛠️ Tech Stack

- **Framework:** React Native (Expo)
- **Routing:** React Navigation
-- **Cloud:** Optional remote sync (previously used Firebase) — disabled in this local-only build
- **Local Storage:** Async Storage
- **Language:** TypeScript / JavaScript

## 🧪 Development

Set up `.env` and/or `.env.local` files before running the app:

```
# Agar Google Login use kar rahe ho
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com

# Agar GitHub Login use kar rahe ho
EXPO_PUBLIC_GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxx
```

Restart Expo after editing environment files so the new values load.

### Firestore security + indexes

- Update `firestore.rules` + `firestore.indexes.json` alongside any schema change.
- Deploy them before releasing: `firebase deploy --only firestore:rules,firestore:indexes`.
- Rules enforce strict ownership on `user/{uid}` and `cash_entries` with validated payloads.

### OAuth configuration

- **Google**: The button is hidden in Expo Go; use an EAS/dev-client build. Provide the verified Web Client ID via `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- **GitHub**: Only the OAuth App client ID is required. The app uses GitHub's Device Authorization flow, so no secrets live in the bundle. Enable Device Flow for your OAuth app and ensure users can reach `https://github.com/login/device`.

---

## 🔒 Privacy

Your privacy is our priority:

- **User data is encrypted.**
- **No ads, no trackers.**
- Cloud backup is optional & secure.
- **Privacy Policy:** [Add your link here]

---

## 📥 Download APK

You can download the latest stable APK directly from the link below or via SourceForge above.

👉 **[Download via GitHub](https://github.com/EllowDigital/DhanDiary/blob/master/shareapp-link.txt)**

---

## 👨‍💻 Developer

**Sarwan – EllowDigital**

- 📧 **Developer Email:** sarwanyadav6174@gmail.com
- 📧 **Team Email:** ellowdigitalindia@gmail.com

---

## ⭐ Support

If you like this project and find it useful, please consider giving it a ⭐ **star on GitHub!**
