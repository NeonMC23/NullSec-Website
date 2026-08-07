/** NullSec backend entity types (mirror of database-schema.md). */

export interface User {
  id: number;
  identity_id: string;
  status: 'active' | 'disabled';
  created_at: Date;
  updated_at: Date;
}

export interface RecoveryCredential {
  id: number;
  user_id: number;
  recovery_hash: string; // argon2 hash — never the raw key
  created_at: Date;
  last_used_at: Date | null;
}

export interface UserProfileRow {
  user_id: number;
  username: string;
  avatar_seed: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserSettingsRow {
  user_id: number;
  settings_json: Record<string, unknown>;
  updated_at: Date;
}

export interface UserProgressRow {
  user_id: number;
  progress_json: Record<string, unknown>;
  updated_at: Date;
}

export interface SessionRow {
  id: number;
  user_id: number;
  token_hash: string; // sha256 of the raw token — never the raw token
  created_at: Date;
  expires_at: Date;
  revoked: boolean;
}
