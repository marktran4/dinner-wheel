# Design spec — Recipe Library

**Status:** draft for review
**App:** Dinner Wheel (single-file PWA, vanilla JS, Firebase RTDB sync)
**Author:** Mark (interviewed via Claude)

---

## 1. What we're building

A fourth tab — **Recipes 📖** — that holds the household's trusted recipes.
Recipes are primarily *references*: a link to the original recipe on one of
the sources Mark + Jenny actually cook from, plus a structured ingredient
list so the shopping list can build itself with real quantities.

The trusted sources:

| Source | Host(s) | Cuisine lean |
|---|---|---|
| RecipeTin Eats | `recipetineats.com` | everything |
| Hot Thai Kitchen | `hot-thai-kitchen.com` | Thai |
| Maangchi | `maangchi.com` | Korean |
| My Korean Kitchen | `mykoreankitchen.com` | Korean |
| Vicky Pham | `vickypham.com` | Vietnamese |
| Viet World Kitchen | `vietworldkitchen.com` | Vietnamese |
| Helen's Recipes | `helenrecipes.com`, YouTube links | Vietnamese |

Three headline outcomes:

1. **A Recipes tab** — browse/search the library, filter by source, add
   recipes by hand or by pasting a URL.
2. **One tap from This Week to the recipe** — when a planned meal has a
   linked recipe, its slot card on the home (This Week) view shows a 📖
   button that opens the source page directly.
3. **A smarter shopping list** — recipe ingredients carry quantities, and
   the same ingredient across multiple planned meals merges
   (2 onions + 1 onion = 3 onions).

### Non-goals (v1)

- No scraping/importing of ingredient lists from recipe pages (the app is a
  static GitHub Pages site — no server, and recipe sites don't send CORS
  headers; see §6).
- No photos stored in the app (the source page has the photos).
- No step-by-step cooking mode — the source page *is* the method.
- No changes to the wheel, veto, tally, or week-rollover mechanics.

---

## 2. How it fits the existing model

Today an **idea** is the unit everything runs on: the wheel spins ideas,
slots hold `ideaId`s, and `idea.ings` (free text, one line per item) feeds
the shop list.

A **recipe** becomes a separate record that an idea can *link to*:

```
recipe  ──(idea.recipeId)──  idea  ──(slot.ideaId)──  week slot
```

- The wheel keeps spinning **ideas** — nothing about spinning changes.
- Adding a recipe from the Recipes tab auto-creates (or links to) a matching
  idea, so every recipe is instantly spinnable/plannable.
- An idea without a recipe keeps working exactly as today (free-text `ings`,
  no 📖 button). Nothing is migrated destructively.
- When an idea has a `recipeId`, the recipe's structured ingredients
  **replace** the idea's free-text `ings` as the shop-list source.

Why a separate record instead of extra fields on the idea: the Ideas tab
stays a lightweight brainstorm bank ("we should do tacos sometime"), while
the library is the curated set of things we know how to cook, browsable by
source. Deleting an idea shouldn't delete the recipe, and vice versa.

---

## 3. Data model

New top-level node `recipes` in the same house state (local and Firebase —
same `mealwheel/$house` path, no rules change needed):

```jsonc
"recipes": {
  "<recipeId>": {
    "name":   "Bun Cha (Vietnamese Meatballs)",
    "emoji":  "🍜",                    // via existing pickEmoji(), editable
    "url":    "https://www.recipetineats.com/bun-cha-vietnamese-meatballs/",
    "source": "recipetin",             // registry key, derived from url host; "other" if unknown
    "serves": 4,                       // optional, display only in v1
    "ings":   "500 g pork mince\n2 tbsp fish sauce\n1 onion\nvermicelli noodles",
    "notes":  "double the nuoc cham",  // optional free text
    "by":     "mark",
    "at":     1756500000000
  }
}
```

Change to ideas — one optional field:

```jsonc
"ideas": {
  "<ideaId>": { /* existing fields unchanged */, "recipeId": "<recipeId>" }
}
```

Design notes:

- **`ings` stays a newline-separated string**, same as ideas today — same
  editing UI, same Firebase-friendly shape. Structure comes from *parsing*
  each line at shop-list build time (§5), not from a nested array. This
  keeps hand entry frictionless and makes old free-text lines and new
  quantity lines the same data type.
- **`source` is stored, not recomputed**, so renaming/moving a URL later
  doesn't reshuffle the library. It's derived once from the URL host at
  save time via a `SOURCES` registry constant (key, label, host patterns,
  accent color). Unknown hosts get `"other"` — the library accepts any URL,
  the seven sources are just first-class citizens with filter chips.
- Safe getter `recipes()` follows the existing pattern (`ideas()`,
  `shop()` etc.) since Firebase drops empty nodes.
- Deleting a recipe clears `recipeId` on any idea pointing at it (same
  "drop deleted ideas" defensiveness as `shortlistIds()`); deleting an idea
  leaves the recipe in the library.

