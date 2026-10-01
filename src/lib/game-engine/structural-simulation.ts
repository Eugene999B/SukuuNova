export type StructuralNode = {
  id: string;
  x: number;
  y: number;
  fixedX?: boolean;
  fixedY?: boolean;
  loadX?: number;
  loadY?: number;
};

export type StructuralMember = {
  id: string;
  nodeA: string;
  nodeB: string;
  area: number;
  youngModulus: number;
  yieldStrength: number;
};

export type StructuralModel = {
  nodes: StructuralNode[];
  members: StructuralMember[];
};

export type StructuralVector = { x: number; y: number };

export type StructuralMemberResult = {
  memberId: string;
  length: number;
  strain: number;
  stress: number;
  axialForce: number;
  utilization: number;
  failed: boolean;
  mode: "tension" | "compression" | "neutral";
};

export type StructuralSimulationResult = {
  stable: boolean;
  errors: string[];
  displacements: Record<string, StructuralVector>;
  reactions: Record<string, StructuralVector>;
  members: StructuralMemberResult[];
  maxUtilization: number;
  failedMemberIds: string[];
};

const EPSILON = 1e-10;

function zeroMatrix(size: number) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}

function cloneMatrix(matrix: number[][]) {
  return matrix.map((row) => [...row]);
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const n = vector.length;
  const a = cloneMatrix(matrix);
  const b = [...vector];

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    let pivotMagnitude = Math.abs(a[column][column]);
    for (let row = column + 1; row < n; row += 1) {
      const magnitude = Math.abs(a[row][column]);
      if (magnitude > pivotMagnitude) {
        pivotMagnitude = magnitude;
        pivotRow = row;
      }
    }
    if (pivotMagnitude < EPSILON) throw new Error("unstable_or_singular_structure");

    if (pivotRow !== column) {
      [a[column], a[pivotRow]] = [a[pivotRow], a[column]];
      [b[column], b[pivotRow]] = [b[pivotRow], b[column]];
    }

    const pivot = a[column][column];
    for (let row = column + 1; row < n; row += 1) {
      const factor = a[row][column] / pivot;
      if (Math.abs(factor) < EPSILON) continue;
      a[row][column] = 0;
      for (let inner = column + 1; inner < n; inner += 1) a[row][inner] -= factor * a[column][inner];
      b[row] -= factor * b[column];
    }
  }

  const solution = Array.from({ length: n }, () => 0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let remainder = b[row];
    for (let column = row + 1; column < n; column += 1) remainder -= a[row][column] * solution[column];
    const diagonal = a[row][row];
    if (Math.abs(diagonal) < EPSILON) throw new Error("unstable_or_singular_structure");
    solution[row] = remainder / diagonal;
  }
  return solution;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => row.reduce((total, value, index) => total + value * vector[index], 0));
}

function emptyResult(errors: string[]): StructuralSimulationResult {
  return {
    stable: false,
    errors,
    displacements: {},
    reactions: {},
    members: [],
    maxUtilization: 0,
    failedMemberIds: [],
  };
}

/**
 * Small-displacement 2D pin-jointed truss analysis using the direct stiffness
 * method. Units are intentionally not hard-coded: callers should use one
 * consistent unit system (SI is recommended).
 *
 * This is appropriate for an educational build/test/redesign game loop. It is
 * not a replacement for professional structural engineering software.
 */
