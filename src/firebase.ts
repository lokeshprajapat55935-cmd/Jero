import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAkR_OfIWsN8mtJQiIee9ZO7MuSJ98zhes",
  authDomain: "apnora-fc153.firebaseapp.com",
  projectId: "apnora-fc153",
  storageBucket: "apnora-fc153.firebasestorage.app",
  messagingSenderId: "357759516440",
  appId: "1:357759516440:web:05c029a6b8d82b8326e86d",
  measurementId: "G-EE8BWJTNH3"
};

// Next.js client-safe initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Is line ko dhyan se check karna, yahi main auth object export kar rahi hai
export const auth = getAuth(app);

export function getRecaptchaVerifier(authInstance: any, container: HTMLElement | string) {
  if (typeof window === 'undefined') return null;

  if ((window as any).recaptchaVerifier) {
    const isContainerInDom = typeof container === 'string'
      ? document.getElementById(container)
      : document.body.contains(container);

    if (isContainerInDom) {
      return (window as any).recaptchaVerifier;
    } else {
      clearRecaptchaVerifier();
    }
  }

  (window as any).recaptchaVerifier = new RecaptchaVerifier(
    authInstance,
    container,
    { size: 'invisible' }
  );

  return (window as any).recaptchaVerifier;
}

export function clearRecaptchaVerifier() {
  if (typeof window !== 'undefined' && (window as any).recaptchaVerifier) {
    try {
      (window as any).recaptchaVerifier.clear();
    } catch (e) {}
    (window as any).recaptchaVerifier = null;
  }
}

export { RecaptchaVerifier, signInWithPhoneNumber };