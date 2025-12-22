# Vibe Coding ガイド

AI と協働して Web アプリを作る開発スタイルのガイド。

## ドキュメント構成

| ファイル | 内容 | いつ読む？ |
|----------|------|-----------|
| [architect.md](architect.md) | 技術スタック、設計、環境構築 | 最初に |
| [code.md](code.md) | DB、型安全性、テスト、UI | 実装中に |
| [deploy.md](deploy.md) | デプロイ、セキュリティ、トラブル対応 | 本番化時に |

## クイックスタート

1. `architect.md` を読んで全体像を把握
2. 環境構築手順に従ってセットアップ
3. 実装中は `code.md` を参照
4. デプロイ時は `deploy.md` を参照

## 各ファイルの内容

### architect.md (設計編)

- 技術スタック選定（Node.js, Hono, React, TanStack）
- アーキテクチャ設計（Hono Proxy パターン）
- 開発フロー（Vibe Coding の進め方）
- ディレクトリ構成
- 環境構築手順
- 学習リソース

### code.md (実装編)

- データベース戦略（NoCodeBackend）
- 型安全性の実現（Hono RPC, TanStack Router）
- 通信と状態管理（TanStack Query）
- Webhook と API の使い分け
- テスト戦略（Playwright Codegen）
- Tailwind CSS と shadcn/ui
- VS Code ワークスペース設定
- アンチパターンとベストプラクティス

### deploy.md (運用編)

- Docker とデプロイ（Cloud Run）
- セキュリティとパフォーマンス
- トラブルシューティング
- ローカルアプリとデスクトップ化（Electron/Tauri）
