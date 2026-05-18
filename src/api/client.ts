import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

const TOKEN_KEY = "stock-viewer-token";
const API_BASE = import.meta.env.VITE_STOCK_API_BASE || "/api";
const AUTH_API_BASE = import.meta.env.VITE_AUTH_API_BASE || "http://localhost:3600/api";

function createClient(baseURL: string) {
  return axios.create({ baseURL, timeout: 15000 });
}

export const authClient = createClient(API_BASE);
export const identityClient = createClient(AUTH_API_BASE);

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function attachAuthHeaders(config: InternalAxiosRequestConfig) {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

authClient.interceptors.request.use(attachAuthHeaders);
identityClient.interceptors.request.use(attachAuthHeaders);

function handleAuthExpired(err: AxiosError) {
  if (err.response?.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
  return Promise.reject(err);
}

authClient.interceptors.response.use((res) => res, handleAuthExpired);
identityClient.interceptors.response.use((res) => res, handleAuthExpired);
