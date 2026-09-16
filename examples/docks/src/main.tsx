import { render } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For } from 'solid-js';

interface Task {
  id: number;
  title: string;
  done: boolean;
}

function TaskRow(props: { task: Task; onToggle: (id: number) => void }) {
  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={props.task.done}
          onChange={() => props.onToggle(props.task.id)}
        />
        {props.task.title}
      </label>
    </li>
  );
}

function Tasks() {
  const [tasks, setTasks] = createSignal<Task[]>(
    [
      { id: 1, title: 'Read the owner tree', done: false },
      { id: 2, title: 'Follow a signal into the graph', done: false },
      { id: 3, title: 'Jump back to the component', done: true },
    ],
    { name: 'tasks' },
  );

  const done = createMemo(() => tasks().filter((task) => task.done).length, { name: 'done' });

  createEffect(
    () => done(),
    (value) => {
      document.title = `Tasks (${value} done)`;
    },
    { name: 'report-done' },
  );

  const toggle = (id: number) =>
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    );

  return (
    <section>
      <h1>Tasks</h1>
      <p>{`${done()} of ${tasks().length} done`}</p>
      <ul>
        <For each={tasks()}>{(task) => <TaskRow task={task} onToggle={toggle} />}</For>
      </ul>
    </section>
  );
}

function App() {
  return (
    <main>
      <Tasks />
      <p>Open the Vite DevTools dock and pick Reactivity Graph or Ownership Tree.</p>
    </main>
  );
}

render(() => <App />, document.getElementById('app')!);
