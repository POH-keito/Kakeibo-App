/**
 * NoCodeBackend API Client
 * REST API wrapper for NCB database operations
 */

// Environment variables are accessed lazily to ensure dotenv has loaded
const getConfig = () => ({
  baseUrl: process.env.NCB_BASE_URL || 'https://ncb.fukushi.ma',
  instance: process.env.NCB_INSTANCE || '',
  apiKey: process.env.NCB_API_KEY || '',
});

interface NCBQueryOptions {
  where?: Record<string, unknown>;
  order_by?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  limit?: number;
  offset?: number;
}

interface NCBResponse<T> {
  data: T;
  status?: string;
  message?: string;
}

// Convert Hasura-style where clause to NCB query params
const convertWhereToParams = (where: Record<string, unknown>, params: URLSearchParams): void => {
  const processCondition = (field: string, condition: unknown) => {
    if (typeof condition !== 'object' || condition === null) {
      params.append(`${field}[eq]`, String(condition));
      return;
    }

    for (const [op, value] of Object.entries(condition as Record<string, unknown>)) {
      switch (op) {
        case '_eq':
          params.append(`${field}[eq]`, String(value));
          break;
        case '_neq':
          params.append(`${field}[neq]`, String(value));
          break;
        case '_gt':
          params.append(`${field}[gt]`, String(value));
          break;
        case '_gte':
          params.append(`${field}[gte]`, String(value));
          break;
        case '_lt':
          params.append(`${field}[lt]`, String(value));
          break;
        case '_lte':
          params.append(`${field}[lte]`, String(value));
          break;
        case '_in':
          if (Array.isArray(value)) {
            params.append(`${field}[in]`, value.join(','));
          }
          break;
        case '_like':
          params.append(`${field}[like]`, String(value));
          break;
      }
    }
  };

  for (const [key, value] of Object.entries(where)) {
    if (key === '_and' && Array.isArray(value)) {
      for (const condition of value) {
        convertWhereToParams(condition as Record<string, unknown>, params);
      }
    } else if (key === '_or') {
      // NCB doesn't support OR directly, skip for now
      console.warn('NCB API does not support _or conditions');
    } else {
      processCondition(key, value);
    }
  }
};

class NCBClient {
  private get baseUrl() {
    return getConfig().baseUrl;
  }

  private get instance() {
    return getConfig().instance;
  }

  private get apiKey() {
    return getConfig().apiKey;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    options?: { body?: unknown }
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log('[NCB API Request]', method, url);

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let result: NCBResponse<T>;
    try {
      result = JSON.parse(text) as NCBResponse<T>;
    } catch {
      console.error('[NCB API Error] Failed to parse response:', text.substring(0, 200));
      throw new Error(`NCB API Error: ${res.status} - Invalid JSON response`);
    }

    if (!res.ok || result.status === 'error') {
      console.error('[NCB API Error]', url, result.message || result);
      const errorMessage = result.message || `NCB API Error: ${res.status}`;
      throw new Error(errorMessage);
    }

    return result.data;
  }

  async list<T>(table: string, options?: NCBQueryOptions): Promise<T[]> {
    const params = new URLSearchParams();
    params.append('Instance', this.instance);

    if (options?.limit) {
      params.append('limit', String(options.limit));
    }

    if (options?.offset) {
      const page = Math.floor(options.offset / (options.limit || 100)) + 1;
      params.append('page', String(page));
    }

    if (options?.order_by) {
      const sortFields: string[] = [];
      const orderDirs: string[] = [];
      const orderBy = Array.isArray(options.order_by) ? options.order_by : [options.order_by];
      for (const item of orderBy) {
        for (const [field, direction] of Object.entries(item)) {
          sortFields.push(field);
          orderDirs.push(direction);
        }
      }
      if (sortFields.length > 0) {
        params.append('sort', sortFields.join(','));
        params.append('order', orderDirs.join(','));
      }
    }

    if (options?.where) {
      convertWhereToParams(options.where, params);
    }

    const data = await this.request<T[]>('GET', `/read/${table}?${params.toString()}`);
    return data || [];
  }

  async create<T>(table: string, data: Partial<T> | Partial<T>[]): Promise<T[]> {
    const items = Array.isArray(data) ? data : [data];
    const results: T[] = [];

    for (const item of items) {
      const result = await this.request<T>(
        'POST',
        `/create/${table}?Instance=${this.instance}`,
        { body: item }
      );
      results.push(result);
    }

    return results;
  }

