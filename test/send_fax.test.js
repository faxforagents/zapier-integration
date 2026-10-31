'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { afterEach, before, test } = require('node:test');
const { nock, App, appTester, bundleWith, api, refusal, document, quote, job, DOC, UPL, QUOTE } = require('./helpers');

const perform = App.creates.send_fax.operation.perform;
before(() => nock.disableNetConnect());
afterEach(() => {
  assert.ok(nock.isDone(), `pending mocks: ${nock.pendingMocks().join(', ')}`);
  nock.cleanAll();
});

test('text is prepared, quoted and sent under an idempotency key derived from the quote', async () => {
  const bodies = {};
  api().post('/v1/documents', (b) => { bodies.document = b; return true; }).reply(201, document());
  api().post('/v1/fax-quotes', (b) => { bodies.quote = b; return true; }).reply(201, quote());
  api()
    .matchHeader('idempotency-key', `zapier:${QUOTE}`)
    .post('/v1/faxes', (b) => { bodies.fax = b; return true; })
    .reply(201, job('queued', { client_reference: 'order 7' }));

  const result = await appTester(perform, bundleWith({ to: '+15550000001', text: 'Hello from Zapier.', client_reference: 'order 7' }));
  assert.deepEqual(bodies.document, { text: 'Hello from Zapier.' });
  assert.deepEqual(bodies.quote, { document_id: DOC, to: '+15550000001' });
  assert.deepEqual(bodies.fax, { quote_id: QUOTE, client_reference: 'order 7' });
  assert.equal(result.id, job().id);
  assert.equal(result.state, 'queued');
  assert.equal(result.amount_usd, 0.039);
  assert.equal(result.idempotency_key, `zapier:${QUOTE}`);
  assert.equal(result.document_page_count, 1);
});

test('markdown with cover fields, a from number, an approval and a custom key reach the API as named', async () => {
  const bodies = {};
  api().post('/v1/documents', (b) => { bodies.document = b; return true; }).reply(201, document({ source: 'markdown', filename: 'memo.pdf' }));
  api().post('/v1/fax-quotes', (b) => { bodies.quote = b; return true; }).reply(201, quote({ cover_pages: 1, billable_pages: 2, amount_micro: 78000, authorization_required: true }));
  api().matchHeader('idempotency-key', 'order-7-attempt-1').post('/v1/faxes', (b) => { bodies.fax = b; return true; }).reply(201, job('queued', { approval_id: 'apr_' + '5'.repeat(32) }));

  await appTester(perform, bundleWith({
    to: '+15550000001', markdown: '# Memo', filename: 'memo.pdf', from: '+15550001000',
    cover_subject: 'Memo', cover_message: 'See attached.', cover_to_name: 'Dr. Lee', cover_from_name: 'Front desk',
    approval_id: 'apr_' + '5'.repeat(32), idempotency_key: 'order-7-attempt-1',
  }));
  assert.deepEqual(bodies.document, { markdown: '# Memo', filename: 'memo.pdf' });
  assert.deepEqual(bodies.quote, {
    document_id: DOC, to: '+15550000001', from: '+15550001000',
    cover: { to_name: 'Dr. Lee', from_name: 'Front desk', subject: 'Memo', message: 'See attached.' },
  });
  assert.deepEqual(bodies.fax, { quote_id: QUOTE, approval_id: 'apr_' + '5'.repeat(32) });
});

