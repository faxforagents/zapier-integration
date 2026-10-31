<p align="center">
  <a href="https://faxforagents.com"><img src="https://faxforagents.com/brand/logo-512.png" width="88" alt="Fax for Agents"></a>
</p>

<h1 align="center">zapier-integration</h1>

<p align="center">The Zapier integration for <a href="https://faxforagents.com">Fax for Agents</a>. Send a fax, find a fax, and start a Zap when a fax arrives or is delivered.</p>

<p align="center">
  <a href="https://faxforagents.com">Website</a> ·
  <a href="https://faxforagents.com/docs/quickstart/">Quickstart</a> ·
  <a href="https://faxforagents.com/docs/api/">API reference</a> ·
  <a href="https://faxforagents.com/docs/sdks/">SDKs</a> ·
  <a href="https://faxforagents.com/mcp/">MCP</a> ·
  <a href="https://app.faxforagents.com">Dashboard</a> ·
  <a href="https://faxforagents.com/pricing/">Pricing</a> ·
  <a href="https://faxforagents.com/changelog/">Changelog</a> ·
  <a href="https://gitlab.com/faxforagents/zapier-integration">GitLab</a>
</p>

<div align="center">

[![ci](https://img.shields.io/github/actions/workflow/status/faxforagents/zapier-integration/ci.yml?branch=main&label=ci)](https://github.com/faxforagents/zapier-integration/actions/workflows/ci.yml) [![MIT](https://img.shields.io/badge/licence-MIT-1f6feb)](https://github.com/faxforagents/zapier-integration/blob/main/LICENSE) [![Zapier Platform CLI](https://img.shields.io/badge/Zapier-Platform%20CLI%2019.3-ff4f00)](https://docs.zapier.com/platform/build-cli/overview)

</div>

Fax for Agents is a fax API, a hosted MCP server and SDKs built so AI agents can send and receive
faxes. It is made by JSB Holdings LLC and built by [Synapse](https://synapsereality.io/).

This repository holds the integration as the Zapier Platform CLI lays it out. `index.js` is the app
definition, with one file per trigger, search and create. `zapier-platform-core` is the only runtime
dependency. Every request goes to `api.faxforagents.com`, and every path and field name is the one in
the [OpenAPI document](https://faxforagents.com/openapi.json).

## Triggers, searches and creates

| Step | Type | Does |
|---|---|---|
| New Inbound Fax | polling trigger | `GET /v1/inbox`, newest first, with an optional status filter. Zapier dedupes on `id`. Each item carries `pdf`, a file that is fetched only when a later step uses it: `GET /v1/inbox/{inbox_id}/download`, then the signed URL |
| Fax Delivered | polling trigger | `GET /v1/faxes?state=delivered`, newest first. The final state is a choice: `delivered` (with the carrier's evidence), `partial`, `failed` or `unknown` |
| Find Fax | search | `GET /v1/faxes/{fax_id}`: `queued`, `active`, `delivered`, `partial`, `failed` or `unknown`. An unknown id is no result, not an error |
| Send Fax | create | `POST /v1/documents` from text or Markdown, or `POST /v1/uploads`, the bytes to the signed URL and `POST /v1/uploads/{upload_id}/complete` for a file, then `POST /v1/fax-quotes` to the number and `POST /v1/faxes` under an `Idempotency-Key`. Returns the fax, `queued` |

The connection is one API key, sent as `Authorization: Bearer` to `api.faxforagents.com` and to
nothing else. It is checked against `GET /v1/balance`. The connection label names the environment
from the first characters of the key. An `ffa_test_` key is labelled "Test key (sandbox, no carrier,
no cost)" and an `ffa_live_` key "Live key (carrier, prepaid wallet)". API refusals keep the stable `error_code` and the request's
correlation id in the message. 401 asks for a reconnect. 429 is left to Zapier, which retries the
step after the `Retry-After` delay.

Send Fax takes exactly one of Text, Markdown or File. A file is a PDF, PNG, JPEG or TIFF from an
earlier step or a URL to one. It is downloaded without the API key, uploaded through the bounded
session with its SHA-256 hash, and becomes an immutable document. Any cover field (to name, from name,
subject, message) adds a billable cover page. The idempotency key is `zapier:` followed by the id of
the quote this run created. A retried request for the same quote returns the same fax. The
Idempotency key field overrides it. The step returns the fax as queued. Fax Delivered or Find Fax read the
outcome later. Send Fax does not wait for the carrier.

A live send needs a human approval bound to that exact quote, or a delegated policy the account owner
wrote outside Zapier. When the quote says `authorization_required` and no approval id was given, Send
Fax stops with the quote id and nothing is sent. A person approves it in the dashboard and the
approval id goes into the step's Approval ID field.

A test key (`ffa_test_...`) reaches the sandbox only. No carrier, no cost. The destination number
picks the outcome: `+15550000001` is delivered, `+15550000003` is partial and `+15550000005` is
unknown. A live key (`ffa_live_...`) reaches the carrier and spends the prepaid wallet.

## Prices

The price card is effective from 2026-10-28. $0.039 per page sent, $0.019 per page received. $2 per
number per month, $19 per month for the Agent workspace. Sandbox pages cost 0.

## Working on this repository

```bash
npm ci --ignore-scripts
npm test                                            # 21 unit tests on node:test, every API call mocked with nock
npx -y zapier-platform-cli@19.3.0 validate          # the schema, then Zapier's integration checks
sh scripts/truthcheck.sh
```

The tests never reach the network. They assert the request bodies, headers and paths against the
shapes in the OpenAPI document and the samples the sibling integrations record. The integration was
not run against the live API from this repository.

## Publishing

The integration is registered with Zapier as **Fax for Agents**, integration id **248902**
(`App248902` in `.zapierapprc`), audience private, category fax. Version 1.0.0 on platform 19.3.0 was
pushed on 2026-10-31. It is private: not submitted for review, not listed in the App Directory, and
no users were invited.

The Platform UI for it is `https://developer.zapier.com/app/248902/version/1.0.0`. That page is where
the maintainer uploads the logo, adds the screenshots, writes the directory description and submits
the integration for review. None of that is done from this repository, and the CLI here never
promotes, publishes or invites.

A new version is a change of `version` in `package.json` and one command, with the Zapier deploy key (the
`zapier-platform login` credential) in `~/.zapierrc` on the machine that runs it:

```bash
npx -y zapier-platform-cli@19.3.0 push
```

`zapier-platform versions` lists what is uploaded. `zapier-platform promote 1.0.1` makes a version
the one new Zaps use, and stays a human's decision.

## Licence

MIT. See [LICENSE](LICENSE). Security reports go to hello@faxforagents.com.
