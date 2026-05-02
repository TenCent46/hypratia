import type { Edge } from '@xyflow/react';
import type { DemoMemoNodeType } from './DemoMemoNode';
import type { DemoImageNodeType } from './DemoImageNode';
import type { DemoFileNodeType } from './DemoFileNode';

export type DemoNode = DemoMemoNodeType | DemoImageNodeType | DemoFileNodeType;

export const initialNodes: DemoNode[] = [
  {
    id: 'root',
    type: 'memo',
    position: { x: 260, y: 20 },
    style: { width: 260, height: 120 },
    data: {
      title: 'Designing Hypratia',
      body: 'A spatial memory layer for LLM conversations. Local-first, Mac-native, Markdown-backed.',
    },
  },
  {
    id: 'local-first',
    type: 'memo',
    position: { x: -40, y: 220 },
    style: { width: 240, height: 130 },
    data: {
      title: 'Local-first',
      body: 'Your conversations live on your machine, in plain Markdown. No accounts. No cloud lock-in.',
    },
  },
  {
    id: 'spatial',
    type: 'memo',
    position: { x: 260, y: 220 },
    style: { width: 240, height: 130 },
    data: {
      title: 'Spatial memory canvas',
      body: 'Pull any message onto an infinite canvas. Cluster, connect, revisit — instead of scrolling forever.',
    },
  },
  {
    id: 'mac-native',
    type: 'memo',
    position: { x: 560, y: 220 },
    style: { width: 240, height: 130 },
    data: {
      title: 'Mac-native via Tauri',
      body: 'A real desktop app. ~10 MB binary. Native windowing, menubar, shortcuts.',
    },
  },
  {
    id: 'why-not-notion',
    type: 'memo',
    position: { x: 560, y: 410 },
    style: { width: 240, height: 130 },
    data: {
      title: 'Why not Notion?',
      body: 'Notion is for documents. Hypratia is for thinking — the canvas is the medium, not the output.',
    },
  },
  {
    id: 'obsidian',
    type: 'memo',
    position: { x: -40, y: 410 },
    style: { width: 240, height: 130 },
    data: {
      title: 'Obsidian-compatible',
      body: 'Export to your vault as Markdown with wikilinks. Round-trip safe. Your notes outlive the app.',
    },
  },
  // ---------- File nodes — demonstrate that PDF / PPTX / MD all become spatial ----------
  {
    id: 'pdf-research',
    type: 'file',
    position: { x: 880, y: 20 },
    style: { width: 260, height: 160 },
    data: {
      type: 'pdf',
      filename: 'research-paper.pdf',
      preview:
        'Spatial memory in human cognition: a review of recent neuroimaging evidence supporting the place-cell hypothesis…',
      meta: '24 pages · 3 citations linked',
    },
  },
  {
    id: 'pptx-deck',
    type: 'file',
    position: { x: 880, y: 220 },
    style: { width: 260, height: 160 },
    data: {
      type: 'pptx',
      filename: 'q1-roadmap.pptx',
      preview: 'Q1 roadmap · objectives · milestones · risks',
      meta: '12 slides',
    },
  },
  {
    id: 'md-reading-list',
    type: 'file',
    position: { x: 880, y: 420 },
    style: { width: 260, height: 160 },
    data: {
      type: 'md',
      filename: 'reading-list.md',
      preview:
        'Books on memory and cognition: Sapiens, Thinking Fast & Slow, A Mind for Numbers…',
      meta: '12 items',
    },
  },
];

export const initialEdges: Edge[] = [
  { id: 'e-root-local', source: 'root', target: 'local-first' },
  { id: 'e-root-spatial', source: 'root', target: 'spatial' },
  { id: 'e-root-mac', source: 'root', target: 'mac-native' },
  { id: 'e-spatial-notion', source: 'spatial', target: 'why-not-notion' },
  { id: 'e-local-obsidian', source: 'local-first', target: 'obsidian' },
  { id: 'e-spatial-pdf', source: 'spatial', target: 'pdf-research' },
  { id: 'e-spatial-pptx', source: 'spatial', target: 'pptx-deck' },
  { id: 'e-obsidian-md', source: 'obsidian', target: 'md-reading-list' },
];