  async update<T>(
    table: string,
    where: Record<string, unknown>,
    data: Partial<T>
  ): Promise<T[]> {
    // NCB requires ID for update - extract from where clause
    let id: number | null = null;

    const whereId = where.id as Record<string, unknown> | number | undefined;
    if (typeof whereId === 'object' && whereId?._eq) {
      id = whereId._eq as number;
    } else if (typeof whereId === 'number') {
      id = whereId;
    }

    if (id === null) {
      // Fetch records first to get IDs
      const records = await this.list<{ id: number }>(table, { where, limit: 1000 });
      const results: T[] = [];

      for (const record of records) {
        const result = await this.request<T>(
          'PATCH',
          `/update/${table}/${record.id}?Instance=${this.instance}`,
          { body: data }
        );
        results.push(result);
      }

      return results;
    }

    const result = await this.request<T>(
      'PATCH',
      `/update/${table}/${id}?Instance=${this.instance}`,
      { body: data }
    );

    return [result];
  }

  async delete(table: string, where: Record<string, unknown>): Promise<number> {
    // NCB requires ID for delete - extract from where clause
    let ids: number[] = [];

    const whereId = where.id as Record<string, unknown> | undefined;
    if (whereId?._eq) {
      ids = [whereId._eq as number];
    } else if (whereId?._in) {
      ids = whereId._in as number[];
    } else {
      // Fetch records first to get IDs
      const records = await this.list<{ id: number }>(table, { where, limit: 5000 });
      ids = records.map(r => r.id);
    }

    for (const id of ids) {
      await this.request<unknown>('DELETE', `/delete/${table}/${id}?Instance=${this.instance}`);
    }

    return ids.length;
  }

  async upsert<T>(
    table: string,
    data: Partial<T> | Partial<T>[],
    conflictColumns: string[]
  ): Promise<T[]> {
    const items = Array.isArray(data) ? data : [data];
    const results: T[] = [];

    for (const item of items) {
      // Build where clause from conflict columns
      const where: Record<string, unknown> = {};
      for (const col of conflictColumns) {
        const value = (item as Record<string, unknown>)[col];
        if (value !== undefined) {
          where[col] = { _eq: value };
        }
      }

      // Check if record exists
      const existing = await this.list<{ id: number }>(table, { where, limit: 1 });

      if (existing.length > 0) {
        // Update existing record
        const result = await this.request<T>(
          'PATCH',
          `/update/${table}/${existing[0].id}?Instance=${this.instance}`,
          { body: item }
        );
        results.push(result);
      } else {
        // Create new record
        const result = await this.request<T>(
          'POST',
          `/create/${table}?Instance=${this.instance}`,
          { body: item }
        );
        results.push(result);
      }
    }

    return results;
  }
}

// Singleton instance
export const ncb = new NCBClient();

// Type definitions for database tables
export interface Transaction {
  id: number;
  household_id: number;
  transaction_date: string;
  content: string;
  amount: number;
  category_id: number | null;
  moneyforward_id: string;
  processing_status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  household_id: number;
  major_name: string;
  minor_name: string;
  cost_type: string;
}

export interface User {
  id: number;
  household_id: number;
  name: string;
}

export interface UserAlias {
  id: number;
  user_id: number;
  alias: string;
}

export interface TransactionShare {
  id: number;
  moneyforward_id: string;
  user_id: number;
  share_amount: number;
}

export interface TransactionShareOverride {
  id: number;
  moneyforward_id: string;
  user_id: number;
  override_type: 'PERCENT' | 'FIXED_AMOUNT';
  value: number;
}

export interface BurdenRatio {
  id: number;
  household_id: number;
  effective_month: string;
}

export interface BurdenRatioDetail {
  id: number;
  burden_ratio_id: number;
  user_id: number;
  ratio_percent: number;
}

export interface Tag {
  id: number;
  household_id: number;
  name: string;
  color: string | null;
}

export interface TransactionTag {
  id: number;
  moneyforward_id: string;
  tag_id: number;
}

export interface MonthlyMemo {
  id: number;
  household_id: number;
  target_month: string;
  memo_content: string;
}
