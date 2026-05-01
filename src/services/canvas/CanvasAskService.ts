import type { ID } from '../../types';
import {
  resolveMarkdownContext,
  type MarkdownContextPacket,
} from '../markdown/MarkdownContextResolver';

export async function buildCanvasAskContext(input: {
  nodeIds: ID[];
  edgeIds: ID[];
}): Promise<MarkdownContextPacket> {
  return await resolveMarkdownContext(input.nodeIds, input.edgeIds);
}
