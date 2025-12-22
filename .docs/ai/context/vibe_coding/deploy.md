# Deploy - 運用編

> このドキュメントは以下の内容を統合しています:
> Dockerとデプロイ、セキュリティとパフォーマンス、トラブルシューティング、ローカルアプリとデスクトップ化

---

## Docker とデプロイ

### Dockerfile の構成

マルチステージビルドを使って、効率的なイメージを作成します。

#### Dockerfile（ルート）

```dockerfile
# 1. フロントエンドのビルド
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. バックエンドのビルド
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# 3. 実行環境
FROM node:20-alpine
WORKDIR /app

# バックエンドの成果物をコピー
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package.json ./

# フロントエンドの成果物をコピー
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### バックエンドで静的ファイルを配信

Hono でフロントエンドのビルド成果物を配信します。

#### backend/src/index.ts の設定

```typescript
import { Hono } from "hono";
import { serveStatic } from "hono/node-server";

const app = new Hono();

// API ルート
app.get("/api/hello", (c) => {
  return c.json({ message: "Hello" });
});

// 静的ファイルの配信（最後に配置）
app.use("/*", serveStatic({ root: "./public" }));

export default app;
export type AppType = typeof app;
```

### 環境変数の管理

#### .env ファイル（バックエンド）

```env
PORT=3000
NCB_API_KEY=your-api-key-here
NCB_BASE_URL=https://your-ncb-instance.com
```

#### 環境変数の読み込み

```typescript
// backend/src/index.ts
import { serve } from "@hono/node-server";

const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
});
```

### ビルドと実行

#### ローカルでビルド

```bash
docker build -t my-vibe-app .
```

#### ローカルで実行

```bash
docker run -p 3000:3000 --env-file backend/.env my-vibe-app
```

### Cloud Run へのデプロイ

#### 前提条件

- Google Cloud SDK がインストールされている
- プロジェクトが作成されている

#### デプロイ手順

```bash
# イメージをビルド
docker build -t gcr.io/YOUR_PROJECT_ID/my-vibe-app .

# イメージをプッシュ
docker push gcr.io/YOUR_PROJECT_ID/my-vibe-app

# Cloud Run にデプロイ
gcloud run deploy my-vibe-app \
  --image gcr.io/YOUR_PROJECT_ID/my-vibe-app \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars PORT=8080,NCB_API_KEY=your-key
```

#### 環境変数の設定

Cloud Run のコンソールから、または `gcloud` コマンドで設定します。

```bash
gcloud run services update my-vibe-app \
  --set-env-vars NCB_API_KEY=your-key,NCB_BASE_URL=https://...
```

### よくある問題

#### Q: ビルドが失敗する

A: 各ステージで必要なファイルがコピーされているか確認します。

#### Q: 静的ファイルが表示されない

A: `serveStatic` のパスが正しいか確認します。`./public` は実行時の作業ディレクトリからの相対パスです。

#### Q: 環境変数が読み込まれない

A: Docker の `--env-file` オプションや、Cloud Run の環境変数設定を確認します。

---

## セキュリティとパフォーマンス

### セキュリティのベストプラクティス

#### 認証と認可

##### セッション管理

```typescript
// backend/src/middleware/auth.ts
import { getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";

// ログイン時にセッションを発行
app.post("/api/login", async (c) => {
  // パスワード検証...
  const token = await sign({ userId: user.id }, process.env.JWT_SECRET!);
  setCookie(c, "session", token, {
    httpOnly: true, // JavaScriptからアクセス不可
    secure: true, // HTTPSのみ
    sameSite: "strict", // CSRF対策
    maxAge: 60 * 60 * 24 * 7, // 7日間
  });
  return c.json({ ok: true });
});

// 認証ミドルウェア
const authMiddleware = async (c: Context, next: Next) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!);
    c.set("userId", payload.userId);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};
```

#### 入力検証

```typescript
import { z } from "zod";

// スキーマ定義
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

