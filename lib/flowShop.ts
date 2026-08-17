export type FlowShopJobId = 'A' | 'B' | 'C';
export type FlowShopMachineId = 'M1' | 'M2';
export type FlowShopOrder = [FlowShopJobId, FlowShopJobId, FlowShopJobId];

export const FLOW_SHOP_JOBS: FlowShopOrder = ['A', 'B', 'C'];

export const FLOW_SHOP_PROCESSING_TIMES: Record<FlowShopJobId, Record<FlowShopMachineId, number>> = {
  A: { M1: 3, M2: 7 },
  B: { M1: 6, M2: 2 },
  C: { M1: 4, M2: 5 },
};

export type FlowShopOperation = {
  id: `${FlowShopJobId}-${FlowShopMachineId}`;
  job: FlowShopJobId;
  machine: FlowShopMachineId;
  start: number;
  end: number;
  duration: number;
  predecessorIds: string[];
  critical: boolean;
};

export type FlowShopSchedule = {
  order: FlowShopOrder;
  operations: FlowShopOperation[];
  makespan: number;
  machineTotals: Record<FlowShopMachineId, number>;
  machineIdle: Record<FlowShopMachineId, number>;
  criticalOperationId: FlowShopOperation['id'];
};

export type FlowShopState = {
  order: FlowShopOrder;
  schedule: FlowShopSchedule;
};

const validateOrder: (order: readonly string[]) => asserts order is FlowShopOrder = (order) => {
  if (order.length !== 3) throw new Error('A flow-shop order must contain three jobs.');
  if (new Set(order).size !== 3 || !FLOW_SHOP_JOBS.every((job) => order.includes(job))) {
    throw new Error('A flow-shop order must include A, B, and C exactly once.');
  }
};

export const computeFlowShopSchedule = (candidate: readonly string[]): FlowShopSchedule => {
  validateOrder(candidate);
  const order = [...candidate] as FlowShopOrder;
  const operations: FlowShopOperation[] = [];
  const previousEnd: Record<FlowShopMachineId, number> = { M1: 0, M2: 0 };

  order.forEach((job, jobIndex) => {
    const m1Start = previousEnd.M1;
    const m1End = m1Start + FLOW_SHOP_PROCESSING_TIMES[job].M1;
    const m1Id = `${job}-M1` as const;
    operations.push({
      id: m1Id,
      job,
      machine: 'M1',
      start: m1Start,
      end: m1End,
      duration: FLOW_SHOP_PROCESSING_TIMES[job].M1,
      predecessorIds: jobIndex > 0 ? [`${order[jobIndex - 1]}-M1`] : [],
      critical: false,
    });
    previousEnd.M1 = m1End;

    const m2Start = Math.max(m1End, previousEnd.M2);
    const m2End = m2Start + FLOW_SHOP_PROCESSING_TIMES[job].M2;
    const m2Id = `${job}-M2` as const;
    operations.push({
      id: m2Id,
      job,
      machine: 'M2',
      start: m2Start,
      end: m2End,
      duration: FLOW_SHOP_PROCESSING_TIMES[job].M2,
      predecessorIds: [m1Id, ...(jobIndex > 0 ? [`${order[jobIndex - 1]}-M2`] : [])],
      critical: false,
    });
    previousEnd.M2 = m2End;
  });

  const makespan = previousEnd.M2;
  const criticalOperationId = `${order[2]}-M2` as const;
  const critical = operations.map((operation) => ({ ...operation, critical: operation.id === criticalOperationId }));
  const machineTotals = { M1: 13, M2: 14 } as const;

  return {
    order,
    operations: critical,
    makespan,
    machineTotals: { ...machineTotals },
    machineIdle: { M1: makespan - machineTotals.M1, M2: makespan - machineTotals.M2 },
    criticalOperationId,
  };
};

export const createFlowShopState = (): FlowShopState => ({
  order: [...FLOW_SHOP_JOBS],
  schedule: computeFlowShopSchedule(FLOW_SHOP_JOBS),
});

export const reorderFlowShopJob = (state: FlowShopState, fromIndex: number, toIndex: number): FlowShopState => {
  if (fromIndex < 0 || fromIndex >= 3 || toIndex < 0 || toIndex >= 3) return state;
  const order = [...state.order] as FlowShopOrder;
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  return { order, schedule: computeFlowShopSchedule(order) };
};

export const resetFlowShopState = (_state?: FlowShopState): FlowShopState => createFlowShopState();
