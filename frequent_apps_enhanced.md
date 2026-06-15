# Enhanced Solution — Frequent-Apps Tracking + Code Cleanup (Complete Widget)

> **Relationship to `solution.md`:** This is the same frequent-apps feature, plus every improvement from the review. `solution.md` keeps the original code untouched except for the feature; **this file applies the fixes too.** Each section below is the whole, drop-in file.
>
> **Widget:** DLA Connect — Applications · **Instance ID:** `083dbc0647a97610e4c3c1aa436d435f` · **Scope:** `x_g_dla_dla_connec`

---

## 0. Bug fix — clicks weren't creating a preference

**Symptom:** clicking a card never created the `_frequent_apps` preference (in this and the prior version).

**Cause:** the write used `gs.getUser().setPreference(...)`, which in a scoped app can throw "Illegal access to method setPreference in class com.glide.sys.User" — and the failure was invisible, because `recordClick` was called fire-and-forget with no response handling while the server swallowed the error into an unread `data.resp`. Any failure (the scoped-method error, a null `$sp.getPortalRecord()` on the round-trip, or a non-persisting `setPreference`) produced exactly the observed result: no preference, no error.

**Fix:** reads and writes now go through direct `sys_user_preference` GlideRecord access (`readUserPref` / `writeUserPref`, keyed on `gs.getUserID()`), which persists regardless of scope; `getFrequentPrefName` is guarded; and failures are now logged server-side (`gs.error`/`gs.warn`) and surfaced client-side (`console.warn`) with a `saved` flag.

**Verify in ~30 seconds after re-importing:**
1. Click a card, then check **System Logs → All**, filtered for `DLA frequent_apps` — any real error now shows here.
2. Check **sys_user_preference** for a record named `<suffix>_frequent_apps` on your user.
3. Open the browser console — a non-persisting write now logs `[DLA] recordClick did not persist`.

**If `saved` comes back false with no exception:** the write is being blocked, which points to the **widget's scope lacking create/update access to `sys_user_preference`** (a cross-scope table-access setting). Tell me the widget's application scope and I'll adjust the approach (e.g., move the write into a properly-scoped Script Include, or confirm the app's access to that table).

---



**Bug fixes**
- `getFavoriteWidget` now passes `url: item.url` (was `item.app_url`, which was always undefined).
- Favorite-star clicks no longer leak into the card. The `.fav-icon` wrapper now calls `$event.stopPropagation()`, so the 5-second `fav_change` window — which could swallow an unrelated card click — is **removed entirely** (along with `favRevert` and the two `$rootScope` favorite listeners).

**Dead-code removal**
- Removed the unreachable `CALLABLE_FUNCTIONS` / `input.func` block (server) and the `ajax()`-based `c.tag` / `c.tag_selected` (client).
- With the `ajax` path gone, `getMyApplications` only ever ran with `"all"`, so the `favorites` / `recent` / `popular` switch branches and `getFavorites()` are removed. `getMyApplications` is now a plain "all available apps, by name" query.
- Stripped the half-wired icon/description data: the server no longer fetches `icon_url`/`description`, and the unused `.item-desc` CSS (base + hover) is removed. **Judgment call** — see note below.

**Robustness / performance**
- **Preferences are now read/written via direct `sys_user_preference` GlideRecord access, not `gs.getUser().get/setPreference`.** The latter can throw "Illegal access" in a scoped app and has documented persistence quirks — the likely reason clicks never created a preference in earlier versions. (See §0.)
- **Click-tracking failures are no longer silent.** The server logs to `gs.error`/`gs.warn`, returns a `saved` flag, and the client inspects the response and `console.warn`s if the write didn't persist.
- `getFrequentPrefName` is guarded so a null portal record on a round-trip can't throw.
- `$sp.getWidget("dlac_favorite", …)` is now built only for the first `FAV_WIDGET_CAP` cards (after ordering), instead of every app — capping expensive server-side widget renders.
- `JSON.parse` on the preference is wrapped in a `safeParseArray` helper that returns `[]` on malformed data, so a bad preference can't crash the load path.
- Resize handling is **debounced** (a burst of `ResizeObserver` events collapses into one recalculation) and the observer + pending timer are **disconnected on `$scope.$destroy`** (no leak).
- `calculateVisibleCards` now guards against `c.data` not being loaded yet.

