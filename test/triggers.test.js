'use strict';

const assert = require('node:assert/strict');
const { afterEach, before, test } = require('node:test');
const { nock, App, appTester, bundleWith, api, job, inboxItem, INB } = require('./helpers');

before(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());

test('New Inbound Fax lists the inbox newest first, keeps the ids and adds a PDF file pointer', async () => {
  const newer = inboxItem({ id: 'inb_' + '9'.repeat(32), received_at: '2026-10-31T01:00:00Z' });
  api().get('/v1/inbox').query({ limit: 50 }).reply(200, { items: [newer, inboxItem()], next_cursor: null });
  const results = await appTester(App.triggers.new_inbound_fax.operation.perform, bundleWith({}));
  assert.deepEqual(results.map((r) => r.id), [newer.id, INB]);
  assert.equal(results[0].pages, 3);
  assert.match(results[0].pdf, /^hydrate\|\|\|.*\|\|\|hydrate$/);
  assert.match(results[0].pdf, /downloadInboxPdf/);
});

test('New Inbound Fax passes the status filter through', async () => {
  api().get('/v1/inbox').query({ limit: 50, status: 'received' }).reply(200, { items: [inboxItem()] });
  const results = await appTester(App.triggers.new_inbound_fax.operation.perform, bundleWith({ status: 'received' }));
  assert.equal(results.length, 1);
});

test('Fax Delivered asks the API for the chosen final state and returns only faxes in it', async () => {
  const delivered = job('delivered', { pages_sent: 1, completed_at: '2026-10-31T00:01:00Z', evidence: { remote_station_id: '+15550000001', pages: 1 } });
  const stray = job('active', { id: 'fax_' + '8'.repeat(32) });
  api().get('/v1/faxes').query({ limit: 50, state: 'delivered' }).reply(200, { items: [delivered, stray], next_cursor: null });
  const results = await appTester(App.triggers.fax_delivered.operation.perform, bundleWith({}));
  assert.deepEqual(results.map((r) => [r.id, r.state]), [[delivered.id, 'delivered']]);

  api().get('/v1/faxes').query({ limit: 50, state: 'failed' }).reply(200, { items: [job('failed', { failure_code: 'no_answer' })] });
  const failed = await appTester(App.triggers.fax_delivered.operation.perform, bundleWith({ state: 'failed' }));
  assert.equal(failed[0].failure_code, 'no_answer');
  await assert.rejects(appTester(App.triggers.fax_delivered.operation.perform, bundleWith({ state: 'queued' })), /State must be one of/);
});

test('the inbox PDF hydrator follows the signed link without the key', async () => {
  const bytes = Buffer.from('%PDF-1.4 received');
  api().get(`/v1/inbox/${INB}/download`).reply(200, { url: 'https://blob.example/signed.pdf?sig=1', expires_at: '2026-10-31T00:15:00Z', content_type: 'application/pdf' });
  nock('https://blob.example', { badheaders: ['authorization'] }).get('/signed.pdf').query({ sig: '1' }).reply(200, bytes);
  const stashed = [];
  const z = { request: null, stashFile: (buf, len, name, type) => { stashed.push([buf, len, name, type]); return 'https://zapier.example/stashed'; } };
  const result = await appTester(async (realZ, bundle) => App.hydrators.downloadInboxPdf({ ...realZ, stashFile: z.stashFile }, bundle), bundleWith({ inbox_id: INB }));
  assert.equal(result, 'https://zapier.example/stashed');
  assert.ok(stashed[0][0].equals(bytes));
  assert.deepEqual(stashed[0].slice(1), [bytes.length, `${INB}.pdf`, 'application/pdf']);
});

test('every action has a sample, output fields and an id in the sample', () => {
  const ops = [
    ...Object.values(App.triggers), ...Object.values(App.searches), ...Object.values(App.creates),
  ].map((a) => a.operation);
  for (const op of ops) {
    assert.ok(op.sample && op.sample.id, 'sample with id');
    assert.ok(op.outputFields.length > 5, 'output fields');
    for (const f of op.outputFields) assert.ok(f.key && f.label, 'labelled field');
  }
});
