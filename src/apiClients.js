import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic client factory
 */
export function createAnthropicClient(apiKey) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/**
 * xAI client using standard HTTP calls (since xAI SDK may not be browser-compatible)
 * Uses Grok vision API endpoint
 */
export function createXaiClient(apiKey) {
  return {
    async messagesCreate(params) {
      const response = await fetch('https://api.x.ai/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = new Error(`xAI API error: ${response.statusText}`);
        error.status = response.status;
        error.name = response.status === 401 ? 'AuthenticationError' : 'APIError';
        throw error;
      }

      return response.json();
    },
  };
}

/**
 * Factory function to get the appropriate client based on API key format
 */
export function getApiClient(apiKey, provider = 'auto') {
  if (provider === 'auto') {
    // Auto-detect provider based on key prefix
    if (apiKey.startsWith('sk-ant-')) {
      provider = 'anthropic';
    } else if (apiKey.startsWith('xai-')) {
      provider = 'xai';
    } else {
      throw new Error('Unknown API key format. Use Anthropic (sk-ant-*) or xAI (xai-*) keys.');
    }
  }

  if (provider === 'anthropic') {
    return { client: createAnthropicClient(apiKey), provider: 'anthropic' };
  } else if (provider === 'xai') {
    return { client: createXaiClient(apiKey), provider: 'xai' };
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Normalize API errors to a common format
 */
export function mapApiError(err, provider) {
  const status = err?.status;
  const name = err?.name;

  if (provider === 'anthropic') {
    if (status === 401) return 'Invalid Anthropic API key. Check Settings.';
    if (status === 429) return 'Rate limit hit. Try again in a moment.';
    if (status >= 500) return 'Anthropic API is having trouble. Try again.';
    if (name === 'APIConnectionError' || name === 'TypeError') {
      return "Couldn't reach Anthropic. Check connection.";
    }
  } else if (provider === 'xai') {
    if (status === 401) return 'Invalid xAI API key. Check Settings.';
    if (status === 429) return 'xAI rate limit hit. Try again in a moment.';
    if (status >= 500) return 'xAI API is having trouble. Try again.';
    if (name === 'APIConnectionError' || name === 'TypeError') {
      return "Couldn't reach xAI. Check connection.";
    }
  }

  return "Couldn't read the receipt. Try a clearer photo.";
}