**Cosmetic**
- `window.open` → `$window.open`.
- Instance sys_id is referenced via a single `WIDGET_ID` constant instead of being hardcoded in multiple `getElementById` calls.
- Card-count math fixed: gaps between N cards are `(N-1)`, and the formula no longer depends on the stale `visible_cards.length`.
- Removed unused `.content-toggle` CSS, the redundant `| limitTo: 5`, and the redundant `.item-name` hover rule.
- Fixed the `-webkit-box-orietn` → `-webkit-box-orient` typo.

**Two judgment calls (reversible)**
1. **Icon/description: stripped, not rendered.** `.item-desc` was styled as a 2-column grid (copied from `.item-icon`) — wrong for text — and rendering descriptions changes the card layout. That's design work, not cleanup, so the unused data/CSS was removed and the widget stays visually identical. If you want real per-app icons later, `application_icon` is still available on the table.
2. **Favorite fix via `stopPropagation` in this widget**, rather than editing the `dlac_favorite` child widget. Self-contained and lower-touch. Verify the star still toggles (it will — propagation stopping doesn't block the child's own handler).

**Confirmed feature decisions** (unchanged from `solution.md`): portal-scoped `<url_suffix>_frequent_apps`; reorder on next load, not live; 2px translucent-white divider.

---

## 2. HTML Template

```html
<div class="widget-container" id='083dbc0647a97610e4c3c1aa436d435f'>
  <div class='section-title-container'>
    <h3 class="section-title headline-medium">
      {{options.title}}
    </h3>
    <a href="?id=dla_connect_applications" class="view-all"><span class='title-small'>View All</span><i class="title-small fa fa-arrow-right"></i></a>
  </div>
  <div class="card-section card-section-bg" ng-show="c.show_content">
    <div class="card-view" ng-show="c.view_type == 'card'">

      <!-- Skeleton Loading -->
      <div class="item-card" ng-repeat="item in [].constructor(5) track by $index" ng-if='data.isLoading'>
        <div class='item-content'>
          <div class="skeleton-icon">
            <div class='skeleton skeleton-text'></div>
          </div>
          <div class="skeleton-name">
            <div class='skeleton skeleton-text'></div>
          </div>
        </div>
        <div class="fav-icon" >
        </div>
      </div>
      <div class="item-card"
           ng-repeat="item in data.visible_cards"
           ng-if='c.show_cards && !data.isLoading'
           ng-class="{'divider-start': $index === c.divider_index}"
           ng-click="c.item_selected(item)"
           id="card-{{item.sys_id}}">
        <div class='item-content'>
          <div class="item-icon">
            <i class="fa-regular fa-square" aria-hidden="true"></i>
            <i class="fa-regular fa-square" aria-hidden="true"></i>
            <i class="fa-regular fa-square" aria-hidden="true"></i>
            <i class="fa-regular fa-square" aria-hidden="true"></i>
          </div>
          <div class="item-name">
            {{item.name}}
          </div>
        </div>
        <div class="fav-icon" ng-click="$event.stopPropagation()">
          <sp-widget widget="item.fav_widget"></sp-widget>
        </div>
      </div>
    </div>
  </div>
</div>
```

Changes: removed `| limitTo: 5` from the skeleton repeat; real card row gets the divider `ng-class`, `c.item_selected(item)`, and the `.fav-icon` now stops click propagation. The four-square icon glyph is unchanged.

---

## 3. CSS / SCSS

```scss
.item-card {
  display: flex;
  flex: 1 0 0;
  border-radius: 8px;
  padding: 8px;
  height: auto !important;
  background-color:$Sky-500;
  min-height:80px;
  z-index: 2;
  .item-content {
    display: flex;
    gap: 8px;
    align-items: center;
    align-self: stretch;
    flex: 1 0 0;

    .skeleton-icon {
      width: 12px;
      height: 12px;
    }

    .skeleton-name {
      width: 75%;
    }

    .item-icon{
      font-size: 10px;
      color:#456e96;
      font-weight:700;
      line-height:10px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }

    .item-name{
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow:hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      font-weight: 700;
      line-height: 150%;
      color: #FFF;
    }
  }

  .fav-icon{
    display: flex;
    align-self: stretch;
    align-items: start;
    justify-content: end;
  }

  &:hover{
    cursor: pointer;
    background-color: $Sky-600;
  }

  /* Vertical divider before the first non-frequent card */
  &.divider-start {
    position: relative;
  }
  &.divider-start::before {
    content: "";
    position: absolute;
    left: -5px;   /* sits in the ~8px inter-card gap — tune to the live container */
    top: 10%;
    bottom: 10%;
    width: 2px;
    background-color: rgba(255, 255, 255, 0.65);
  }
}
```