app.post("/api/users", async (c) => {
  const body = await c.req.json();

  // 検証
  const result = createUserSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  // 検証済みデータを使用
  const user = result.data;
  // ...
});
```

#### API キーの保護

```typescript
// ❌ 悪い例：フロントエンドに露出
const apiKey = "secret-key"; // これは絶対にダメ

// ✅ 良い例：環境変数で管理
const apiKey = process.env.NCB_API_KEY; // バックエンドのみ
```

### パフォーマンス最適化

#### キャッシュ戦略

##### TanStack Query のキャッシュ設定

```typescript
// frontend/src/App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分間は新鮮とみなす
      cacheTime: 1000 * 60 * 30, // 30分間キャッシュ
    },
  },
});
```

##### Hono 側でのキャッシュ

```typescript
// 頻繁にアクセスするデータはキャッシュ
const cache = new Map<string, { data: any; expires: number }>();

app.get("/api/popular-posts", async (c) => {
  const cached = cache.get("popular-posts");
  if (cached && cached.expires > Date.now()) {
    return c.json(cached.data);
  }

  const data = await fetchFromNCB();
  cache.set("popular-posts", {
    data,
    expires: Date.now() + 1000 * 60 * 5, // 5分
  });

  return c.json(data);
});
```

#### データベースクエリの最適化

##### 必要なフィールドだけ取得

```typescript
// ❌ 悪い例：全フィールドを取得
const users = await ncb.get("/users");

// ✅ 良い例：必要なフィールドだけ
const users = await ncb.get("/users?select=id,name,email");
```

##### ページネーション

```typescript
app.get("/api/posts", async (c) => {
  const page = Number(c.req.query("page")) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = await ncb.get(`/posts?limit=${limit}&offset=${offset}`);

  return c.json({ posts, page, hasMore: posts.length === limit });
});
```

#### バンドルサイズの最適化

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
```

### モニタリングとロギング

#### エラーロギング

```typescript
// backend/src/middleware/logger.ts
app.use("*", async (c, next) => {
  const start = Date.now();

  try {
    await next();
  } catch (error) {
    // エラーをログに記録
    console.error("Error:", {
      url: c.req.url,
      method: c.req.method,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    const duration = Date.now() - start;
    console.log(`${c.req.method} ${c.req.url} - ${duration}ms`);
  }
});
```

#### パフォーマンス監視

```typescript
// 遅いリクエストを検出
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`Slow request: ${c.req.url} took ${duration}ms`);
  }
});
```

### よくあるセキュリティホール

#### XSS 対策

React は自動的にエスケープしますが、`dangerouslySetInnerHTML` を使う時は注意：

```typescript
// ❌ 危険
<div dangerouslySetInnerHTML={{ __html: userInput }} />;

// ✅ 安全：DOMPurify などでサニタイズ
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />;
```

#### SQL インジェクション

NoCodeBackend を使っている場合、直接 SQL を書かないのでリスクは低いですが、クエリパラメータは検証しましょう。

### チェックリスト

セキュリティ：

- [ ] API キーは環境変数で管理している
- [ ] 入力検証を実装している
- [ ] セッション Cookie は httpOnly になっている
- [ ] HTTPS を使用している（本番環境）

パフォーマンス：

- [ ] キャッシュを適切に設定している
- [ ] 不要なデータを取得していない
- [ ] ページネーションを実装している
- [ ] バンドルサイズを確認している

---

## トラブルシューティング

### よくある問題と解決方法

開発中によく遭遇する問題と、その解決方法をまとめました。

### 型エラー

#### Hono RPC の型が効かない

**症状**: フロントエンドで `client.api.xxx` の型補完が効かない

**原因**:

- `AppType` がエクスポートされていない
- インポートパスが間違っている

**解決方法**:

```typescript
// backend/src/index.ts
// ★ これが重要
export type AppType = typeof routes;

// frontend/src/lib/client.ts
// ★ 相対パスが正しいか確認
import type { AppType } from "../../../backend/src/index";
```

