# GitHub Copilot レビュー方針

GitHub Copilot によるコードレビュー時に重点確認してほしい観点をまとめる。

## プロジェクト概要
- Discord のクロスポストされたメッセージを検知し、外部の Google Apps Script (GAS) で翻訳して元メッセージへ返信する Bot。
- TypeScript / Node.js、パッケージマネージャは pnpm。主要ライブラリは discord.js と `@book000/node-utils`。HTTP 呼び出しは Node 標準の `fetch` を使用する。

## レビュー時の重点確認事項
- **機密情報**: Discord トークン等が `data/config.json` 以外にハードコードされていないか。ログ出力に機密情報が混入していないか。
- **設定の取り扱い**: 設定は `data/config.json` (環境変数 `CONFIG_FILE` / `CONFIG_PATH` で上書き可) から読み込む。`src/config.ts` の型と実際の利用箇所が整合しているか。
- **エラーハンドリング**: 非同期処理 (Promise / `async`) の例外が握り潰されていないか。Discord API 呼び出しや `fetch` の失敗が適切に処理・ログ出力されているか。
- **翻訳ロジック**: `src/utils.ts` の URL 保護や整形処理を変更する場合、既存の正規表現・置換挙動を壊していないか。対応するテスト (`src/utils.test.ts`) が追加・更新されているか。
- **JSDoc**: 公開関数・インターフェースに日本語の JSDoc があるか。

## コーディング規約 (lint で強制)
- フォーマット: Prettier (`.prettierrc.yml`)。
- リンタ: ESLint (`eslint.config.mjs`、`@book000/eslint-config` ベース)。
- TypeScript の `skipLibCheck` は使用しない。
- コメントは日本語、エラーメッセージは英語。日本語と英数字の間には半角スペースを入れる。

## フラグ不要な既知パターン
- `gas-script.js` は GAS 側で動作する独立コードで、本リポジトリの Node.js 環境向けの依存や型付けを前提としない。Node 側の規約違反として指摘しない。
- ログの絵文字プレフィックス (`✅` `❌` `🤖` 等) は既存スタイル。除去を促さない。
