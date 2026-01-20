import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { llmApi, LlmSettings } from '../utils/api';
import { useCrypto } from './CryptoContext';
import { LLM_SYSTEM_PROMPT, MaskMapping, unmaskResponse } from '../utils/masking';

interface LlmContextType {
  settings: LlmSettings | null;
  loading: boolean;
  hasApiKey: boolean;
  saveApiKey: (apiKey: string, endpoint?: string) => Promise<void>;
  askLlm: (prompt: string, mappings: MaskMapping[], dataType: string, recordId: number) => Promise<{
    request: string;
    rawResponse: string;
    displayResponse: string;
  }>;
  reloadSettings: () => Promise<void>;
}

const LlmContext = createContext<LlmContextType | null>(null);

export function LlmProvider({ children }: { children: ReactNode }) {
  const { encrypt, decrypt, hasDataKey } = useCrypto();
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [decryptedApiKey, setDecryptedApiKey] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    // Decrypt API key when settings and data key are available
    if (settings?.encryptedApiKey && hasDataKey) {
      decrypt(settings.encryptedApiKey)
        .then(key => setDecryptedApiKey(key))
        .catch(err => console.error('Failed to decrypt API key:', err));
    } else {
      setDecryptedApiKey(null);
    }
  }, [settings, hasDataKey, decrypt]);

  async function loadSettings() {
    setLoading(true);
    try {
      const result = await llmApi.getSettings();
      setSettings(result);
    } catch (error) {
      console.error('Failed to load LLM settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveApiKey(apiKey: string, endpoint?: string) {
    if (!hasDataKey) {
      throw new Error('No data key available');
    }

    const encryptedApiKey = await encrypt(apiKey);
    await llmApi.updateSettings({
      provider: 'gemini',
      endpoint: endpoint || settings?.endpoint,
      encryptedApiKey
    });

    await loadSettings();
  }

  async function askLlm(
    prompt: string,
    mappings: MaskMapping[],
    dataType: string,
    recordId: number
  ): Promise<{ request: string; rawResponse: string; displayResponse: string }> {
    if (!decryptedApiKey) {
      throw new Error('No API key configured. Please set up your Gemini API key in settings.');
    }

    const endpoint = settings?.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const fullEndpoint = `${endpoint}?key=${decryptedApiKey}`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: LLM_SYSTEM_PROMPT }]
      },
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    // Log the ask action
    await llmApi.logAsk(dataType, recordId).catch(console.error);

    const response = await fetch(fullEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const result = await response.json();
    const rawResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

    // Unmask the response
    const displayResponse = unmaskResponse(rawResponse, mappings);

    return {
      request: prompt,
      rawResponse,
      displayResponse
    };
  }

  return (
    <LlmContext.Provider value={{
      settings,
      loading,
      hasApiKey: !!decryptedApiKey,
      saveApiKey,
      askLlm,
      reloadSettings: loadSettings
    }}>
      {children}
    </LlmContext.Provider>
  );
}

export function useLlm() {
  const context = useContext(LlmContext);
  if (!context) {
    throw new Error('useLlm must be used within a LlmProvider');
  }
  return context;
}
