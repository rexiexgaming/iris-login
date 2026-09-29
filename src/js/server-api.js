export class ServerAPI {
  constructor(baseUrl = '', getAccessToken = null) {
    this.baseUrl = baseUrl;
    this.getAccessToken = getAccessToken;
  }

  async request(path, options = {}) {
    const accessToken = this.getAccessToken ? await this.getAccessToken() : null;
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    const text = await response.text();
    let json = {};

    if (text) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new Error(`Server returned invalid JSON for ${path}.`);
      }
    }

    if (!response.ok) {
      const error = new Error(json?.error || `Request failed with status ${response.status}.`);
      error.status = response.status;
      error.code = json?.code;
      error.details = json?.details;
      error.payload = json;
      throw error;
    }

    return json;
  }

  getProviderStatus() {
    return this.request('/api/providers/status', {
      method: 'GET'
    });
  }

  sendMessage(payload) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}