#### 型定義ファイルが見つからない

**症状**: `Cannot find module` エラー

**解決方法**:

- TypeScript の設定で `paths` を設定する
- または、相対パスで直接インポートする（推奨）

### CORS エラー

#### ブラウザで CORS エラーが出る

**症状**: `Access-Control-Allow-Origin` エラー

**解決方法**:

```typescript
// backend/src/index.ts
import { cors } from "hono/cors";

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"], // 開発環境
    credentials: true,
  })
);
```

### 接続エラー

#### フロントエンドからバックエンドに接続できない

**症状**: `Failed to fetch` エラー

**確認ポイント**:

1. バックエンドが起動しているか
2. ポート番号が正しいか（デフォルト: 3000）
3. フロントエンドの `client.ts` の URL が正しいか

**解決方法**:

```typescript
// frontend/src/lib/client.ts
const API_URL = import.meta.env.PROD
  ? window.location.origin // 本番: 同じオリジン
  : "http://localhost:3000"; // 開発: バックエンドのURL
```

### ビルドエラー

#### Docker ビルドが失敗する

**症状**: `COPY failed` などのエラー

**確認ポイント**:

1. ファイルパスが正しいか
2. `.dockerignore` で除外すべきファイルが除外されているか

**解決方法**:

`.dockerignore` を作成:

```dockerignore
node_modules
dist
.env
.git
*.log
```

#### フロントエンドのビルドが失敗する

**症状**: Vite のビルドエラー

**確認ポイント**:

1. `vite.config.ts` の設定が正しいか
2. 依存関係がインストールされているか

**解決方法**:

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### 実行時エラー

#### ポートが既に使われている

**症状**: `Port 3000 is already in use`

**解決方法**:

```bash
# 使用中のプロセスを確認
lsof -i :3000

# プロセスを終了
kill -9 <PID>
```

または、別のポートを使う:

```typescript
// backend/src/index.ts
const port = Number(process.env.PORT) || 3001;
```

#### 環境変数が読み込まれない

**症状**: `process.env.XXX` が `undefined`

**解決方法**:

1. `.env` ファイルが正しい場所にあるか確認
2. 環境変数の読み込みライブラリを使う（例: `dotenv`）

```typescript
// backend/src/index.ts
import "dotenv/config";
```

### NoCodeBackend 関連

#### API キーが無効

**症状**: 401 Unauthorized エラー

**確認ポイント**:

1. API キーが正しいか
2. 環境変数に設定されているか
3. リクエストヘッダーに含まれているか

**解決方法**:

```typescript
// backend/src/lib/ncb.ts
const response = await fetch(`${NCB_BASE_URL}/api/users`, {
  headers: {
    Authorization: `Bearer ${process.env.NCB_API_KEY}`,
  },
});
```

#### 型生成が失敗する

**症状**: `openapi-typescript` でエラー

**確認ポイント**:

1. Swagger JSON が正しい形式か
2. ファイルパスが正しいか

**解決方法**:

```bash
# Swagger JSON を確認
cat swagger.json | jq .

# 型を生成
npx openapi-typescript ./swagger.json -o ./backend/src/types/ncb-schema.ts
```

### デバッグのコツ

#### ログを確認する

```typescript
// バックエンド
console.log("Request:", c.req.url);
console.log("Body:", await c.req.json());

// フロントエンド
console.log("Response:", data);
```

#### ネットワークタブを確認

ブラウザの開発者ツールで、リクエストとレスポンスを確認します。

#### 型を確認する

```typescript
// 型を確認したい時
type Test = typeof client.api;
// エディタでホバーすると型が表示される
```

### まだ解決しない場合

1. **エラーメッセージ全体をコピー**: AI に貼り付けて相談
2. **再現手順を整理**: 何をしたらエラーが出るか
3. **環境情報を確認**: Node.js のバージョン、OS など

---

## ローカルアプリとデスクトップ化

### Web スタックでローカルファイル操作

