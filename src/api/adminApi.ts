import { identityClient } from "./client";

export interface AdminUser {
  id: number;
  username: string;
  nickname: string;
  role: string;
  created_at: string;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const { data } = await identityClient.get("/admin/users");
  return Array.isArray(data) ? data : [];
}

export async function createUser(params: {
  username: string;
  password: string;
  nickname?: string;
  role?: string;
}): Promise<{ id: number }> {
  const { data } = await identityClient.post("/admin/users", params);
  return data;
}

export async function updateUserRole(
  id: number,
  role: string,
): Promise<void> {
  await identityClient.put(`/admin/users/${id}/role`, { role });
}

export async function resetUserPassword(
  id: number,
  newPassword: string,
): Promise<void> {
  await identityClient.post(`/admin/users/${id}/reset-password`, { newPassword });
}

export async function deleteUser(id: number): Promise<void> {
  await identityClient.delete(`/admin/users/${id}`);
}
