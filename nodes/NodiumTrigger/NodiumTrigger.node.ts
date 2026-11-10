import { createHmac, timingSafeEqual } from 'crypto'
import {
  NodeConnectionTypes,
  type IDataObject, type IHookFunctions, type INodeType, type INodeTypeDescription, type IWebhookFunctions, type IWebhookResponseData
} from 'n8n-workflow'
import { nodiumRequest } from '../../shared'

const EVENTS = [
  'message.received', 'message.sent', 'message.delivered', 'message.read', 'message.failed',
  'message.echoed', 'conversation.opened', 'contact.opted_in', 'contact.opted_out',
  'channel.connected', 'channel.connect_failed', 'channel.health_changed'
]

/** `t=<timestamp>,v1=<signature>`: an HMAC-SHA256 of `<timestamp>.<raw body>`, five minutes of tolerance. */
function verify(rawBody: Buffer, header: string, secret: string): boolean {
  let timestamp = 0
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === 't') timestamp = Number(rest.join('='))
    else if (key === 'v1') signatures.push(rest.join('='))
  }
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')
  return signatures.some(signature =>
    signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
}

/**
 * Nodium Trigger — starts a workflow on a Nodium event. Activating the
 * workflow creates the webhook subscription at Nodium; deactivating it deletes
 * it. Each call is checked against the subscription's secret before the
 * workflow runs.
 */
export class NodiumTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nodium Trigger',
    name: 'nodiumTrigger',
    icon: 'file:nodium.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["events"].join(", ")}}',
    description: 'Starts the workflow when a WhatsApp message arrives, or on any other Nodium event',
    defaults: { name: 'Nodium Trigger' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'nodiumApi', required: true }],
    webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
    properties: [
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        options: EVENTS.map(event => ({ name: event, value: event })),
        default: ['message.received']
      },
      {
        displayName: 'A subscription without a client receives the events of every client of your account; each event carries `workspace_id` and `external_id`, the client it comes from.',
        name: 'notice',
        type: 'notice',
        default: ''
      },
      {
        displayName: 'Client', name: 'tenant', type: 'string', default: '',
        description: 'Only the events of one of your customers: their client ID, or your own externalId. Empty: every client.'
      }
    ]
  }

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node')
        if (!data.webhookId) return false
        const tenant = (this.getNodeParameter('tenant', '') as string) || undefined
        const { subscriptions } = await nodiumRequest.call(this, 'GET', '/webhooks', { tenant })
        const found = (subscriptions as IDataObject[]).some(item => item.id === data.webhookId && item.url === this.getNodeWebhookUrl('default'))
        if (!found) {
          delete data.webhookId
          delete data.secret
        }
        return found
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const tenant = (this.getNodeParameter('tenant', '') as string) || undefined
        const created = await nodiumRequest.call(this, 'POST', '/webhooks', {
          body: { url: this.getNodeWebhookUrl('default'), events: this.getNodeParameter('events', []) as string[] },
          tenant
        })
        const data = this.getWorkflowStaticData('node')
        data.webhookId = created.id
        data.secret = created.secret
        return true
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node')
        if (data.webhookId) {
          const tenant = (this.getNodeParameter('tenant', '') as string) || undefined
          try {
            await nodiumRequest.call(this, 'DELETE', `/webhooks/${encodeURIComponent(data.webhookId as string)}`, { tenant })
          } catch {
            // Already gone at Nodium: nothing left to delete.
          }
        }
        delete data.webhookId
        delete data.secret
        return true
      }
    }
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const request = this.getRequestObject()
    const secret = this.getWorkflowStaticData('node').secret as string | undefined
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody
    const header = String(request.headers['x-nodium-signature'] ?? '')

    // Without the subscription's secret or a valid signature, the workflow does not run.
    if (!secret || !rawBody || !verify(rawBody, header, secret)) {
      this.getResponseObject().status(400).end()
      return { noWebhookResponse: true }
    }
    return { workflowData: [this.helpers.returnJsonArray(this.getBodyData() as IDataObject)] }
  }
}
