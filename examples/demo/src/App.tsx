import { createEffect, createMemo, createSignal, For, Loading, Show } from 'solid-js';
import { createOrder, SEED_ORDERS, type Order, type OrderStatus } from './orders.js';
import { reportCall } from './report-call.js';
import './styles.css';

type Filter = 'all' | OrderStatus;
type Sort = 'newest' | 'total';

const FILTERS: Filter[] = ['all', 'paid', 'open', 'refunded'];
const CURRENCIES = ['USD', 'EUR', 'JPY'];

/**
 * Runs on the server. The toolbar's server function panel shows the request and
 * the response, including the serialized body.
 */
async function loadRate(currency: string): Promise<{ currency: string; rate: number }> {
  'use server';
  const rates: Record<string, number> = { USD: 1, EUR: 0.92, JPY: 155.4 };
  await new Promise((resolve) => setTimeout(resolve, 450));
  return { currency, rate: rates[currency] ?? 1 };
}

function Boom(): never {
  throw new Error('The demo threw this on purpose.');
}

export default function App() {
  const [orders, setOrders] = createSignal<Order[]>(SEED_ORDERS, { name: 'orders' });
  const [query, setQuery] = createSignal('', { name: 'query' });
  const [filter, setFilter] = createSignal<Filter>('all', { name: 'status-filter' });
  const [sort, setSort] = createSignal<Sort>('newest', { name: 'sort-order' });
  const [currency, setCurrency] = createSignal('USD', { name: 'currency' });
  const [broken, setBroken] = createSignal(false, { name: 'broken' });

  const matching = createMemo(
    () => {
      const search = query().trim().toLowerCase();
      const status = filter();
      return orders().filter((order) => {
        if (status !== 'all' && order.status !== status) return false;
        if (!search) return true;
        return (
          order.customer.toLowerCase().includes(search) ||
          order.item.toLowerCase().includes(search) ||
          order.id.toLowerCase().includes(search)
        );
      });
    },
    { name: 'matching-orders' },
  );

  const sorted = createMemo(
    () =>
      [...matching()].sort((a, b) =>
        sort() === 'total' ? b.total - a.total : b.placedAt - a.placedAt,
      ),
    { name: 'sorted-orders' },
  );

  const revenue = createMemo(
    () =>
      matching().reduce((total, order) => total + (order.status === 'paid' ? order.total : 0), 0),
    { name: 'revenue' },
  );

  const openCount = createMemo(() => matching().filter((order) => order.status === 'open').length, {
    name: 'open-orders',
  });

  const averageOrder = createMemo(
    () => (matching().length === 0 ? 0 : revenue() / matching().length),
    { name: 'average-order' },
  );

  // An async memo. While the server function is in flight the graph shows this
  // node, and everything derived from it, as pending.
  const rate = createMemo(
    async () => {
      const target = currency();
      const answer = await reportCall('loadRate', { currency: target }, () => loadRate(target));
      return answer.rate;
    },
    { name: 'exchange-rate' },
  );

  const converted = createMemo(() => revenue() * rate(), { name: 'converted-revenue' });

  createEffect(
    () => ({ open: openCount(), total: matching().length }),
    (counts) => {
      document.title = `${counts.open} open of ${counts.total} orders`;
    },
    { name: 'sync-title' },
  );

  function addOrder(): void {
    setOrders((current) => [createOrder(), ...current]);
  }

  function refund(id: string): void {
    setOrders((current) =>
      current.map((order) => (order.id === id ? { ...order, status: 'refunded' } : order)),
    );
  }

  return (
    <main class="page">
      <header class="masthead">
        <div>
          <h1>Orders</h1>
          <p class="subtitle">
            A demo app for the Solid Start dev toolbar. Open the toolbar and pick the graph icon.
          </p>
        </div>
        <div class="masthead-actions">
          <button class="primary" onClick={addOrder}>
            Add order
          </button>
          <button onClick={() => setBroken(true)}>Throw an error</button>
        </div>
      </header>

      <section class="stats">
        <article class="stat">
          <span class="stat-label">Paid revenue</span>
          <span class="stat-value">{`$${revenue().toFixed(2)}`}</span>
          <span class="stat-note">signal → matching-orders → revenue</span>
        </article>
        <article class="stat">
          <span class="stat-label">Average order</span>
          <span class="stat-value">{`$${averageOrder().toFixed(2)}`}</span>
          <span class="stat-note">revenue ÷ matching-orders</span>
        </article>
        <article class="stat">
          <span class="stat-label">Open</span>
          <span class="stat-value">{openCount()}</span>
          <span class="stat-note">drives the document title effect</span>
        </article>
        <article class="stat">
          <span class="stat-label">{`Revenue in ${currency()}`}</span>
          <Loading fallback={<span class="stat-value pending">loading…</span>}>
            <span class="stat-value">{converted().toFixed(2)}</span>
          </Loading>
          <span class="stat-note">server function through an async memo</span>
        </article>
      </section>

      <section class="controls">
        <input
          type="search"
          placeholder="Search customer, item or id"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <div class="chips">
          <For each={FILTERS}>
            {(value) => (
              <button
                class="chip"
                aria-pressed={filter() === value ? 'true' : 'false'}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            )}
          </For>
        </div>
        <div class="chips">
          <button
            class="chip"
            aria-pressed={sort() === 'newest' ? 'true' : 'false'}
            onClick={() => setSort('newest')}
          >
            newest
          </button>
          <button
            class="chip"
            aria-pressed={sort() === 'total' ? 'true' : 'false'}
            onClick={() => setSort('total')}
          >
            highest total
          </button>
        </div>
        <div class="chips">
          <For each={CURRENCIES}>
            {(value) => (
              <button
                class="chip"
                aria-pressed={currency() === value ? 'true' : 'false'}
                onClick={() => setCurrency(value)}
              >
                {value}
              </button>
            )}
          </For>
        </div>
      </section>

      <table class="orders">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Item</th>
            <th>Status</th>
            <th class="right">Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <For
            each={sorted()}
            fallback={
              <tr>
                <td colspan={6} class="empty">
                  Nothing matches this filter.
                </td>
              </tr>
            }
          >
            {(order) => (
              <tr>
                <td class="mono">{order.id}</td>
                <td>{order.customer}</td>
                <td>{order.item}</td>
                <td>
                  <span class={`status status-${order.status}`}>{order.status}</span>
                </td>
                <td class="right mono">{`$${order.total.toFixed(2)}`}</td>
                <td class="right">
                  <Show when={order.status !== 'refunded'}>
                    <button class="link" onClick={() => refund(order.id)}>
                      Refund
                    </button>
                  </Show>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <Show when={broken()}>
        <Boom />
      </Show>
    </main>
  );
}
