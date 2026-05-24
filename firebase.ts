import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use initializeFirestore with settings for better compatibility in restricted environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Error Handling Spec for Firestore Permissions
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const errorMessage = error?.message || String(error);
  const errorCode = error?.code || 'unknown';
  
  const errInfo: FirestoreErrorInfo = {
    error: `${errorCode}: ${errorMessage}`,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error(`[Firestore Error - ${operationType}] at ${path}:`, errorMessage);
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore with limited retries
async function testConnection(retries = 3) {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection verified.");
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    if (retries > 0) {
      console.warn(`Firestore connection retry ${4 - retries}... (${errorMsg})`);
      setTimeout(() => testConnection(retries - 1), 5000);
    } else {
      if (errorMsg.includes('the client is offline') || error?.code === 'unavailable') {
        console.error("Firestore is currently unavailable or offline. The app will continue in offline mode.");
      } else if (errorMsg.includes('permission-denied') || error?.code === 'permission-denied') {
        console.warn("Firestore connection check: Permission denied (this is normal if rules are tight).");
      } else {
        console.error("Firestore connection failed explicitly:", errorMsg);
      }
    }
  }
}

testConnection();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};
