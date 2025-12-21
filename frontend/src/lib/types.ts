// Database types (matching backend)
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
  aliases: string[];
}

export interface Tag {
  id: number;
  household_id: number;
  name: string;
  color: string | null;
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

export interface TransactionTag {
  id: number;
  moneyforward_id: string;
  tag_id: number;
}

export interface BurdenRatio {
  id: number;
  household_id: number;
  effective_month: string;
  details: BurdenRatioDetail[];
}

export interface BurdenRatioDetail {
  id: number;
  burden_ratio_id: number;
  user_id: number;
  ratio_percent: number;
}

export interface MonthlyMemo {
  id: number;
  household_id: number;
  target_month: string;
  memo_content: string;
}

// Enriched transaction with category and share info
export interface EnrichedTransaction extends Transaction {
  categoryMajorName: string;
  categoryMinorName: string;
  costType: string;
  hasOverrides: boolean;
  userShares: { userId: number; alias: string; amount: number; percent: number }[];
}

// Summary types
export interface MonthlySummary {
  totalSpending: number;
  userShares: Record<number, number>;
  transactionCount: number;
}

export interface CategorySummary {
  majorName: string;
  minorName: string;
  costType: string;
  amount: number;
}

// AI types
export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface AIAnalysisResponse {
  response: string;
  history: ChatMessage[];
}