この技術スタックでは、**ローカルファイルへのアクセスも可能**です。

### アーキテクチャ

```text
[Browser: React]  ← UIの描画と確認画面
     ⬇️ (Hono RPC)
[Server: Hono (Node.js)]  ← fs モジュールでファイル操作
     ⬇️
[Local Files]  ← 実際のファイルシステム
```

**ポイント**: バックエンド（Hono/Node.js）は Python と同等の権限でファイル操作が可能。

### 実装例：ファイルリネームツール

```typescript
// backend/src/routes/files.ts
import { Hono } from "hono";
import fs from "node:fs/promises";
import path from "node:path";

const app = new Hono();

// ディレクトリ内のファイル一覧を取得
app.get("/list", async (c) => {
  const targetDir = c.req.query("dir") || "./target-data";
  const files = await fs.readdir(targetDir);
  return c.json({ files });
});

// リネーム実行
app.post("/rename", async (c) => {
  const { oldName, newName, dir } = await c.req.json();

  try {
    await fs.rename(path.join(dir, oldName), path.join(dir, newName));
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export default app;
```

### Python vs TypeScript の判断基準

#### Node.js (今回のスタック) で十分なケース ✅

- **AI 処理**: OpenAI API や Gemini API を「呼ぶ」だけなら差はない
- **Web 検索/取得**: Node.js は非同期処理が強く、並行して複数サイトを見に行く処理は**Python より速い**
- **ディレクトリ推論**: 文字列操作やロジックなので問題なし

#### Python に留まるべきケース ⚠️

- **ローカル LLM の駆動**: PyTorch をガッツリ回す場合
- **複雑なデータ解析**: Pandas で数百万行のデータを処理する場合
- **特殊なバイナリ解析**: Python 専用ライブラリが必要な場合

### UI/UX の優位性

ファイル操作ツールで最も恐ろしいのは**「AI が誤爆して大事なファイルをめちゃくちゃにすること」**。

| 機能                   | Python (Streamlit/Tkinter) | React + Tailwind         |
| ---------------------- | -------------------------- | ------------------------ |
| **Before/After 比較**  | 文字列を並べるのが精一杯   | **色付きで Diff 表示**   |
| **一括選択/除外**      | チェックボックス制御が面倒 | 直感的な UI でポチポチ   |
| **進捗表示**           | 簡易的なプログレスバー     | スムーズなアニメーション |
| **即時フィードバック** | 再描画に時間がかかる       | サクサク動く             |

### Electron / Tauri への移行

#### 進化の図式

```text
Phase 1: Local Web App (今の構成)
  → ブラウザで localhost:3000 にアクセス
  → 開発が一番速い

Phase 2: Electron App (未来の構成)
  → デスクトップアイコンをダブルクリック
  → ブラウザの枠が消えて没入感が出る
  → .exe や .app として配布可能
```

#### なぜ移行がイージーか

| 項目                    | 移行難易度 | 理由                               |
| ----------------------- | ---------- | ---------------------------------- |
| **Backend → Electron**  | ほぼゼロ   | Electron の裏側は Node.js そのもの |
| **Frontend → Electron** | ゼロ       | Electron の画面は Chrome そのもの  |
| **Tauri への移行**      | 低い       | Sidecar で Node.js を同梱可能      |

#### Electron vs Tauri

| 項目           | Electron           | Tauri                |
| -------------- | ------------------ | -------------------- |
| **サイズ**     | 大きい (100MB+)    | 小さい (10MB~)       |
| **Node.js**    | 内蔵               | Sidecar で同梱が必要 |
| **移行難易度** | **非常に低い**     | 低い                 |
| **推奨**       | Node.js を使うなら | Rust で書きたいなら  |

**結論**: まずは Web アプリとして完成させ、必要なら Electron でラップする。

### まとめ

「Web アプリとして作っておいて、後から専用の殻（シェル）を被せて配布する」

これが現代の開発における最も賢い選択肢。最初から Electron で作る必要はありません。
