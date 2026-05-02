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
