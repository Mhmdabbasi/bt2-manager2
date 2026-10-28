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
  distributor_price_minor: number;
  currency: string;
  enabled: boolean;
};

export type Distributor = { id: string; name: string; contact: string; notes: string; active: boolean; all_packages_enabled: boolean; created_at: string };
export type DistributorPackagePolicy = { distributor_id: string; all_packages_enabled: boolean; packages: { package_id: string; name: string; service_type: 'hotspot'|'user_manager'; package_enabled: boolean; allowed: boolean; username_prefix_override: string }[] };
export type ManagedVoucher = { id: string; batch_id: string; username: string; state: string; failure_reason: string; created_at: string; package: string; owner: string };
export type InventoryData = { total: number; balances: { owner_id: string; owner_name: string; count: number }[]; events: { id: string; type: string; voucher_id: string; username: string; from: string; to: string; note: string; created_at: string }[] };
export type BatchArchiveRow = { id: string; name: string; outlet_name: string; state: string; requested_count: number; succeeded_count: number; failed_count: number; created_at: string; completed_at: string; printed_at: string; print_count: number; package: string; service_type: string; profile_name: string; active_count: number; disabled_count: number };
export type ArchivedBatch = BatchArchiveRow & { validity_label: string; template_version_id: string; generation_options: Record<string, unknown> };
export type ArchivedVoucher = { id: string; username: string; password: string; state: string; error?: string };
export type CardTemplateField = { id: string; kind: 'text'|'field'; field: 'username'|'password'|'package'|'validity'|'date'|'print_date'|'qrcode'|''; text: string; x: number; y: number; width: number; height: number; font_size: number; font_weight: string; align: 'right'|'center'|'left'; color: string };
export type CardTemplateDocument = { width_mm: number; height_mm: number; background: string; fields: CardTemplateField[] };
export type CardTemplate = { id: string; version_id: string; name: string; version: number; created_at: string; service_type: 'hotspot'|'user_manager'; package_id: string; distributor_id: string; scope: 'global'|'package'|'distributor'; archived: boolean; document?: CardTemplateDocument };
export type UserManagerSnapshot = {
  router?: RouterInfo;
  major_version?: number;
  synced_at?: string;
  profiles: { source_id: string; name: string; properties: Record<string, string>; present?: boolean; last_seen_at?: string }[];
  limitations: { source_id: string; name: string; properties: Record<string, string>; present?: boolean; last_seen_at?: string }[];
  profile_limitations: { profile_source_id: string; profile_name?: string; limitation_source_id: string; limitation_name?: string; position: number; properties: Record<string, string>; present?: boolean; last_seen_at?: string }[];
};

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
  exportBackup: async (password: string): Promise<Blob> => {
    const response = await fetch('/api/backup/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || `تعذر تصدير النسخة (${response.status})`);
    }
    return response.blob();
  },
  health: () => request<{ status: string }>('/api/health'),
  routers: () => request<RouterRecord[]>('/api/routers'),
  activeRouter: () => request<{ connected: boolean; router: RouterInfo }>('/api/routers/active'),
  connect: (body: { name: string; address: string; port: number; username: string; password: string; tls: boolean }) =>
    request<RouterInfo>('/api/routers/connect', { method: 'POST', body: JSON.stringify(body) }),
  disconnect: () => request<{ connected: boolean }>('/api/routers/disconnect', { method: 'POST', body: '{}' }),
  profiles: () => request<HotspotProfile[]>('/api/hotspot/profiles'),
  hotspotServers: () => request<string[]>('/api/hotspot/servers'),
  users: () => request<HotspotUser[]>('/api/hotspot/users'),
  packages: () => request<ServicePackage[]>('/api/packages'),
  createPackage: (body: Omit<ServicePackage, 'id' | 'enabled'>) => request<ServicePackage>('/api/packages', { method: 'POST', body: JSON.stringify(body) }),
  updatePackage: (id: string, body: Omit<ServicePackage, 'id' | 'enabled'>) => request<ServicePackage>(`/api/packages/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  disablePackage: (id: string) => request<void>(`/api/packages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  distributors: () => request<Distributor[]>('/api/distributors'),
  createDistributor: (body: { name: string; contact: string; notes: string }) => request<Distributor>('/api/distributors', { method: 'POST', body: JSON.stringify(body) }),
  updateDistributor: (id: string, body: Pick<Distributor, 'name'|'contact'|'notes'|'active'>) => request<Distributor>(`/api/distributors/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  distributorPackagePolicy: (id: string) => request<DistributorPackagePolicy>(`/api/distributors/${encodeURIComponent(id)}/packages`),
  saveDistributorPackagePolicy: (id: string, body: Pick<DistributorPackagePolicy, 'all_packages_enabled'|'packages'>) => request<DistributorPackagePolicy>(`/api/distributors/${encodeURIComponent(id)}/packages`, { method: 'PUT', body: JSON.stringify(body) }),
  inventory: () => request<InventoryData>('/api/inventory'),
  userManager: () => request<UserManagerSnapshot>('/api/usermanager'),
  templates: () => request<CardTemplate[]>('/api/templates'),
  template: (id: string) => request<CardTemplate>(`/api/templates/${encodeURIComponent(id)}`),
  templateVersion: (id: string) => request<CardTemplate>(`/api/template-versions/${encodeURIComponent(id)}`),
  saveTemplate: (body: { id?: string; name: string; service_type: 'hotspot'|'user_manager'; package_id?: string; distributor_id?: string; scope: 'global'|'package'|'distributor'; document: CardTemplateDocument }) => request<CardTemplate>('/api/templates', { method: 'POST', body: JSON.stringify(body) }),
  archiveTemplate: (id: string) => request<void>(`/api/templates/${encodeURIComponent(id)}/archive`, { method: 'POST', body: '{}' }),
  syncUserManager: () => request<UserManagerSnapshot>('/api/usermanager/sync', { method: 'POST', body: '{}' }),
  vouchers: (offset = 0, limit = 100, query = '') => request<{ items: ManagedVoucher[]; total: number; limit: number; offset: number }>(`/api/vouchers?offset=${offset}&limit=${limit}&q=${encodeURIComponent(query)}`),
  batches: (offset = 0, limit = 50, query = '') => request<{ items: BatchArchiveRow[]; total: number; limit: number; offset: number }>(`/api/batches?offset=${offset}&limit=${limit}&q=${encodeURIComponent(query)}`),
  batch: (id: string) => request<{ batch: ArchivedBatch; vouchers: ArchivedVoucher[] }>(`/api/batches/${encodeURIComponent(id)}`),
  markBatchPrinted: (id: string) => request<{ printed_at: string }>(`/api/batches/${encodeURIComponent(id)}/printed`, { method: 'POST', body: '{}' }),
  disableBatch: (id: string) => request<{ requested_count: number; succeeded_count: number; failed_count: number; results: { username: string; state: string; error?: string }[] }>(`/api/batches/${encodeURIComponent(id)}/disable`, { method: 'POST', body: '{}' }),
  enableBatch: (id: string) => request<{ requested_count: number; succeeded_count: number; failed_count: number; results: { username: string; state: string; error?: string }[] }>(`/api/batches/${encodeURIComponent(id)}/enable`, { method: 'POST', body: '{}' }),
  credentials: (id: string) => request<{ username: string; password: string }>(`/api/vouchers/${encodeURIComponent(id)}/credentials`),
  disableVoucher: (id: string) => request<{ state: string }>(`/api/vouchers/${encodeURIComponent(id)}/disable`, { method: 'POST', body: '{}' }),
  createBatch: (body: { package_id: string; count: number; template_version_id?: string; distributor_id?: string; outlet_name?: string; username_prefix?: string; token_mode?: 'alphanumeric'|'letters'|'numbers'; username_length?: number; hotspot_server?: string; password_policy?: 'none'|'same_as_username'|'random' }) => request<{ id: string; name: string; outlet_name: string; state: string; requested_count: number; succeeded_count: number; failed_count: number; vouchers: { id: string; username: string; password: string; state: string; error?: string }[] }>('/api/vouchers/batches', { method: 'POST', body: JSON.stringify(body) }),
  inventoryMovement: (body: { action: 'allocate' | 'transfer' | 'return'; voucher_ids: string[]; distributor_id?: string; note?: string }) => request<{ action: string; count: number }>('/api/inventory/movements', { method: 'POST', body: JSON.stringify(body) }),
};
