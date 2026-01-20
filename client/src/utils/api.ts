const API_BASE = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    request<{ message: string; user: { id: number; username: string; role: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),

  logout: () =>
    request<{ message: string }>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{ user: { id: number; username: string; role: string } }>('/auth/me')
};

// Users API
export const usersApi = {
  list: () =>
    request<Array<{
      id: number;
      username: string;
      name: string;
      surname: string;
      birthdate: string;
      email: string;
      is_active: number;
      role_name: string;
    }>>('/users'),

  create: (data: {
    username: string;
    password: string;
    name?: string;
    surname?: string;
    birthdate?: string;
    email?: string;
    roleId?: string;
    publicKey: string;
  }) =>
    request<{ message: string; userId: number }>('/users', {
      method: 'POST',
      body: JSON.stringify(data)
    })
};

// Weight Data API
export interface WeightRecord {
  id: number;
  member_id: number;
  weight: number;
  date: string;
  deleted: string | null;
  created_at: string;
  member_name: string | null;
  member_surname: string | null;
}

export const dataApi = {
  list: () =>
    request<WeightRecord[]>('/data'),

  create: (memberId: number, weight: number, date: string) =>
    request<{ message: string; id: number }>('/data', {
      method: 'POST',
      body: JSON.stringify({ memberId, weight, date })
    }),

  delete: (id: number) =>
    request<{ message: string; deletedAt: string }>(`/data/${id}`, {
      method: 'DELETE'
    })
};

// Keys API
export const keysApi = {
  get: (userId: number) =>
    request<{
      id: number;
      user_id: number;
      role_id: number;
      public_key: string;
      encrypted_private_key: string;
      wrapped_data_key: string;
      role_name: string;
    }>(`/keys/${userId}`),

  grant: (userId: number, wrappedDataKey: string) =>
    request<{ message: string }>('/keys/grant', {
      method: 'POST',
      body: JSON.stringify({ userId, wrappedDataKey })
    }),

  getRoles: () =>
    request<Array<{ id: number; name: string }>>('/keys/roles/list'),

  // Check if system has any valid data key
  systemHasDataKey: () =>
    request<{ hasDataKey: boolean }>('/keys/system/has-data-key'),

  // Set up user's own keys (first login or new device)
  setup: (publicKey: string, encryptedPrivateKey: string, wrappedDataKey?: string) =>
    request<{
      message: string;
      existing?: boolean;
      encrypted_private_key?: string;
      public_key?: string;
      wrapped_data_key?: string;
    }>('/keys/setup', {
      method: 'PUT',
      body: JSON.stringify({ publicKey, encryptedPrivateKey, wrappedDataKey })
    }),

  // Admin resets a user's keys (for lost keys recovery)
  reset: (userId: number) =>
    request<{ message: string }>(`/keys/reset/${userId}`, {
      method: 'DELETE'
    })
};

// Audit API
export interface AuditLog {
  id: number;
  action: string;
  user_id: number | null;
  target_user_id: number | null;
  details: string | null;
  ip_address: string | null;
  success: number;
  created_at: string;
  actor_username: string | null;
  target_username: string | null;
}

export const auditApi = {
  list: (params?: { limit?: number; offset?: number; action?: string; userId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.action) searchParams.set('action', params.action);
    if (params?.userId) searchParams.set('userId', params.userId.toString());
    const query = searchParams.toString();
    return request<{ logs: AuditLog[]; total: number; limit: number; offset: number }>(
      `/audit${query ? `?${query}` : ''}`
    );
  },

  getActions: () => request<string[]>('/audit/actions')
};

// Members API
export interface Member {
  id: number;
  name: string | null;
  surname: string | null;
  birthdate: string | null;
  email: string | null;
  gender: string | null;
  deleted: string | null;
  created_at: string;
}

export const membersApi = {
  list: () => request<Member[]>('/members'),

  create: (data: { name?: string; surname?: string; birthdate?: string; email?: string; gender?: string }) =>
    request<{ message: string; id: number }>('/members', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  delete: (id: number) =>
    request<{ message: string; deletedAt: string }>(`/members/${id}`, {
      method: 'DELETE'
    })
};

// LLM API
export interface LlmSettings {
  provider: string;
  endpoint: string;
  hasApiKey: boolean;
  encryptedApiKey?: string;
}

export const llmApi = {
  getSettings: () => request<LlmSettings>('/llm/settings'),

  updateSettings: (data: { provider?: string; endpoint?: string; encryptedApiKey: string }) =>
    request<{ message: string }>('/llm/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  logAsk: (dataType: string, recordId: number) =>
    request<{ message: string }>('/llm/ask/log', {
      method: 'POST',
      body: JSON.stringify({ dataType, recordId })
    })
};
