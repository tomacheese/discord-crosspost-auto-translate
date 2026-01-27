# Gemini CLI 用作業方針

## 目的
本ドキュメントは、Gemini CLI が本プロジェクトで作業を行う際のコンテキストと指示を定義します。

## 出力スタイル
- **言語**: 日本語
- **トーン**: 簡潔かつ直接的（プロフェッショナルな CLI エージェントとして）
- **形式**: Markdown

## 共通ルール
- **会話言語**: 日本語
- **コミット規約**: Conventional Commits ( `<description>` は日本語)
- **日本語と英数字の間**: 半角スペースを挿入

## プロジェクト概要
- **目的**: Discord のクロスポストメッセージを自動翻訳する Bot。
- **技術スタック**: TypeScript, discord.js, pnpm, Jest

## コーディング規約
- **コメント**: 日本語
- **エラーメッセージ**: 英語
- **docstring**: 公開要素には日本語で JSDoc を記載。
- **TypeScript**: `skipLibCheck` の使用禁止。

## 開発コマンド
```bash
# インストール
pnpm install

# 開発
pnpm dev

# リンター
pnpm lint

# 自動修正
pnpm fix

# テスト
pnpm test

# ビルド
pnpm compile
```

## 注意事項
- 認証情報 (Discord Token 等) を Git にコミットしない。
- 既存のコードスタイル、ディレクトリ構造、アーキテクチャを尊重する。
- 変更後は必ず `pnpm lint` で品質を確認する。

## リポジトリ固有
- `src/event.ts` の `onMessageCreate` 周りが主要なロジックです。
- `gas-script.js` は外部サービス (GAS) 側のコードであり、本リポジトリの Node.js 環境では動作しません。
