/**
 * NoCodeBackend API Client
 * REST API wrapper for NCB database operations
 */

const NCB_API_URL = process.env.NCB_API_URL || 'https://app.nocodebackend.com';
const NCB_API_KEY = process.env.NCB_API_KEY || '';

interface NCBQueryOptions {
  where?: Record<string, unknown>;
  order_by?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  limit?: number;
  offset?: number;
}

interface NCBResponse<T> {
  data: T[];
  count?: number;
}

class NCBClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    table: string,
    options?: NCBQueryOptions & { body?: unknown }
  ): Promise<T> {
    const url = new URL(`/api/tables/${table}/rows`, this.baseUrl);

    // Add query parameters
    if (options?.where) {
      url.searchParams.set('where', JSON.stringify(options.where));
    }
    if (options?.order_by) {
      url.searchParams.set('order_by', JSON.stringify(options.order_by));
    }
    if (options?.limit) {
      url.searchParams.set('limit', String(options.limit));
    }
    if (options?.offset) {
      url.searchParams.set('offset', String(options.offset));
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`NCB API Error: ${res.status} ${error}`);
    }

    return res.json() as Promise<T>;
  }

  async list<T>(table: string, options?: NCBQueryOptions): Promise<T[]> {
    const response = await this.request<NCBResponse<T>>('GET', table, options);
    return response.data || [];
  }

  async create<T>(table: string, data: Partial<T> | Partial<T>[]): Promise<T[]> {
    const items = Array.isArray(data) ? data : [data];
    const response = await this.request<NCBResponse<T>>('POST', table, { body: items });
    return response.data || [];
  }

  async update<T>(
    table: string,
    where: Record<string, unknown>,
    data: Partial<T>
  ): Promise<T[]> {
    const url = new URL(`/api/tables/${table}/rows`, this.baseUrl);
    url.searchParams.set('where', JSON.stringify(where));

    const res = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`NCB API Error: ${res.status} ${error}`);
    }

    const response = await res.json() as NCBResponse<T>;
    return response.data || [];
  }

  async delete(table: string, where: Record<string, unknown>): Promise<void> {
    const url = new URL(`/api/tables/${table}/rows`, this.baseUrl);
    url.searchParams.set('where', JSON.stringify(where));

    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`NCB API Error: ${res.status} ${error}`);
    }
  }

  async upsert<T>(
    table: string,
    data: Partial<T> | Partial<T>[],
    conflictColumns: string[]
  ): Promise<T[]> {
    const items = Array.isArray(data) ? data : [data];
    const url = new URL(`/api/tables/${table}/rows`, this.baseUrl);
    url.searchParams.set('on_conflict', conflictColumns.join(','));

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(items),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`NCB API Error: ${res.status} ${error}`);
    }

    const response = await res.json() as NCBResponse<T>;
    return response.data || [];
  }
}

// Singleton instance
export const ncb = new NCBClient(NCB_API_URL, NCB_API_KEY);

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
  transaction_id: number;
  user_id: number;
  amount: number;
}

export interface TransactionShareOverride {
  id: number;
  transaction_id: number;
  user_id: number;
  amount: number;
}

export interface BurdenRatio {
  id: number;
  household_id: number;
  target_month: string;
}

export interface BurdenRatioDetail {
  id: number;
  burden_ratio_id: number;
  user_id: number;
  percentage: number;
}

export interface Tag {
  id: number;
  household_id: number;
  name: string;
  color: string | null;
}

export interface TransactionTag {
  id: number;
  transaction_id: number;
  tag_id: number;
}

export interface MonthlyMemo {
  id: number;
  household_id: number;
  target_month: string;
  memo_content: string;
}
