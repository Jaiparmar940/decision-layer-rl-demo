import type {
  Container,
  EpisodeOrder,
  EpisodeState,
  Item,
  TaskConfig,
} from '../types';

export function hasItemTypes(config: TaskConfig): boolean {
  return (config.itemTypes?.length ?? 0) > 0;
}

export function hasOrders(config: TaskConfig): boolean {
  return (config.orders?.length ?? 0) > 0;
}

export function streamEnabled(config: TaskConfig): boolean {
  return Boolean(config.arrivalStream?.enabled);
}

export function qualityGateOn(config: TaskConfig): boolean {
  return Boolean(config.qualityGate?.uniformStack);
}

export function typeDef(config: TaskConfig, typeId: string | null | undefined) {
  if (!typeId) return undefined;
  return config.itemTypes?.find((t) => t.id === typeId);
}

export function typeLabel(config: TaskConfig, typeId: string | null | undefined): string {
  return typeDef(config, typeId)?.label ?? typeId ?? 'unknown';
}

export function foldProfile(
  config: TaskConfig,
  typeId: string | null | undefined,
): string | null {
  return typeDef(config, typeId)?.foldProfile ?? null;
}

export function isForeignObject(config: TaskConfig, item: Item): boolean {
  const attr = config.itemAttributes.find((a) => a.id === item.attributeId);
  return attr?.hazardClass === 'foreignObject';
}

export function visibleSet(state: EpisodeState): Set<string> {
  return new Set(state.visibleItemIds);
}

export function isItemVisible(state: EpisodeState, itemId: string): boolean {
  if (!state.seedData.streamEnabled) return true;
  return state.visibleItemIds.includes(itemId);
}

export function visibleUnresolvedIds(state: EpisodeState): string[] {
  return state.visibleItemIds.filter((id) => {
    const p = state.itemPhase[id];
    return p !== 'placed' && p !== 'aside';
  });
}

export function inboundRemaining(state: EpisodeState): number {
  return state.inboundQueue.length;
}

export function streamExhausted(state: EpisodeState): boolean {
  return state.inboundQueue.length === 0;
}

export function confuseType(
  config: TaskConfig,
  trueType: string,
  rng: () => number,
): string {
  const row = config.typeConfusion?.[trueType];
  if (!row) return trueType;
  const entries = Object.entries(row).filter(([, p]) => p > 0);
  if (entries.length === 0) return trueType;
  const total = entries.reduce((a, [, p]) => a + p, 0);
  let r = rng() * total;
  for (const [id, p] of entries) {
    r -= p;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1]![0];
}

export function ordersOf(state: EpisodeState): EpisodeOrder[] {
  return state.seedData.orders;
}

export function containersForOrder(state: EpisodeState, orderId: string): Container[] {
  return state.containers.filter((c) => c.orderId === orderId);
}

export function itemInContainer(state: EpisodeState, itemId: string): Container | undefined {
  return state.containers.find((c) => c.itemIds.includes(itemId));
}

export function placedTrueTypeCount(
  state: EpisodeState,
  orderId: string,
  typeId: string,
): number {
  let n = 0;
  for (const c of containersForOrder(state, orderId)) {
    for (const id of c.itemIds) {
      const it = state.seedData.items.find((i) => i.id === id);
      // Extras (foreign / added hazards) have destOrderId null and never
      // substitute for required order-line units.
      if (it?.trueType === typeId && it.destOrderId != null) n += 1;
    }
  }
  return n;
}

/** True when generation dropped units from at least one order line. */
export function hasGenuineShort(orders: EpisodeOrder[]): boolean {
  return orders.some((o) => o.lines.some((l) => l.supplied < l.count));
}

export interface UnmetLine {
  orderId: string;
  orderLabel: string;
  typeId: string;
  missing: number;
  count: number;
  placed: number;
}

export function unmetOrderLines(state: EpisodeState): UnmetLine[] {
  const unmet: UnmetLine[] = [];
  for (const order of ordersOf(state)) {
    for (const line of order.lines) {
      const placed = placedTrueTypeCount(state, order.id, line.typeId);
      if (placed < line.count) {
        unmet.push({
          orderId: order.id,
          orderLabel: order.label,
          typeId: line.typeId,
          missing: line.count - placed,
          count: line.count,
          placed,
        });
      }
    }
  }
  return unmet;
}

