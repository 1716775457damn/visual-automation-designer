import type { Connection, Edge, Node } from 'reactflow';
import type { BlockNodeData } from '../components/FlowEditor/BlockNode';
import { formatValidationResponse } from './formatValidationMessage';
import type { ValidationErrorResponse } from '../tauri/flow';

function isConditionNode(node: Node<BlockNodeData> | undefined): boolean {
  return node?.data?.blockCategory === 'control' && node.data.blockType === 'condition';
}

function isLoopNode(node: Node<BlockNodeData> | undefined): boolean {
  return node?.data?.blockCategory === 'control'
    && (node.data.blockType === 'loop' || node.data.blockType === 'loop_infinite');
}

export function getConnectionGuardValidation(
  connection: Connection,
  nodes: Node<BlockNodeData>[],
  edges: Edge[]
): ValidationErrorResponse | null {
  const sourceId = connection.source;
  if (!sourceId) {
    return null;
  }

  const sourceNode = nodes.find((node) => node.id === sourceId);

  if (isConditionNode(sourceNode) && connection.sourceHandle !== 'true' && connection.sourceHandle !== 'false') {
    return formatValidationResponse({
      code: 'CONDITION_DEFAULT_OUTGOING_UNSUPPORTED',
      message: 'Condition default outgoing edges are unsupported',
      blockId: sourceId,
    });
  }

  const conditionBranchParent = edges.find((edge) =>
    edge.target === sourceId && (edge.sourceHandle === 'true' || edge.sourceHandle === 'false')
  );

  if (conditionBranchParent) {
    return formatValidationResponse({
      code: 'CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED',
      message: 'Condition branch subchains are unsupported',
      blockId: conditionBranchParent.source,
    });
  }

  const loopChildParent = edges.find((edge) => {
    if (edge.target !== sourceId) {
      return false;
    }

    const parentNode = nodes.find((node) => node.id === edge.source);
    return isLoopNode(parentNode);
  });

  if (loopChildParent) {
    return formatValidationResponse({
      code: 'LOOP_SUBCHAIN_UNSUPPORTED',
      message: 'Loop subchains are unsupported',
      blockId: loopChildParent.source,
    });
  }

  return null;
}
