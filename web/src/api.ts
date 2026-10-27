export type RouterInfo = {
  name: string;
  address: string;
  port: number;
  tls: boolean;
  identity: string;
  version: string;
  board: string;
  model: string;
  uptime: string;
  connected: boolean;
  checked_at: string;
};

export type RouterRecord = {
  id: string;
  name: string;
  address: string;
  port: number;
  tls: boolean;
  version: string;
  identity: string;
  last_seen_at: string;
  created_at: string;
};

export type HotspotProfile = {
  id: string;
  name: string;
  address_pool: string;
  session_timeout: string;
  idle_timeout: string;
  shared_users: string;
};

export type HotspotUser = {
  id: string;
  name: string;
  profile: string;
  server: string;
  disabled: boolean;
};

export type ServicePackage = {
  id: string;
  name: string;
  service_type: 'hotspot' | 'user_manager';
  profile_name: string;
  username_prefix: string;
  validity_label: string;
  price_minor: number;
  currency: string;
  enabled: boolean;
};

export type Distributor = { id: string; name: string; contact: string; notes: string; active: boolean; created_at: string };
export type ManagedVoucher = { id: string; batch_id: string; username: string; state: string; failure_reason: string; created_at: string; package: string; owner: string };
export type InventoryData = { total: number; balances: { owner_id: string; owner_name: string; count: number }[]; events: { id: string; type: string; voucher_id: string; username: string; from: string; to: string; note: string; created_at: string }[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `تعذر إكمال الطلب (${response.status})`);
  }
  return payload as T;
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),
  routers: () => request<RouterRecord[]>('/api/routers'),
  activeRouter: () => request<{ connected: boolean; router: RouterInfo }>('/api/routers/active'),
  connect: (body: { name: string; address: string; port: number; username: string; password: string; tls: boolean }) =>
    request<RouterInfo>('/api/routers/connect', { method: 'POST', body: JSON.stringify(body) }),
  disconnect: () => request<{ connected: boolean }>('/api/routers/disconnect', { method: 'POST', body: '{}' }),
  profiles: () => request<HotspotProfile[]>('/api/hotspot/profiles'),
  users: () => request<HotspotUser[]>('/api/hotspot/users'),
  packages: () => request<ServicePackage[]>('/api/packages'),
  createPackage: (body: Omit<ServicePackage, 'id' | 'enabled'>) => request<ServicePackage>('/api/packages', { method: 'POST', body: JSON.stringify(body) }),
  distributors: () => request<Distributor[]>('/api/distributors'),
  createDistributor: (body: { name: string; contact: string; notes: string }) => request<Distributor>('/api/distributors', { method: 'POST', body: JSON.stringify(body) }),
  inventory: () => request<InventoryData>('/api/inventory'),
  vouchers: (offset = 0, limit = 100) => request<{ items: ManagedVoucher[]; total: number; limit: number; offset: number }>(`/api/vouchers?offset=${offset}&limit=${limit}`),
  credentials: (id: string) => request<{ username: string; password: string }>(`/api/vouchers/${encodeURIComponent(id)}/credentials`),
  disableVoucher: (id: string) => request<{ state: string }>(`/api/vouchers/${encodeURIComponent(id)}/disable`, { method: 'POST', body: '{}' }),
  createBatch: (body: { package_id: string; count: number }) => request<{ id: string; state: string; requested_count: number; succeeded_count: number; failed_count: number; vouchers: { id: string; username: string; password: string; state: string; error?: string }[] }>('/api/vouchers/batches', { method: 'POST', body: JSON.stringify(body) }),
  inventoryMovement: (body: { action: 'allocate' | 'transfer' | 'return'; voucher_ids: string[]; distributor_id?: string; note?: string }) => request<{ action: string; count: number }>('/api/inventory/movements', { method: 'POST', body: JSON.stringify(body) }),
};
