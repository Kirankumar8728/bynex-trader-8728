export const generateCodeVerifier = () => {
  const array = window.crypto.getRandomValues(new Uint8Array(64));
  return Array.from(array)
    .map(v => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[v % 66])
    .join('');
};

export const generateState = () => {
  const array = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(array)
    .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
};

export const generateCodeChallenge = async (verifier: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};
