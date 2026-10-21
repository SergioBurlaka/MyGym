import { env } from '../../config/env.js';

// Everything a client compares byte for byte is derived from PUBLIC_URL.
export const ISSUER = env.PUBLIC_URL;
export const MCP_RESOURCE = `${env.PUBLIC_URL}/mcp`;

// One scope = full access to the user's training data, like a PAT. Split
// it only if a client ever needs less.
export const SCOPE = 'mygym';

export const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60_000; // consent screen
export const AUTHORIZATION_CODE_TTL_MS = 10 * 60_000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60_000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

export const OAT_PREFIX = 'mygym_oat_'; // OAuth access token
export const ORT_PREFIX = 'mygym_ort_'; // OAuth refresh token

// RFC 8414 authorization server metadata. Endpoints live under /api so the
// existing nginx /api/ route reaches them; only this document and the
// protected resource one sit at the root /.well-known/.
export function authorizationServerMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
    token_endpoint: `${ISSUER}/api/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    // Public clients only; together with the next flag this is what makes
    // Claude (and ChatGPT) use CIMD instead of dynamic registration.
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    // RFC 9207: `iss` on every authorization response - ChatGPT only uses
    // its stable redirect URI when this is there.
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [SCOPE],
  };
}

// RFC 9728 protected resource metadata for the MCP server.
export function protectedResourceMetadata() {
  return {
    resource: MCP_RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'MyGym',
  };
}
