'use strict';

const assert = require('node:assert/strict');
const { afterEach, before, test } = require('node:test');
const { nock, App, appTester, bundleWith, api, refusal, job, FAX } = require('./helpers');

const perform = App.searches.find_fax.operation.perform;
before(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());

test('a fax is read by id with its evidence', async () => {
  api().get(`/v1/faxes/${FAX}`).reply(200, job('delivered', { pages_sent: 1, captured_micro: 39000, provider_ref: 'ref-1', evidence: { remote_station_id: '+15550000001', pages: 1 } }));
  const results = await appTester(perform, bundleWith({ fax_id: FAX }));
  assert.equal(results.length, 1);
  assert.equal(results[0].state, 'delivered');
  assert.deepEqual(results[0].evidence, { remote_station_id: '+15550000001', pages: 1 });
});

test('an unknown id is no result, not an error', async () => {
  api().get('/v1/faxes/fax_nope').reply(404, refusal('not_found', 'No such fax.'));
  assert.deepEqual(await appTester(perform, bundleWith({ fax_id: 'fax_nope' })), []);
});

test('other refusals still raise with their code', async () => {
  api().get(`/v1/faxes/${FAX}`).reply(403, refusal('scope_missing', 'Needs fax:read.'));
  await assert.rejects(appTester(perform, bundleWith({ fax_id: FAX })), /error_code=scope_missing, http 403/);
  await assert.rejects(appTester(perform, bundleWith({ fax_id: '  ' })), /Fax ID is required/);
});
