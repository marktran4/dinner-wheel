# Design spec — Recipe Library

**Status:** draft for review
**App:** Dinner Wheel (single-file PWA, vanilla JS, Firebase RTDB sync)
**Author:** Mark (interviewed via Claude)

---

## 1. What we're building

A fourth tab — **Recipes 📖** — that holds the household's trusted recipes.
Recipes are primarily *references*: a link to the original recipe on one of
the sources Mark + Jenny actually cook from, plus an ingredient list so a
planned recipe still fills the shopping list the way ideas do today.

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

Two headline outcomes:

1. **A Recipes tab** — browse/search the library, filter by source, add
   recipes by hand or by pasting a URL.
2. **One tap from This Week to the recipe** — when a planned meal has a
   linked recipe, its slot card on the home (This Week) view shows a 📖
   button that opens the source page directly.

### Non-goals (v1)

- **No changes to the shopping list.** It keeps its current behavior
  exactly: grouped per meal, fed from `idea.ings`, same tick keys. Recipes
  feed it through the existing mechanism (§5) rather than replacing it.
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
- The shop list keeps reading `idea.ings` and knows nothing about recipes —
  see §5 for how a recipe's ingredients get there.

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
    "serves": 4,                       // optional, display only
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

- **`ings` is a newline-separated string**, byte-for-byte the same shape as
  `idea.ings` today. That's deliberate: mirroring it onto the linked idea
  (§5) is a plain copy, and the shop list needs zero changes.
- **`source` is stored, not recomputed**, so renaming/moving a URL later
  doesn't reshuffle the library. It's derived once from the URL host at
  save time via a `SOURCES` registry constant (key, label, host patterns,
  accent color). Unknown hosts get `"other"` — the library accepts any URL,
  the seven sources are just first-class citizens with filter chips.
- Safe getter `recipes()` follows the existing pattern (`ideas()`,
  `shop()` etc.) since Firebase drops empty nodes.
- Deleting a recipe clears `recipeId` on any idea pointing at it (same
  "drop deleted ideas" defensiveness as `shortlistIds()`) and leaves that
  idea's `ings` in place; deleting an idea leaves the recipe in the library.

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
│ [ Ingredients — one per line               ] │
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
     `recipeId`, `ings` copied from the recipe) — **unless** an existing
     idea has the same normalized name, in which case link that idea
     instead (sets its `recipeId`, mirrors `ings`) and toast "Linked to
     your existing idea ✓".
- Ingredients may be empty at add time; a recipe with no ingredients simply
  contributes nothing to the shop list, exactly like an idea with no
  ingredients today.

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
- The shopping list below the slots is untouched, in code and on screen.

### 4.4 Ideas tab tie-in (small)

- An idea linked to a recipe shows `📖` next to its name. Its edit panel
  shows the ingredients **read-only** with a "Edit in recipe →" link
  (jumps to the Recipes tab with that card open), so ingredients have one
  editing home and can't drift out of sync with the recipe.
- An unlinked idea's edit panel is unchanged, plus one small action:
  **"Promote to recipe"** — creates a recipe pre-filled from the idea
  (name, emoji, `ings` copied over) and links it. This is the upgrade path
  for the existing bank.

---

## 5. How recipes reach the shopping list

**The shopping list does not change.** It still walks this week's slots,
reads `idea.ings`, groups by meal, and keys ticks as `ideaId_lineIndex`.
No new parsing, no merging, no quantity math.

Recipes reach it by **mirroring**: whenever a recipe's `ings` is saved
(on add, and on every edit), the same string is written to its linked
idea's `ings` in the same `Store.patch` call:

```js
Store.patch({
  'recipes/<recipeId>/ings': text,
  'ideas/<ideaId>/ings':     text     // same patch, so they can't diverge
});
```

Consequences, all intentional:

- The shop list code stays exactly as it is — the lowest-risk option, and
  it means an old phone still on the previous build builds an identical
  list.
- Ingredients are edited in **one place** (the recipe) whenever a link
  exists — §4.4 makes the idea's copy read-only, so the mirror is always
  one-directional and there's no merge conflict to resolve.
- Unlinked ideas keep their own free-text ingredients, untouched.
- Quantity merging across meals (`2 onions + 1 onion = 3 onions`) is
  explicitly out of scope. If it's ever wanted, it's a self-contained
  change to the shop-list renderer and doesn't touch this design — the
  ingredient text is already sitting where it would need it.

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
  won't break sync (it just won't show the tab, and thanks to the mirror
  in §5 its shopping list is still correct).

---

## 7. Implementation plan

All in `index.html`, following existing patterns (string-built render
functions, `Store.patch` writes, event delegation). The shop-list renderer
is not modified in any phase.

**Phase 1 — the library**
1. `SOURCES` registry; `recipes()` getter; recipe CRUD via `Store.patch`.
2. Recipes tab: nav button, view, add card with URL detection + slug name
   guess, source chips, search, cards with Open/Plan/edit.

**Phase 2 — linking**
3. Auto-create/link idea on recipe add, with `ings` mirroring (§5).
4. 📖 chip on This Week slot cards.
5. Ideas tab: 📖 marker, read-only ingredients + "Edit in recipe →",
   "Promote to recipe".

**Phase 3 — polish (optional)**
6. Serves display; Helen's Recipes YouTube thumbnails via
   `img.youtube.com` (no CORS issue for images); recently-cooked sort on
   the library.

**Testing checklist**
- Old state (ideas with free-text ings, no `recipes` node) renders
  unchanged; **shopping list output is byte-identical before and after the
  feature ships** for any week with no recipes planned.
- Editing a recipe's ingredients updates the planned meal's shop-list
  lines, and existing ticks behave the same as editing an idea's
  ingredients does today.
- Recipe add on phone A appears on phone B (cloud mode) and survives
  refresh (local mode).
- Deleting a recipe un-links its idea without deleting it or wiping its
  ingredients; deleting an idea keeps the recipe.
- Week rollover, veto, tally, and wheel flows untouched.

---

## 8. Open questions for Mark + Jenny

1. Should "Plan it" from a recipe card jump you to the This Week tab, or
   stay put with a toast? *(Ideas tab currently stays put — spec follows.)*
2. Helen's Recipes is YouTube-first — is a plain link enough, or do you
   want the video thumbnail on the card (Phase 3)?
3. When a recipe is linked, ingredients become read-only on the idea
   (§4.4). Any case where you'd want to tweak the shop-list version for a
   week without editing the recipe itself?
