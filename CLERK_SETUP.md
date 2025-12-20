# Clerk Authentication Setup Guide for DhanDiary

This guide explains how to configure Clerk for Email/Password, Google, and GitHub login, ensuring your existing data is preserved and accounts are merged correctly.

## 1. Create Clerk Application

1.  Go to [dashboard.clerk.com](https://dashboard.clerk.com/ sign-up) and sign up.
2.  Click **"Create Application"**.
3.  Name it **"DhanDiary"**.
4.  Under **"How will your users sign in?"**, select:
    *   **Email** (ensure "Email" and "Password" are checked).
    *   **Google**.
    *   **GitHub**.
5.  Click **"Create Application"**.

## 2. Configure API Keys

1.  In the Clerk Dashboard, go to **"API Keys"** in the sidebar.
2.  Copy the **"Publishable Key"** (starts with `pk_test_...`).
3.  Open your project's `.env` file (create one if it doesn't exist) and add:
    ```env
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
    ```
4.  **Important:** Also add this variable to your `app.json` or `app.config.js` in the `extra` section if you use EAS Build, but `.env` handles local dev.

5.  **Dependencies:** Ensure you have installed the required packages:
    ```bash
    npm install @clerk/clerk-expo expo-secure-store expo-linear-gradient expo-web-browser
    ```

## 3. Configure Social Logins (Google & GitHub)

### Google
1.  Go to **User & Authentication > Social Connections** in Clerk.
2.  Click the **Gear Icon** next to Google.
3.  Follow Clerk's guide to create a logical OAuth credentials in Google Cloud Console if for production.
4.  **For Development:** Clerk handles this automatically ("Use development keys"). You don't need to do anything else for local testing!

### GitHub
1.  Similarly, check GitHub settings.
2.  **For Development:** Clerk uses shared development keys. It just works.

## 4. Account Linking Settings (Critical for Merging)

To ensure users who signed up with Email `test@example.com` can later log in with Google (`test@example.com`) without creating a duplicate account:
1.  Go to **User & Authentication > Email, Phone, Username**.
2.  Ensure **"Email address"** is required.
3.  Go to **User & Authentication > Social Connections**.
4.  Ensure **"Fetch email address from social provider"** is enabled (default).
5.  *Note:* Clerk automatically links accounts if the email is verified and matches.

## 5. Database Update (One-Time Execution)

Run this SQL command in your Neon Console to enable the mapping between Clerk and your existing data:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
```

## 6. How It Works (The "Safe Bridge")

1.  When a user logs in via Clerk (Google/GitHub/Email), the app gets a `clerk_user_id`.
2.  The app sends this ID + Email to your Neon Database.
3.  **The Logic:**
    *   **Old User?** If an account with that email exists but no Clerk ID, we update it with the Clerk ID (Merging).
    *   **New User?** We create a new row.
    *   **Returning User?** We just find the row by Clerk ID.
4.  **Result:** The rest of the app gets the `UUID` it expects. **Zero data loss.**
