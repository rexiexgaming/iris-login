import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  doc,
  getFirestore,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestore = firebaseApp ? getFirestore(firebaseApp) : null;

function requireFirebase() {
  if (!firebaseAuth || !firestore) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to your environment.');
  }
}

export function observeAuthState(callback) {
  requireFirebase();
  return onAuthStateChanged(firebaseAuth, callback);
}

export function signIn(email, password) {
  requireFirebase();
  return signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
}

export async function createAccount(email, password, oneTimeCode) {
  requireFirebase();

  const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);

  try {
    await consumeOneTimeCode(oneTimeCode, email, credential.user.uid);
    return credential.user;
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  }
}

async function consumeOneTimeCode(oneTimeCode, email, userId) {
  const normalizedCode = oneTimeCode.trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error('Enter your one-time code to create an account.');
  }

  const codeRef = doc(firestore, 'inviteCodes', normalizedCode);
  await runTransaction(firestore, async (transaction) => {
    const codeSnapshot = await transaction.get(codeRef);

    if (!codeSnapshot.exists()) {
      throw new Error('That one-time code is invalid.');
    }

    const codeData = codeSnapshot.data();
    if (codeData.used) {
      throw new Error('That one-time code has already been used.');
    }

    if (codeData.expiresAt && codeData.expiresAt.toMillis() <= Date.now()) {
      throw new Error('That one-time code has expired.');
    }

    if (codeData.email && codeData.email.toLowerCase() !== email.trim().toLowerCase()) {
      throw new Error('That one-time code is assigned to another email address.');
    }

    transaction.update(codeRef, {
      used: true,
      usedAt: serverTimestamp(),
      usedBy: userId
    });
  });
}

export function signOutUser() {
  requireFirebase();
  return signOut(firebaseAuth);
}

export function firebaseErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'An account already exists with this email.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a password with at least six characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'permission-denied': 'Firebase blocked this request. Check your Firestore rules.'
  };

  return messages[error?.code] || error?.message || 'Something went wrong. Please try again.';
}
