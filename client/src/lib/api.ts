import type { CreateRoomResponse, RoomPreview } from '../../../shared/protocol';
import { API_BASE } from './socket';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? 'Something went wrong.', res.status);
  return body as T;
}

export const api = {
  createRoom: (name: string) =>
    request<CreateRoomResponse>('/api/rooms', { method: 'POST', body: JSON.stringify({ name }) }),
  getRoom: (code: string, signal?: AbortSignal) => request<RoomPreview>(`/api/rooms/${code}`, { signal }),
  videoMeta: (id: string, signal?: AbortSignal) =>
    request<{ title: string | null; channel: string | null }>(`/api/video/${id}`, { signal }),
};
