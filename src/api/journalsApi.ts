import { authClient } from "./client";

export interface Journal {
  id: number;
  title: string;
  content: string;
  trade_date: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export async function fetchJournals(params?: {
  tag?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<Journal[]> {
  const { data } = await authClient.get("/journals", { params });
  return Array.isArray(data) ? data : [];
}

export async function fetchJournal(id: number): Promise<Journal> {
  const { data } = await authClient.get(`/journals/${id}`);
  return data;
}

export async function createJournal(journal: {
  title?: string;
  content: string;
  tradeDate?: string;
  tags?: string[];
}): Promise<{ id: number }> {
  const { data } = await authClient.post("/journals", journal);
  return data;
}

export async function updateJournal(
  id: number,
  journal: {
    title?: string;
    content: string;
    tradeDate?: string;
    tags?: string[];
  },
): Promise<void> {
  await authClient.put(`/journals/${id}`, journal);
}

export async function deleteJournal(id: number): Promise<void> {
  await authClient.delete(`/journals/${id}`);
}
