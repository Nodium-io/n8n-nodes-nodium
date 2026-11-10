import { randomUUID } from 'crypto'
import {
  NodeApiError, NodeConnectionTypes, NodeOperationError,
  type IDataObject, type IExecuteFunctions, type INodeExecutionData, type INodeType, type INodeTypeDescription, type JsonObject
} from 'n8n-workflow'
import { nodiumRequest } from '../../shared'

/**
 * Nodium — send WhatsApp messages and templates, read conversations, numbers,
 * contacts and clients. Every call goes to the Nodium REST API with the API
 * key of the credential; `Client` acts for one of your customers.
 */
export class Nodium implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nodium',
    name: 'nodium',
    icon: 'file:nodium.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Send and read WhatsApp messages through Nodium (Meta\'s official WhatsApp Cloud API)',
    defaults: { name: 'Nodium' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    usableAsTool: true,
    credentials: [{ name: 'nodiumApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Message', value: 'message' },
          { name: 'Conversation', value: 'conversation' },
          { name: 'Number', value: 'channel' },
          { name: 'Contact', value: 'contact' },
          { name: 'Client', value: 'tenant' }
        ],
        default: 'message'
      },
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['message'] } },
        options: [
          { name: 'Send Text', value: 'sendText', action: 'Send a text message', description: 'Free text: only within 24 hours of the customer\'s last message' },
          { name: 'Send Template', value: 'sendTemplate', action: 'Send a template message', description: 'An approved template: to write first, or after the 24-hour window' }
        ],
        default: 'sendText'
      },
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['conversation'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get a conversation', description: 'With its 24-hour window' },
          { name: 'Get Many', value: 'getAll', action: 'Get many conversations' },
          { name: 'Get Messages', value: 'messages', action: 'Get the messages of a conversation' }
        ],
        default: 'getAll'
      },
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['channel', 'contact'] } },
        options: [{ name: 'Get Many', value: 'getAll', action: 'Get many' }],
        default: 'getAll'
      },
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['tenant'] } },
        options: [
          { name: 'Create', value: 'create', action: 'Create a client with a connect link', description: 'Add one of your customers, and get the hosted link that connects their WhatsApp' },
          { name: 'Get Many', value: 'getAll', action: 'Get many clients' }
        ],
        default: 'getAll'
      },

      // ── Message ──────────────────────────────────────────────────────────
      {
        displayName: 'Number ID', name: 'channelId', type: 'string', required: true, default: '',
        displayOptions: { show: { resource: ['message'] } },
        description: 'The ID of the WhatsApp number that sends (Number › Get Many, or `data.channel_id` of a trigger event)'
      },
      {
        displayName: 'To', name: 'to', type: 'string', required: true, default: '', placeholder: '+33612345678',
        displayOptions: { show: { resource: ['message'] } },
        description: 'The recipient\'s phone number, in international format'
      },
      {
        displayName: 'Text', name: 'text', type: 'string', typeOptions: { rows: 3 }, required: true, default: '',
        displayOptions: { show: { resource: ['message'], operation: ['sendText'] } }
      },
      {
        displayName: 'Template Name', name: 'templateName', type: 'string', required: true, default: '', placeholder: 'order_ready',
        displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } }
      },
      {
        displayName: 'Template Language', name: 'templateLanguage', type: 'string', default: 'en',
        displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } }
      },
      {
        displayName: 'Variables', name: 'variables', type: 'json', default: '{}',
        displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
        description: 'The values of the template\'s placeholders: by number ({ "1": "Karim" }) or by name ({ "client_name": "Karim" })'
      },
      {
        displayName: 'Idempotency Key', name: 'idempotencyKey', type: 'string', default: '',
        displayOptions: { show: { resource: ['message'] } },
        description: 'Sending twice with the same key sends once. Use a stable value (an order number and a step, or the trigger\'s event ID) so that a retried workflow does not send twice. Empty: a new key for each run.'
      },

      // ── Conversation ─────────────────────────────────────────────────────
      {
        displayName: 'Conversation ID', name: 'conversationId', type: 'string', required: true, default: '',
        displayOptions: { show: { resource: ['conversation'], operation: ['get', 'messages'] } }
      },

      // ── Client ───────────────────────────────────────────────────────────
      {
        displayName: 'Name', name: 'name', type: 'string', required: true, default: '',
        displayOptions: { show: { resource: ['tenant'], operation: ['create'] } }
      },
      {
        displayName: 'Your ID for It', name: 'externalId', type: 'string', default: '',
        displayOptions: { show: { resource: ['tenant'], operation: ['create'] } },
        description: 'Your own identifier for this customer. Unique in your account: creating it twice answers with the existing client.'
      },
      {
        displayName: 'Return Address', name: 'redirectUrl', type: 'string', default: '', placeholder: 'https://app.example.com/whatsapp',
        displayOptions: { show: { resource: ['tenant'], operation: ['create'] } },
        description: 'Where your customer lands after connecting their number (https only)'
      },

      // ── Shared ───────────────────────────────────────────────────────────
      {
        displayName: 'Limit', name: 'limit', type: 'number', typeOptions: { minValue: 1, maxValue: 100 }, default: 20,
        displayOptions: { show: { operation: ['getAll', 'messages'] } },
        description: 'Max number of results to return'
      },
      {
        displayName: 'Client', name: 'tenant', type: 'string', default: '',
        displayOptions: { hide: { resource: ['tenant'] } },
        description: 'Act for one of your customers: their client ID, or your own externalId. Empty: your own company, or the client your key is pinned to.'
      }
    ]
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const out: INodeExecutionData[] = []

    for (let i = 0; i < items.length; i++) {
      try {
        const resource = this.getNodeParameter('resource', i) as string
        const operation = this.getNodeParameter('operation', i) as string
        const tenant = resource === 'tenant' ? undefined : (this.getNodeParameter('tenant', i, '') as string) || undefined
        const limit = () => this.getNodeParameter('limit', i, 20) as number
        let result: IDataObject | IDataObject[]

        if (resource === 'message') {
          const body: IDataObject = {
            channelId: this.getNodeParameter('channelId', i),
            to: this.getNodeParameter('to', i),
            idempotencyKey: (this.getNodeParameter('idempotencyKey', i, '') as string) || randomUUID()
          }
          if (operation === 'sendText') {
            Object.assign(body, { type: 'text', text: this.getNodeParameter('text', i) })
          } else {
            const raw = this.getNodeParameter('variables', i, '{}')
            const variables = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
            Object.assign(body, {
              type: 'template',
              templateName: this.getNodeParameter('templateName', i),
              templateLanguage: this.getNodeParameter('templateLanguage', i, 'en'),
              ...(variables && Object.keys(variables).length ? { variables } : {})
            })
          }
          result = await nodiumRequest.call(this, 'POST', '/messages', { body, tenant })
        } else if (resource === 'conversation') {
          if (operation === 'get') {
            result = await nodiumRequest.call(this, 'GET', `/conversations/${encodeURIComponent(this.getNodeParameter('conversationId', i) as string)}`, { tenant })
          } else if (operation === 'messages') {
            const id = encodeURIComponent(this.getNodeParameter('conversationId', i) as string)
            result = (await nodiumRequest.call(this, 'GET', `/conversations/${id}/messages`, { qs: { limit: limit() }, tenant })).items
          } else {
            result = (await nodiumRequest.call(this, 'GET', '/conversations', { qs: { limit: limit() }, tenant })).items
          }
        } else if (resource === 'channel') {
          result = (await nodiumRequest.call(this, 'GET', '/channels', { tenant })).items.slice(0, limit())
        } else if (resource === 'contact') {
          result = (await nodiumRequest.call(this, 'GET', '/contacts', { qs: { limit: limit() }, tenant })).items
        } else if (operation === 'create') {
          const externalId = this.getNodeParameter('externalId', i, '') as string
          const redirectUrl = this.getNodeParameter('redirectUrl', i, '') as string
          const client = await nodiumRequest.call(this, 'POST', '/tenants', {
            body: { name: this.getNodeParameter('name', i), ...(externalId ? { externalId } : {}) }
          })
          const link = await nodiumRequest.call(this, 'POST', `/tenants/${encodeURIComponent(client.id)}/connect-links`, {
            body: redirectUrl ? { redirectUrl } : {}
          })
          // The link's address is returned only here: send it to your customer.
          result = { ...client, connectLink: link }
        } else {
          result = (await nodiumRequest.call(this, 'GET', '/tenants', { qs: { limit: limit() } })).items
        }

        for (const json of Array.isArray(result) ? result : [result]) out.push({ json, pairedItem: { item: i } })
      } catch (error) {
        if (this.continueOnFail()) {
          out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } })
          continue
        }
        if (error instanceof SyntaxError) throw new NodeOperationError(this.getNode(), 'Variables must be valid JSON', { itemIndex: i })
        throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i })
      }
    }
    return [out]
  }
}
