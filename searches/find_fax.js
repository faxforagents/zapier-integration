'use strict';

const { BASE_URL, throwApiError } = require('../lib/api');
const { FAX_JOB, FAX_JOB_FIELDS } = require('../lib/samples');

// GET /v1/faxes/{fax_id}. A 404 is "no such fax", which a search reports as no result.
const perform = async (z, bundle) => {
  const faxId = String(bundle.inputData.fax_id || '').trim();
  if (!faxId) throw new z.errors.Error('Fax ID is required.', 'InvalidInput', 400);
  const response = await z.request({ url: `${BASE_URL}/v1/faxes/${encodeURIComponent(faxId)}`, skipThrowForStatus: true });
  if (response.status === 404) return [];
  if (response.status >= 400) throwApiError(z, response);
  return [response.data];
};

module.exports = {
  key: 'find_fax',
  noun: 'Fax',
  display: {
    label: 'Find Fax',
    description: 'Reads one fax job by its id: its state, pages, amount and the carrier evidence once delivered.',
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'fax_id',
        label: 'Fax ID',
        type: 'string',
        required: true,
        placeholder: 'fax_...',
        helpText: 'The id returned by Send Fax.',
      },
    ],
    sample: FAX_JOB,
    outputFields: FAX_JOB_FIELDS,
  },
};
