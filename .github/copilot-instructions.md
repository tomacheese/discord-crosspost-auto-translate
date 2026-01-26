# GitHub Copilot Instructions

## プロジェクト概要
- 目的: Discord のクロスポストされたメッセージを自動翻訳して返信する。
- 主な機能:
  - 他のチャンネルからクロスポストされたメッセージの検知
  - Google Apps Script (GAS) を利用したメッセージの翻訳
  - 翻訳結果を元のメッセージへの返信として投稿
- 対象ユーザー: 開発者、Discord サーバー管理者

## 共通ルール
- 会話は日本語で行う。
- PR とコミットは Conventional Commits に従う。
- 日本語と英数字の間には半角スペースを入れる。

## 技術スタック
- 言語: TypeScript
- 実行環境: Node.js (v24.13.0)
- 主要ライブラリ: discord.js, axios
- パッケージマネージャー: pnpm
- テストフレームワーク: Jest
- リンター/フォーマッタ: ESLint, Prettier

## 開発コマンド
```bash
# 依存関係のインストール
pnpm install

# 開発実行 (tsx watch)
pnpm dev

# リンター実行
pnpm lint

# 自動修正実行
pnpm fix

# テスト実行
pnpm test

# ビルド (tsc)
pnpm compile

# バンドル (ncc)
pnpm package
```

## コーディング規約
- フォーマット: Prettier (`.prettierrc.yml`)
- リンター: ESLint (`eslint.config.mjs`)
- TypeScript: `skipLibCheck` は使用しない。
- 関数やインターフェースには JSDoc (日本語) を記載する。

## テスト方針
- テストフレームワーク: Jest
- テストファイル: `src/**/*.test.ts`
- 新機能追加時やバグ修正時には、対応するテストを追加または更新する。

## セキュリティ / 機密情報
- Discord トークンなどの機密情報は `data/config.json` で管理し、絶対に Git にコミットしない。
- ログに機密情報を出力しない。

## リポジトリ固有
- 翻訳には外部の Google Apps Script (`gas-script.js`) を利用する。
- 設定ファイルはデフォルトで `data/config.json` を参照する。
