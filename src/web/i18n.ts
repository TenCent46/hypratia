/**
 * Tiny i18n module for the Hypratia landing + demo pages.
 *
 * No external dep — the dictionary is a flat key/value map per locale and
 * `t(locale, key)` falls back to English when a key is missing. Keys live in
 * one file so a translator can sweep them in a single pass.
 */

export const LOCALES = ['en', 'ja', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  zh: '中文',
};

const STORAGE_KEY = 'hypratia-locale';

type Dict = Record<string, string>;

const en: Dict = {
  'lang.aria.switcher': 'Language',
  'lang.aria.option': 'Switch language to {label}',

  // ---------- header / shared chrome ----------
  'header.aria.home': 'Hypratia home',
  'header.aria.github': 'Hypratia on GitHub',
  'header.title.github': 'View source on GitHub',
  'header.download': 'Download for macOS',

  // ---------- footer ----------
  'footer.copy': '© Hypratia · Local-first memory canvas for LLM conversations',
  'footer.github': 'GitHub',
  'footer.download': 'Download for macOS',

  // ---------- landing hero ----------
  'hero.eyebrow': 'Memory Canvas · Beta',
  'hero.title.line1': 'Your conversations,',
  'hero.title.line2': 'finally spatial.',
  'hero.sub':
    'Hypratia turns every LLM chat into an infinite canvas you can rearrange, connect, and keep forever — as Markdown, on your Mac.',
  'hero.cta.primary': 'Download for macOS',
  'hero.cta.secondary': 'Try the live demo →',
  'hero.cta.meta': 'Free during beta · Apple Silicon & Intel · macOS 12+',

  // ---------- preview stage ----------
  'stage.aria.preview': 'Live canvas preview',
  'stage.aria.demo': 'Hypratia canvas demo',

  // ---------- features ----------
  'features.aria': 'Features',
  'features.eyebrow': 'Why Hypratia',
  'features.title': 'Built for thinking, not filing.',
  'features.localFirst.title': 'Local-first',
  'features.localFirst.desc':
    'Every conversation is a plain Markdown file on your disk. Works offline. No accounts, no cloud lock-in.',
  'features.macNative.title': 'Mac-native',
  'features.macNative.desc':
    'A real desktop app — ~10 MB, native windows, menubar, shortcuts. Built on Tauri 2.',
  'features.canvas.title': 'Conversation memory canvas',
  'features.canvas.desc':
    'Drop messages onto an infinite canvas. Cluster, connect, revisit — instead of scrolling forever.',

  // ---------- how it works ----------
  'how.aria': 'How it works',
  'how.eyebrow': 'How it works',
  'how.title': 'A canvas that grows with the conversation.',
  'how.step1.title': 'Chat as usual',
  'how.step1.desc':
    'Talk to your favorite LLM in the right pane. BYO API key — Claude, GPT, Gemini, Mistral.',
  'how.step2.title': 'Drag onto the canvas',
  'how.step2.desc':
    'Pull any message into the left pane. It becomes a draggable Markdown node you own.',
  'how.step3.title': 'Cluster and connect',
  'how.step3.desc':
    'Arrange ideas in space. Link them. Drop in pasted text or images. Build a map of your thinking.',
  'how.step4.title': 'Save to your vault',
  'how.step4.desc':
    'Everything mirrors to your Obsidian vault as Markdown with wikilinks. Your notes outlive the app.',

  // ---------- demo page ----------
  'demo.title': 'Live demo',
  'demo.badge.static': 'Static · no AI calls',
  'demo.intro':
    'Drag nodes around. Click + Add memo for a new Markdown node, or paste text / images straight onto the canvas. Nothing leaves your browser — this page does not talk to any AI provider.',
  'demo.intro.addMemo': '+ Add memo',
  'demo.back': '← Back to home',
  'demo.outro':
    'This is a small slice of Hypratia. The Mac app adds local LLM chat, your full Obsidian vault, attachments, search, and more.',

  // ---------- demo chat panel ----------
  'chat.title': 'Today’s thread',
  'chat.badge': 'Demo · no AI calls',
  'chat.badge.title': 'Static demo — no API keys, no provider calls',
  'chat.composer.disabled': 'Composer disabled — install the Mac app to chat',

  // ---------- demo canvas chrome ----------
  'canvas.addMemo': 'Add memo',
  'canvas.hint.paste': 'Paste text or images here',

  // ---------- canvas-node context menu ----------
  'node.selectAll': 'Select All',
  'node.copy': 'Copy',

  // ---------- welcome tour ----------
  'tour.skip': 'Skip tour',
  'tour.next': 'Next →',
  'tour.gotIt': 'Got it',
  'tour.step': 'Step {n} of {total}',

  'tour.welcome.title': 'Welcome to Hypratia',
  'tour.welcome.body':
    'A memory canvas for your conversations. This is a live demo — no AI calls happen and nothing leaves your browser.',
  'tour.add.title': 'Add a memo',
  'tour.add.body':
    'Click + Add memo to drop a new Markdown node on the canvas. Drag it anywhere.',
  'tour.paste.title': 'Paste anything',
  'tour.paste.body':
    'Copy any image (e.g. ⌘⇧4 on Mac), then press ⌘V on the canvas. Pasted text becomes a memo, pasted images become image nodes.',
  'tour.files.title': 'PDF, PPTX, MD — all supported',
  'tour.files.body':
    'In the full Mac app, drop PDFs, PowerPoint decks, or Markdown files onto the canvas. Hypratia parses them, indexes content, and links them to your conversations.',

  // ---------- sample chat messages ----------
  'sample.msg.user1':
    'I keep losing track of where ideas came from in long ChatGPT threads. Anything spatial would help.',
  'sample.msg.assistant1.title': 'Spatial works because retrieval is positional',
  'sample.msg.assistant1.p1':
    "Linear chat collapses every idea into one timeline. The mind doesn't store ideas that way — it stores them in a place.",
  'sample.msg.assistant1.p2':
    'Drop messages onto a canvas as you go and the canvas becomes a map of the conversation.',
  'sample.msg.user2': "Right — and I want it offline. I'm tired of cloud notes.",
  'sample.msg.assistant2.title': 'Local-first, Markdown all the way down',
  'sample.msg.assistant2.p1':
    'Every node is a Markdown file. Your Obsidian vault stays the source of truth.',
  'sample.msg.assistant2.p2':
    'Hypratia is just a lens over those files — delete the app and your notes are still yours.',
  'sample.chat.meta': '2 messages · 1 idea pinned',

  // ---------- sample canvas nodes ----------
  'sample.node.root.title': 'Designing Hypratia',
  'sample.node.root.body':
    'A spatial memory layer for LLM conversations. Local-first, Mac-native, Markdown-backed.',
  'sample.node.local.title': 'Local-first',
  'sample.node.local.body':
    'Your conversations live on your machine, in plain Markdown. No accounts. No cloud lock-in.',
  'sample.node.spatial.title': 'Spatial memory canvas',
  'sample.node.spatial.body':
    'Pull any message onto an infinite canvas. Cluster, connect, revisit — instead of scrolling forever.',
  'sample.node.mac.title': 'Mac-native via Tauri',
  'sample.node.mac.body':
    'A real desktop app. ~10 MB binary. Native windowing, menubar, shortcuts.',
  'sample.node.notion.title': 'Why not Notion?',
  'sample.node.notion.body':
    'Notion is for documents. Hypratia is for thinking — the canvas is the medium, not the output.',
  'sample.node.obsidian.title': 'Obsidian-compatible',
  'sample.node.obsidian.body':
    'Export to your vault as Markdown with wikilinks. Round-trip safe. Your notes outlive the app.',

  // ---------- sample file nodes ----------
  'sample.file.pdf.preview':
    'Spatial memory in human cognition: a review of recent neuroimaging evidence supporting the place-cell hypothesis…',
  'sample.file.pdf.meta': '24 pages · 3 citations linked',
  'sample.file.pptx.preview': 'Q1 roadmap · objectives · milestones · risks',
  'sample.file.pptx.meta': '12 slides',
  'sample.file.md.preview':
    'Books on memory and cognition: Sapiens, Thinking Fast & Slow, A Mind for Numbers…',
  'sample.file.md.meta': '12 items',

  // ---------- pasted-node placeholders ----------
  'pasted.note.title': 'Pasted note',
  'pasted.image.title': 'Pasted image',
  'new.memo.title': 'New memo',
  'new.memo.body': 'Edit me, or paste content directly onto the canvas.',

  // ---------- v2 landing — Raycast/Obsidian-inspired marketing site ----------
  'nav.demo': 'Demo',
  'nav.features': 'Features',
  'nav.privacy': 'Privacy',
  'nav.pricing': 'Pricing',
  'nav.github': 'GitHub',
  'nav.download': 'Download',

  'v2.hero.eyebrow': 'For Mac · Local-first · BYOK',
  'v2.hero.headline.l1': 'Stop losing your best',
  'v2.hero.headline.l2': 'AI conversations.',
  'v2.hero.sub':
    'Hypratia turns chats, documents, PDFs, and ideas into a local-first thinking canvas.',
  'v2.hero.cta.download': 'Download for macOS',
  'v2.hero.cta.demo': 'Try the live demo',
  'v2.hero.cta.github': 'View on GitHub',
  'v2.hero.meta': 'Free during beta · Apple Silicon & Intel · macOS 12+',

  'v2.demo.eyebrow': 'See it in motion',
  'v2.demo.title': 'A live canvas you can drive in the browser.',
  'v2.demo.sub':
    'A no-install walkthrough of Hypratia — chat into the right pane, watch ideas land on the canvas. The Mac app does the same, locally.',
  'v2.demo.cta': 'Open the live demo',
  'v2.demo.note': 'Runs entirely in your browser · No sign-up · No keys required',
  'v2.demo.preview.chat': 'Chat',
  'v2.demo.preview.canvas': 'Canvas',

  'v2.features.eyebrow': 'Why Hypratia',
  'v2.features.title': 'Designed to keep your thinking, not capture it.',
  'v2.features.spatial.title': 'Spatial memory for AI conversations',
  'v2.features.spatial.desc':
    'Your best AI conversations should not disappear into infinite scroll.',
  'v2.features.local.title': 'Local-first project knowledge',
  'v2.features.local.desc':
    'Keep PDFs, Markdown, notes, and memories on your Mac.',
  'v2.features.byok.title': 'BYOK and provider freedom',
  'v2.features.byok.desc':
    'Use OpenAI, Anthropic, Google, Mistral, or your own compatible provider.',
  'v2.features.export.title': 'Export to your vault',
  'v2.features.export.desc':
    'Turn conversations and nodes into Markdown for Obsidian-style workflows.',

  'v2.privacy.eyebrow': 'Privacy by architecture',
  'v2.privacy.title':
    'Your thinking should not live inside someone else’s cloud.',
  'v2.privacy.body':
    'Hypratia stores your conversations, nodes, project files, and memory locally. There is no telemetry. Network requests are limited to the AI providers you configure and optional update checks.',
  'v2.privacy.point.local': 'Local-only data by default',
  'v2.privacy.point.byok': 'Bring your own keys',
  'v2.privacy.point.notelemetry': 'Zero telemetry',
  'v2.privacy.point.markdown': 'Plain Markdown on disk',

  'v2.pricing.eyebrow': 'Pricing',
  'v2.pricing.title': 'Three ways in.',
  'v2.pricing.community.title': 'Community',
  'v2.pricing.community.tagline': 'Free and open-source core.',
  'v2.pricing.community.cta': 'Coming soon',
  'v2.pricing.community.bullet1': 'Local-first canvas + chat',
  'v2.pricing.community.bullet2': 'BYOK for any major provider',
  'v2.pricing.community.bullet3': 'Markdown export to your vault',
  'v2.pricing.founder.title': 'Founder',
  'v2.pricing.founder.tagline':
    'One-time early supporter license for Hypratia 1.x Pro features.',
  'v2.pricing.founder.cta': 'Join waitlist',
  'v2.pricing.founder.bullet1': 'Lifetime Pro on 1.x',
  'v2.pricing.founder.bullet2': 'Founder badge & input on roadmap',
  'v2.pricing.founder.bullet3': 'Priority support',
  'v2.pricing.pro.title': 'Pro',
  'v2.pricing.pro.tagline':
    'Advanced local AI workflows, official builds, and early access features.',
  'v2.pricing.pro.cta': 'Join waitlist',
  'v2.pricing.pro.bullet1': 'Local embeddings & semantic search',
  'v2.pricing.pro.bullet2': 'Advanced citation & PDF tooling',
  'v2.pricing.pro.bullet3': 'Early access to new pipelines',
  'v2.pricing.popular': 'Most popular',

  'v2.finalcta.title': 'Build a place for your thoughts to return to.',
  'v2.finalcta.sub':
    'A quiet desktop app that keeps the thread you’re actually thinking in.',
  'v2.finalcta.download': 'Download for macOS',
  'v2.finalcta.demo': 'Try the live demo',
  'v2.finalcta.github': 'Star on GitHub',

  'v2.footer.tagline': 'Local-first memory canvas for LLM conversations',
  'v2.footer.section.product': 'Product',
  'v2.footer.section.resources': 'Resources',
  'v2.footer.section.legal': 'Legal',
  'v2.footer.link.demo': 'Live demo',
  'v2.footer.link.changelog': 'Changelog',
  'v2.footer.link.docs': 'Docs',
  'v2.footer.link.privacy': 'Privacy',
  'v2.footer.link.license': 'MIT License',

  // Mock chat / canvas content used by the animated InteractiveAppDemo.
  'v2.mock.chat.title': 'Project · Hypratia design',
  'v2.mock.chat.user1': 'How should the canvas remember context?',
  'v2.mock.chat.assistant1':
    'Treat each pinned answer as a node. Position is the index — relations are edges.',
  'v2.mock.chat.user2': 'Pin that answer.',
  'v2.mock.chat.assistant2':
    'Pinned. It now lives on the canvas — drag it anywhere, link it to a PDF, export to your vault.',
  'v2.mock.toast.export': 'Exported to Obsidian vault',
  'v2.mock.node.pinned.title': 'Spatial memory',
  'v2.mock.node.pinned.body':
    'Pinned answers become nodes. Position = index, relations = edges.',
  'v2.mock.node.idea.title': 'Idea cluster',
  'v2.mock.node.idea.body': 'Group related threads in space.',
  'v2.mock.node.pdf.title': 'research-paper.pdf',
  'v2.mock.node.pdf.preview':
    'Place-cell hypothesis · spatial memory in human cognition…',
  'v2.mock.node.md.title': 'reading-list.md',
  'v2.mock.node.md.preview': 'Books on memory and cognition · 12 items',
};

