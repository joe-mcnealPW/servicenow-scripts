# Solution — Frequent-Apps Tracking & Ordering (Complete Widget)

> **Companion doc:** `gen-connect-applications-widget.md` (verbatim transcription of the current widget).
> This document contains the **complete, drop-in code** for each widget part with the frequent-apps enhancement applied. Each section below is the whole file, not a diff — paste it in wholesale.
>
> **Widget:** gen Connect — Applications · **Instance ID:** `083dbc0647a97610e4c3c1aa436d435f` · **Scope:** `x_g_gen_gen_connec`

---

## 1. What this delivers

Card clicks are tracked per user in a `<url_suffix>_frequent_apps` preference (a JSON array of `{ id, name, count, last_clicked }`). On click, the count is incremented via a fire-and-forget server call. On the **next** load, the app list is re-ordered so the most-clicked apps come first, then the rest by name; each item is tagged `is_frequent`. The widget looks identical except for a thin translucent-white divider drawn before the first non-frequent card — and only when both groups are actually visible.

The reorder is "next load," not live, so cards never reshuffle mid-session. A tap on the favorite star does **not** count as a click.

---

## 2. Confirmed decisions baked into the code below

1. Preference name is portal-scoped: `<url_suffix>_frequent_apps`.
2. Server adds a `recordClick` action branch above the async guard; the dead `CALLABLE_FUNCTIONS`/`input.func` block (server) and `ajax()`-based `c.tag`/`c.tag_selected` (client) are removed.
3. The mobile (`<=480px`) path now flips `show_cards`, so cards render on phones.
4. Reorder takes effect on next load, not live.
5. Divider is a 2px translucent-white bar (`rgba(255,255,255,0.65)`) in the inter-card gap.

> Deliberately **not** changed here: the `app_url`/`url` mismatch in `getFavoriteWidget`, the favorite-click propagation behavior, the unused `recent`/`popular`/`favorites` query branches, the half-wired icon/description feature, resize debounce/cleanup, and the `-webkit-box-orietn` typo. These are tracked separately, per your call.

---

## 3. HTML Template

```html
<div class="widget-container" id='083dbc0647a97610e4c3c1aa436d435f'>
  <div class='section-title-container'>
    <h3 class="section-title headline-medium">
      {{options.title}}
    </h3>
    <a href="?id=gen_connect_applications" class="view-all"><span class='title-small'>View All</span><i class="title-small fa fa-arrow-right"></i></a>
  </div>
  <div class="card-section card-section-bg" ng-show="c.show_content">
    <div class="card-view" ng-show="c.view_type == 'card'">

      <!-- Skeleton Loading -->
      <div class="item-card" ng-repeat="item in [].constructor(5) | limitTo: 5 track by $index" ng-if='data.isLoading'>
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
           ng-if='c.show_cards  && !data.isLoading'
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
        <div class="fav-icon" >
          <sp-widget widget="item.fav_widget"></sp-widget>
        </div>
      </div>
    </div>
  </div>
</div>
```

Changes from original: the real card row now has `ng-class="{'divider-start': $index === c.divider_index}"` and calls `c.item_selected(item)` instead of `c.item_selected(item.url)`. Everything else is untouched.

---

## 4. CSS / SCSS

