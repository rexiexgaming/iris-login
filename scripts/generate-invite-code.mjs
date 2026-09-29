import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const count = Math.max(1, Number(getArgument('--count') || 1));
const outputFile = getArgument('--out') || (count > 1 ? 'invite-codes.txt' : '');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function generateCodes() {
  const generatedCodes = [];
  const batchSize = 400;
  let currentBatch = firestore.batch();
  let batchOpCount = 0;

  for (let i = 0; i < count; i++) {
    let code = '';
    let docRef = null;
    let attempts = 0;

    while (attempts < 10) {
      code = createCode();
      if (!generatedCodes.includes(code)) {
        docRef = firestore.collection('inviteCodes').doc(code);
        break;
      }
      attempts++;
    }

    const data = { used: false, createdAt: new Date() };
    if (requestedEmail && count === 1) data.email = requestedEmail.toLowerCase();
    if (expiresInDays > 0) {
      data.expiresAt = Timestamp.fromDate(new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000));
    }

    currentBatch.set(docRef, data);
    generatedCodes.push(code);
    batchOpCount++;

    if (batchOpCount >= batchSize || i === count - 1) {
      await currentBatch.commit();
      currentBatch = firestore.batch();
      batchOpCount = 0;
    }
  }

  console.log(`✅ Successfully generated ${generatedCodes.length} invitation code(s) in Firestore.`);

  if (outputFile) {
    const outPath = path.resolve(outputFile);
    writeFileSync(outPath, generatedCodes.join('\n') + '\n', 'utf8');
    console.log(`📄 Saved all ${generatedCodes.length} codes to: ${outputFile}`);
  } else {
    generatedCodes.forEach((c) => console.log(`Code: ${c}`));
  }

  process.exit(0);
}

generateCodes().catch((err) => {
  console.error('Error generating invite codes:', err);
  process.exit(1);
});

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

