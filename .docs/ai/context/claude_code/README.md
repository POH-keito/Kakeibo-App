# Claude Code 設定・運用テンプレート集

Claude Code (Max 5x / Opus 4.5) を効率的かつ低コストに運用するための設定ファイルテンプレート集です。
frontend-design skill による高品質 UI 生成、トークン節約のための設定が含まれています。

## ファイルの役割と配置場所

各ファイルを適切な場所に配置（またはリネームして配置）して使用してください。

| テンプレートファイル | 配置すべき場所 (Destination) | 役割 |
|-------------------|-----------------------------|------|
| **`CLAUDE_global.md`** | `~/.claude/CLAUDE.md` | **全プロジェクト共通の設定**。<br>Opus 4.5 の暴走抑制、UIデザイン原則（frontend-design skill + デジタル庁）、共通の振る舞いを定義します。 |
| **`CLAUDE_project.md`** | `./CLAUDE.md` (プロジェクトルート) | **プロジェクト固有の設定**。<br>`claude code` 起動時に `/init` で生成した後、この内容を参考に `docs/` の内容などを追記します。 |
| **`.claudeignore`** | `./.claudeignore` (プロジェクトルート) | **トークン節約の要**。<br>`node_modules` や巨大なログファイル、画像などを Claude に読ませないように設定します。 |
| **`skills/`** | `~/.claude/skills/` | **Claude Code Skills**。<br>Claude が自動認識・利用するスキル定義。詳細は `skills/frontend-design.md` を参照。 |

## 推奨セットアップフロー

1. **グローバル設定の適用 (初回のみ)**
   ```bash
   mkdir -p ~/.claude
   cp CLAUDE_global.md ~/.claude/CLAUDE.md
   ```

2. **プロジェクトごとの初期設定**
   プロジェクトのルートディレクトリで以下を実行します。

   ```bash
   # 1. 無視リストの配置（トークン節約）
   cp /path/to/templates/.claudeignore .

   # 2. Claude Code 起動 & プロジェクト設定生成
   claude
   > /init
   ```

3. **プロジェクト設定のカスタマイズ**
   `/init` で生成された `CLAUDE.md` に、`CLAUDE_project.md` の内容（アーキテクチャ図やコマンド一覧）を追記・調整します。

## チップス

- **Opus 4.5 vs Sonnet**: 普段は `Sonnet` (設定で変更可能) を使い、複雑なタスクのみ `Opus 4.5` を使うとコストパフォーマンスが良いです。
- **UI確認**: ブラウザ操作は `npx playwright codegen` で行い、Claude にはコードを渡すか、ログを確認させる運用が「AIネイティブ」な開発スタイルです。