export function simulateTruss(model: StructuralModel): StructuralSimulationResult {
  if (model.nodes.length < 2) return emptyResult(["at_least_two_nodes_required"]);
  if (!model.members.length) return emptyResult(["at_least_one_member_required"]);
  if (model.nodes.length > 120) return emptyResult(["model_too_large_for_learning_simulation"]);

  const nodeIndex = new Map<string, number>();
  const errors: string[] = [];
  model.nodes.forEach((node, index) => {
    if (!node.id.trim() || nodeIndex.has(node.id)) errors.push(`invalid_or_duplicate_node:${node.id}`);
    nodeIndex.set(node.id, index);
    if (![node.x, node.y, node.loadX ?? 0, node.loadY ?? 0].every(Number.isFinite)) errors.push(`non_finite_node:${node.id}`);
  });
  if (errors.length) return emptyResult(errors);

  const dofCount = model.nodes.length * 2;
  const stiffness = zeroMatrix(dofCount);
  const loads = Array.from({ length: dofCount }, () => 0);

  model.nodes.forEach((node, index) => {
    loads[index * 2] = node.loadX ?? 0;
    loads[index * 2 + 1] = node.loadY ?? 0;
  });

  const memberGeometry = new Map<string, { aIndex: number; bIndex: number; length: number; c: number; s: number }>();
  const memberIds = new Set<string>();

  for (const member of model.members) {
    if (!member.id.trim() || memberIds.has(member.id)) errors.push(`invalid_or_duplicate_member:${member.id}`);
    memberIds.add(member.id);
    const aIndex = nodeIndex.get(member.nodeA);
    const bIndex = nodeIndex.get(member.nodeB);
    if (aIndex === undefined || bIndex === undefined || aIndex === bIndex) {
      errors.push(`invalid_member_nodes:${member.id}`);
      continue;
    }
    if (!(member.area > 0) || !(member.youngModulus > 0) || !(member.yieldStrength > 0)) {
      errors.push(`invalid_member_material:${member.id}`);
      continue;
    }

    const a = model.nodes[aIndex];
    const b = model.nodes[bIndex];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!(length > EPSILON)) {
      errors.push(`zero_length_member:${member.id}`);
      continue;
    }
    const c = dx / length;
    const s = dy / length;
    const factor = member.area * member.youngModulus / length;
    const local = [
      [c * c, c * s, -c * c, -c * s],
      [c * s, s * s, -c * s, -s * s],
      [-c * c, -c * s, c * c, c * s],
      [-c * s, -s * s, c * s, s * s],
    ].map((row) => row.map((value) => value * factor));
    const dofs = [aIndex * 2, aIndex * 2 + 1, bIndex * 2, bIndex * 2 + 1];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) stiffness[dofs[row]][dofs[column]] += local[row][column];
    }
    memberGeometry.set(member.id, { aIndex, bIndex, length, c, s });
  }
  if (errors.length) return emptyResult(errors);

  const originalStiffness = cloneMatrix(stiffness);
  const originalLoads = [...loads];
  const constrained = new Set<number>();
  model.nodes.forEach((node, index) => {
    if (node.fixedX) constrained.add(index * 2);
    if (node.fixedY) constrained.add(index * 2 + 1);
  });
  if (!constrained.size) return emptyResult(["structure_requires_supports"]);

  for (const dof of constrained) {
    for (let index = 0; index < dofCount; index += 1) {
      stiffness[dof][index] = 0;
      stiffness[index][dof] = 0;
    }
    stiffness[dof][dof] = 1;
    loads[dof] = 0;
  }

  let displacementVector: number[];
  try {
    displacementVector = solveLinearSystem(stiffness, loads);
  } catch (error) {
    return emptyResult([error instanceof Error ? error.message : "structural_solver_failed"]);
  }

  const forceVector = multiplyMatrixVector(originalStiffness, displacementVector);
  const reactionsVector = forceVector.map((value, index) => value - originalLoads[index]);
  const displacements: Record<string, StructuralVector> = {};
  const reactions: Record<string, StructuralVector> = {};

  model.nodes.forEach((node, index) => {
    displacements[node.id] = { x: displacementVector[index * 2], y: displacementVector[index * 2 + 1] };
    reactions[node.id] = {
      x: node.fixedX ? reactionsVector[index * 2] : 0,
      y: node.fixedY ? reactionsVector[index * 2 + 1] : 0,
    };
  });

  const members: StructuralMemberResult[] = model.members.map((member) => {
    const geometry = memberGeometry.get(member.id);
    if (!geometry) throw new Error(`Missing geometry for ${member.id}`);
    const aDisplacement = displacements[model.nodes[geometry.aIndex].id];
    const bDisplacement = displacements[model.nodes[geometry.bIndex].id];
    const extension = (bDisplacement.x - aDisplacement.x) * geometry.c + (bDisplacement.y - aDisplacement.y) * geometry.s;
    const strain = extension / geometry.length;
    const stress = member.youngModulus * strain;
    const axialForce = stress * member.area;
    const utilization = Math.abs(stress) / member.yieldStrength;
    return {
      memberId: member.id,
      length: geometry.length,
      strain,
      stress,
      axialForce,
      utilization,
      failed: utilization > 1,
      mode: Math.abs(stress) < EPSILON ? "neutral" : stress > 0 ? "tension" : "compression",
    };
  });

  const maxUtilization = members.reduce((maximum, member) => Math.max(maximum, member.utilization), 0);
  return {
    stable: true,
    errors: [],
    displacements,
    reactions,
    members,
    maxUtilization,
    failedMemberIds: members.filter((member) => member.failed).map((member) => member.memberId),
  };
}
