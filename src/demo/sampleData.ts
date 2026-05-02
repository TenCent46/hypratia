import type { Edge } from '@xyflow/react';
import type { DemoMemoNodeType } from './DemoMemoNode';
import type { DemoImageNodeType } from './DemoImageNode';
import type { DemoFileNodeType } from './DemoFileNode';

export type DemoNode = DemoMemoNodeType | DemoImageNodeType | DemoFileNodeType;

/**
 * Sample canvas state. String fields use i18n keys (resolved by the node
 * components via `useLocale().t(key)`), so changing the language updates
 * every existing node in place.
 */
export const initialNodes: DemoNode[] = [
  {
    id: 'root',
    type: 'memo',
    position: { x: 260, y: 20 },
    style: { width: 260, height: 120 },
    data: {
      titleKey: 'sample.node.root.title',
      bodyKey: 'sample.node.root.body',
    },
  },
  {
    id: 'local-first',
    type: 'memo',
    position: { x: -40, y: 220 },
    style: { width: 240, height: 130 },
    data: {
      titleKey: 'sample.node.local.title',
      bodyKey: 'sample.node.local.body',
    },
  },
  {
    id: 'spatial',
    type: 'memo',
    position: { x: 260, y: 220 },
    style: { width: 240, height: 130 },
    data: {
      titleKey: 'sample.node.spatial.title',
      bodyKey: 'sample.node.spatial.body',
    },
  },
  {
    id: 'mac-native',
    type: 'memo',
    position: { x: 560, y: 220 },
    style: { width: 240, height: 130 },
    data: {
      titleKey: 'sample.node.mac.title',
      bodyKey: 'sample.node.mac.body',
    },
  },
  {
    id: 'why-not-notion',
    type: 'memo',
    position: { x: 560, y: 410 },
    style: { width: 240, height: 130 },
    data: {
      titleKey: 'sample.node.notion.title',
      bodyKey: 'sample.node.notion.body',
    },
  },
  {
    id: 'obsidian',
    type: 'memo',
    position: { x: -40, y: 410 },
    style: { width: 240, height: 130 },
    data: {
      titleKey: 'sample.node.obsidian.title',
      bodyKey: 'sample.node.obsidian.body',
    },
  },
  {
    id: 'pdf-research',
    type: 'file',
    position: { x: 880, y: 20 },
    style: { width: 260, height: 160 },
    data: {
      type: 'pdf',
      filename: 'research-paper.pdf',
      previewKey: 'sample.file.pdf.preview',
      metaKey: 'sample.file.pdf.meta',
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
      previewKey: 'sample.file.pptx.preview',
      metaKey: 'sample.file.pptx.meta',
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
      previewKey: 'sample.file.md.preview',
      metaKey: 'sample.file.md.meta',
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
