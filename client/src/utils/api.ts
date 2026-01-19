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

// Data API
export const dataApi = {
  list: () =>
    request<Array<{ id: number; key: string; value: string; created_at: string }>>('/data'),

  create: (key: string, value: string) =>
    request<{ message: string; id: number }>('/data', {
      method: 'POST',
      body: JSON.stringify({ key, value })
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
