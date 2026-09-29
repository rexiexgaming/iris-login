# Firebase setup

1. Enable **Email/Password** in Firebase Authentication.
2. Add the Firebase web app values to `.env` using `.env.example` as the template.
3. Deploy `firestore.rules` to the project.
4. Generate invitation documents with `npm run generate:code`.

Each document ID is the code users type, preferably uppercase. The minimum document is:

```json
{
  "used": false
}
```

An optional `email` field restricts the code to one email address. An optional `expiresAt` field can contain a Firestore timestamp. After successful signup, the app atomically marks the document as used and records the Firebase user ID, so the same code cannot be used again.

## Generate codes automatically

Create a Firebase service-account key from **Firebase Console → Project settings → Service accounts → Generate new private key**. Save it locally as `firebase-service-account.json`, add that filename to `.env`, and never commit or upload the file.

Then run:

```bash
npm run generate:code
npm run generate:code -- --email student@example.com --expires-in 7
```

The command creates a random code directly in Firestore and prints it. `--email` is optional; `--expires-in` is the number of days before the code expires.

The browser Firebase values come from **Project settings → General → Your apps → Web app → SDK setup and configuration**. Put those values in the `VITE_FIREBASE_*` entries in `.env`. `FIREBASE_SERVICE_ACCOUNT_PATH` and `FIREBASE_PROJECT_ID` are only for the local generator; never put service-account credentials in `VITE_*` variables.
