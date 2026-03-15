import axios from "axios";

const TOKEN_KEY = "stock-viewer-token";

export const authClient = axios.create({ baseURL: "/api", timeout: 15000 });

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

authClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

authClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    return Promise.reject(err);
  },
);
