'use strict';

// The Fax for Agents REST API as the Zapier integration sees it: one base URL, the stable error
// envelope, and the remedies a person can act on. Provenance: faxforagents/apify-actor src/fax.js
// and faxforagents/make-app src/general/base.iml.json (2026-10-31).

const BASE_URL = 'https://api.faxforagents.com';
const VERSION = require('../package.json').version;
const USER_AGENT = `faxforagents-zapier/${VERSION}`;

// The states a fax job never leaves.
const TERMINAL_STATES = ['delivered', 'partial', 'failed', 'unknown'];

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};
const ALLOWED_CONTENT_TYPES = new Set(Object.values(CONTENT_TYPES));

const REMEDIES = {
  invalid_token: 'The API key was rejected. Reconnect with an ffa_test_... or ffa_live_... key from app.faxforagents.com.',
  scope_missing: 'The API key lacks a scope this step needs (document:write, fax:quote, fax:send, fax:read or inbox:read).',
  approval_required:
    'No approval and no policy allows this send. A person approves the quote in the dashboard and the approval id goes in Approval ID, or the account owner writes a policy.',
  approval_expired: 'The approval expired with its quote. Quote again and ask again.',
  approval_mismatch: 'The approval was given for a different send.',
  approval_consumed: 'This approval was already used. One approval, one send.',
  insufficient_balance: 'The wallet does not cover this fax. A person tops it up in the dashboard.',
  quote_expired: 'The quote expired before the send. Run the step again.',
  rate_limited: 'Rate limit reached. Zapier retries the step in a moment.',
};

function isApiUrl(url) {
  return typeof url === 'string' && (url === BASE_URL || url.startsWith(`${BASE_URL}/`));
}

// 'test' for an ffa_test_ key, 'live' for an ffa_live_ key, null for anything else.
function environmentOf(apiKey) {
  const key = String(apiKey || '');
  if (key.startsWith('ffa_test_')) return 'test';
  if (key.startsWith('ffa_live_')) return 'live';
  return null;
}

function contentTypeOf(filename) {
  const dot = String(filename || '').lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  return CONTENT_TYPES[ext] || 'application/pdf';
}

// The error envelope of a refused request, or a stand-in when the body is not JSON.
function errorOf(response) {
  let data = response.data;
  if (data === undefined && typeof response.content === 'string' && response.content) {
    try {
      data = JSON.parse(response.content);
    } catch {
      data = null;
    }
  }
  const err = (data && data.error) || {};
  return {
    code: err.code || 'http_error',
    message: err.message || `HTTP ${response.status}`,
    correlationId: err.correlation_id || null,
  };
}

// Turn a refused API response into the error Zapier shows the person. 401 asks for a reconnect.
// 429 never reaches here: zapier-platform-core throws its ThrottledError first and Zapier retries.
function throwApiError(z, response) {
  const { code, message, correlationId } = errorOf(response);
  const text =
    `${REMEDIES[code] || message} (error_code=${code}, http ${response.status})` +
    (correlationId ? ` [${correlationId}]` : '');
  if (response.status === 401) {
    throw new z.errors.ExpiredAuthError(text);
  }
  throw new z.errors.Error(text, code, response.status);
}

module.exports = {
  BASE_URL,
  USER_AGENT,
  VERSION,
  TERMINAL_STATES,
  ALLOWED_CONTENT_TYPES,
  REMEDIES,
  isApiUrl,
  environmentOf,
  contentTypeOf,
  errorOf,
  throwApiError,
};
