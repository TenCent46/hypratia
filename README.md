# Hypratia

Hypratiaは、ローカルファーストのAI思考ワークスペースです。右側でチャット、左側で無限キャンバスを使い、会話・ノード・PDF/文書・プロジェクト知識をまとめて扱えます。

macOSを主対象にしています。

## 最初にこれだけ読めば使えます

### 1. アプリを起動する

このリポジトリを開いて、ターミナルで次を実行します。

```bash
pnpm install
pnpm tauri dev
```

アプリの画面が開いたら起動成功です。

### 2. AIのAPIキーを設定する

1. Settingsを開く
2. Providersを開く
3. OpenAI / Anthropic / Google / Mistralなど、使いたいproviderのAPIキーを入れる
4. Testを押して接続確認する
5. Chat画面で質問する

APIキーは自分のMac内に保存されます。

### 3. 基本の使い方

- 右側のChatでAIと会話する
- 左側のCanvasに会話やメモのノードを並べる
- PDFやMarkdownなどのファイルを開いて参照する
- プロジェクトごとに資料、会話、メモリを分ける
- 必要ならObsidian用のMarkdownとして書き出す

### 4. PDFや文書を使う

プロジェクトの`raw/`フォルダにPDF、DOCX、Markdown、txt、csvなどを入れます。アプリ側でプロジェクトを開くと、ファイルビューアーから参照できます。

PDFのcitationリンクをクリックすると、該当ファイルやページを開く用途で使えます。

### 5. よく使う操作

| やりたいこと | 操作 |
|---|---|
| 新しい会話を始める | `Cmd+N` |
| 設定を開く | `Cmd+,` |
| コマンドパレットを開く | `Cmd+P` |
| 検索する | `Cmd+K` |
| Canvasに空ノードを追加 | `Cmd+E` |
| Canvasの表示を中央に戻す | `Cmd+0` |
| メッセージ送信 | `Cmd+Enter` |
| 送信停止 | `Cmd+Backspace` |

## 配布用DMGを作る

Mac用の配布ファイルを作る場合は次を実行します。

```bash
pnpm tauri build
```

DMGはここに作られます。

```text
src-tauri/target/release/bundle/dmg/
```

Apple Silicon向けに明示してビルドした場合はここです。

```bash
pnpm tauri build --target aarch64-apple-darwin
```

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/
```

Intel Mac向けに明示してビルドした場合はここです。

```bash
pnpm tauri build --target x86_64-apple-darwin
```

```text
src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/
```

`.app`は同じ`bundle`配下の`macos/`に作られます。

## GitHubへアップロードする

現在のアップロード先は次です。

```text
origin https://github.com/TenCent46/hypratia.git
```

普通に変更をGitHubへ送る場合:

```bash
git status
git add .
git commit -m "変更内容を短く書く"
git push origin <branch-name>
```

今いるブランチ名は次で確認できます。

```bash
git branch --show-current
```

GitHub ReleaseとしてDMGを出す場合は、バージョンタグをpushします。

```bash
git status
git add .
git commit -m "release: v1.1.0-beta.1"
git tag v1.1.0-beta.1
git push origin <branch-name>
git push origin v1.1.0-beta.1
```

`v*.*.*`形式のタグをpushすると、`.github/workflows/release.yml`が動き、GitHub ReleasesにDMGと`.app.zip`がアップロードされます。

署名・notarize付きリリースには、GitHub Secretsに次の値が必要です。

```text
APPLE_SIGNING_IDENTITY
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

未署名のローカル確認だけなら、まずは`pnpm tauri build`で十分です。

## 詳しい機能

| Action | Shortcut |
|---|---|
| Command palette | `Cmd+P` |
| Search | `Cmd+K` |
| AI palette on selection | `Cmd+J` |
| Today's daily note | `Cmd+D` |
| Quick capture | `Cmd+Shift+Space` |
| All shortcuts | `Cmd+?` |
| Settings | `Cmd+,` |
| New conversation | `Cmd+N` |
| Add empty node | `Cmd+E` |
| Toggle Current/Global map | `Cmd+G` |
| Center viewport | `Cmd+0` |
| Select tool | `V` |
| Hand/Pan tool | `H` |
| Toggle Inspect/Chat | `Cmd+Shift+I` |
| Export to vault | `Cmd+Shift+E` |
| Send / Stop | `Cmd+Enter` / `Cmd+Backspace` |

## プロジェクト知識フォルダ

プロジェクトごとの知識ベースは次の構成を想定しています。

```text
knowledge-base/
  projects/
    [project-name]/
      raw/
      instruction/
        instruction.md
        memory.md
        meta-instruction.md
      processed/
```

- `raw/`: PDF、DOCX、Markdown、txt、csvなどの原文ファイル
- `instruction/instruction.md`: プロジェクト固有のAIへの指示
- `instruction/memory.md`: 決定事項やユーザー設定などの長期記憶
- `instruction/meta-instruction.md`: 検索やcitation利用の短いルール
- `processed/`: アプリが生成する抽出済みテキスト、chunk、index

`memory.md`にPDF本文や長い要約を詰め込まず、一次資料は`raw/`、検索用データは`processed/`に分けます。

## 開発コマンド

```bash
pnpm install             # 依存関係のインストール
pnpm tauri dev           # Tauriデスクトップ開発起動
pnpm dev                 # Viteのみ起動
pnpm build               # TypeScript + Vite build
pnpm typecheck           # TypeScript型チェック
pnpm lint                # ESLint
pnpm check:knowledge     # knowledge retrievalの簡易チェック
pnpm tauri build         # macOS向け.app/.dmg作成
```

## データの保存場所

アプリの永続データはTauriの`appDataDir()`配下に保存されます。macOSでは概ね次の場所です。

```text
~/Library/Application Support/com.bakerization.memory-canvas/
```

主なファイル:

- `conversations.json`
- `messages.json`
- `nodes.json`
- `edges.json`
- `settings.json`
- `attachments.json`
- `secrets.json`
- `attachments/YYYY-MM/<id>.<ext>`
- `LLM-Conversations/`
- `LLM-Daily/`
- `LLM-Nodes/`
- `LLM-Maps/`
- `LLM-Attachments/`

## 技術スタック

- Shell: Tauri 2
- UI: React 19 + TypeScript + Vite
- Canvas: `@xyflow/react`
- State: Zustand
- Markdown: `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight`
- AI: Vercel AI SDK
- PDF: `react-pdf` + `pdfjs-dist`
- Command palette: `cmdk`
- Persistence: Tauri `appDataDir()`配下のJSONファイル

## 関連ドキュメント

- [CLAUDE.md](CLAUDE.md): 開発ルールと設計方針
- [plan/](plan/README.md): 実装計画
- [plan/v1/](plan/v1/README.md): v1系の計画
- [.github/workflows/release.yml](.github/workflows/release.yml): GitHub Release用workflow

## Privacy

Telemetryはありません。ネットワーク通信は、設定したAI providerへのAPI通信と、updater有効時のGitHub Release確認に限定されます。

## License

MIT. See [LICENSE](LICENSE).
