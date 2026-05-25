// ============================================================================
// Auth Service
// Centralized authentication logic for Deriv OAuth and Firebase
// ============================================================================

import { getRedirectUri, generateAuthUrl, exchangeCodeForToken } from './derivApiService';

// -- Type Definitions --
export interface DerivAuthState {
  accessToken: string | null;
  expiresAt: number | null;
}

// Generate PKCE code verifier and challenge
const generateRandomString = (length: number) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let randomString = '';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    randomString += charset[randomValues[i] % charset.length];
  }
  return randomString;
};

const base64UrlEncode = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const generateCodeChallenge = async (verifier: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(hashBuffer);
};

export const initiateOAuthFlow = async (action: 'login' | 'signup') => {
  try {
    const verifier = generateRandomString(128);
    const challenge = await generateCodeChallenge(verifier);
    const state = generateRandomString(32);

    // Use sessionStorage for security
    sessionStorage.setItem('pkce_code_verifier', verifier);
    sessionStorage.setItem('oauth_state', state);

    // Sanitize returnTo
    const currentUrl = new URL(window.location.href);
    const returnParams = new URLSearchParams(currentUrl.search);
    returnParams.delete('code');
    returnParams.delete('state');
    returnParams.delete('error');
    returnParams.delete('error_description');
    
    const sanitizedSearch = returnParams.toString() ? `?${returnParams.toString()}` : '';
    let returnTo = currentUrl.pathname + sanitizedSearch;

    if (returnTo.startsWith('/callback')) {
      returnTo = '/';
    }
    sessionStorage.setItem('auth_return_to', returnTo);

    const redirectUri = getRedirectUri();

    const authUrl = generateAuthUrl({
      codeChallenge: challenge,
      state: state,
      redirectUri: redirectUri,
      action: action
    });

    // We use full-page redirect universally for all devices.
    // It is the most robust strategy and avoids popup blockers and origin communication overhead.
    window.location.href = authUrl;
    
    return true;
  } catch (error) {
    console.error(`[Auth Service] Could not initiate ${action}`, error);
    throw error;
  }
};

export const handleOAuthCallback = async (code: string, state: string, errorParam?: string | null): Promise<{ token: string, expiresAt: number, returnTo: string }> => {
  if (errorParam) {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('auth_return_to');
    throw new Error(`Authentication denied: ${errorParam}`);
  }

  // 1. Retrieve stored credentials from sessionStorage
  const storedState = sessionStorage.getItem('oauth_state');
  const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

  // 2. Strict State Comparison
  if (!storedState || state !== storedState) {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('auth_return_to');
    throw new Error('Security verification failed (State Mismatch). The login process was aborted for your protection.');
  }

  if (!codeVerifier) {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('auth_return_to');
    throw new Error('Session expired or data missing. Please try logging in again.');
  }

  try {
    // 3. Exchange code for token via backend
    const tokenData = await exchangeCodeForToken(code, codeVerifier);
    
    // 4. Clean up PKCE session data BEFORE anything else
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    
    let returnTo = sessionStorage.getItem('auth_return_to') || '/';
    sessionStorage.removeItem('auth_return_to');
    
    // Strict sanitization for final redirect destination
    try {
      const parsedReturnTo = new URL(returnTo, window.location.origin);
      if (parsedReturnTo.pathname.startsWith('/callback')) {
          returnTo = '/';
      } else {
          returnTo = parsedReturnTo.pathname + parsedReturnTo.search;
      }
    } catch {
      returnTo = '/';
    }
    
    const expiresAt = Date.now() + (tokenData.expires_in - 60) * 1000;

    return {
      token: tokenData.access_token,
      expiresAt,
      returnTo
    };
  } catch (err) {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('auth_return_to');
    throw err;
  }
};

// We will keep tokens in memory via React context/hook, but if we need a global getter/setter:
let inMemoryToken: string | null = null;
let inMemoryExpiresAt: number | null = null;

export const setInMemoryToken = (token: string, expiresAt: number) => {
  inMemoryToken = token;
  inMemoryExpiresAt = expiresAt;
};

export const getInMemoryToken = () => {
    return {
        accessToken: inMemoryToken,
        expiresAt: inMemoryExpiresAt
    }
};

export const clearInMemoryToken = () => {
  inMemoryToken = null;
  inMemoryExpiresAt = null;
};

// ============================================================================
// Secure Session Recovery
// ============================================================================
export const recoverSession = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/deriv/session', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.access_token && data.expires_at > Date.now()) {
        setInMemoryToken(data.access_token, data.expires_at);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
};

export const performLogout = async () => {
  clearInMemoryToken();
  const activeAcc = localStorage.getItem('deriv_active_account');
  if (activeAcc) localStorage.removeItem('deriv_active_account');
  
  try {
    await fetch('/api/deriv/logout', { method: 'POST' });
  } catch {
    // Ignore network errors on logout
  }
};
