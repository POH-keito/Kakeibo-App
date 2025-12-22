# frontend-design Skill

## 概要

Anthropic 公式の Claude Code skill。Claude が生成する UI の品質を向上させ、「AI っぽい」Generic なデザインを回避する。

## 導入方法

### Claude Code Skills として配置

```bash
mkdir -p ~/.claude/skills/frontend-design
# SKILL.md を配置
```

配置先: `~/.claude/skills/frontend-design/SKILL.md`

配置後、Claude Code が自動的に認識・利用する（明示的な有効化は不要）。

## 主な指針

### Design Thinking（コーディング前）

1. **Purpose**: 何を解決するか？誰が使うか？
2. **Tone**: 明確な美的方向性を選ぶ
   - brutally minimal, maximalist chaos, retro-futuristic, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, etc.
3. **Constraints**: 技術的制約（フレームワーク、パフォーマンス、アクセシビリティ）
4. **Differentiation**: 何が忘れられないポイントか？

### Frontend Aesthetics Guidelines

| 要素           | 推奨                                                     | 禁止                               |
| -------------- | -------------------------------------------------------- | ---------------------------------- |
| **Typography** | 独創的で印象的なフォント                                 | Arial, Inter, Roboto, system fonts |
| **Color**      | CSS 変数で一貫性、強いアクセント                         | 紫グラデーション on 白背景         |
| **Motion**     | 高インパクトな瞬間（ページロード、staggered reveals）    | 散発的なマイクロインタラクション   |
| **Layout**     | 非対称、オーバーラップ、斜めの流れ                       | 予測可能なパターン                 |
| **Background** | 雰囲気と深み（グラデーションメッシュ、ノイズ、パターン） | ベタ塗り                           |

### 重要な原則

> **CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

## 参考

- [公式リポジトリ](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design)
- [X での紹介](https://x.com/9m/status/1995132941824131300)

## 関連

- このリポジトリでは、判断に迷った場合は「デジタル庁デザインシステム」の思想（機能性・アクセシビリティ重視）を参照する運用としている
