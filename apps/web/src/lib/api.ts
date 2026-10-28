export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

export async function request<T>(path: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new ApiError('连接超时，请稍后重试。', 0);
    throw new ApiError('暂时无法连接服务，请检查网络后重试。', 0);
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error : `请求未完成（${response.status}），请稍后重试。`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function downloadObservations(pondId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/export/observations.csv${pondId ? `?pondId=${encodeURIComponent(pondId)}` : ''}`, { credentials: 'include', signal: AbortSignal.timeout(30000) });
  } catch { throw new ApiError('数据导出失败，请检查网络后重试。', 0); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(data.error ?? '数据导出失败，请稍后重试。', response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `澜启渔新-水质观测-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