---

## 4. UX

### 4.1 Recipes tab

Nav gains a fourth item: `🍽️ This week · 🎡 Wheel · 📖 Recipes · 💡 Ideas`.
(Four tabs fit the existing tabbar styling at phone widths; icons shrink
slightly if needed.)

Layout, top to bottom — mirrors the Ideas tab so it feels native:

1. **Add card** (§4.2).
2. **Source filter chips** — `All · RecipeTin · Hot Thai · Maangchi ·
   My Korean · Vicky Pham · Viet World · Helen's · Other`, horizontally
   scrollable, single-select. Chip shows a count badge.
3. **Search box** — filters by name, same behavior as idea search.
4. **Recipe cards**, newest first:

```
┌──────────────────────────────────────────────┐
│ 🍜  Bun Cha (Vietnamese Meatballs)           │
│     RecipeTin Eats · 4 ings · by Mark        │
│                          [Open ↗] [Plan it]  │
└──────────────────────────────────────────────┘
```

- **Open ↗** — opens `url` in a new browser tab (`target="_blank"`,
  `rel="noopener"`). Hidden if the recipe has no URL (hand-entered only).
- **Plan it** — fills the next empty slot of this week with the linked
  idea, exactly like the Ideas tab's plan button; disabled when the week
  is full or the meal is already planned.
- **Tap the card** — expands an inline edit panel (same pattern as
  `.ideaedit`): name, URL, ingredients textarea, notes, serves, delete.

### 4.2 Add flow (hand entry + URL paste, one form)

A single add card with two inputs:

```
┌ Add a recipe ────────────────────────────────┐
│ [ Paste a link (optional)…                 ] │
│ [ Recipe name…                             ] │
│ [ Ingredients — one per line, "500 g pork" ] │
│                                    [ Add ]   │
└──────────────────────────────────────────────┘
```

- **URL paste behavior** (all client-side, no fetching):
  - Host is matched against the `SOURCES` registry → source badge appears
    immediately ("✓ RecipeTin Eats").
  - The name field is **pre-filled from the URL slug** when empty:
    `/bun-cha-vietnamese-meatballs/` → `Bun cha vietnamese meatballs`
    (dashes → spaces, sentence case, strip trailing ids). The user can fix
    it up — this is a convenience, not a scraper. YouTube URLs get no
    slug guess (their slugs are opaque); name stays manual.
- **On Add:**
  1. Create the recipe record.
  2. Create a linked idea (`name`, `emoji`, default effort `standard`,
     `recipeId`) — **unless** an existing idea has the same normalized
     name, in which case link that idea instead (sets its `recipeId`) and
     toast "Linked to your existing idea ✓".
- Ingredients may be empty at add time; a recipe with no ingredients simply
  contributes nothing to the shop list yet.

### 4.3 This Week (home) integration

On a filled slot whose idea has a `recipeId` with a URL, the slot card's
meta row gains a recipe chip:

```
MEAL 2   Bun Cha
[Wed] 🟡 standard · by Mark · [📖 RecipeTin ↗]
```

- Tapping the chip opens the source URL in a new tab. This is the "I'm
  cooking tonight, get me to the method in one tap" path.
- The chip label is the source's short name (from the registry), so you
  can see at a glance *where* the recipe lives.
- Ideas without recipes render exactly as today — no chip, no empty state.

### 4.4 Ideas tab tie-in (small)

- An idea linked to a recipe shows `📖` next to its name and its edit panel
  offers "View recipe" (jumps to the Recipes tab with that card open)
  instead of the free-text ingredients textarea (ingredients now live on
  the recipe — one source of truth).
- An unlinked idea's edit panel gains one small action: **"Promote to
  recipe"** — creates a recipe pre-filled from the idea (name, emoji,
  ings copied over) and links it. This is the upgrade path for the
  existing bank.

---

## 5. Shopping list with quantities

### 5.1 Ingredient line grammar

Each `ings` line is parsed with a lenient grammar:

```
line     := [qty] [unit] name
qty      := number | fraction | mixed     e.g. 2, 0.5, 1/2, 1 1/2
unit     := one of UNITS registry         g, kg, ml, l, tbsp, tsp, cup(s),
                                          can(s), bunch(es), clove(s), …
name     := the rest of the line
```

Examples:

| Line | qty | unit | name |
|---|---|---|---|
| `500 g pork mince` | 500 | g | pork mince |
| `2 onions` | 2 | — | onion *(singularized)* |
| `1/2 cup fish sauce` | 0.5 | cup | fish sauce |
| `vermicelli noodles` | — | — | vermicelli noodles |
| `salt and pepper` | — | — | salt and pepper |

**A line that doesn't parse is not an error** — it's an unquantified item,
exactly like every existing free-text line. This is what makes the old idea
bank and the new recipes coexist on one list.

