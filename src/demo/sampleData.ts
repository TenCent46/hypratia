import type { Edge } from '@xyflow/react';
import type { DemoMemoNodeType } from './DemoMemoNode';
import type { DemoImageNodeType } from './DemoImageNode';

export type DemoNode = DemoMemoNodeType | DemoImageNodeType;

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
];

export const initialEdges: Edge[] = [
  { id: 'e-root-local', source: 'root', target: 'local-first' },
  { id: 'e-root-spatial', source: 'root', target: 'spatial' },
  { id: 'e-root-mac', source: 'root', target: 'mac-native' },
  { id: 'e-spatial-notion', source: 'spatial', target: 'why-not-notion' },
  { id: 'e-local-obsidian', source: 'local-first', target: 'obsidian' },
];
