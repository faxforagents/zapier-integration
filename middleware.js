'use strict';

const { BASE_URL, USER_AGENT, isApiUrl, throwApiError } = require('./lib/api');

// The API key goes only to api.faxforagents.com, and never to a signed upload URL, a signed
// download URL or a Zapier file URL. A request marked `noAuth` is sent bare even on the API host.
const includeApiKey = (request, z, bundle) => {
  if (!isApiUrl(request.url) || request.noAuth) return request;
  request.headers = request.headers || {};
  request.headers.Accept = 'application/json';
  request.headers['User-Agent'] = USER_AGENT;
  if (bundle.authData && bundle.authData.api_key) {
    request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
  }
  return request;
};

// A refusal becomes an error with the stable error_code and a remedy. A request that opted out
// with skipThrowForStatus handles its own statuses (the fax search treats 404 as "not found").
const handleBadResponses = (response, z) => {
  if (response.status < 400) return response;
  const skip = response.skipThrowForStatus || (response.request && response.request.skipThrowForStatus);
  if (skip) return response;
  const url = (response.request && response.request.url) || '';
  if (!isApiUrl(url) || url.startsWith(`${BASE_URL}/v1/uploads/`)) {
    throw new z.errors.Error(`The file could not be fetched from ${url} (http ${response.status}).`, 'FileFetchError', response.status);
  }
  throwApiError(z, response);
};

module.exports = { befores: [includeApiKey], afters: [handleBadResponses] };
