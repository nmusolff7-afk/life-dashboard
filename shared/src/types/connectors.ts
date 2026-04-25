// Connector types (PRD §4.8.6 + BUILD_PLAN_v2 §2). Mirrors the backend
// users_connectors table + the canonical catalog in connectors.py.

export type ConnectorProvider =
  | 'healthkit'
  | 'health_connect'
  | 'gmail'
  | 'gcal'
  | 'outlook'
  | 'plaid'
  | 'strava'
  | 'garmin'
  | 'apple_family_controls'
  | 'location';

export type ConnectorStatus =
  | 'disconnected'
  | 'pending_oauth'
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'error';

export type ConnectorKind = 'oauth' | 'device_native' | 'webhook_only';
export type ConnectorCategory = 'fitness' | 'nutrition' | 'finance' | 'time' | 'attention';

export interface ConnectorEntry {
  provider: ConnectorProvider;
  display_name: string;
  description: string;
  category: ConnectorCategory;
  kind: ConnectorKind;
  icon: string;
  ships_in_phase: string;  // 'a0' | 'c1' | 'v1.1' | future markers
  note: string;
  platforms: string[];     // ['ios', 'android'] etc.

  // Per-user state (absent / default when the user has never interacted)
  status: ConnectorStatus;
  last_sync_at?: number | null;
  last_error?: string | null;
  external_user_id?: string | null;
  scopes?: string | null;
}

export interface ConnectorsListResponse {
  ok: boolean;
  connectors: ConnectorEntry[];
}

export interface ConnectorDetailResponse {
  ok: boolean;
  connector: ConnectorEntry;
}

// Consent map: keyed by source (e.g. 'gmail'), value is allowed flag.
export interface ConsentMap {
  [source: string]: boolean;
}

export interface ConsentResponse {
  ok: boolean;
  consent: ConsentMap;
}