const ja: Dict = {
  'lang.aria.switcher': '言語',
  'lang.aria.option': '言語を {label} に切り替える',

  'header.aria.home': 'Hypratia ホーム',
  'header.aria.github': 'GitHub の Hypratia',
  'header.title.github': 'GitHub でソースを見る',
  'header.download': 'macOS 版をダウンロード',

  'footer.copy': '© Hypratia · LLM 会話のためのローカルファースト・メモリーキャンバス',
  'footer.github': 'GitHub',
  'footer.download': 'macOS 版をダウンロード',

  'hero.eyebrow': 'Memory Canvas · ベータ版',
  'hero.title.line1': 'あなたの会話に、',
  'hero.title.line2': 'ついに空間を。',
  'hero.sub':
    'Hypratia は、すべての LLM チャットを、再配置・接続・永続化できる無限のキャンバスに変えます — Markdown として、あなたの Mac の中に。',
  'hero.cta.primary': 'macOS 版をダウンロード',
  'hero.cta.secondary': 'ライブデモを試す →',
  'hero.cta.meta': 'ベータ期間中は無料 · Apple Silicon と Intel · macOS 12 以降',

  'stage.aria.preview': 'ライブキャンバスプレビュー',
  'stage.aria.demo': 'Hypratia キャンバスデモ',

  'features.aria': '特長',
  'features.eyebrow': 'なぜ Hypratia なのか',
  'features.title': '整理ではなく、思考のために。',
  'features.localFirst.title': 'ローカルファースト',
  'features.localFirst.desc':
    'すべての会話は、あなたのディスク上のプレーンな Markdown ファイル。オフラインで動作。アカウント不要、クラウドロックインなし。',
  'features.macNative.title': 'Mac ネイティブ',
  'features.macNative.desc':
    '本物のデスクトップアプリ — 約 10 MB、ネイティブウィンドウ・メニューバー・ショートカット。Tauri 2 製。',
  'features.canvas.title': '会話メモリーキャンバス',
  'features.canvas.desc':
    'メッセージを無限のキャンバスにドロップ。延々とスクロールするのではなく、群を作り、つなぎ、再訪する。',

  'how.aria': '使い方',
  'how.eyebrow': '使い方',
  'how.title': '会話とともに育つキャンバス。',
  'how.step1.title': 'いつも通りチャット',
  'how.step1.desc':
    '右ペインでお好みの LLM と対話。API キーは持参 — Claude、GPT、Gemini、Mistral。',
  'how.step2.title': 'キャンバスにドラッグ',
  'how.step2.desc':
    'メッセージを左ペインへ。あなた所有のドラッグ可能な Markdown ノードに変わります。',
  'how.step3.title': '群を作り、つなぐ',
  'how.step3.desc':
    'アイデアを空間に並べ、リンクし、貼り付けたテキストや画像を落とす。思考の地図を構築。',
  'how.step4.title': 'Vault に保存',
  'how.step4.desc':
    'Wikilink 付きの Markdown としてあなたの Obsidian Vault にミラー。ノートはアプリより長生きします。',

  'demo.title': 'ライブデモ',
  'demo.badge.static': '静的 · AI 呼び出しなし',
  'demo.intro':
    'ノードをドラッグできます。「+ メモを追加」で新しい Markdown ノードを作成、またはテキストや画像をそのままキャンバスに貼り付け。すべてブラウザ内で完結 — このページは AI プロバイダーと通信しません。',
  'demo.intro.addMemo': '+ メモを追加',
  'demo.back': '← ホームに戻る',
  'demo.outro':
    'これは Hypratia のごく一部です。Mac アプリにはローカル LLM チャット、Obsidian Vault 連携、添付ファイル、検索などが含まれます。',

  'chat.title': '本日のスレッド',
  'chat.badge': 'デモ · AI 呼び出しなし',
  'chat.badge.title': '静的デモ — API キーもプロバイダー通信もなし',
  'chat.composer.disabled': '入力は無効 — チャットするには Mac アプリをインストール',

  'canvas.addMemo': 'メモを追加',
  'canvas.hint.paste': 'テキストや画像をここにペースト',

  'node.selectAll': 'すべて選択',
  'node.copy': 'コピー',

  'tour.skip': 'ツアーをスキップ',
  'tour.next': '次へ →',
  'tour.gotIt': '了解',
  'tour.step': '{n} / {total}',

  'tour.welcome.title': 'Hypratia へようこそ',
  'tour.welcome.body':
    '会話のためのメモリーキャンバスです。これはライブデモ — AI 呼び出しは発生せず、ブラウザの外には何も出ません。',
  'tour.add.title': 'メモを追加する',
  'tour.add.body':
    '「+ メモを追加」をクリックすると、新しい Markdown ノードがキャンバスに置かれます。自由にドラッグできます。',
  'tour.paste.title': '何でも貼り付け',
  'tour.paste.body':
    '画像をコピーし (Mac なら ⌘⇧4 など)、キャンバス上で ⌘V を押します。テキストはメモに、画像は画像ノードになります。',
  'tour.files.title': 'PDF・PPTX・MD すべて対応',
  'tour.files.body':
    'Mac アプリ本体では、PDF・PowerPoint・Markdown ファイルをキャンバスにドロップできます。Hypratia が解析・インデックス化し、会話に紐付けます。',

  'sample.msg.user1':
    '長い ChatGPT のスレッドだと、アイデアの出どころを見失っていく。空間的に扱える何かが欲しい。',
  'sample.msg.assistant1.title': '位置で記憶するから、空間が効く',
  'sample.msg.assistant1.p1':
    'リニアなチャットは、すべてのアイデアを 1 本のタイムラインに圧縮する。脳はそうではなく、場所で記憶している。',
  'sample.msg.assistant1.p2':
    'メッセージをキャンバスに落としていくと、キャンバスがその会話の地図になる。',
  'sample.msg.user2': 'そうなんだよ — それにオフラインがいい。クラウドノートにはもう疲れた。',
  'sample.msg.assistant2.title': 'ローカルファースト、徹底的に Markdown',
  'sample.msg.assistant2.p1':
    'すべてのノードは Markdown ファイル。Obsidian Vault が真実の源 (source of truth) のまま。',
  'sample.msg.assistant2.p2':
    'Hypratia はそのファイル群を覗くレンズに過ぎない — アプリを消してもノートは残る。',
  'sample.chat.meta': '2 メッセージ · 1 アイデア固定',

  'sample.node.root.title': 'Hypratia の設計',
  'sample.node.root.body':
    'LLM 会話のための空間的メモリー層。ローカルファースト、Mac ネイティブ、Markdown 基盤。',
  'sample.node.local.title': 'ローカルファースト',
  'sample.node.local.body':
    '会話はあなたのマシンのプレーン Markdown に。アカウント不要、クラウドロックインなし。',
  'sample.node.spatial.title': '空間的メモリーキャンバス',
  'sample.node.spatial.body':
    '任意のメッセージを無限キャンバスへ。延々とスクロールするのではなく、群を作り、つなぎ、再訪する。',
  'sample.node.mac.title': 'Tauri 製 Mac ネイティブ',
  'sample.node.mac.body':
    '本物のデスクトップアプリ。バイナリ約 10 MB。ネイティブウィンドウ・メニューバー・ショートカット。',
  'sample.node.notion.title': 'なぜ Notion ではないのか',
  'sample.node.notion.body':
    'Notion はドキュメントのためのもの。Hypratia は思考のためのもの — キャンバスは媒体であって出力ではない。',
  'sample.node.obsidian.title': 'Obsidian 互換',
  'sample.node.obsidian.body':
    'Wikilink 付き Markdown として Vault にエクスポート。ラウンドトリップ安全。ノートはアプリより長生き。',

  'sample.file.pdf.preview':
    '人間の認知における空間記憶: 場所細胞仮説を支持する近年の脳画像研究のレビュー…',
  'sample.file.pdf.meta': '24 ページ · 3 件の引用リンク',
  'sample.file.pptx.preview': 'Q1 ロードマップ · 目標 · マイルストーン · リスク',
  'sample.file.pptx.meta': '12 スライド',
  'sample.file.md.preview':
    '記憶と認知に関する書籍: Sapiens、ファスト&スロー、数学を学ぶ脳…',
  'sample.file.md.meta': '12 件',

  'pasted.note.title': '貼り付けたメモ',
  'pasted.image.title': '貼り付けた画像',
  'new.memo.title': '新しいメモ',
  'new.memo.body': '編集してください。あるいはキャンバスに直接貼り付けてください。',

  // ---------- v2 landing ----------
  'nav.demo': 'デモ',
  'nav.features': '特長',
  'nav.privacy': 'プライバシー',
  'nav.pricing': '料金',
  'nav.github': 'GitHub',
  'nav.download': 'ダウンロード',

  'v2.hero.eyebrow': 'Mac 用 · ローカルファースト · BYOK',
  'v2.hero.headline.l1': 'いちばん大事な AI 会話を、',
  'v2.hero.headline.l2': '失わない場所へ。',
  'v2.hero.sub':
    'Hypratia は会話、ドキュメント、PDF、アイデアを、ローカルファーストの思考キャンバスに変えます。',
  'v2.hero.cta.download': 'macOS 版をダウンロード',
  'v2.hero.cta.demo': 'ライブデモを試す',
  'v2.hero.cta.github': 'GitHub で見る',
  'v2.hero.meta': 'ベータ期間中は無料 · Apple Silicon と Intel · macOS 12 以降',

  'v2.demo.eyebrow': '実際に動かしてみる',
  'v2.demo.title': 'ブラウザで触れる、生きたキャンバス。',
  'v2.demo.sub':
    'インストール不要。右でチャット、左のキャンバスにアイデアが落ちる。Mac アプリでは同じことが、ローカルで起きます。',
  'v2.demo.cta': 'ライブデモを開く',
  'v2.demo.note':
    'ブラウザだけで完結 · サインアップ不要 · APIキー不要',
  'v2.demo.preview.chat': 'Chat',
  'v2.demo.preview.canvas': 'Canvas',

  'v2.features.eyebrow': 'なぜ Hypratia なのか',
  'v2.features.title': '思考を残すための設計。記録のためではなく。',
  'v2.features.spatial.title': 'AI 会話のための空間記憶',
  'v2.features.spatial.desc':
    'いちばん良かった AI との会話を、無限スクロールに飲み込ませない。',
  'v2.features.local.title': 'ローカルファーストのプロジェクト知識',
  'v2.features.local.desc':
    'PDF、Markdown、ノート、メモリーをすべて Mac の中に。',
  'v2.features.byok.title': 'BYOK / プロバイダー自由',
  'v2.features.byok.desc':
    'OpenAI、Anthropic、Google、Mistral、互換プロバイダーまで自由に。',
  'v2.features.export.title': 'Vault へエクスポート',
  'v2.features.export.desc':
    '会話とノードを Markdown として書き出し、Obsidian 流のワークフローへ。',

  'v2.privacy.eyebrow': '設計レベルでのプライバシー',
  'v2.privacy.title': 'あなたの思考を、誰かのクラウドに置かないために。',
  'v2.privacy.body':
    'Hypratia は会話・ノード・プロジェクトファイル・メモリーをすべてローカルに保存します。テレメトリはありません。ネットワーク通信は、設定した AI プロバイダーへの API 通信と任意のアップデート確認に限定されます。',
  'v2.privacy.point.local': '初期値はローカル限定',
  'v2.privacy.point.byok': 'API キーは持参',
  'v2.privacy.point.notelemetry': 'テレメトリゼロ',
  'v2.privacy.point.markdown': 'ディスク上はプレーン Markdown',

  'v2.pricing.eyebrow': '料金',
  'v2.pricing.title': '入り口は 3 つ。',
  'v2.pricing.community.title': 'Community',
  'v2.pricing.community.tagline': '無料 + オープンソースのコア。',
  'v2.pricing.community.cta': '近日公開',
  'v2.pricing.community.bullet1': 'ローカルファーストのキャンバス + チャット',
  'v2.pricing.community.bullet2': '主要プロバイダーすべての BYOK',
  'v2.pricing.community.bullet3': 'Vault への Markdown エクスポート',
  'v2.pricing.founder.title': 'Founder',
  'v2.pricing.founder.tagline':
    'Hypratia 1.x Pro 機能のための、買い切り早期支援者ライセンス。',
  'v2.pricing.founder.cta': 'ウェイトリストに登録',
  'v2.pricing.founder.bullet1': '1.x の Pro を生涯利用',
  'v2.pricing.founder.bullet2': 'Founder バッジ + ロードマップへの意見',
  'v2.pricing.founder.bullet3': '優先サポート',
  'v2.pricing.pro.title': 'Pro',
  'v2.pricing.pro.tagline':
    '高度なローカル AI ワークフロー、公式ビルド、早期アクセス機能。',
  'v2.pricing.pro.cta': 'ウェイトリストに登録',
  'v2.pricing.pro.bullet1': 'ローカル埋め込み + 意味検索',
  'v2.pricing.pro.bullet2': '高度な引用 / PDF ツーリング',
  'v2.pricing.pro.bullet3': '新パイプラインへの早期アクセス',
  'v2.pricing.popular': '人気',

  'v2.finalcta.title': '思考が帰ってこられる場所をつくる。',
  'v2.finalcta.sub':
    '本当に考えていた糸を、ちゃんと残してくれる静かなデスクトップアプリ。',
  'v2.finalcta.download': 'macOS 版をダウンロード',
  'v2.finalcta.demo': 'ライブデモを試す',
  'v2.finalcta.github': 'GitHub でスター',

  'v2.footer.tagline': 'LLM 会話のためのローカルファースト・メモリーキャンバス',
  'v2.footer.section.product': 'プロダクト',
  'v2.footer.section.resources': 'リソース',
  'v2.footer.section.legal': '規約',
  'v2.footer.link.demo': 'ライブデモ',
  'v2.footer.link.changelog': 'Changelog',
  'v2.footer.link.docs': 'ドキュメント',
  'v2.footer.link.privacy': 'プライバシー',
  'v2.footer.link.license': 'MIT ライセンス',

  'v2.mock.chat.title': 'プロジェクト · Hypratia 設計',
  'v2.mock.chat.user1': 'キャンバスはどうやって文脈を覚えるべき？',
  'v2.mock.chat.assistant1':
    '固定された回答をノード扱いに。位置がインデックス、関係がエッジ。',
  'v2.mock.chat.user2': 'この回答を固定しておいて。',
  'v2.mock.chat.assistant2':
    '固定しました。キャンバスにノードとして残ります — ドラッグ、PDF とリンク、Vault へエクスポートが可能。',
  'v2.mock.toast.export': 'Obsidian Vault に書き出しました',
  'v2.mock.node.pinned.title': '空間記憶',
  'v2.mock.node.pinned.body':
    '固定された回答はノードに。位置 = インデックス、関係 = エッジ。',
  'v2.mock.node.idea.title': 'アイデア群',
  'v2.mock.node.idea.body': '関連スレッドを空間でグルーピング。',
  'v2.mock.node.pdf.title': 'research-paper.pdf',
  'v2.mock.node.pdf.preview':
    '場所細胞仮説 · 人間の認知における空間記憶…',
  'v2.mock.node.md.title': 'reading-list.md',
  'v2.mock.node.md.preview': '記憶と認知の書籍 · 12 件',
};