test('a file URL is downloaded without the key, uploaded through the signed session with its sha256, then quoted', async () => {
  const bytes = Buffer.from('%PDF-1.4 fake letter');
  const seen = {};
  nock('https://zapier.example').get('/hydrate/letter').reply(200, bytes, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="letter.pdf"' });
  api().post('/v1/uploads', (b) => { seen.upload = b; return true; }).reply(201, {
    id: UPL, status: 'pending', filename: 'letter.pdf', content_type: 'application/pdf', declared_size: bytes.length, received_size: 0,
    sha256: null, created_at: '2026-10-31T00:00:00Z', expires_at: '2026-10-31T01:00:00Z', completed_at: null,
    upload_url: `https://api.faxforagents.com/v1/uploads/${UPL}/content?sig=abc`, upload_method: 'PUT', upload_url_expires_at: '2026-10-31T00:15:00Z',
  });
  nock('https://api.faxforagents.com', { badheaders: ['authorization'] })
    .put(`/v1/uploads/${UPL}/content`, (b) => { seen.put = b; return true; })
    .query({ sig: 'abc' })
    .matchHeader('content-type', 'application/pdf')
    .reply(200, { id: UPL, status: 'received' });
  api().post(`/v1/uploads/${UPL}/complete`, (b) => { seen.complete = b; return true; }).reply(200, { id: UPL, status: 'completed' });
  api().post('/v1/documents', (b) => { seen.document = b; return true; }).reply(201, document({ source: 'upload', upload_id: UPL, page_count: 3, filename: 'letter.pdf' }));
  api().post('/v1/fax-quotes').reply(201, quote({ document_pages: 3, billable_pages: 3, amount_micro: 117000 }));
  api().matchHeader('idempotency-key', `zapier:${QUOTE}`).post('/v1/faxes').reply(201, job('queued', { billable_pages: 3, amount_micro: 117000 }));

  const result = await appTester(perform, bundleWith({ to: '+15550000001', file: 'https://zapier.example/hydrate/letter' }));
  assert.deepEqual(seen.upload, { filename: 'letter.pdf', size_bytes: bytes.length, content_type: 'application/pdf' });
  assert.equal(typeof seen.put, 'string');
  assert.ok(Buffer.from(seen.put, /^[0-9a-f]+$/.test(seen.put) ? 'hex' : 'utf8').equals(bytes), `the bytes reached the signed URL unchanged, got ${JSON.stringify(seen.put).slice(0, 80)}`);
  assert.deepEqual(seen.complete, { sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  assert.deepEqual(seen.document, { upload_id: UPL, filename: 'letter.pdf' });
  assert.equal(result.document_page_count, 3);
  assert.equal(result.amount_usd, 0.117);
});

test('an image without headers takes its type from the Filename field', async () => {
  const bytes = Buffer.from('fake png');
  const seen = {};
  nock('https://files.example').get('/x').reply(200, bytes);
  api().post('/v1/uploads', (b) => { seen.upload = b; return true; }).reply(201, { id: UPL, status: 'pending', upload_url: 'https://blob.example/signed', upload_method: 'PUT' });
  nock('https://blob.example', { badheaders: ['authorization'] }).put('/signed').matchHeader('content-type', 'image/png').reply(200, '');
  api().post(`/v1/uploads/${UPL}/complete`).reply(200, { id: UPL, status: 'completed' });
  api().post('/v1/documents').reply(201, document({ source: 'upload', upload_id: UPL }));
  api().post('/v1/fax-quotes').reply(201, quote());
  api().post('/v1/faxes').reply(201, job());
  await appTester(perform, bundleWith({ to: '+15550000001', file: 'https://files.example/x', filename: 'scan.png' }));
  assert.deepEqual(seen.upload, { filename: 'scan.png', size_bytes: bytes.length, content_type: 'image/png' });
});

test('a quote that needs a human approval stops before the send and names the quote', async () => {
  api().post('/v1/documents').reply(201, document());
  api().post('/v1/fax-quotes').reply(201, quote({ authorization_required: true }));
  await assert.rejects(appTester(perform, bundleWith({ to: '+15550000001', text: 'x' })), (e) => {
    assert.match(e.message, new RegExp(`approves quote ${QUOTE}`));
    assert.match(e.message, /Nothing was sent/);
    return true;
  });
});

test('input mistakes are refused before any request', async () => {
  await assert.rejects(appTester(perform, bundleWith({ to: '+15550000001' })), /exactly one of Text, Markdown or File/);
  await assert.rejects(appTester(perform, bundleWith({ to: '+15550000001', text: 'a', markdown: 'b' })), /exactly one of Text, Markdown or File/);
  await assert.rejects(appTester(perform, bundleWith({ to: '5550000001', text: 'a' })), /E\.164/);
});

test('an API refusal carries the stable error code, the remedy and the correlation id', async () => {
  api().post('/v1/documents').reply(201, document());
  api().post('/v1/fax-quotes').reply(422, refusal('invalid_destination', 'Not a fax route.'));
  await assert.rejects(appTester(perform, bundleWith({ to: '+15550000001', text: 'x' })), (e) => {
    assert.equal(e.name, 'AppError');
    assert.match(e.message, /Not a fax route\. \(error_code=invalid_destination, http 422\) \[corr_1\]/);
    return true;
  });
  api().post('/v1/documents').reply(201, document());
  api().post('/v1/fax-quotes').reply(201, quote());
  api().post('/v1/faxes').reply(402, refusal('insufficient_balance', 'Balance too low.'));
  await assert.rejects(appTester(perform, bundleWith({ to: '+15550000001', text: 'x' })), /wallet does not cover this fax\. A person tops it up in the dashboard\. \(error_code=insufficient_balance, http 402\) \[corr_1\]/);
});

test('a file that cannot be fetched is reported with its URL and no upload is opened', async () => {
  nock('https://files.example').get('/gone').reply(404, 'not here');
  await assert.rejects(appTester(perform, bundleWith({ to: '+15550000001', file: 'https://files.example/gone' })), /could not be fetched from https:\/\/files\.example\/gone \(http 404\)/);
});

test('a 429 becomes a throttled retry, not a Zap error', async () => {
  api().post('/v1/documents').reply(429, refusal('rate_limited', 'Slow down.', true), { 'Retry-After': '7' });
  await assert.rejects(appTester(perform, bundleWith({ to: '+15550000001', text: 'x' })), (e) => {
    assert.equal(e.name, 'ThrottledError');
    return true;
  });
});
