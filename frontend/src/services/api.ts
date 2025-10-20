/**
 * API Client
 * Axios-based client for AtlasEngine backend API
 */

import axios from 'axios';
import type { Project, Build, Preview, MemoryStats, FileItem, QuotaSummary } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor (add auth token if available)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor (handle errors)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// PROJECT API
// ============================================================================

export const projectApi = {
  create: async (data: { name: string; description?: string; framework?: string; language?: string }) => {
    const response = await api.post<{ success: boolean; project: Project }>('/projects', data);
    return response.data;
  },

  list: async (params?: { limit?: number; offset?: number; status?: string }) => {
    const response = await api.get<{ success: boolean; projects: Project[] }>('/projects', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get<{ success: boolean; project: Project }>(`/projects/${id}`);
    return response.data;
  },

  update: async (id: string, data: Partial<Project>) => {
    const response = await api.patch<{ success: boolean }>(`/projects/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/projects/${id}`);
    return response.data;
  },

  build: async (id: string) => {
    const response = await api.post<{ success: boolean; buildId: string; logs?: string }>(`/projects/${id}/build`);
    return response.data;
  },

  deploy: async (id: string, buildId: string) => {
    const response = await api.post<{ success: boolean; preview: Preview }>(`/projects/${id}/deploy`, { buildId });
    return response.data;
  },

  listFiles: async (id: string, path = '') => {
    const response = await api.get<{ success: boolean; files: FileItem[] }>(`/projects/${id}/files`, {
      params: { path },
    });
    return response.data;
  },

  getFileContent: async (id: string, path: string) => {
    const response = await api.get<{ success: boolean; content: string }>(`/projects/${id}/files/content`, {
      params: { path },
    });
    return response.data;
  },

  updateFileContent: async (id: string, path: string, content: string) => {
    const response = await api.put<{ success: boolean }>(`/projects/${id}/files/content`, { path, content });
    return response.data;
  },
};

// ============================================================================
// MEMORY API
// ============================================================================

export const memoryApi = {
  get: async (projectId: string) => {
    const response = await api.get<{ success: boolean; content: string; stats: MemoryStats }>(
      `/projects/${projectId}/memory`
    );
    return response.data;
  },

  update: async (projectId: string, updates: Record<string, string>) => {
    const response = await api.post<{ success: boolean }>(`/projects/${projectId}/memory`, { updates });
    return response.data;
  },

  createCheckpoint: async (projectId: string, name: string, notes?: string) => {
    const response = await api.post<{ success: boolean; checkpoint: any }>(`/projects/${projectId}/memory/checkpoint`, {
      name,
      notes,
    });
    return response.data;
  },

  getStats: async (projectId: string) => {
    const response = await api.get<{ success: boolean; stats: MemoryStats }>(`/projects/${projectId}/memory/stats`);
    return response.data;
  },

  compact: async (projectId: string, keepLastN = 5) => {
    const response = await api.post<{ success: boolean; removedCount: number }>(
      `/projects/${projectId}/memory/compact`,
      { keepLastN }
    );
    return response.data;
  },

  getHealth: async (projectId: string) => {
    const response = await api.get<{ success: boolean; health: any }>(`/projects/${projectId}/memory/health`);
    return response.data;
  },
};

// ============================================================================
// BUILD API
// ============================================================================

export const buildApi = {
  get: async (id: string) => {
    const response = await api.get<{ success: boolean; build: Build }>(`/builds/${id}`);
    return response.data;
  },

  list: async (projectId: string, limit = 10) => {
    const response = await api.get<{ success: boolean; builds: Build[] }>(`/builds/project/${projectId}`, {
      params: { limit },
    });
    return response.data;
  },

  getLogs: async (id: string) => {
    const response = await api.get<{ success: boolean; logs: string }>(`/builds/${id}/logs`);
    return response.data;
  },
};

// ============================================================================
// PREVIEW API
// ============================================================================

export const previewApi = {
  get: async (id: string) => {
    const response = await api.get<{ success: boolean; preview: Preview }>(`/previews/${id}`);
    return response.data;
  },

  getActive: async (projectId: string) => {
    const response = await api.get<{ success: boolean; preview: Preview | null }>(`/previews/project/${projectId}`);
    return response.data;
  },

  stop: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/previews/${id}`);
    return response.data;
  },

  getLogs: async (id: string, tail = 100) => {
    const response = await api.get<{ success: boolean; logs: string }>(`/previews/${id}/logs`, { params: { tail } });
    return response.data;
  },

  getStats: async (id: string) => {
    const response = await api.get<{ success: boolean; stats: any }>(`/previews/${id}/stats`);
    return response.data;
  },

  healthCheck: async (id: string) => {
    const response = await api.post<{ success: boolean; healthCheck: any }>(`/previews/${id}/health`);
    return response.data;
  },
};

// ============================================================================
// QUOTA API
// ============================================================================

export const quotaApi = {
  getSummary: async () => {
    const response = await api.get<QuotaSummary>('/quotas/summary');
    return response.data;
  },
};

// ============================================================================
// HEALTH API
// ============================================================================

export const healthApi = {
  check: async () => {
    const response = await api.get('/health');
    return response.data;
  },
};

export default api;
