# n8n nodes for Nodium

[![npm](https://img.shields.io/npm/v/@nodium.io/n8n-nodes-nodium.svg)](https://www.npmjs.com/package/@nodium.io/n8n-nodes-nodium)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Send and receive WhatsApp messages in [n8n](https://n8n.io) with [Nodium](https://nodium.io), the WhatsApp API gateway for developers (Meta's official WhatsApp Cloud API).

| Node | What it does |
|---|---|
| **Nodium Trigger** | Starts a workflow when a WhatsApp message arrives, or on any other Nodium event. Activating the workflow creates the webhook at Nodium; every call is checked against its signature before the workflow runs. |
| **Nodium** | Sends a text or an approved template; reads conversations, their messages, numbers, contacts and clients; creates a client with the hosted link that connects its WhatsApp. |

## Install

In n8n: **Settings › Community Nodes › Install**, then enter `@nodium.io/n8n-nodes-nodium`.

On a self-hosted n8n without the interface: `npm install @nodium.io/n8n-nodes-nodium` in `~/.n8n/nodes`, then restart n8n.

## Credentials

Create a **Nodium API** credential with your API key (`nod_…`), from **Settings › API keys** in the Nodium console. No account yet? [Create one for free](https://nodium.io): 3,000 messages a month and one number, no card.

## A workflow that answers

1. **Nodium Trigger**, event `message.received`.
2. **Nodium**, Message › Send Text:
   - Number ID: `{{ $json.data.channel_id }}`
   - To: `{{ $json.data.from }}`
   - Text: `You wrote: {{ $json.data.text }}`
   - Idempotency Key: `reply-{{ $json.id }}` (the same on every redelivery: sent once)

## What WhatsApp imposes

- **Free text only goes out within 24 hours** of the customer's last message. To write first, or after that, use **Send Template** with an approved template.
- **A send refused by WhatsApp is still a success** for the API: check `message.status` in the output (`failed`, with `message.errorInfo`).

## Several customers

A trigger without a client receives the events of every client of your account: each event carries `workspace_id` and `external_id`, the client it comes from. In the **Nodium** node, the **Client** field acts for one of your customers (their client ID or your own `externalId`).

## Learn more

- [WhatsApp API with n8n, step by step](https://nodium.io/en/guides/whatsapp-api-n8n)
- [The API guide](https://nodium.io/en/docs/api) · [Webhook events](https://nodium.io/en/docs/api/guide/webhooks)

MIT © By-Tech.io
