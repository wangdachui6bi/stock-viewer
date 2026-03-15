import { authClient, setToken, clearToken, getToken } from "./client";

export interface User {
  id: number;
  username: string;
  nickname: string;
  role: string;
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; user: User }> {
  const { data } = await authClient.post("/auth/login", { username, password });
  setToken(data.token);
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await authClient.get("/auth/me");
  return data;
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await authClient.post("/auth/change-password", { oldPassword, newPassword });
}

export function logout() {
  clearToken();
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