Changes: removed `.content-toggle`, `.item-desc` (base + hover), and the redundant `.item-name` hover rule; fixed the `-webkit-box-orient` typo; added the divider rule.

---

## 4. Client Script

```javascript
api.controller = function($scope, $window, $location, $timeout) {
  /* widget controller */
  var c = this;

  var WIDGET_ID = "083dbc0647a97610e4c3c1aa436d435f";

  c.show_content = true;
  c.show_cards = false;
  c.toggle_content = function() { c.show_content = !c.show_content; };

  /*
  * Async Load Data
  */
  c.server.get({ action: 'loadData' }).then(function(response) {
    c.data = response.data;
    c.data.isLoading = false;
    c.updateVisibleCards();   // recompute now that the real list exists
  });

  c.view_type = "card";
  c.toggle_view = function() {
    c.view_type = (c.view_type == "card") ? "list" : "card";
  };

  // Open the app and record the click. The favorite star stops propagation in
  // the template, so this only fires on a genuine card click.
  c.item_selected = function(item) {
    c.recordClick(item);
    $window.open(item.url);
  };

  c.item_selected_no_tab = function(url) {
    $location.url(url);
  };

  // Fire-and-forget click tracking. No c.data reassignment, so the visible
  // cards do not reshuffle mid-session — but the response is inspected so a
  // failed write surfaces in the console instead of failing silently.
  c.recordClick = function(item) {
    if (!item || !item.sys_id) return;
    c.server.get({
      action: "recordClick",
      sys_id: item.sys_id,
      name: item.name
    }).then(function(response) {
      var resp = (response && response.data) ? response.data.resp : null;
      if (!resp || resp.status !== "success" || resp.saved === false) {
        console.warn("[DLA] recordClick did not persist:", resp);
      }
    }, function(err) {
      console.warn("[DLA] recordClick request failed:", err);
    });
  };

  // Index (within visible_cards) of the first non-frequent card that follows a
  // frequent one. -1 means: no frequents, all-frequent, or no boundary visible.
  c.computeDividerIndex = function() {
    c.divider_index = -1;
    if (!c.data || !c.data.visible_cards) return;
    var cards = c.data.visible_cards;
    var sawFrequent = false;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].is_frequent) {
        sawFrequent = true;
      } else if (sawFrequent) {
        c.divider_index = i;
        return;
      }
    }
  };

  c.calculateVisibleCards = function() {
    var container = document.getElementById(WIDGET_ID);
    if (!container) return;
    if (!c.data || !c.data.list_items) return;

    var count;
    if ($window.innerWidth <= 480) {
      count = 2;
    } else {
      var gap = 8;
      var cardWidth = 175;
      var inner = container.offsetWidth - 32;            // minus container padding
      count = Math.max(1, Math.floor((inner + gap) / (cardWidth + gap)));
    }

    c.data.visible_cards = c.data.list_items.slice(0, count);
    c.computeDividerIndex();

    if (!c.show_cards) {
      c.show_cards = true;
    }
  };

  // Debounced recalc — cancels any pending run so a burst of resize events
  // collapses into a single recalculation.
  var recalcTimer;
  c.updateVisibleCards = function() {
    if (recalcTimer) $timeout.cancel(recalcTimer);
    recalcTimer = $timeout(function() {
      c.calculateVisibleCards();
    }, 150);
  };

  c.updateVisibleCards();

  // Recalculate when the widget container resizes.
  var resizeObserver;
  var targetContainer = document.getElementById(WIDGET_ID);
  if (targetContainer && $window.ResizeObserver) {
    resizeObserver = new $window.ResizeObserver(function() {
      c.updateVisibleCards();
    });
    resizeObserver.observe(targetContainer);
  }

  // Clean up the observer and any pending timer when the widget is destroyed.
  $scope.$on('$destroy', function() {
    if (recalcTimer) $timeout.cancel(recalcTimer);
    if (resizeObserver) resizeObserver.disconnect();
  });
};
```

Changes: dropped `$rootScope` injection, the `fav_change`/`favRevert` machinery, both favorite `$rootScope` listeners, the dead `c.tag`/`c.tag_selected`, and the separate `handleResize`. `item_selected` is now immediate (no 200ms timer) and uses `$window.open`. Added `WIDGET_ID`, debounced `updateVisibleCards`, fixed card-count math, null guard, `$destroy` cleanup, plus the frequent-apps additions (`recordClick`, `computeDividerIndex`, divider in `calculateVisibleCards`, recompute in the `loadData` callback). `toggle_view`, `toggle_content`, and `item_selected_no_tab` remain (unwired, but not part of the removals).

