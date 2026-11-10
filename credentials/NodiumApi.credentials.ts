import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow'

export class NodiumApi implements ICredentialType {
  name = 'nodiumApi'
  displayName = 'Nodium API'
  documentationUrl = 'https://nodium.io/en/docs/api/guide/auth'
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Your Nodium API key (nod_…), from Settings › API keys in the console'
    }
  ]

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } }
  }

  test: ICredentialTestRequest = {
    request: { baseURL: 'https://nodium.io/api/v1', url: '/channels' }
  }
}
