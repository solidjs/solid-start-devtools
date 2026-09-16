# Vite DevTools docks

Shows the reactivity graph and the ownership tree inside the Vite DevTools dock
instead of the floating toolbar.

```sh
pnpm demo:docks
```

Open the page, press the Vite DevTools dock, and pick `Reactivity Graph` or
`Ownership Tree`. Both panels read the app's runtime from the same page, so the
values stay live and a jump between the two keeps working.
