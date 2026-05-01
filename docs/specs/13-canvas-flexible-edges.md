# 13 — Canvas Flexible Edges

## Purpose

Edges should feel spatial and natural. The connection point should depend on
node positions instead of being locked to a small fixed set of directions.

## Current System

The canvas uses React Flow nodes and edges. Node handles currently provide
fixed connection affordances for manual linking.

## Preferred Rendering

For rendered edges, calculate endpoints from the line between node centers:

1. Compute source node rectangle and target node rectangle.
2. Draw a line between their centers.
3. Intersect that line with each rectangle boundary.
4. Use those boundary points as edge endpoints.

## Ask Edges

Ask-generated edges initially connect source node to answer node using the same
dynamic boundary logic. Marker-level anchors are future work.

## Acceptance

1. Existing edge data still works.
2. Moving nodes updates edge endpoints naturally.
3. Ask-generated edges connect source and answer nodes cleanly.
4. Manual fixed handles can remain for connection creation if needed.
