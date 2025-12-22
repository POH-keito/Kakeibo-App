# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## プロジェクト概要

[プロジェクトの目的と主な機能を1-2段落で記載]

## 技術スタック

| 役割 | 技術 | 備考 |
|------|------|------|
| バックエンド | Hono + TypeScript | |
| フロントエンド | React + Vite | |
| スタイリング | Tailwind CSS + shadcn/ui | |
| デプロイ | Docker + Cloud Run | |

## コマンド

```bash
# 開発
npm run dev              # フルスタック起動
npm run dev:backend      # バックエンドのみ
npm run dev:frontend     # フロントエンドのみ

# テスト
npx playwright test      # E2Eテスト実行
npx playwright test --ui # UIモードで実行

# ビルド・デプロイ
npm run build
git push origin main     # 自動デプロイ
```

## アーキテクチャ

```
Frontend (React)
    ↓ RPC（型安全）
Backend (Hono)
    ↓ REST API
External Services
```

## 主要ファイル

- `backend/src/index.ts` - エントリーポイント
- `frontend/src/lib/client.ts` - API クライアント
- `frontend/src/pages/` - ページコンポーネント

## 環境変数

```bash
API_URL=your_api_url
API_KEY=your_api_key
```

## 開発ルール

### やるべきこと
- 作業計画と進捗は GitHub Issue に記録
- UI 変更後は Playwright で検証
- エラーが出たらメッセージ全体を確認

### 避けるべきこと
| NG | 正しい方法 |
|----|-----------|
| useEffect で直接 fetch | TanStack Query を使用 |
| ビジネスロジックをFEに書く | バックエンドに集約 |
| 環境変数のハードコード | .env で管理 |

## ドキュメント

詳細は `docs/` ディレクトリを参照。