export function orderLineFulfillment(state: EpisodeState): {
  fulfilled: number;
  total: number;
  ordersCorrect: number;
  ordersTotal: number;
} {
  const orders = ordersOf(state);
  let fulfilled = 0;
  let total = 0;
  let ordersCorrect = 0;
  for (const order of orders) {
    let ok = true;
    for (const line of order.lines) {
      const placed = placedTrueTypeCount(state, order.id, line.typeId);
      fulfilled += Math.min(placed, line.count);
      total += line.count;
      if (placed < line.count) ok = false;
    }
    const foreignOrMisroute = containersForOrder(state, order.id).some((c) =>
      c.itemIds.some((id) => {
        const it = state.seedData.items.find((i) => i.id === id);
        if (!it) return false;
        if (!it.trueType) return true;
        return !order.lines.some((l) => l.typeId === it.trueType);
      }),
    );
    if (ok && !foreignOrMisroute) ordersCorrect += 1;
  }
  return {
    fulfilled,
    total,
    ordersCorrect,
    ordersTotal: orders.length,
  };
}

export function isCrossOrderPlacement(
  state: EpisodeState,
  item: Item,
  container: Container,
): boolean {
  if (!container.orderId) return false;
  const order = state.seedData.orders.find((o) => o.id === container.orderId);
  if (!order) return false;
  if (!item.trueType) return true;
  return !order.lines.some((l) => l.typeId === item.trueType);
}

export function containerHasSpace(c: Container): boolean {
  return c.itemIds.length < c.capacity;
}

export function firstContainerWithSpace(state: EpisodeState): Container | undefined {
  return state.containers.find(containerHasSpace) ?? state.containers[0];
}

function intendedFoldProfile(config: TaskConfig, c: Container): string | null {
  if (!c.orderId) return null;
  const order = config.orders?.find((o) => o.id === c.orderId);
  if (!order) return null;
  const def = order.containers.find((d, i) => (d.id ?? `${c.orderId}-c${i}`) === c.id);
  return def?.foldProfile ?? null;
}

function profileAllows(config: TaskConfig, c: Container, profile: string | null): boolean {
  const intended = intendedFoldProfile(config, c);
  if (intended && profile && intended !== profile) return false;
  if (c.committedFoldProfile && profile && c.committedFoldProfile !== profile) return false;
  return true;
}

export function matchingOrderContainer(
  state: EpisodeState,
  config: TaskConfig,
  typeId: string | null,
  destOrderId?: string | null,
): Container | undefined {
  if (!typeId) return firstContainerWithSpace(state);
  const profile = foldProfile(config, typeId);
  const destOrder = destOrderId
    ? state.seedData.orders.find((o) => o.id === destOrderId)
    : undefined;
  const needing = state.seedData.orders.filter((o) => {
    const line = o.lines.find((l) => l.typeId === typeId);
    if (!line) return false;
    return placedTrueTypeCount(state, o.id, typeId) < line.count;
  });
  const pool = destOrder
    ? [destOrder]
    : needing.length
      ? needing
      : state.seedData.orders.filter((o) => o.lines.some((l) => l.typeId === typeId));
  for (const order of pool) {
    const cs = containersForOrder(state, order.id);
    const open = cs.find(
      (c) => containerHasSpace(c) && profileAllows(config, c, profile),
    );
    if (open) return open;
    const empty = cs.find(
      (c) => c.itemIds.length === 0 && profileAllows(config, c, profile),
    );
    if (empty) return empty;
  }
  return undefined;
}

export function believedTypeOf(state: EpisodeState, itemId: string): string | null {
  return state.beliefs.find((b) => b.itemId === itemId)?.believedType ?? null;
}

export function typeConfirmed(state: EpisodeState, itemId: string): boolean {
  return Boolean(state.beliefs.find((b) => b.itemId === itemId)?.typeConfirmed);
}

export function itemAppearsLabel(config: TaskConfig, item: Item, believedType: string | null): string {
  if (isForeignObject(config, item)) {
    const attr = config.itemAttributes.find((a) => a.id === item.attributeId);
    return attr?.label ?? 'foreignObject';
  }
  return typeLabel(config, believedType ?? item.glanceType);
}
