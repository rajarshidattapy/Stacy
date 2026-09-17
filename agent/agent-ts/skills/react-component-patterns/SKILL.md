---
name: react-component-patterns
description: Modern React component patterns — functional components, composition, state management, custom hooks, file structure. Use when authoring or refactoring components in /workspace/frontend/src/.
---

# react-component-patterns

## When to use

Writing a new component. Refactoring an existing one. Deciding where state should live. Extracting reusable logic.

## Functional components only

Class components are legacy. Always:

```tsx
export function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <div>
      <p>{count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  );
}
```

Named exports for predictable IDE autocomplete and refactors. Default exports only when the file is a route entry (Next.js) and the framework requires it.

## File structure

```
src/
  components/
    Counter.tsx          # one component, named export, PascalCase file
    CounterControls.tsx
  hooks/
    useCounter.ts
  lib/
    addresses.ts
    utils.ts
  abi/
    Counter.ts
```

One component per file. Co-locate small subcomponents that aren't reused.

## Composition over inheritance

React has no inheritance. Compose via children, render props, or hooks:

```tsx
// Layout component takes children
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}

// Used as
<Card title="Counter">
  <Counter initial={0} />
</Card>
```

## Lifting state

State should live at the lowest common ancestor of components that use it.

```tsx
// Bad — sibling components each manage their own count, can't sync
function App() {
  return (
    <>
      <CounterDisplay />     {/* has its own state */}
      <CounterButton />      {/* has its own state */}
    </>
  );
}

// Good — App owns state, passes down
function App() {
  const [count, setCount] = useState(0);
  return (
    <>
      <CounterDisplay count={count} />
      <CounterButton onClick={() => setCount(count + 1)} />
    </>
  );
}
```

Lift only as far as needed. Don't push state to the top of the tree if only two leaves use it.

## Controlled vs uncontrolled inputs

Controlled (state in React):
```tsx
const [name, setName] = useState('');
<input value={name} onChange={e => setName(e.target.value)} />
```

Uncontrolled (state in DOM, read on submit):
```tsx
const ref = useRef<HTMLInputElement>(null);
const submit = () => console.log(ref.current?.value);
<input ref={ref} />
```

Default to controlled. Use uncontrolled for performance-critical large forms or when integrating with non-React form libs.

## Custom hooks

Extract reusable logic into hooks (function names must start with `use`):

```ts
// hooks/useDebounce.ts
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
```

If you find yourself copying useState + useEffect across components, that's a custom hook.

## useEffect cleanup

```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);    // cleanup runs before next effect or unmount
}, []);
```

Always clean up subscriptions, timers, event listeners. Missing cleanup = memory leak + duplicated work in StrictMode.

## useMemo / useCallback — only when measured

Default: don't use them. Premature memo costs more than it saves (extra deps array allocation, equality checks).

Use when:
- Passing a function/object to a `React.memo`'d child (else memo is bypassed).
- Computing an expensive derived value (sort, filter on a 10k-row list).

```tsx
const sorted = useMemo(() => bigList.sort(...), [bigList]);
const handleClick = useCallback(() => doX(id), [id]);
```

Don't memo trivial primitives or strings — useless.

## Context for global state

When prop-drilling >3 levels:

```tsx
const ThemeContext = createContext<'light' | 'dark'>('light');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme] = useState<'light' | 'dark'>('light');
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

Context re-renders ALL consumers when the value changes. For frequently-changing state, split into multiple contexts or use a state library (Zustand for small apps).

## Server vs client components (Next.js 14+)

Default in Next.js App Router: server component. Use `'use client'` directive at the top of files that use:
- `useState`, `useEffect`, etc.
- Browser APIs (`window`, `localStorage`).
- Event handlers (`onClick`).

```tsx
'use client';
import { useState } from 'react';
export function Counter() { ... }
```

Server components fetch data directly (no useEffect for data) and render to HTML. Client components hydrate on the browser.

If using plain Vite + React (no Next.js), every component is implicitly a client component — no directive needed.

## Common mistakes

- **Calling hooks conditionally** — `if (x) useState(0)` breaks the rules of hooks. Hooks must be called in the same order every render.
- **Mutating state directly** — `state.push(x)` doesn't trigger re-render. Use `setState([...state, x])`.
- **Stale closures in useEffect** — capturing a value that's stale by the time the effect runs. Add to deps array OR use a ref.
- **useEffect for derived data** — derived data should be computed during render, not synced via effect. Effects are for side effects (subscriptions, DOM, fetches).
- **Returning JSX inside `useEffect`** — effects don't render. JSX comes from the function body.
- **`key` missing in lists** — React warns. Use a stable unique ID, not array index (unless list is static).
- **Memoizing everything "to be safe"** — adds CPU work + memory; can SLOW down a fast app.
- **Default exports for components** — refactors silently break imports; named exports are safer.
