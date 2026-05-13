import { describe, it, expect } from 'vitest';
import type { Connection, Edge, Node } from 'reactflow';
import { getConnectionGuardValidation } from './connectionGuards';

function createNode(id: string, blockType: string, blockCategory: 'action' | 'control'): Node {
  return {
    id,
    type: 'blockNode',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      blockType,
      blockCategory,
    },
  } as never;
}

describe('getConnectionGuardValidation', () => {
  it('blocks default outgoing connections from condition nodes', () => {
    const validation = getConnectionGuardValidation(
      { source: 'condition-1', target: 'next-1' } as Connection,
      [
        createNode('condition-1', 'condition', 'control'),
        createNode('next-1', 'click', 'action'),
      ],
      []
    );

    expect(validation?.code).toBe('CONDITION_DEFAULT_OUTGOING_UNSUPPORTED');
  });

  it('blocks subchains from condition branch nodes', () => {
    const validation = getConnectionGuardValidation(
      { source: 'branch-1', target: 'after-1' } as Connection,
      [
        createNode('condition-1', 'condition', 'control'),
        createNode('branch-1', 'click', 'action'),
        createNode('after-1', 'wait_time', 'action'),
      ],
      [{ id: 'edge-1', source: 'condition-1', target: 'branch-1', sourceHandle: 'true' } as Edge]
    );

    expect(validation?.code).toBe('CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED');
  });

  it('blocks subchains from loop child nodes', () => {
    const validation = getConnectionGuardValidation(
      { source: 'loop-child-1', target: 'after-1' } as Connection,
      [
        createNode('loop-1', 'loop', 'control'),
        createNode('loop-child-1', 'click', 'action'),
        createNode('after-1', 'wait_time', 'action'),
      ],
      [{ id: 'edge-1', source: 'loop-1', target: 'loop-child-1' } as Edge]
    );

    expect(validation?.code).toBe('LOOP_SUBCHAIN_UNSUPPORTED');
  });

  it('allows supported condition branch connections', () => {
    const validation = getConnectionGuardValidation(
      { source: 'condition-1', target: 'branch-1', sourceHandle: 'true' } as Connection,
      [
        createNode('condition-1', 'condition', 'control'),
        createNode('branch-1', 'click', 'action'),
      ],
      []
    );

    expect(validation).toBeNull();
  });
});
