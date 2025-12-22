# Tool Search Tool

Claude API の高度なツール管理機能。大量のツール定義によるコンテキスト圧迫と選択精度低下を解決する。

## 解決する問題

| 問題 | 詳細 |
|------|------|
| **コンテキスト圧迫** | 50 ツール ≈ 10-20K トークン消費 |
| **選択精度低下** | 30-50 ツール超で顕著に悪化 |

## 仕組み

### 遅延ロード（defer_loading）

ツール定義を事前に全て読み込むのではなく、必要時に検索して展開する。

```json
{
  "name": "get_weather",
  "description": "Get weather for a location",
  "defer_loading": true
}
```

### 検索タイプ

| タイプ | 特徴 | 用途 |
|--------|------|------|
| **Regex** | 正規表現パターンで検索 | ツール名が明確な場合 |
| **BM25** | 自然言語クエリで検索 | 説明文ベースの検索 |

## ベストプラクティス

1. **頻出 3-5 ツールは非遅延**にする
2. ツール名と説明を明確・記述的に作成
3. ユーザーの表現方法に合わせたキーワードを説明に含める
4. システムプロンプトでツール分類を事前説明

## 活用シナリオと判断基準

| シナリオ | 判断 | 理由 |
|----------|------|------|
| ツール数 10 未満 | ❌ 不要 | オーバーヘッドが効果を上回る |
| ツール数 10-30 | △ 検討 | 状況次第 |
| ツール数 30-50 超 | ✅ 推奨 | 効果が顕著 |
| ツール定義 10K トークン超 | ✅ 推奨 | コンテキスト節約効果大 |

## Claude Code CLI での利用

| 観点 | 状況 |
|------|------|
| 直接設定 | ❌ 不可（API レベルの機能） |
| 内部での自動適用 | 不明（公式に記載なし） |
| 代替手段 | Permission 制御、MCP サーバー toggle |

→ 詳細は `mcp_optimization.md` を参照

## 自作エージェント開発での活用

Claude API を直接使う場合は設定可能：

```python
# ベータヘッダーが必要
headers = {
    "anthropic-beta": "advanced-tool-use-2025-11-20"
}

# ツール定義に defer_loading: true を追加
tools = [
    {
        "name": "rarely_used_tool",
        "description": "...",
        "defer_loading": True,
        "input_schema": {...}
    }
]
```

## 関連機能: Programmatic Tool Calling

複数ツールを Python スクリプトでオーケストレーションし、最終結果のみコンテキストに追加する機能。

**適用シナリオ**:

- 大規模データセット処理
- 3 つ以上の独立したツールを使うワークフロー
- データ変換・フィルタリングが必要なタスク

## 参考リンク

- [Anthropic 公式ドキュメント](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- [Zenn 解説記事](https://zenn.dev/headwaters/articles/4a04a696fa7218)
- [azukiazusa.dev 解説](https://azukiazusa.dev/blog/trying-claude-tool-finder/)
