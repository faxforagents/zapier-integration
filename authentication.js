'use strict';

const { BASE_URL, environmentOf } = require('./lib/api');

// GET /v1/balance is a small authenticated read: it needs a valid key, reads nothing but the
// wallet, and names the environment the key reaches.
const test = (z) => z.request({ url: `${BASE_URL}/v1/balance` });

// The label names the environment from the key prefix, so a person sees at a glance whether a
// Zap reaches the sandbox or the carrier. The balance response confirms it when the prefix is odd.
const connectionLabel = (z, bundle) => {
  const env = environmentOf(bundle.authData.api_key) || (bundle.inputData && bundle.inputData.environment) || null;
  if (env === 'test') return 'Test key (sandbox, no carrier, no cost)';
  if (env === 'live') return 'Live key (carrier, prepaid wallet)';
  return 'API key';
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Create a key at [app.faxforagents.com](https://app.faxforagents.com). An `ffa_test_` key reaches the sandbox only and costs nothing. An `ffa_live_` key reaches the carrier and spends the prepaid wallet.',
    },
  ],
  test,
  connectionLabel,
};
