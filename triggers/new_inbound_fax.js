'use strict';

const { BASE_URL } = require('../lib/api');
const { INBOX_ITEM, INBOX_ITEM_FIELDS } = require('../lib/samples');
const hydrators = require('../hydrators');

// GET /v1/inbox lists received faxes newest first. Zapier dedupes on `id`, so every item that was
// not in the list at the last poll triggers once. The PDF is a file pointer, fetched only when a
// later step uses it.
const perform = async (z, bundle) => {
  const params = { limit: 50 };
  if (bundle.inputData.status) params.status = bundle.inputData.status;
  const response = await z.request({ url: `${BASE_URL}/v1/inbox`, params });
  const items = Array.isArray(response.data.items) ? response.data.items : [];
  return items.map((item) => ({
    ...item,
    pdf: z.dehydrateFile(hydrators.downloadInboxPdf, { inbox_id: item.id }),
  }));
};

module.exports = {
  key: 'new_inbound_fax',
  noun: 'Inbound Fax',
  display: {
    label: 'New Inbound Fax',
    description: 'Triggers when a fax is received on one of your numbers.',
  },
  operation: {
    type: 'polling',
    perform,
    inputFields: [
      {
        key: 'status',
        label: 'Status',
        type: 'string',
        choices: { received: 'Received', read: 'Read', archived: 'Archived' },
        helpText: 'Only received faxes in this state. Empty triggers on every new fax whatever its state.',
      },
    ],
    sample: { ...INBOX_ITEM, pdf: 'SAMPLE FILE' },
    outputFields: INBOX_ITEM_FIELDS,
  },
};
