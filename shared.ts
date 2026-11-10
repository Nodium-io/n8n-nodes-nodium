import type { IDataObject, IExecuteFunctions, IHookFunctions, IHttpRequestMethods, IWebhookFunctions } from 'n8n-workflow'

export const BASE_URL = 'https://nodium.io/api/v1'

type Caller = IExecuteFunctions | IHookFunctions | IWebhookFunctions

/**
 * One call to the Nodium API with the node's credential. Nodium answers
 * `{ data }`; this returns `data`. `tenant` names one of your clients
 * (the `Nodium-Tenant` header), by its id or your own externalId.
 */
export async function nodiumRequest(
  this: Caller,
  method: IHttpRequestMethods,
  path: string,
  options: { body?: IDataObject, qs?: IDataObject, tenant?: string } = {}
): Promise<any> {
  const response = await this.helpers.httpRequestWithAuthentication.call(this, 'nodiumApi', {
    method,
    url: `${BASE_URL}${path}`,
    json: true,
    ...(options.body ? { body: options.body } : {}),
    ...(options.qs ? { qs: options.qs } : {}),
    ...(options.tenant ? { headers: { 'Nodium-Tenant': options.tenant } } : {})
  })
  return response && typeof response === 'object' && 'data' in response ? response.data : response
}
