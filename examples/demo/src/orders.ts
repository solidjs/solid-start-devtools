export type OrderStatus = 'paid' | 'open' | 'refunded';

export interface Order {
  id: string;
  customer: string;
  item: string;
  total: number;
  status: OrderStatus;
  placedAt: number;
}

const CUSTOMERS = [
  'Ada Lovelace',
  'Grace Hopper',
  'Alan Turing',
  'Katherine Johnson',
  'Rosalind Franklin',
  'Linus Pauling',
];

const ITEMS = [
  'Reactive mug',
  'Signal sticker pack',
  'Memo notebook',
  'Effect hoodie',
  'Owner tote bag',
  'Graph poster',
];

/** Fixed so the server render and the client render agree. */
const EPOCH = Date.UTC(2026, 8, 1, 9, 0, 0);

export const SEED_ORDERS: Order[] = [
  { id: 'ORD-0001', customer: 'Ada Lovelace', item: 'Reactive mug', total: 24.5, status: 'paid' },
  {
    id: 'ORD-0002',
    customer: 'Grace Hopper',
    item: 'Effect hoodie',
    total: 89,
    status: 'paid',
  },
  { id: 'ORD-0003', customer: 'Alan Turing', item: 'Graph poster', total: 32, status: 'open' },
  {
    id: 'ORD-0004',
    customer: 'Katherine Johnson',
    item: 'Memo notebook',
    total: 18.75,
    status: 'paid',
  },
  {
    id: 'ORD-0005',
    customer: 'Rosalind Franklin',
    item: 'Signal sticker pack',
    total: 12,
    status: 'refunded',
  },
  {
    id: 'ORD-0006',
    customer: 'Linus Pauling',
    item: 'Owner tote bag',
    total: 41.2,
    status: 'open',
  },
  { id: 'ORD-0007', customer: 'Ada Lovelace', item: 'Graph poster', total: 32, status: 'paid' },
  {
    id: 'ORD-0008',
    customer: 'Grace Hopper',
    item: 'Signal sticker pack',
    total: 12,
    status: 'open',
  },
].map((order, index) => ({ ...order, placedAt: EPOCH - index * 37 * 60_000 }) as Order);

let nextId = SEED_ORDERS.length + 1;

/** A new order for the add button. Only ever called from a click. */
export function createOrder(): Order {
  const customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)]!;
  const item = ITEMS[Math.floor(Math.random() * ITEMS.length)]!;
  const statuses: OrderStatus[] = ['paid', 'open', 'open', 'refunded'];
  return {
    id: `ORD-${String(nextId++).padStart(4, '0')}`,
    customer,
    item,
    total: Math.round((12 + Math.random() * 180) * 100) / 100,
    status: statuses[Math.floor(Math.random() * statuses.length)]!,
    placedAt: Date.now(),
  };
}