const zh: Dict = {
  'lang.aria.switcher': '语言',
  'lang.aria.option': '将语言切换为 {label}',

  'header.aria.home': 'Hypratia 首页',
  'header.aria.github': 'GitHub 上的 Hypratia',
  'header.title.github': '在 GitHub 查看源码',
  'header.download': '下载 macOS 版',

  'footer.copy': '© Hypratia · 面向 LLM 对话的本地优先记忆画布',
  'footer.github': 'GitHub',
  'footer.download': '下载 macOS 版',

  'hero.eyebrow': 'Memory Canvas · 测试版',
  'hero.title.line1': '让你的对话，',
  'hero.title.line2': '终于有了空间。',
  'hero.sub':
    'Hypratia 把每一段 LLM 对话变成可重新排列、连接和永久保存的无限画布 — 以 Markdown 形式，存在你的 Mac 上。',
  'hero.cta.primary': '下载 macOS 版',
  'hero.cta.secondary': '试用在线演示 →',
  'hero.cta.meta': '测试期间免费 · Apple Silicon 与 Intel · macOS 12 及以上',

  'stage.aria.preview': '实时画布预览',
  'stage.aria.demo': 'Hypratia 画布演示',

  'features.aria': '特性',
  'features.eyebrow': '为什么选 Hypratia',
  'features.title': '为思考而生，不是为归档。',
  'features.localFirst.title': '本地优先',
  'features.localFirst.desc':
    '每段对话都是你磁盘上的纯 Markdown 文件。离线可用。无需账号，不绑定云端。',
  'features.macNative.title': 'Mac 原生',
  'features.macNative.desc':
    '真正的桌面应用 — 约 10 MB，原生窗口、菜单栏、快捷键。基于 Tauri 2 构建。',
  'features.canvas.title': '对话记忆画布',
  'features.canvas.desc':
    '把消息拖到无限画布上。聚集、连接、重访 — 告别没完没了的滚动。',

  'how.aria': '工作原理',
  'how.eyebrow': '工作原理',
  'how.title': '随对话生长的画布。',
  'how.step1.title': '正常聊天',
  'how.step1.desc':
    '在右栏与你喜欢的 LLM 对话。自带 API 密钥 — Claude、GPT、Gemini、Mistral。',
  'how.step2.title': '拖到画布',
  'how.step2.desc':
    '把消息拖入左栏。它会变成你拥有的可拖动 Markdown 节点。',
  'how.step3.title': '聚集与连接',
  'how.step3.desc':
    '在空间中排布想法、建立链接、粘贴文本或图片。构建思考的地图。',
  'how.step4.title': '保存到你的库',
  'how.step4.desc':
    '全部以带 wikilink 的 Markdown 镜像到你的 Obsidian 库。你的笔记比应用活得更久。',

  'demo.title': '在线演示',
  'demo.badge.static': '静态 · 无 AI 调用',
  'demo.intro':
    '可以拖动节点。点击 + 添加备忘新建 Markdown 节点，或直接将文本/图片粘贴到画布。所有操作都在浏览器内完成 — 本页不会联系任何 AI 服务商。',
  'demo.intro.addMemo': '+ 添加备忘',
  'demo.back': '← 返回首页',
  'demo.outro':
    '这只是 Hypratia 的一小部分。Mac 应用还包含本地 LLM 聊天、完整的 Obsidian 库、附件、搜索等更多功能。',

  'chat.title': '今天的对话',
  'chat.badge': '演示 · 无 AI 调用',
  'chat.badge.title': '静态演示 — 无 API 密钥，无任何服务商调用',
  'chat.composer.disabled': '输入已禁用 — 安装 Mac 应用以开始聊天',

  'canvas.addMemo': '添加备忘',
  'canvas.hint.paste': '在此粘贴文本或图片',

  'node.selectAll': '全选',
  'node.copy': '复制',

  'tour.skip': '跳过引导',
  'tour.next': '下一步 →',
  'tour.gotIt': '明白了',
  'tour.step': '第 {n} / {total} 步',

  'tour.welcome.title': '欢迎使用 Hypratia',
  'tour.welcome.body':
    '为对话而生的记忆画布。这是一个在线演示 — 不会发起 AI 调用，也不会向外发送任何数据。',
  'tour.add.title': '添加备忘',
  'tour.add.body':
    '点击 + 添加备忘 在画布上放下一个新的 Markdown 节点。可以拖到任意位置。',
  'tour.paste.title': '粘贴任何内容',
  'tour.paste.body':
    '复制任意图片 (Mac 上可用 ⌘⇧4)，然后在画布上按 ⌘V。粘贴文本变成备忘节点，粘贴图片变成图片节点。',
  'tour.files.title': '支持 PDF、PPTX、MD',
  'tour.files.body':
    '在 Mac 应用中，可以把 PDF、PowerPoint、Markdown 文件直接拖到画布上。Hypratia 会解析、建立索引，并与你的对话相互连接。',

  'sample.msg.user1':
    '在长 ChatGPT 对话里，我经常忘了某个想法是从哪冒出来的。要是能空间化处理就好了。',
  'sample.msg.assistant1.title': '空间有效，是因为提取本质上就是位置性的',
  'sample.msg.assistant1.p1':
    '线性聊天会把所有想法压成一条时间线。但大脑不是这样存信息的 — 它把信息存在「位置」里。',
  'sample.msg.assistant1.p2':
    '一边对话一边把消息拖到画布上，画布就成了这段对话的地图。',
  'sample.msg.user2': '对 — 而且我想要离线版本。云笔记我已经受够了。',
  'sample.msg.assistant2.title': '本地优先，全程 Markdown',
  'sample.msg.assistant2.p1':
    '每个节点都是一份 Markdown 文件。你的 Obsidian 库始终是单一的事实来源。',
  'sample.msg.assistant2.p2':
    'Hypratia 只是这些文件之上的一层视图 — 即使删掉应用，你的笔记也还属于你。',
  'sample.chat.meta': '2 条消息 · 已置顶 1 个想法',

  'sample.node.root.title': '设计 Hypratia',
  'sample.node.root.body':
    '面向 LLM 对话的空间化记忆层。本地优先、Mac 原生、以 Markdown 为底座。',
  'sample.node.local.title': '本地优先',
  'sample.node.local.body':
    '对话存在你自己的电脑上，纯 Markdown。无账号，不锁定云端。',
  'sample.node.spatial.title': '空间化记忆画布',
  'sample.node.spatial.body':
    '把任意消息拖到无限画布。聚集、连接、重访 — 而不是无止境地滚动。',
  'sample.node.mac.title': '基于 Tauri 的 Mac 原生应用',
  'sample.node.mac.body':
    '真正的桌面应用。二进制约 10 MB。原生窗口、菜单栏、快捷键。',
  'sample.node.notion.title': '为什么不是 Notion？',
  'sample.node.notion.body':
    'Notion 是给文档用的。Hypratia 是给思考用的 — 画布是媒介，而不是产物。',
  'sample.node.obsidian.title': '兼容 Obsidian',
  'sample.node.obsidian.body':
    '以带 wikilink 的 Markdown 导出到你的库。可往返同步。笔记比应用活得更久。',

  'sample.file.pdf.preview':
    '人类认知中的空间记忆：近期支持位置细胞假说的脑成像证据综述……',
  'sample.file.pdf.meta': '24 页 · 关联 3 处引用',
  'sample.file.pptx.preview': 'Q1 路线图 · 目标 · 里程碑 · 风险',
  'sample.file.pptx.meta': '12 张幻灯片',
  'sample.file.md.preview':
    '关于记忆与认知的书：人类简史、思考快与慢、A Mind for Numbers……',
  'sample.file.md.meta': '12 项',

  'pasted.note.title': '粘贴的备忘',
  'pasted.image.title': '粘贴的图片',
  'new.memo.title': '新建备忘',
  'new.memo.body': '编辑此处，或直接将内容粘贴到画布上。',

  // ---------- v2 landing ----------
  'nav.demo': '演示',
  'nav.features': '特性',
  'nav.privacy': '隐私',
  'nav.pricing': '价格',
  'nav.github': 'GitHub',
  'nav.download': '下载',

  'v2.hero.eyebrow': 'macOS 专属 · 本地优先 · BYOK',
  'v2.hero.headline.l1': '别让最好的 AI 对话',
  'v2.hero.headline.l2': '从你身边消失。',
  'v2.hero.sub':
    'Hypratia 把对话、文档、PDF 与想法变成本地优先的思考画布。',
  'v2.hero.cta.download': '下载 macOS 版',
  'v2.hero.cta.demo': '试试在线演示',
  'v2.hero.cta.github': '在 GitHub 查看',
  'v2.hero.meta': '测试期间免费 · Apple Silicon 与 Intel · macOS 12 及以上',

  'v2.demo.eyebrow': '亲手体验',
  'v2.demo.title': '在浏览器里就能驾驶的画布。',
  'v2.demo.sub':
    '免安装演示：右侧聊天，左侧画布上落下想法。Mac 应用以同样的方式，在本地完成。',
  'v2.demo.cta': '打开在线演示',
  'v2.demo.note': '完全在浏览器中运行 · 无需注册 · 无需 API Key',
  'v2.demo.preview.chat': 'Chat',
  'v2.demo.preview.canvas': 'Canvas',

  'v2.features.eyebrow': '为什么选 Hypratia',
  'v2.features.title': '设计目的：留住思考，而不是抓取它。',
  'v2.features.spatial.title': 'AI 对话的空间化记忆',
  'v2.features.spatial.desc':
    '最好的 AI 对话，不该消失在无限滚动里。',
  'v2.features.local.title': '本地优先的项目知识',
  'v2.features.local.desc':
    'PDF、Markdown、笔记、记忆——全部留在你的 Mac 上。',
  'v2.features.byok.title': 'BYOK 与服务商自由',
  'v2.features.byok.desc':
    'OpenAI、Anthropic、Google、Mistral 或你自己的兼容服务商，随你选。',
  'v2.features.export.title': '导出到你的库',
  'v2.features.export.desc':
    '把对话与节点导出为 Markdown，融入 Obsidian 风格的工作流。',

  'v2.privacy.eyebrow': '架构层面的隐私',
  'v2.privacy.title': '你的思考不该住在别人的云里。',
  'v2.privacy.body':
    'Hypratia 把对话、节点、项目文件和记忆都存在本地。无遥测。仅与你配置的 AI 服务商和可选的更新检查通信。',
  'v2.privacy.point.local': '默认本地存储',
  'v2.privacy.point.byok': '自带 API 密钥',
  'v2.privacy.point.notelemetry': '零遥测',
  'v2.privacy.point.markdown': '磁盘上是纯 Markdown',

  'v2.pricing.eyebrow': '价格',
  'v2.pricing.title': '三条入口。',
  'v2.pricing.community.title': 'Community',
  'v2.pricing.community.tagline': '免费、开源的核心。',
  'v2.pricing.community.cta': '即将推出',
  'v2.pricing.community.bullet1': '本地优先的画布 + 聊天',
  'v2.pricing.community.bullet2': '主流服务商 BYOK',
  'v2.pricing.community.bullet3': '导出到你的 Markdown 库',
  'v2.pricing.founder.title': 'Founder',
  'v2.pricing.founder.tagline':
    '一次性早期支持者授权，含 Hypratia 1.x Pro 功能。',
  'v2.pricing.founder.cta': '加入候补名单',
  'v2.pricing.founder.bullet1': '1.x 全程 Pro',
  'v2.pricing.founder.bullet2': 'Founder 徽章 + 路线图发言权',
  'v2.pricing.founder.bullet3': '优先支持',
  'v2.pricing.pro.title': 'Pro',
  'v2.pricing.pro.tagline':
    '高级本地 AI 工作流、官方构建、抢先体验功能。',
  'v2.pricing.pro.cta': '加入候补名单',
  'v2.pricing.pro.bullet1': '本地嵌入与语义检索',
  'v2.pricing.pro.bullet2': '高级引用与 PDF 工具',
  'v2.pricing.pro.bullet3': '新管线抢先体验',
  'v2.pricing.popular': '热门',

  'v2.finalcta.title': '为思考造一个能回去的地方。',
  'v2.finalcta.sub':
    '一个安静的桌面应用，留住你真正在思考的那条线索。',
  'v2.finalcta.download': '下载 macOS 版',
  'v2.finalcta.demo': '试试在线演示',
  'v2.finalcta.github': '在 GitHub 上 Star',

  'v2.footer.tagline': '面向 LLM 对话的本地优先记忆画布',
  'v2.footer.section.product': '产品',
  'v2.footer.section.resources': '资源',
  'v2.footer.section.legal': '法律',
  'v2.footer.link.demo': '在线演示',
  'v2.footer.link.changelog': '更新记录',
  'v2.footer.link.docs': '文档',
  'v2.footer.link.privacy': '隐私',
  'v2.footer.link.license': 'MIT 许可证',

  'v2.mock.chat.title': '项目 · Hypratia 设计',
  'v2.mock.chat.user1': '画布该怎么记住上下文？',
  'v2.mock.chat.assistant1':
    '把每一条置顶回答当作节点。位置就是索引，关系就是边。',
  'v2.mock.chat.user2': '把这条置顶。',
  'v2.mock.chat.assistant2':
    '已置顶。它现在停在画布上 — 拖到任意位置、链接到 PDF、导出到你的库。',
  'v2.mock.toast.export': '已导出到 Obsidian 库',
  'v2.mock.node.pinned.title': '空间化记忆',
  'v2.mock.node.pinned.body':
    '置顶回答变成节点。位置 = 索引，关系 = 边。',
  'v2.mock.node.idea.title': '想法簇',
  'v2.mock.node.idea.body': '在空间中聚集相关线程。',
  'v2.mock.node.pdf.title': 'research-paper.pdf',
  'v2.mock.node.pdf.preview': '位置细胞假说 · 人类认知中的空间记忆…',
  'v2.mock.node.md.title': 'reading-list.md',
  'v2.mock.node.md.preview': '关于记忆与认知的书 · 12 项',
};

const dicts: Record<Locale, Dict> = { en, ja, zh };

export function translate(locale: Locale, key: string): string {
  return dicts[locale][key] ?? dicts.en[key] ?? key;
}

export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Detect locale from URL `?lang=`, then localStorage, then `navigator.language`. */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get('lang');
    if (isLocale(fromUrl)) return fromUrl;
  } catch {
    /* ignore */
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  const lang = (window.navigator.language || 'en').toLowerCase();
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('zh')) return 'zh';
  return 'en';
}

export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
  }
}
