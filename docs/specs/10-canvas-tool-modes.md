# 10 — Canvas Tool Modes

## Purpose

Make the canvas interaction mode explicit so users can choose whether pointer
drags manipulate canvas objects or the viewport camera.

## Model

```ts
type CanvasTool = 'select' | 'hand';
```

`CanvasTool` is UI state. It is not a node, edge, or viewport property.

## Tools

- Select Tool (`V`): default pointer cursor. Selects nodes and edges, drags nodes,
  starts marquee selection from empty canvas, and leaves cards/edges interactive.
- Hand Tool (`H`): grab cursor. Pointer drag moves the visible viewport. Nodes are
  not draggable and the marquee selector does not start.

## Acceptance

1. Pressing `V` switches to Select Tool.
2. Pressing `H` switches to Hand Tool.
3. In Select Tool, existing node dragging, marquee selection, edge/card
   interaction, zooming, and dropping still work.
4. In Hand Tool, dragging on the canvas or a node moves the viewport and does not
   drag nodes.
5. The command palette exposes `Select Tool` and `Hand Tool`.
