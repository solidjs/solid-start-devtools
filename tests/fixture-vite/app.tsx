import { render } from '@solidjs/web';
import { createSignal } from 'solid-js';

// No toolbar in the JSX: the Vite plugin mounts it.
function App() {
  const [count, setCount] = createSignal(0, { name: 'count' });
  return (
    <button id="increment" onClick={() => setCount((value) => value + 1)}>
      {`count ${count()}`}
    </button>
  );
}

render(() => <App />, document.getElementById('app')!);
