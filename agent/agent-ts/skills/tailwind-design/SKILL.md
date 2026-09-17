---
name: tailwind-design
description: Tailwind CSS patterns — utility-first mindset, responsive prefixes, dark mode, color systems, when to use @apply. Use when styling components in /workspace/frontend/.
---

# tailwind-design

## When to use

Styling any component. Setting up a design system. Picking between utility classes and extracted CSS.

## Utility-first mindset

Compose styles inline; don't reach for new CSS files:

```tsx
// Good
<button className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
  Mint
</button>

// Bad (defeats Tailwind's value)
<button className="custom-button">Mint</button>
// + custom CSS file with .custom-button { ... }
```

Repetition is fine. Components encapsulate the duplication when needed.

## Responsive prefixes

Mobile-first. No prefix = all sizes. Prefixes layer ON TOP at the breakpoint:

```tsx
<div className="text-sm md:text-base lg:text-lg">
  Scales up at md (≥768px) and lg (≥1024px)
</div>
```

Default breakpoints:
- `sm:` ≥640px
- `md:` ≥768px
- `lg:` ≥1024px
- `xl:` ≥1280px
- `2xl:` ≥1536px

## Color system

Use the default palette where possible — `bg-blue-600`, `text-gray-900`. Customize in `tailwind.config.js`:

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
    },
  },
};
```

Then `bg-brand-500`, `text-brand-50`. Stick to a 50-900 scale per color for consistency.

## Dark mode

Two strategies: `class` (manual toggle) or `media` (follows OS).

```js
// tailwind.config.js
export default { darkMode: 'class' };
```

Toggle by adding `class="dark"` to `<html>`:

```ts
document.documentElement.classList.toggle('dark');
```

Use the `dark:` variant:

```tsx
<div className="bg-white text-black dark:bg-gray-900 dark:text-white">
  Adapts to mode
</div>
```

For `media` strategy, no toggle needed; OS controls.

## Spacing scale

Tailwind's `p-`, `m-`, `gap-`, `space-x-`, `space-y-` use a consistent scale (`0`, `1`=0.25rem, `2`=0.5rem, `4`=1rem, etc.). Stick to it for visual rhythm. `p-3` and `p-4` are 4px apart — small differences add up.

## Flex and grid

```tsx
// Centered row
<div className="flex items-center justify-between">
  <span>Left</span>
  <span>Right</span>
</div>

// Two-column grid, responsive to one on small
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  <Card />
  <Card />
</div>
```

`gap-` is universally supported in flex now (don't use `space-x-` if `gap-` works).

## Typography

```tsx
<h1 className="text-3xl font-bold tracking-tight">
<p className="text-base leading-relaxed text-gray-700">
```

Install `@tailwindcss/typography` for prose blocks:

```tsx
<article className="prose dark:prose-invert">
  <ReactMarkdown>{md}</ReactMarkdown>
</article>
```

## Animation utilities

```tsx
<div className="animate-pulse">Loading...</div>
<button className="transition-colors duration-200 hover:bg-blue-700">Click</button>
```

Define custom animations in config:

```js
theme: {
  extend: {
    keyframes: {
      shake: { '0%, 100%': { transform: 'translateX(0)' }, '50%': { transform: 'translateX(4px)' } },
    },
    animation: { shake: 'shake 0.4s ease-in-out' },
  },
}
```

## Variants — group, peer

```tsx
// Group: parent hover affects child
<a className="group">
  <span className="group-hover:underline">Hovered when parent is</span>
</a>

// Peer: sibling affects sibling
<input id="email" className="peer" />
<label className="peer-focus:text-blue-600">Email</label>
```

## When to use `@apply`

Rarely. Tailwind's strength is utilities at the call site. `@apply` re-centralizes styles, defeating the purpose.

Acceptable uses:
- Form input base styles applied across many `<input>` elements via `.form-input { @apply rounded border px-3 py-2; }`.
- Third-party component overrides where you can't add classes.

```css
/* index.css */
@layer components {
  .btn-primary {
    @apply rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700;
  }
}
```

Then `<button class="btn-primary">Mint</button>`. Use sparingly.

## Arbitrary values

```tsx
<div className="grid-cols-[200px_1fr_100px]">
<div className="bg-[#1da1f2]">
```

Use when scale doesn't fit. Don't if there's a reasonable scale value.

## Class merging

When components accept `className`, merge with library defaults using `tailwind-merge`:

```ts
import { twMerge } from 'tailwind-merge';

export function Button({ className, ...rest }: ButtonProps) {
  return <button className={twMerge('rounded bg-blue-600 px-4 py-2', className)} {...rest} />;
}
```

Without merging, conflicting classes (e.g., `bg-red-500` overriding `bg-blue-600`) get unpredictable order.

## Common mistakes

- **Inventing color values mid-component** — `bg-[#3b82f6]` everywhere instead of `bg-blue-500`. Centralize in config.
- **Skipping responsive prefixes** — desktop-first thinking gives bad mobile UX. Start with mobile, add `md:` for larger.
- **`@apply` for one-off styles** — defeats utility-first.
- **`!important` modifiers (`!bg-red-500`)** — sign of class-order conflict. Fix the conflict (use `tailwind-merge`).
- **Inconsistent spacing** — mixing `p-3` and `p-4` arbitrarily. Pick one as primary, deviate intentionally.
- **Forgetting dark mode at component author time** — every color choice should also have a `dark:` variant if dark mode is enabled. Easier to add upfront than retrofit.
- **Tailwind purging your dynamic classes** — `className={`bg-${color}-500`}` doesn't get scanned. Use a lookup map: `const map = { red: 'bg-red-500', blue: 'bg-blue-500' };`.
