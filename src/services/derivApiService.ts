// Fetch environment variables with fallbacks
// Note: In Vite, variables must be prefixed with VITE_ to be available on the client side.
export const OAUTH_CLIENT_ID = import.meta.env.VITE_DERIV_CLIENT_ID;
export const NEW_APP_ID = import.meta.env.VITE_DERIV_APP_ID;
const AFFILIATE_ID = import.meta.env.VITE_DERIV_AFFILIATE_ID || import.meta.env.VITE_AFFILIATE_TOKEN;
export const OAUTH_SCOPE =
  import.meta.env.VITE_DERIV_SCOPE ||
  'trade account_manage';
const SIDC = import.meta.env.VITE_DERIV_SIDC;
const UTM_CAMPAIGN = import.meta.env.VITE_DERIV_UTM_CAMPAIGN;

if (!OAUTH_CLIENT_ID) {
  throw new Error("Missing VITE_DERIV_CLIENT_ID. Please set this in your environment variables.");
}

if (!NEW_APP_ID) {
  throw new Error("Missing VITE_DERIV_APP_ID. Please set this in your environment variables.");
}

/**
 * Dynamically determines the redirect URI based on current environment.
 */
export const getRedirectUri = () => {
  const uri = import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/callback`;
  if (!uri.startsWith('https://') && !uri.startsWith('http://localhost') && !uri.startsWith('http://127.0.0.1')) {
    throw new Error('Invalid redirect URI: Must start with https:// or be localhost');
  }
  return uri;
};

const API_BASE_URL = 'https://api.derivws.com';

// ============================================================================
// Types
// ============================================================================
export interface DerivTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// ============================================================================
// Internal Helpers
// ============================================================================
export const getAuthHeaders = (token: string) => ({
  'Deriv-App-ID': NEW_APP_ID,
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
});

// ============================================================================
// OAuth Flow (Backend Exchange)
// ============================================================================

/**
 * Exchanges an authorization code for an access token using the backend API.
 * This is performed server-side to protect sensitive data like the code_verifier.
 */
export const exchangeCodeForToken = async (code: string, codeVerifier: string): Promise<DerivTokenResponse> => {
  // Use the same redirect URI used to get the authorization code
  const redirectUri = getRedirectUri();
  
  const response = await fetch('/api/deriv/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || errorData.message || 'Failed to exchange token';
    if (import.meta.env.DEV) {
      console.error(`[AUTH SERVICE] Token exchange failed: ${errorMessage}`);
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

// ============================================================================
// Account Management (REST APIs)
// ============================================================================
export const getOtpUrl = async (accountId: string, token: string): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE_URL}/trading/v1/options/accounts/${accountId}/otp`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.errors && data.errors.length > 0 && data.errors[0].message) {
        throw new Error(data.errors[0].message);
      }
      throw new Error(`Failed to get OTP for WebSocket: ${response.status}`);
    }

    const data = await response.json();
    return data.data.url; 
  } catch (error: unknown) {
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch OTP');
  }
};

export interface DerivAccount {
  loginid: string;
  balance: number;
  currency: string;
  email: string;
  is_virtual: boolean;
}

export const getAccountsInfo = async (token: string): Promise<DerivAccount[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/trading/v1/options/accounts`, { 
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.errors && data.errors.length > 0 && data.errors[0].message) {
        throw new Error(data.errors[0].message);
      }
      throw new Error(`Failed to fetch account info: ${response.status}`);
    }

    const json = await response.json();
    if (!json.data || json.data.length === 0) {
      throw new Error('No accounts found');
    }

    // Map to the shape expected by useDeriv
    return json.data.map((data: Record<string, unknown>) => ({
      loginid: String(data.account_id),
      balance: Number(data.balance),
      currency: String(data.currency),
      email: data.email ? String(data.email) : '', 
      is_virtual: data.account_type === 'demo',
    }));
  } catch (error: unknown) {
    throw new Error(error instanceof Error ? error.message : 'Network error fetching account info');
  }
};

export const resetDemoBalanceRest = async (accountId: string, token: string): Promise<Record<string, unknown>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/trading/v1/options/accounts/${accountId}/reset-demo-balance`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.errors && data.errors.length > 0 && data.errors[0].message) {
        throw new Error(data.errors[0].message);
      }
      throw new Error(`Failed to reset demo balance: ${response.status}`);
    }

    return await response.json();
  } catch (error: unknown) {
    throw new Error(error instanceof Error ? error.message : 'Network error resetting balance');
  }
};

// ============================================================================
// URL Builders
// ============================================================================
export const generateAuthUrl = (params: {
  codeChallenge: string;
  state: string;
  redirectUri?: string;
  action?: 'login' | 'signup';
}) => {
  // Use the explicitly required redirect URI from user configuration
  const finalRedirectUri = params.redirectUri || getRedirectUri();
  
  // 1. URL strictly as per instructions and DerivApi.txt
  const url = new URL('https://auth.deriv.com/oauth2/auth');
  
  // 2. Set strict parameters using URLSearchParams
  const searchParams = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: finalRedirectUri,
    scope: OAUTH_SCOPE,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256'
  });

  // 3. Add Signup specific parameters if needed
  if (params.action === 'signup') {
    // Open Deriv registration form
    searchParams.set('prompt', 'registration');

    // Official affiliate parameters
    if (AFFILIATE_ID) {
      searchParams.set('t', AFFILIATE_ID);
      searchParams.set('utm_source', AFFILIATE_ID);
    }

    if (SIDC) {
      searchParams.set('sidi', SIDC);
      searchParams.set('sidc', SIDC);
    }

    searchParams.set('utm_medium', 'affiliate');

    // Optional campaign tracking
    const finalCampaignObj = import.meta.env.VITE_UTM_CAMPAIGN || UTM_CAMPAIGN;
    if (finalCampaignObj) {
      searchParams.set('utm_campaign', finalCampaignObj);
    }
  }

  url.search = searchParams.toString();
  return url.toString();
};

/**
 * Parses and validates the OAuth callback parameters from window.location.
 */
export const parseOAuthCallback = () => {
  const params = new URLSearchParams(window.location.search);

  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  // Handle OAuth errors
  if (error) {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('auth_return_to');
    throw new Error(errorDescription || `OAuth Error: ${error}`);
  }

  // Validate authorization code
  if (!code) {
    throw new Error('Missing authorization code');
  }

  // Validate OAuth state
  if (!state) {
    throw new Error('Missing OAuth state');
  }

  // Compare with stored state
  const storedState = sessionStorage.getItem('oauth_state');

  if (storedState !== state) {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('auth_return_to');
    throw new Error('OAuth state mismatch');
  }

  return {
    code,
    state,
  };
};
