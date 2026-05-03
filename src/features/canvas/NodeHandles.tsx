import { Handle, Position } from '@xyflow/react';

const SIDES: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: 't' },
  { pos: Position.Right, key: 'r' },
  { pos: Position.Bottom, key: 'b' },
  { pos: Position.Left, key: 'l' },
];

/**
 * Renders exactly 4 handles per node — one centered on each side. The canvas
 * runs in `ConnectionMode.Loose`, which lets every handle act as both source
 * and target, so a single handle per side is enough. With
 * `connectionRadius={60}` and the larger hit-area in `.mc-handle::before`, the
 * user does not need to land on the dot to connect.
 */
export function NodeHandles() {
  return (
    <>
      {SIDES.map((s) => (
        <Handle
          key={`h-${s.key}`}
          id={`h-${s.key}`}
          type="source"
          position={s.pos}
          className="mc-handle"
        />
      ))}
    </>
  );
}
