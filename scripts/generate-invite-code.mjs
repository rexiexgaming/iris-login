import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

loadLocalEnv();

const defaultServiceAccountPath = path.resolve('firebase-service-account.json');
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || (existsSync(defaultServiceAccountPath) ? defaultServiceAccountPath : '');
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const serviceAccount = serviceAccountJson
  ? JSON.parse(serviceAccountJson)
  : serviceAccountPath
    ? JSON.parse(readFileSync(path.resolve(serviceAccountPath), 'utf8'))
    : null;

if (!serviceAccount) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON in .env.');
}

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
    });

const firestore = getFirestore(firebaseApp);
const requestedEmail = getArgument('--email');
const expiresInDays = Number(getArgument('--expires-in') || 0);
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

for (let attempt = 0; attempt < 5; attempt += 1) {
  const code = createCode();
  const data = { used: false, createdAt: new Date() };

  if (requestedEmail) data.email = requestedEmail.toLowerCase();
  if (expiresInDays > 0) {
    data.expiresAt = Timestamp.fromDate(new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000));
  }

  try {
    await firestore.collection('inviteCodes').doc(code).create(data);
    console.log(`Created one-time code: ${code}`);
    if (requestedEmail) console.log(`Assigned email: ${requestedEmail}`);
    if (expiresInDays > 0) console.log(`Expires in: ${expiresInDays} day(s)`);
    process.exit(0);
  } catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') throw error;
  }
}

throw new Error('Could not create a unique invitation code. Try again.');

function createCode() {
  return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join('');
}

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function loadLocalEnv() {
  const envPath = path.resolve('.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