```scss
.content-toggle {
  border: 2px solid transparent;
  border-radius: 3px;
}

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
      -webkit-box-orietn: vertical;
      overflow:hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      font-weight: 700;
      line-height: 150%;
      color: #FFF;
    }

    .item-desc {
      font-size: 10px;
      color:#456e96;
      font-weight:700;
      line-height:10px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
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
    .item-name{
      color: #FFF;
    }
    .item-desc {
      color: #FFF;
    }
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

Changes from original: the `&.divider-start` rule and its `::before` bar were added inside `.item-card`. The `left: -5px` offset assumes the ~8px inter-card gap implied by the client width math; verify against `.card-view` (which wasn't in the screenshots) and adjust.

---

## 5. Client Script

```javascript
api.controller=function($scope, $rootScope, $window, $location, $timeout) {
  /* widget controller */
  var c = this;

  c.show_content = true;
  c.show_cards = false;
  c.toggle_content = function() {c.show_content = !c.show_content};



  /*
  * Async Load Data
  */
  c.server.get({action: 'loadData'}).then(function (response) {
    c.data = response.data;
    c.data.isLoading = false;
    c.updateVisibleCards();   // recompute now that the real list exists
  });



  c.view_type = "card";
  c.toggle_view = function() {
    if (c.view_type == "card") {
      c.view_type = "list";
    } else {
      c.view_type = "card";
    }
  };

  // Check if a favorite event was triggered to prevent redirect
  var fav_change = false;
  function favRevert() {
    fav_change = false;
  }

  c.item_selected = function(item) {
    setTimeout(function() {
      if (fav_change) {
        favRevert();
        return;                 // favorite toggle — do not record or navigate
      }
      c.recordClick(item);      // count only a real navigation click
      window.open(item.url);
    }, 200);
  }

  // Fire-and-forget click tracking. No .then(), so c.data is not reassigned
  // and the visible cards do not reshuffle mid-session.
  c.recordClick = function(item) {
    if (!item || !item.sys_id) return;
    c.server.get({
      action: "recordClick",
      sys_id: item.sys_id,
      name: item.name
    });
  };

  c.item_selected_no_tab = function(url) {
    $location.url(url);
  }



  /*
  * Rootscope Events
  */

  $rootScope.$on("favorite_create", function() {
    fav_change = true;
    setTimeout(favRevert, 5000);
  });
  $rootScope.$on("favorite_delete", function() {
    fav_change = true;
    setTimeout(favRevert, 5000);
  });

  /*
  * Handle resize of page to determine how many apps
  */
  c.handleResize = function() {
    try {
      $timeout(function() {
        c.updateVisibleCards();
      }, 50);
    } catch (e) {
      console.error("Error handling resize: ", e);
    }
  }

  // Index (within visible_cards) of the first non-frequent card that follows a
  // frequent one. -1 means: no frequents, all-frequent, or no boundary visible
  // — i.e. draw no divider.
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
    var container = document.getElementById("083dbc0647a97610e4c3c1aa436d435f");
    if (!container) return;

    var full_list = c.data.list_items;
    var count;
    if ($window.innerWidth <= 480) {
      count = 2;
    } else {
      // Minus padding and gap
      var containerWidth = container.offsetWidth - 32 - (8 * c.data.visible_cards.length);
      count = Math.floor(containerWidth / 175);
    }

    c.data.visible_cards = full_list.slice(0, count);
    c.computeDividerIndex();

    if (!c.show_cards) {
      c.show_cards = true;
    }
  };

  c.updateVisibleCards = function() {
    try {
      $timeout(function() {
        c.calculateVisibleCards();
      }, 500);
    } catch (e) {
      console.error("Error updating visible cards: ", e);
    }
  }

  c.updateVisibleCards();

  // Listens for resizing of the My Apps container
  var targetContainer = document.getElementById("083dbc0647a97610e4c3c1aa436d435f");
  if(targetContainer) {
    var resizeObserver = new ResizeObserver(function(entries) {
      c.handleResize();
    })
    resizeObserver.observe(targetContainer);
  }
};
```

Changes from original: removed the dead `c.tag` / `c.tag_selected` (the `ajax()` consumer); added `c.updateVisibleCards()` inside the `loadData` `.then`; `c.item_selected` now takes `item` and records the click on the navigation branch only; added `c.recordClick`; added `c.computeDividerIndex`; rewrote `c.calculateVisibleCards` to compute the divider every run and flip `show_cards` on mobile. `c.toggle_view`, `c.item_selected_no_tab`, and `c.toggle_content` are still present but unwired (left as-is).

---

## 6. Server Script

```javascript
(function() {
  data.instance_id = "083dbc0647a97610e4c3c1aa436d435f";
  data.isLoading = true;

  /* Click-tracking dispatch — handled before the async guard. */
  if (input && input.action === "recordClick") {
    try {
      recordClick(input);
      data.resp = { "status": "success" };
    } catch (e) {
      data.resp = { "status": "failed", "msg": e.message };
    }
    return; // do NOT re-query or re-order on a click
  }

  /* force async */
  if (!input || input.action !== "loadData") {
    return;
  }


  const common = new x_g_gen_gen_connec.genCommon();


  function getFavorites() {
    let favorite_map = {};

    let favorite_name = $sp.getPortalRecord().getDisplayValue('url_suffix') + '_favorites';
    let favorites = gs.getUser().getPreference(favorite_name);
    favorites = favorites ? JSON.parse(favorites) : [];

    for (let favorite of favorites) {
      let type = favorite.type;
      if (!(type in favorite_map)) favorite_map[type] = [];
      favorite_map[type].push(favorite.sys_id);
    }
    return favorite_map;
  }

  function getFavoriteWidget(item, type) {
    return $sp.getWidget("genc_favorite", {
      sys_id: item.sys_id,
      title: item.name,
      description: null,
      target: "_blank",
      type: type,
      url: item.app_url,
      order: -1,
      tooltip_position: "left",
      size: 'fa-md'
    });
  }

  // @param {string} filter: the filter to run when querying applications
  // populates data.list_items with the top 4 applications within the filter
  function getMyApplications(filter) {
    data.list_items = [];
    let available_app_ids = common.getAvailableApplications();

    let app_record = new GlideRecord("sn_ex_sp_pro_web_application");
    app_record.addQuery("sys_id", "IN", available_app_ids);
    switch(filter) {
      case "favorites":
        var fav_map = getFavorites();
        let favs = ("application" in fav_map) ? fav_map.application: [];
        app_record.addQuery("sys_id", "IN", favs);
        app_record.orderBy("name");
        break;
      case "all":
        app_record.orderBy("name");
        break;
      case "recent":
        break;
      case "popular":
        break;
    }
    if(options.max_items) {
      app_record.setLimit(options.max_items);
    }
    app_record.query();

    while(app_record.next()) {
      let item = {
        "sys_id": app_record.sys_id.toString(),
        "name": app_record.name.toString(),
        "icon_url": app_record.application_icon.getDisplayValue(),
        "url": app_record.application_url.toString(),
        "description": app_record.description.toString(),
      };
      item.fav_widget = getFavoriteWidget(item, "application");
      data.list_items.push(item);
    }
  }


  /* ===== Frequency tracking ===== */

  // Portal-scoped name, mirroring the existing "<url_suffix>_favorites" convention.
  function getFrequentPrefName() {
    return $sp.getPortalRecord().getDisplayValue('url_suffix') + '_frequent_apps';
  }

  // Returns { <sys_id>: { id, name, count, last_clicked } } for the current user.
  function getFrequentMap() {
    var raw = gs.getUser().getPreference(getFrequentPrefName());
    var list = raw ? JSON.parse(raw) : [];
    var map = {};
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id) map[list[i].id] = list[i];
    }
    return map;
  }

  // Increment (or create) the click count for one app.
  function recordClick(payload) {
    if (!payload || !payload.sys_id) return;
    var prefName = getFrequentPrefName();
    var raw = gs.getUser().getPreference(prefName);
    var list = raw ? JSON.parse(raw) : [];
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
    gs.getUser().setPreference(prefName, JSON.stringify(list));
  }

  // Re-order data.list_items so frequents come first; tag each item.
  function applyFrequencyOrdering() {
    var freqMap = getFrequentMap();
    var frequent = [];
    var rest = [];

    for (var i = 0; i < data.list_items.length; i++) {
      var item = data.list_items[i];
      var f = freqMap[item.sys_id];           // only currently-available apps are in list_items
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

    // "rest" keeps its existing name order from getMyApplications' orderBy("name")
    data.list_items = frequent.concat(rest);
    data.frequent_total = frequent.length;
  }


  /* ===== page load ===== */
  getMyApplications("all");
  applyFrequencyOrdering();
  data.visible_cards = data.list_items.slice(0, 5);

})();
```

Changes from original: added the `recordClick` action branch at the top; added `getFrequentPrefName`, `getFrequentMap`, `recordClick`, and `applyFrequencyOrdering`; added `applyFrequencyOrdering()` to the page-load tail; removed the dead `CALLABLE_FUNCTIONS` object and `input.func` dispatch block. `getFavorites`, `getFavoriteWidget`, and `getMyApplications` are unchanged.

---

## 7. Behavior & edge cases

- **New user, no preference:** all items `is_frequent: false`, name order, `divider_index` = -1, no bar — identical to today.
- **More frequents than fit (e.g. 6 frequents, 5 cards fit):** all visible cards are frequent → no divider → top 5 frequents shown, rest cut off.
- **Mixed visible:** divider drawn before the first non-frequent card.
- **Lost-access app:** not in `list_items`, so excluded from display automatically; its preference entry can stay harmlessly.
- **Favorite-star tap:** `fav_change` short-circuits before `recordClick` — neither navigates nor counts.
- **Mobile (≤480px):** 2 cards; same divider rules; `show_cards` is now set so cards render.
- **Rapid repeat clicks:** each counts (not debounced).

---

## 8. Verify before go-live

- `gs.getUser().setPreference(name, value)` persists for the current user on this instance (symmetric to the existing `getPreference` use).
- `.card-view` / card-container CSS (gap, flex) — not in the screenshots — to tune the divider's `left` offset.
- `$sp.getPortalRecord().getDisplayValue('url_suffix')` resolves on the page this widget lives on (already used by the favorites code).

---

## 9. Known items intentionally left for later

Captured here so they aren't lost; none are changed in the code above.

- `getFavoriteWidget` passes `url: item.app_url`, but items carry `url` (not `app_url`) → favorite widgets get an undefined URL. Verify against the `genc_favorite` child widget.
- Favorite clicks bubble to the card handler; the 5s `fav_change` window can swallow an unrelated card click. Cleaner fix is `stopPropagation()` in the child widget.
- With the `ajax` path gone, `getMyApplications` is only called with `"all"`, leaving the `favorites`/`recent`/`popular` switch branches and `getFavorites()` unreachable.
- Icon/description feature is half-wired: server fetches `icon_url`/`description`, CSS styles `.item-icon`/`.item-desc`, but the HTML renders neither (four static `fa-square` placeholders only).
- Resize handling: no debounce on the `ResizeObserver`, nested `$timeout`s aren't cancelled, and the observer isn't disconnected on `$scope.$destroy`.
- Minor: `window.open` vs `$window.open`; hardcoded instance sys_id in three places; gap math uses `N` not `N-1`; unused `.content-toggle`; redundant `limitTo: 5`; `-webkit-box-orietn` typo.