---

## 5. Server Script

```javascript
(function() {
  data.instance_id = "083dbc0647a97610e4c3c1aa436d435f";
  data.isLoading = true;

  /* Click-tracking dispatch — handled before the async guard. */
  if (input && input.action === "recordClick") {
    try {
      var saved = recordClick(input);
      data.resp = { "status": "success", "saved": !!saved };
    } catch (e) {
      gs.error("[DLA frequent_apps] recordClick failed: " + e);
      data.resp = { "status": "failed", "msg": e.message };
    }
    return; // do NOT re-query or re-order on a click
  }

  /* force async */
  if (!input || input.action !== "loadData") {
    return;
  }

  const common = new x_g_dla_dla_connec.DLACommon();
  const FAV_WIDGET_CAP = options.max_items || 12; // cap $sp.getWidget() calls; must exceed the most cards ever shown

  /* ===== safe JSON parse ===== */
  function safeParseArray(raw) {
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /* ===== user-preference read/write — direct sys_user_preference access =====
     Uses GlideRecord rather than gs.getUser().get/setPreference, which can
     throw "Illegal access" in a scoped app and has documented persistence
     quirks. This persists reliably regardless of widget scope. */
  function readUserPref(name) {
    var gr = new GlideRecord('sys_user_preference');
    gr.addQuery('user', gs.getUserID());
    gr.addQuery('name', name);
    gr.setLimit(1);
    gr.query();
    return gr.next() ? gr.getValue('value') : null;
  }

  function writeUserPref(name, value) {
    var gr = new GlideRecord('sys_user_preference');
    gr.addQuery('user', gs.getUserID());
    gr.addQuery('name', name);
    gr.setLimit(1);
    gr.query();
    if (gr.next()) {
      gr.setValue('value', value);
      return gr.update();      // returns the record sys_id, or '' on failure
    }
    gr.initialize();
    gr.setValue('user', gs.getUserID());
    gr.setValue('name', name);
    gr.setValue('value', value);
    gr.setValue('type', 'string');
    return gr.insert();        // returns the new sys_id, or '' on failure
  }

  /* ===== app query: all available apps, by name ===== */
  function getMyApplications() {
    data.list_items = [];
    let available_app_ids = common.getAvailableApplications();

    let app_record = new GlideRecord("sn_ex_sp_pro_web_application");
    app_record.addQuery("sys_id", "IN", available_app_ids);
    app_record.orderBy("name");
    if (options.max_items) {
      app_record.setLimit(options.max_items);
    }
    app_record.query();

    while (app_record.next()) {
      data.list_items.push({
        "sys_id": app_record.sys_id.toString(),
        "name": app_record.name.toString(),
        "url": app_record.application_url.toString()
      });
    }
  }

  /* ===== favorite child widgets — built only for the cards likely to render ===== */
  function getFavoriteWidget(item, type) {
    return $sp.getWidget("dlac_favorite", {
      sys_id: item.sys_id,
      title: item.name,
      description: null,
      target: "_blank",
      type: type,
      url: item.url,
      order: -1,
      tooltip_position: "left",
      size: 'fa-md'
    });
  }

  function buildFavoriteWidgets(limit) {
    var max = Math.min(limit, data.list_items.length);
    for (var i = 0; i < max; i++) {
      data.list_items[i].fav_widget = getFavoriteWidget(data.list_items[i], "application");
    }
  }

  /* ===== frequency tracking ===== */

  // Portal-scoped name, mirroring the existing "<url_suffix>_favorites" convention.
  // Guarded so a missing portal record on a round-trip can't throw.
  function getFrequentPrefName() {
    var rec = $sp.getPortalRecord();
    var suffix = rec ? rec.getDisplayValue('url_suffix') : '';
    if (!suffix) {
      gs.warn("[DLA frequent_apps] portal url_suffix unavailable; using unscoped preference name");
    }
    return suffix + '_frequent_apps';
  }

  // Returns { <sys_id>: { id, name, count, last_clicked } } for the current user.
  function getFrequentMap() {
    var list = safeParseArray(readUserPref(getFrequentPrefName()));
    var map = {};
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id) map[list[i].id] = list[i];
    }
    return map;
  }

  // Increment (or create) the click count for one app. Returns the saved
  // record sys_id (truthy) or '' if the write did not persist.
  function recordClick(payload) {
    if (!payload || !payload.sys_id) return false;
    var prefName = getFrequentPrefName();
    var list = safeParseArray(readUserPref(prefName));
    var now = new GlideDateTime().getNumericValue(); // epoch ms, for recency tie-break

    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === payload.sys_id) {
        list[i].count = (list[i].count || 0) + 1;
        list[i].name = payload.name || list[i].name; // refresh denormalized name
        list[i].last_clicked = now;
        found = true;
        break;
      }
    }
    if (!found) {
      list.push({ id: payload.sys_id, name: payload.name || "", count: 1, last_clicked: now });
    }
    return writeUserPref(prefName, JSON.stringify(list));
  }

  // Re-order data.list_items so frequents come first; tag each item.
  function applyFrequencyOrdering() {
    var freqMap = getFrequentMap();
    var frequent = [];
    var rest = [];

    for (var i = 0; i < data.list_items.length; i++) {
      var item = data.list_items[i];
      var f = freqMap[item.sys_id];                 // only currently-available apps are in list_items
      if (f && f.count > 0) {
        item.is_frequent = true;
        item.click_count = f.count;
        item._last_clicked = f.last_clicked || 0;
        frequent.push(item);
      } else {
        item.is_frequent = false;
        item.click_count = 0;
        rest.push(item);
      }
    }

    // frequents: count desc, then most-recent click desc, then name asc
    frequent.sort(function(a, b) {
      if (b.click_count !== a.click_count) return b.click_count - a.click_count;
      if ((b._last_clicked || 0) !== (a._last_clicked || 0)) return (b._last_clicked || 0) - (a._last_clicked || 0);
      return (a.name || "").localeCompare(b.name || "");
    });

    // "rest" keeps the name order from getMyApplications' orderBy("name")
    data.list_items = frequent.concat(rest);
    data.frequent_total = frequent.length;
  }

  /* ===== page load ===== */
  getMyApplications();
  applyFrequencyOrdering();
  buildFavoriteWidgets(FAV_WIDGET_CAP);   // build favorites AFTER ordering, so the top cards get them
  data.visible_cards = data.list_items.slice(0, 5);

})();
```

