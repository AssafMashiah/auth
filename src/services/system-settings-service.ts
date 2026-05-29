import { D1Database } from '@cloudflare/workers-types';
import { SystemSettings } from '../types';

export class SystemSettingsService {
  constructor(private db: D1Database) {}

  async getSettings(): Promise<SystemSettings> {
    const results = await this.db.prepare('SELECT * FROM system_settings').all();
    
    const settings: any = {
      theme: 'system',
      keep_logs: true,
    };

    if (results.results) {
      for (const row of results.results) {
        try {
          // Parse boolean/numbers if needed, though they are stored as JSON strings
          settings[row.key as string] = JSON.parse(row.value as string);
        } catch (e) {
          console.error(`Failed to parse setting ${row.key}:`, e);
          settings[row.key as string] = row.value;
        }
      }
    }

    return settings as SystemSettings;
  }

  async updateSetting(key: string, value: any): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await this.db
      .prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP')
      .bind(key, jsonValue, jsonValue)
      .run();
  }
}
