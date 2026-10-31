'use strict';

// Shared fixtures: the recorded API shapes, the same ids as the sibling integrations' fakes.
const nock = require('nock');
const zapier = require('zapier-platform-core');
const App = require('../index');

const KEY = 'ffa_test_' + 'a'.repeat(43);
const DOC = 'doc_' + '1'.repeat(32);
const UPL = 'upl_' + '0'.repeat(32);
const QUOTE = 'qte_' + '2'.repeat(32);
const FAX = 'fax_' + '3'.repeat(32);
const INB = 'inb_' + '4'.repeat(32);
const API = 'https://api.faxforagents.com';

const appTester = zapier.createAppTester(App);
const bundleWith = (inputData = {}, apiKey = KEY) => ({ authData: { api_key: apiKey }, inputData, meta: {} });

const api = () => nock(API, { reqheaders: { authorization: `Bearer ${KEY}`, accept: 'application/json' } });
const refusal = (code, message, retryable = false) => ({ error: { code, message, retryable, correlation_id: 'corr_1' } });

const document = (extra = {}) => ({
  id: DOC, environment: 'test', status: 'ready', source: 'text', filename: 'document.pdf', content_type: 'application/pdf',
  size_bytes: 1200, sha256: 'ab'.repeat(32), page_count: 1, render_status: 'queued', render_reason: null, validation: {},
  upload_id: null, created_at: '2026-10-31T00:00:00Z', expires_at: null, deleted_at: null, ...extra,
});
const quote = (extra = {}) => ({
  id: QUOTE, environment: 'test', document_id: DOC, document_sha256: 'ab'.repeat(32), to: '+15550000001', from: null, route: 'us',
  document_pages: 1, cover_pages: 0, billable_pages: 1, amount_micro: 39000, currency: 'USD', price_version: 'launch-v1',
  per_page_micro: 39000, route_label: 'United States', cover: null, authorization_required: false, warnings: [],
  expires_at: '2026-10-31T00:10:00Z', expired: false, consumed_by_job_id: null, created_at: '2026-10-31T00:00:00Z', ...extra,
});
const job = (state = 'queued', extra = {}) => ({
  id: FAX, environment: 'test', direction: 'outbound', state, failure_code: null, to: '+15550000001', from: null, route: 'us',
  document_id: DOC, document_sha256: 'ab'.repeat(32), transmitted_sha256: null, quote_id: QUOTE, billable_pages: 1, cover_pages: 0,
  pages_sent: 0, amount_micro: 39000, captured_micro: 0, currency: 'USD', provider: 'sandbox', provider_ref: null,
  client_reference: null, attempt_count: 0, created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z',
  completed_at: null, cancel_requested_at: null, evidence: null, ...extra,
});
const inboxItem = (extra = {}) => ({
  id: INB, from: '+15550009999', to: '+15550001000', pages: 3, status: 'received', document_id: DOC,
  received_at: '2026-10-31T00:00:00Z', amount_micro: 57000, note: null, environment: 'test', number_id: null, project_id: null,
  partial_content: false, media_status: 'stored', duration_secs: 95, provider: 'sandbox', read_at: null, expires_at: null, ...extra,
});

module.exports = { nock, App, appTester, bundleWith, api, refusal, document, quote, job, inboxItem, KEY, DOC, UPL, QUOTE, FAX, INB, API };
