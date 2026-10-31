'use strict';

const assert = require('node:assert/strict');
const { afterEach, before, test } = require('node:test');
const { nock, App, appTester, bundleWith, api, refusal, KEY } = require('./helpers');

before(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());

test('the auth test reads the balance with the key as a Bearer header', async () => {
  api().get('/v1/balance').reply(200, { environment: 'test', currency: 'USD', available_micro: 5000000, held_micro: 0 });
  const response = await appTester(App.authentication.test, bundleWith());
  assert.equal(response.status, 200);
  assert.equal(response.data.environment, 'test');
});

test('a rejected key asks for a reconnect and names the error code', async () => {
  nock('https://api.faxforagents.com').get('/v1/balance').reply(401, refusal('invalid_token', 'The API key was rejected.'));
  await assert.rejects(appTester(App.authentication.test, bundleWith({}, 'ffa_test_wrong')), (e) => {
    assert.equal(e.name, 'ExpiredAuthError');
    assert.match(e.message, /error_code=invalid_token/);
    assert.match(e.message, /app\.faxforagents\.com/);
    return true;
  });
});

test('the connection label names the environment from the key prefix', async () => {
  const label = (key, data = {}) => appTester(App.authentication.connectionLabel, { authData: { api_key: key }, inputData: data });
  assert.equal(await label(KEY), 'Test key (sandbox, no carrier, no cost)');
  assert.equal(await label('ffa_live_' + 'b'.repeat(43)), 'Live key (carrier, prepaid wallet)');
  assert.equal(await label('something', { environment: 'live' }), 'Live key (carrier, prepaid wallet)');
  assert.equal(await label('something'), 'API key');
});

test('the auth field is one password field named api_key', () => {
  assert.deepEqual(App.authentication.fields.map((f) => [f.key, f.type, f.required]), [['api_key', 'password', true]]);
  assert.equal(App.authentication.type, 'custom');
});
