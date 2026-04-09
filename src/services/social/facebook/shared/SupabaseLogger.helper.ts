import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { config } from '../../../../core/config';
import { FacebookOperationLog } from '../types/facebook.types';

export interface SupabaseLoggerOptions {
  enabled: boolean;
  tableName: string;
}

export class SupabaseLogger {
  private readonly options: SupabaseLoggerOptions;
  private readonly client: SupabaseClient | null;

  constructor(options: Partial<SupabaseLoggerOptions>) {
    this.options = {
      enabled: Boolean(options.enabled),
      tableName: options.tableName || 'facebook_operation_logs',
    };
    this.client =
      this.options.enabled && config.supabaseUrl && config.supabaseKey
        ? createClient(config.supabaseUrl, config.supabaseKey)
        : null;
  }

  async log(entry: Omit<FacebookOperationLog, 'id' | 'created_at'>): Promise<void> {
    if (!this.client || !this.options.enabled) return;
    const payload: FacebookOperationLog = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...entry,
    };

    try {
      await this.client.from(this.options.tableName).insert(payload as never);
    } catch (error) {
      // Never break node execution on logging failure.
      console.warn('[Facebook][SupabaseLogger] Failed to write operation log:', error);
    }
  }
}
