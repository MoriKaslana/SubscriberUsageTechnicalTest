# Q4: Troubleshoot & Explain — `getTotalUsageMB`

## 1. Root cause: the callback never returns a value

```js
// BUGGY
records.reduce((total, record) => {
  total += record.dataUsageMB; // mutates the local parameter …
});                             // … but returns nothing (undefined)
```

`Array.prototype.reduce` passes the **return value** of the callback as `total`
(the accumulator) in the next iteration.  
When the callback has a block body `{ … }` with no `return` statement, it
implicitly returns `undefined`.  
So on the second call, `total` is `undefined`, and
`undefined += 1200` gives `NaN`. Every subsequent addition keeps
producing `NaN`, and the final result is `NaN`.

The assignment `total += record.dataUsageMB` only changes the local copy of
the parameter inside that one callback invocation. Because the value is never
returned, the update is silently discarded.

---

## 2. Second problem: no initial value

```js
records.reduce((total, record) => { … });
//                                      ↑ no second argument
```

Without an initial value, `reduce` uses the **first array element** as the
starting accumulator. That element is a record *object*, not a number.

| Scenario | What the buggy code produces |
|---|---|
| Empty array | `TypeError: Reduce of empty array with no initial value` |
| Single record | Returns the record **object** itself (callback is never called) |
| Multiple records | `total` starts as `{ dataUsageMB: 1500, … }`. `{…} += 1200` → `"[object Object]1200"` (string, then NaN once the missing-return bug kicks in) |

---

## 3. Buggy vs. fixed output — sample data

Sample: `[1500, 1200, 6000, 5800, 500, 9000, 5000, 700]` MB

| | Buggy | Fixed |
|---|---|---|
| Empty array | **TypeError** | `0` |
| Single record (500 MB) | `{ dataUsageMB: 500, … }` (object) | `500` |
| All 8 records | `NaN` | `29700` |

---

## 4. The fix

```js
function getTotalUsageMB(records) {
  return records.reduce((total, record) => total + record.dataUsageMB, 0);
}
```

Two changes from the original:

1. **Expression body** — `(total, record) => total + record.dataUsageMB`
   uses an arrow-function expression (no braces), so the result of `total + …`
   is returned automatically on every iteration.

2. **Initial value `0`** — the second argument to `.reduce()` ensures the
   accumulator starts as a number, the callback is called for every element
   (including the only element of a single-item array), and an empty array
   safely returns `0` instead of throwing.

---

## 5. How to prevent this class of bug

### ESLint rules
Add these to your ESLint config to catch the problem at lint time:

```json
"array-callback-return": "error",
"no-param-reassign": "warn"
```

- **`array-callback-return`** — enforces that callbacks passed to array methods
  (`reduce`, `map`, `filter`, …) always contain a `return` statement.
- **`no-param-reassign`** — warns when you mutate a function parameter
  (`total += …`), which is the pattern that *looks* like it's updating the
  accumulator but isn't.

### Always supply an initial value to `reduce`

Treat the second argument as mandatory. A numeric sum should always start at
`0`; a string join at `''`; an array flatten at `[]`. This eliminates the
empty-array TypeError and the first-element-as-accumulator surprise.

Prefer the **concise arrow form** so there is no room for a missing `return`:

```js
// ✅ safe — expression body, initial value
.reduce((acc, x) => acc + x.dataUsageMB, 0)
```

### Unit tests for edge cases

Write at least three tests for any `reduce`-based helper:

| Test | Why |
|---|---|
| Empty array | Catches the missing-initial-value TypeError |
| Single element | Catches the "returns the object itself" bug |
| Multiple elements | Catches the missing-return / NaN bug |

### TypeScript

Annotating the return type makes the bug visible immediately:

```ts
function getTotalUsageMB(records: UsageRecord[]): number {
  return records.reduce((total, record) => {
    total += record.dataUsageMB;
    // TS error: Type 'void' is not assignable to type 'number'
  }, 0);
}
```

The compiler rejects a block-body callback with no `return` as soon as the
return type `number` is declared.

### Code-review habit

For every `reduce` call, ask two questions:

> 1. **What does the callback return?** (Check for a `return` statement or expression body.)
> 2. **What is the starting value?** (Check the second argument.)

If either answer is "nothing" or "not provided", the code is likely wrong.
