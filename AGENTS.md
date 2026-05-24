# Deriv Trading Application - Development Guidelines

## Deriv API Integration

All integrations with the Deriv API must follow the official documentation provided. Specifically:

1. **Authentication (OAuth 2.0)**:
   - Use OAuth 2.0 Authorization Code flow with PKCE.
   - **Authorization endpoint:** `https://auth.deriv.com/oauth2/auth` 
   - **Token endpoint:** `https://auth.deriv.com/oauth2/token`
   - Login URL should use `https://auth.deriv.com/oauth2/auth`.
   - Signup URL should use `https://auth.deriv.com/oauth2/auth` with `prompt=registration`.

2. **API Interaction**:
   - WebSocket Base URL: `wss://api.derivws.com/trading/v1/options/ws/{endpoint}`
   - REST Base URL: `https://api.derivws.com`

3. **General Principles**:
   - Handle PKCE correctly (code_verifier, code_challenge, code_challenge_method=S256).
   - Use `req_id` for WebSocket requests to match responses.
   - Implement `forget`/`forget_all` for subscription management.
