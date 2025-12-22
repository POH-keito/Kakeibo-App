# BrowserAct API & ワークフロー仕様（LLM 参照用）

BrowserAct は、AI 駆動のノーコード Web オートメーション/スクレイピングサービス。自然言語で定義したワークフローをクラウドで実行し、API 経由で結果を取得できる。ここでは LLM が BrowserAct を扱う際に必要な最小限の仕様とベストプラクティスをまとめる。

---

## 1. 基本情報

| 項目               | 内容                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| **ベース URL**     | `https://api.browseract.com`                                                         |
| **認証**           | `Authorization: Bearer <BROWSERACT_API_KEY>` ヘッダー必須                            |
| **レスポンス形式** | JSON                                                                                 |
| **タスク実行方式** | 非同期。`run-task` で task_id を取得し、`get-task` で進捗/結果をポーリング           |
| **Webhook**        | `callback_url` を渡すとタスク完了時に結果を POST 通知                                |
| **主用途**         | サイト検索、フォーム入力、マルチページスクレイピング、テンプレート化されたデータ抽出 |

---

## 2. コアエンドポイント

### 2.1 `POST /v2/workflow/run-task`

- **目的**: ワークフローを起動し `task_id` を取得。
- **必須パラメータ**: `workflow_id`（文字列）
- **任意パラメータ**:
  - `input_parameters`: `[{ "name": "PageNumber", "value": "1" }, ...]`
  - `save_browser_data`: `true/false`（セッションをプロファイルへ保存）
  - `profile_id`: 既存ブラウザプロファイルを再利用する際に指定
  - `callback_url`: タスク完了通知を受け取る HTTPS エンドポイント
- **成功レスポンス**: `{ "id": "<task_id>", "profile_id": "<optional>" }`

### 2.2 `GET /v2/workflow/get-task`

- **目的**: `task_id` の詳細・進捗・出力を取得。
- **レスポンス主要項目**:
  - `status`: `created|running|finished|failed|canceled|paused`
  - `output`: `{ "string": "<JSON 文字列>", "files": ["<url>", ...] }`
  - `steps`: 各ステップのスクショや評価結果
  - `task_failure_info`: エラーコードとメッセージ
- **備考**: `output.string` は多くの場合 JSON 文字列（LLM 側で `json.loads` する）。

### 2.3 `GET /v2/workflow/get-task-status`

- **目的**: ステータスのみを軽量取得。
- **レスポンス**: `{ "status": "<...>" }`

### 2.4 `PUT /v2/workflow/stop-task`

- **目的**: 実行中タスクをキャンセル。
- **クエリ**: `task_id`

### 2.5 `GET /v2/workflow/list-tasks`

- **目的**: ワークフローの履歴をページング取得。監査/可視化用途。

### 2.6 `GET /v2/workflow/list-workflows` / `GET /v2/workflow/get-workflow`

- **目的**: 利用可能なワークフロー一覧と入力パラメータ定義を取得。

---

## 3. 推奨実行フロー（Polling 型）

1. `run-task` に `workflow_id` と必要な `input_parameters` を渡す。
2. 成功レスポンスで受け取った `task_id` を `get-task` で 10–15 秒間隔でポーリング。
3. `status == "finished"` なら `output.string` を JSON として解析。レコードごとにメタ情報（ページ番号など）を付加。
4. `status == "failed"/"canceled"` の場合は `task_failure_info` をログし、必要ならリトライ。
5. 並列実行する場合は `ThreadPoolExecutor` などでページ単位のタスクを投げるが、過度な同時実行は失敗率を高めるため 3〜5 並列を推奨。

---

## 4. 典型的な入力パラメータ

| 例                          | 説明                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `workflow_id`               | BrowserAct 管理画面で発行される ID（例: `62459082135251619`）    |
| `PageNumber`                | ページネーション制御。整数値を文字列化して渡す必要がある         |
| `SearchTerm` / `Department` | サイト固有の検索語やカテゴリ指定                                 |
| `callback_url`              | タスク完了通知を受ける HTTPS URL。30 秒以内に 2xx を返す必要あり |

---

## 5. エラー/リトライ戦略

- `run-task` の HTTP エラー時はページ番号をログしつつ数秒待って再試行（最大 3 回など）。
- `get-task` で `status` が `failed` の場合、`task_failure_info` を記録してから再実行。
- JSON 出力が壊れている場合は `json.JSONDecodeError` を捕捉してリトライ。
- タイムアウトや `paused` 状態が続くときは `stop-task` して再起動した方が早いケースもある。

---

## 6. ベストプラクティス

1. **入力検証**: `input_parameters` はすべて文字列になるため、整数や日付も `str()` で渡す。
2. **結果の正規化**: `output.string` から取得した配列にループ番号やページ番号を付与し、データベースでユニーク化（URL UNIQUE など）。
3. **並列制御**: 大量ページを取得する場合も一度に 3〜5 タスク程度に制限すると安定。
4. **ログ保存**: `task_id`, `status`, `output`, `error_message` をワークフロー実行ログに記録してトレース可能にする。
5. **Webhook 活用**: `callback_url` を指定しておくとポーリングを減らし、Cloud Run や Functions で非同期処理を走らせやすい。
6. **Profile 再利用**: ログイン済みセッションを使い回したい場合は `save_browser_data` を `true` にして `profile_id` を保存しておく。

---

## 7. サポート/その他

- **ドキュメント**: 公式 API ドキュメント（2025-11 時点）に本仕様の詳細が記載されている。
- **クレジット消費**: タスクの複雑さやステップ数に応じてクレジットを消費。AppSumo LTD などプランごとに上限が異なる。
- **ユースケース例**: Amazon/Google News/Reddit などのテンプレートが公開されており、Workflow ID を指定するだけで再利用できる。

この仕様を基に LLM から BrowserAct API を呼び出すプロンプトやコードを生成すると、安定したスクレイピング/自動化パイプラインを構築しやすくなる。
