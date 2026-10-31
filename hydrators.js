'use strict';

const { BASE_URL } = require('./lib/api');

// Fetch the PDF of one received fax when a later step asks for it. GET /v1/inbox/{inbox_id}/download
// answers with a short-lived signed URL, the bytes come from that URL without the API key, and
// Zapier keeps a copy for the Zap run.
const downloadInboxPdf = async (z, bundle) => {
  const inboxId = bundle.inputData.inbox_id;
  const link = await z.request({ url: `${BASE_URL}/v1/inbox/${encodeURIComponent(inboxId)}/download` });
  const signed = link.data;
  const file = await z.request({ url: signed.url, raw: true, noAuth: true });
  const bytes = await file.buffer();
  return z.stashFile(bytes, bytes.length, `${inboxId}.pdf`, signed.content_type || 'application/pdf');
};

module.exports = { downloadInboxPdf };
