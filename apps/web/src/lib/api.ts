'use client';

import { create } from 'zustand';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  phone?: string | null;
  timezone?: string;
  notificationPrefs?: Record<string, boolean>;
  tenant?: { id: string; name: string; slug: string; planCode?: string };
  team?: { id: string; name: string } | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  ready: boolean;
  setSession: (data: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  setUser: (user: AuthUser) => void;
  load: () => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  ready: false,
  setSession: ({ accessToken, refreshToken, user }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('axium_access', accessToken);
      localStorage.setItem('axium_refresh', refreshToken);
    }
    set({ accessToken, refreshToken, user, ready: true });
  },
  setUser: (user) => {
    if (typeof window !== 'undefined') localStorage.setItem('axium_user', JSON.stringify(user));
    set({ user });
  },
  load: () => {
    if (typeof window === 'undefined') return;
    const accessToken = localStorage.getItem('axium_access');
    const refreshToken = localStorage.getItem('axium_refresh');
    const rawUser = localStorage.getItem('axium_user');
    set({
      accessToken,
      refreshToken,
      user: rawUser ? JSON.parse(rawUser) : null,
      ready: true,
    });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('axium_access');
      localStorage.removeItem('axium_refresh');
      localStorage.removeItem('axium_user');
    }
    set({ accessToken: null, refreshToken: null, user: null, ready: true });
  },
}));

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuth.getState();
  if (!refreshToken) return null;
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh failed');
        const data = await res.json();
        useAuth.getState().setSession(data);
        return data.accessToken as string;
      })
      .catch(() => {
        useAuth.getState().logout();
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { raw?: boolean } = {},
): Promise<T> {
  const { accessToken } = useAuth.getState();
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erro inesperado' }));
    const message = Array.isArray(error.message) ? error.message.join(', ') : error.message;
    throw new Error(message ?? 'Erro inesperado');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T = any>(path: string) => apiFetch<T>(path),
  post: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export function fileUrl(id: string, download = false) {
  const { accessToken } = useAuth.getState();
  return `${API_URL}/api/files/${id}/content?token=${accessToken}${download ? '&download=true' : ''}`;
}

export { API_URL };