Changes: added the `recordClick` action branch; added `safeParseArray`, `buildFavoriteWidgets` + `FAV_WIDGET_CAP`, and the frequency helpers; simplified `getMyApplications` (no filter/switch, no `icon_url`/`description`); fixed `getFavoriteWidget` to use `item.url`; removed `getFavorites` and the `CALLABLE_FUNCTIONS`/`input.func` block. Favorite widgets are now built after ordering and capped.

---

## 6. Behavior & edge cases

- **New user:** name order, no frequents, no divider — same as today.
- **More frequents than fit:** all visible cards frequent → no divider → top frequents shown, rest cut off.
- **Mixed visible:** divider before the first non-frequent card.
- **Lost-access app:** excluded from display automatically.
- **Favorite-star tap:** stops propagation — toggles the favorite, never opens the app, never counts a click.
- **Mobile (≤480px):** 2 cards; `show_cards` is set so cards render.
- **Very wide screen beyond the cap:** if more than `FAV_WIDGET_CAP` cards are ever shown at once, the overflow cards render without a favorite star (no error). Raise the cap if your widest layout exceeds ~12 cards.

---

## 7. Verify before go-live

- Preference persistence: after a click, confirm a `<suffix>_frequent_apps` row appears in `sys_user_preference`. If not, check System Logs for `DLA frequent_apps` and confirm the widget's scope can write that table (see §0).
- The favorite star still toggles after adding `$event.stopPropagation()` on `.fav-icon` (expected — it only blocks bubbling to the card).
- Nothing outside this widget depended on the removed `recent` / `popular` / `favorites` branches, `getFavorites()`, or the `icon_url` / `description` fields.
- `FAV_WIDGET_CAP` (default 12) exceeds the most cards your widest layout displays.
- `.card-view` container CSS (gap/flex) — not in the screenshots — for tuning the divider's `left` offset and confirming the corrected card-count math renders as expected.
- `$sp.getPortalRecord().getDisplayValue('url_suffix')` resolves on the page this widget lives on (already used by the existing favorites code).

---

## 8. Still open for later (not bugs, just roadmap)

- Real per-app icons (`application_icon` is available on the table) — a design task, deliberately not done here.
- The `recent` / `popular` filters — `recent` could reuse the `last_clicked` field this already captures; `popular` would need cross-user aggregation (a table, not a per-user preference).
- `toggle_view` / `item_selected_no_tab` / `toggle_content` remain defined but unwired.
