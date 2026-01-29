import axios from 'axios'
import type { KlineBar, KlinePeriod } from '@/types/kline'

const api = axios.create({ baseURL: '/api', timeout: 20000 })

export async function fetchKline(params: {
  code: string
  period?: KlinePeriod
  count?: number
}): Promise<KlineBar[]> {
  const { data } = await api.get<KlineBar[]>('/kline', { params })
  return Array.isArray(data) ? data : []
}
