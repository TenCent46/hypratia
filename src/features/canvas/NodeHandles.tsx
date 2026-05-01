import { Handle, Position } from '@xyflow/react';

const SIDES: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: 't' },
  { pos: Position.Right, key: 'r' },
  { pos: Position.Bottom, key: 'b' },
  { pos: Position.Left, key: 'l' },
];

/**
 * Renders 8 handles per node (4 sides × source + target with distinct ids),
 * so connections can be drawn from or into any side.
 */
export function NodeHandles() {
  return (
    <>
      {SIDES.map((s) => (
        <Handle
          key={`src-${s.key}`}
          id={`s-${s.key}`}
          type="source"
          position={s.pos}
          className="mc-handle"
        />
      ))}
      {SIDES.map((s) => (
        <Handle
          key={`tgt-${s.key}`}
          id={`t-${s.key}`}
          type="target"
          position={s.pos}
          className="mc-handle"
        />
      ))}
    </>
  );
}