### 5.2 Merge rules

The shop list becomes **one combined list** (replacing the per-meal
groups), built from every planned meal's ingredients + extras:

- **Merge key:** normalized name (lowercase, trimmed, naive singular —
  strip trailing `s`/`es` with a small irregulars list) **plus unit
  family**. `g` and `kg` merge (normalized to g, displayed back as kg past
  1000); `tbsp`/`tsp`/`cup` don't cross-merge — no density math.
- **Both quantified, same unit family** → sum: `2 onion` + `1 onion` →
  **`3 onions`**; `500 g pork mince` + `250 g pork mince` → **`750 g pork
  mince`**.
- **Mixed or unmergeable** (one line has qty, the other doesn't; units
  clash) → keep as separate lines. Never guess.
- **Attribution:** each merged line shows tiny meal emojis of its
  contributors (`3 onions 🍜🍛`), so "why is this here" stays answerable.
  Tapping the line could expand per-meal amounts — nice-to-have, not v1.
- **Extras** (`milk, bread…`) keep their own section and behavior,
  untouched.

### 5.3 Ticks

Today's tick keys are `ideaId_lineIndex`, chosen so ticks survive slot
swaps. Merged lines need a new key: **`m_<normalizedName>|<unitFamily>`**.

- Ticks still survive slot swaps *and* now survive re-ordering of
  ingredient lines within a recipe.
- Edge accepted: if a merged line's quantity grows because a new meal is
  planned *after* you shopped (you ticked "3 onions", it becomes
  "5 onions"), the tick **clears** so you notice you need more. (Compare
  stored qty-at-tick vs current; store `{done:true, qty:3}` instead of
  `true`.)
- `shop` node shape stays a flat map; old `ideaId_li` keys are simply
  orphaned and cleaned by the existing "Clear list" / week rollover paths.

---

## 6. Constraints & why some obvious things are out

- **No ingredient scraping:** the app is static (GitHub Pages) and recipe
  sites don't serve CORS headers, so the browser can't fetch their HTML.
  Doing it properly needs a proxy/server or a paid API — out of scope for
  v1. The slug-based name guess (§4.2) is the honest 80% win. If we ever
  want it: a tiny Cloudflare Worker that returns `og:title` +
  schema.org/Recipe JSON-LD would slot cleanly into the same add flow.
- **Source links open the live site** — offline (PWA) you'll see the
  library and shop list fine, but 📖 needs signal. Acceptable: you plan
  online, and the shop list (the offline-critical bit) is local data.
- **Firebase free tier:** recipes are a few hundred bytes each; even
  hundreds of recipes are negligible against the existing state. No rules
  or schema-version changes needed — old app versions ignore the `recipes`
  node and the `recipeId` field entirely, so a phone on the old build
  won't break sync (it just won't show the tab).

---

## 7. Implementation plan

All in `index.html`, following existing patterns (string-built render
functions, `Store.patch` writes, event delegation).

**Phase 1 — library + week link (the core ask)**
1. `SOURCES` + `UNITS` registries; `recipes()` getter; recipe CRUD via
   `Store.patch`.
2. Recipes tab: nav button, view, add card with URL detection + slug name
   guess, source chips, search, cards with Open/Plan/edit.
3. Idea linking: auto-create/link idea on recipe add; "Promote to recipe";
   📖 chip on This Week slot cards.

**Phase 2 — quantified shop list**
4. Line parser + normalizer (pure functions — keep them dependency-free
   and unit-testable in console).
5. Merged list render, new tick keys, qty-at-tick invalidation.

**Phase 3 — polish (optional)**
6. Per-meal breakdown on tap of a merged line; serves scaling
   (multiply quantities when a slot is marked "cooking for 6"); Helen's
   Recipes YouTube thumbnails via `img.youtube.com` (no CORS issue for
   images).

**Testing checklist**
- Old state (ideas with free-text ings, no `recipes` node) renders
  unchanged; shop list identical until a recipe is planned.
- Recipe add on phone A appears on phone B (cloud mode) and survives
  refresh (local mode).
- Deleting a recipe un-links its idea without deleting it; deleting an
  idea keeps the recipe.
- Merge math: `2 onions` + `1 onion`, `500 g` + `1 kg`, qty + no-qty,
  `tbsp` vs `cup` all behave per §5.2.
- Week rollover and veto flows untouched.

---

## 8. Open questions for Mark + Jenny

1. Shop list: fully replace the per-meal grouping with the merged list, or
   keep a toggle between "by meal" and "combined"? *(Spec assumes replace;
   a toggle is cheap if the per-meal view is missed.)*
2. Should "Plan it" from a recipe card jump you to the This Week tab, or
   stay put with a toast? *(Ideas tab currently stays put — spec follows.)*
3. Helen's Recipes is YouTube-first — is a plain link enough, or do you
   want the video thumbnail on the card (Phase 3)?
