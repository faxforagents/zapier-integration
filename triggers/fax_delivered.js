'use strict';

const { BASE_URL, TERMINAL_STATES } = require('../lib/api');
const { FAX_JOB, FAX_JOB_FIELDS } = require('../lib/samples');

// GET /v1/faxes lists fax jobs newest first. The chosen final state goes to the API as the `state`
// filter and is checked again here, so a fax triggers once, when it reaches that state.
const perform = async (z, bundle) => {
  const state = bundle.inputData.state || 'delivered';
  if (!TERMINAL_STATES.includes(state)) {
    throw new z.errors.Error(`State must be one of ${TERMINAL_STATES.join(', ')}.`, 'InvalidInput', 400);
  }
  const response = await z.request({ url: `${BASE_URL}/v1/faxes`, params: { limit: 50, state } });
  const items = Array.isArray(response.data.items) ? response.data.items : [];
  return items.filter((fax) => fax.state === state);
};

module.exports = {
  key: 'fax_delivered',
  noun: 'Fax',
  display: {
    label: 'Fax Delivered',
    description: 'Triggers when a sent fax reaches a final state: delivered by default, or partial, failed or unknown.',
  },
  operation: {
    type: 'polling',
    perform,
    inputFields: [
      {
        key: 'state',
        label: 'Final state',
        type: 'string',
        default: 'delivered',
        choices: { delivered: 'Delivered', partial: 'Partial', failed: 'Failed', unknown: 'Unknown' },
        helpText: 'Which final state to trigger on. Delivered carries the carrier evidence.',
      },
    ],
    sample: FAX_JOB,
    outputFields: FAX_JOB_FIELDS,
  },
};
