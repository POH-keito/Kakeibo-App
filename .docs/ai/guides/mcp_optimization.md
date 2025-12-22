# MCP 管理とコンテキスト最適化

Model Context Protocol (MCP) を使った環境でのツール管理とコンテキスト最適化のベストプラクティス。

## MCP とは

AI モデルが外部ツールやデータソースと連携するための標準プロトコル。特定の AI ツール（Claude Code, Cursor 等）に依存しない。

## コンテキスト最適化の考え方

### ツール定義のコスト

| ツール数 | 概算トークン消費 |
|----------|------------------|
| 10 ツール | 2-4K トークン |
| 30 ツール | 6-12K トークン |
| 50 ツール | 10-20K トークン |
| 100 ツール | 20-40K トークン |

→ ツール数が増えるほど、実際の作業に使えるコンテキストが減る

### 最適化の原則

1. **必要なツールだけを有効化**する
2. **プロジェクト別**に異なるツールセットを使う
3. **頻度**に応じてツールを整理する

## ツール数の把握

```bash
# Docker MCP Toolkit の場合
docker mcp tools ls

# 出力例: 57 tools
```

## Claude Code での実践

### 1. MCP サーバーの toggle

v2.0.10 以降で利用可能：

```
# チャット内で @mention して toggle
@MCP_DOCKER

# または /mcp コマンドで確認・操作
/mcp
```

### 2. Permission 制御

`~/.claude/settings.json` でツール単位の許可/拒否を設定：

```json
{
  "permissions": {
    "allow": [
      "mcp__MCP_DOCKER__issue_read",
      "mcp__MCP_DOCKER__create_pull_request",
      "mcp__MCP_DOCKER__search_*"
    ],
    "deny": [
      "mcp__MCP_DOCKER__confluence_*"
    ]
  }
}
```

**ポイント**:

- `*` ワイルドカード対応
- プロジェクト別に `.claude/settings.json` で上書き可能

### 3. Skills の allowed-tools

特定スキル使用時にツールを制限：

```yaml
---
name: "Security Review"
description: "セキュリティレビュー用"
allowed-tools:
  - Read
  - Grep
  - mcp__MCP_DOCKER__issue_read
---
```

### 4. コンテキスト圧縮

会話が長くなったら `/compact` で圧縮：

```
/compact
```

## プロジェクト別の構成例

### 個人開発プロジェクト

```json
// .claude/settings.json
{
  "permissions": {
    "allow": [
      "mcp__MCP_DOCKER__*"
    ]
  }
}
```

### 業務プロジェクト（Confluence 不要）

```json
{
  "permissions": {
    "allow": [
      "mcp__MCP_DOCKER__issue_*",
      "mcp__MCP_DOCKER__pull_request_*",
      "mcp__MCP_DOCKER__search_*"
    ],
    "deny": [
      "mcp__MCP_DOCKER__confluence_*"
    ]
  }
}
```

## 運用チェックリスト

- [ ] 現在のツール数を把握しているか
- [ ] 本当に必要なツールだけを有効化しているか
- [ ] プロジェクト別に適切な設定をしているか
- [ ] 定期的に `/compact` を使っているか

## 関連ドキュメント

- `tool_search.md` - Tool Search Tool の詳細
- Claude Code 公式: [MCP サーバー管理](https://code.claude.com/docs/en/mcp)
- Claude Code 公式: [Settings](https://code.claude.com/docs/en/settings)
