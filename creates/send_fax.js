'use strict';

const crypto = require('node:crypto');
const { BASE_URL, ALLOWED_CONTENT_TYPES, contentTypeOf } = require('../lib/api');
const { FAX_JOB, FAX_JOB_FIELDS } = require('../lib/samples');

const E164 = /^\+[1-9]\d{6,14}$/;

// Remove empty values so the API sees only what the person filled in.
const compact = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ''));

// A filename for the uploaded bytes: the field, else the Content-Disposition of the download,
// else the last path segment of the URL when it carries an extension, else document.pdf.
function filenameFor(input, response, fileUrl) {
  if (input && String(input).trim()) return String(input).trim().slice(0, 255);
  const disposition = response.getHeader('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (m && m[1]) return decodeURIComponent(m[1]).slice(0, 255);
  try {
    const last = new URL(fileUrl).pathname.split('/').filter(Boolean).pop() || '';
    if (/\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last).slice(0, 255);
  } catch {
    // not a URL: fall through
  }
  return 'document.pdf';
}

// Download the file Zapier hands over (a hydration URL or any URL), then the three-step upload:
// a bounded session, the bytes to the signed URL, the completion with the SHA-256. Returns the
// document created from the upload.
async function documentFromFile(z, fileUrl, filenameInput) {
  const download = await z.request({ url: fileUrl, raw: true, noAuth: true });
  const bytes = await download.buffer();
  if (!bytes.length) throw new z.errors.Error('The file is empty.', 'EmptyFile', 400);
  const filename = filenameFor(filenameInput, download, fileUrl);
  const headerType = String(download.getHeader('content-type') || '').split(';')[0].trim().toLowerCase();
  const contentType = ALLOWED_CONTENT_TYPES.has(headerType) ? headerType : contentTypeOf(filename);

  const session = (
    await z.request({
      url: `${BASE_URL}/v1/uploads`,
      method: 'POST',
      body: { filename, size_bytes: bytes.length, content_type: contentType },
    })
  ).data;
  if (!session.upload_url) throw new z.errors.Error('The upload session carries no upload_url.', 'UploadSession', 502);

  const put = await z.request({
    url: session.upload_url,
    method: session.upload_method || 'PUT',
    body: bytes,
    headers: { 'Content-Type': contentType },
    raw: true,
    noAuth: true,
    skipThrowForStatus: true,
  });
  if (put.status >= 400) {
    throw new z.errors.Error(`The signed upload was refused (http ${put.status}).`, 'UploadRefused', put.status);
  }

  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  await z.request({ url: `${BASE_URL}/v1/uploads/${session.id}/complete`, method: 'POST', body: { sha256 } });
  return (await z.request({ url: `${BASE_URL}/v1/documents`, method: 'POST', body: { upload_id: session.id, filename } })).data;
}

const perform = async (z, bundle) => {
  const input = bundle.inputData;
  const to = String(input.to || '').trim();
  if (!E164.test(to)) {
    throw new z.errors.Error('To must be a fax number in E.164, for example +12025550123.', 'InvalidDestination', 400);
  }
  const sources = ['text', 'markdown', 'file'].filter((k) => input[k] && String(input[k]).trim());
  if (sources.length !== 1) {
    throw new z.errors.Error('Fill exactly one of Text, Markdown or File.', 'InvalidContent', 400);
  }

  // 1) Prepare the document.
  let document;
  if (sources[0] === 'file') {
    document = await documentFromFile(z, String(input.file).trim(), input.filename);
  } else {
    const body = compact({ [sources[0]]: input[sources[0]], filename: input.filename });
    document = (await z.request({ url: `${BASE_URL}/v1/documents`, method: 'POST', body })).data;
  }

  // 2) Quote it to the one destination. Any cover field adds a billable cover page.
  const cover = compact({
    to_name: input.cover_to_name,
    from_name: input.cover_from_name,
    subject: input.cover_subject,
    message: input.cover_message,
  });
  const quoteBody = compact({ document_id: document.id, to, from: input.from });
  if (Object.keys(cover).length) quoteBody.cover = cover;
  const quote = (await z.request({ url: `${BASE_URL}/v1/fax-quotes`, method: 'POST', body: quoteBody })).data;

  const approvalId = input.approval_id && String(input.approval_id).trim();
  if (quote.authorization_required && !approvalId) {
    throw new z.errors.Error(
      `This send needs a human approval. A person approves quote ${quote.id} in the dashboard, then the approval id goes in Approval ID. Nothing was sent.`,
      'approval_required',
      403,
    );
  }

  // 3) Send under an idempotency key. The quote exists for this run alone, so the key is derived
  // from the run. A person may set their own key instead.
  const idempotencyKey = (input.idempotency_key && String(input.idempotency_key).trim()) || `zapier:${quote.id}`;
  const fax = (
    await z.request({
      url: `${BASE_URL}/v1/faxes`,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: compact({ quote_id: quote.id, approval_id: approvalId, client_reference: input.client_reference }),
    })
  ).data;

  return {
    ...fax,
    amount_usd: typeof fax.amount_micro === 'number' ? fax.amount_micro / 1000000 : null,
    idempotency_key: idempotencyKey,
    quote_expires_at: quote.expires_at,
    document_page_count: document.page_count,
  };
};

module.exports = {
  key: 'send_fax',
  noun: 'Fax',
  display: {
    label: 'Send Fax',
    description: 'Prepares a document from text, Markdown or a file, quotes it to one number and sends the fax.',
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'to',
        label: 'To',
        type: 'string',
        required: true,
        placeholder: '+12025550123',
        helpText:
          'The destination fax number in E.164. With a test key, `+15550000001` is delivered, `+15550000003` is partial and `+15550000005` is unknown.',
      },
      {
        key: 'text',
        label: 'Text',
        type: 'text',
        helpText: 'Plain text rendered to a letter PDF. Fill exactly one of Text, Markdown or File.',
      },
      {
        key: 'markdown',
        label: 'Markdown',
        type: 'text',
        helpText: 'Markdown (headings, lists, emphasis, code) rendered to PDF.',
      },
      {
        key: 'file',
        label: 'File',
        type: 'file',
        helpText: 'A PDF, PNG, JPEG or TIFF from an earlier step, or a URL to one. Images become monochrome letter pages.',
      },
      {
        key: 'filename',
        label: 'Filename',
        type: 'string',
        helpText: 'A name for the document, shown in the dashboard. For a file it also picks the type by extension when the download does not say.',
      },
      {
        key: 'from',
        label: 'From',
        type: 'string',
        helpText: 'A fax number you own, in E.164. Empty sends from the shared pool.',
      },
      { key: 'cover_to_name', label: 'Cover sheet: to name', type: 'string', helpText: 'Any cover field adds a billable cover page in front of the document.' },
      { key: 'cover_from_name', label: 'Cover sheet: from name', type: 'string' },
      { key: 'cover_subject', label: 'Cover sheet: subject', type: 'string' },
      { key: 'cover_message', label: 'Cover sheet: message', type: 'text' },
      {
        key: 'approval_id',
        label: 'Approval ID',
        type: 'string',
        helpText: 'An approved request bound to this send (`apr_...`), when the account needs a human approval for live sends. A person grants it in the dashboard.',
      },
      {
        key: 'client_reference',
        label: 'Client reference',
        type: 'string',
        helpText: 'Your own reference stored on the fax, up to 200 characters.',
      },
      {
        key: 'idempotency_key',
        label: 'Idempotency key',
        type: 'string',
        helpText: 'Repeating a send with the same key within 24 hours returns the same fax instead of a second one. Empty means `zapier:` followed by the quote id this run created.',
      },
    ],
    sample: {
      ...FAX_JOB,
      state: 'queued',
      pages_sent: 0,
      captured_micro: 0,
      transmitted_sha256: null,
      provider_ref: null,
      attempt_count: 0,
      updated_at: '2026-10-31T00:00:00Z',
      completed_at: null,
      evidence: null,
      amount_usd: 0.039,
      idempotency_key: 'zapier:qte_22222222222222222222222222222222',
      quote_expires_at: '2026-10-31T00:10:00Z',
      document_page_count: 1,
    },
    outputFields: [
      ...FAX_JOB_FIELDS,
      { key: 'amount_usd', label: 'Amount (USD)', type: 'number' },
      { key: 'idempotency_key', label: 'Idempotency key', type: 'string' },
      { key: 'quote_expires_at', label: 'Quote expires at', type: 'datetime' },
      { key: 'document_page_count', label: 'Document pages', type: 'integer' },
    ],
  },
};
