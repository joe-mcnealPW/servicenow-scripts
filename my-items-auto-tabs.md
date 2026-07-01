# WaaG Widget — Fixed-Count + Container-Fit Tab Split ("Marriage" Solution)

Marries the new fixed-count rule with the original's responsive behavior. The count rule sets a hard **ceiling**; container measurement can **reduce** below it when space is tight; a **floor** collapses to the mobile `<select>` when even the minimum won't fit.

This document contains the **complete, drop-in codebase** — HTML, SCSS, Server Script, Client Controller, and Option Schema — with every change integrated.

---

## 1. Design

### The pipeline

Each stage can only pull the count **down** from the stage above it:

```
                          total tabs
                              |
              +---------------v----------------+
   STAGE 1    | CEILING  (count rule)          |
   count rule | max_tabs_visible = total slots |
              | incl. More. Overflow => max-1  |
              +---------------+----------------+
                              |  ceiling count
              +---------------v----------------+
   STAGE 2    | WIDTH REDUCER (ResizeObserver) |
   measure    | bar overflows? drop last tab   |
              | into More, re-check, repeat    |
              +---------------+----------------+
                              |  fitted count
              +---------------v----------------+
   STAGE 3    | FLOOR  (min_tabs_visible)      |
   mobile     | < min real tabs fit => collapse|
              | to the mobile <select>         |
              +---------------+----------------+
                              |
                     primary_tabs / More / mobile
```

### Key decisions

- **Container measurement supersedes the standalone `matchMedia` (A1).** It's a strict superset: a narrow viewport yields a narrow container (phone case still collapses to mobile), *and* it catches a narrow container inside a wide viewport (dashboard column, side panel) — which `matchMedia` structurally cannot see. One mechanism, driven by a `ResizeObserver` on the widget container. If a hard viewport touch-breakpoint is ever wanted *in addition*, it's a documented one-liner (see section 11).
- **`min_tabs_visible` is resurrected as the mobile floor.** Previously it fed the deleted width math; now it means "fewest real tabs allowed in the bar before collapsing to the mobile dropdown." Clamped to `[1, max-1]`.
- **Overflow is detected via `scrollWidth > clientWidth`, not per-tab arithmetic.** No magic numbers (`-125`, `80`, `125` are gone). The browser reports the truth, including the More button's width, so the More-reservation coupling that caused boundary flicker largely evaporates.
- **First-paint problem is solved by rendering before measuring.** The ceiling set is committed optimistically, *then* the real DOM is measured and reduced. Measurement always reacts to actual layout.
- **Flicker damping.** `OVERFLOW_TOLERANCE_PX` absorbs sub-pixel rounding at the fit boundary. Because each recompute restarts from the ceiling, the committed count is a deterministic function of container width — it cannot oscillate on its own.

### Enabling CSS change (required)

The tabs currently have default `flex-shrink: 1`, so when they don't fit they **squish** rather than overflow — which would make `scrollWidth > clientWidth` never fire. The marriage requires `flex-shrink: 0` on `.tab` and `.more-container` so the row genuinely overflows and measurement works. This is the only functional SCSS change.

---

## 2. Behavior (max = 5)

| Scenario | Result |
|----------|--------|
| 4 tabs, wide container | 4 in bar, no More |
| 5 tabs, wide container | 5 in bar, no More |
| 6 tabs, wide container | 4 in bar + More (2 in dropdown) |
| 6 tabs, container fits only 3 | 3 in bar + More (3 in dropdown) |
| 4 tabs, container fits only 2 | 2 in bar + More (2 in dropdown) |
| any count, fits fewer than min_tabs_visible | mobile select |
| select a dropdown tab | promoted into last bar slot, stays selected |

Note the marriage means a More tab can appear even when there's **no count overflow** (e.g. 4 tabs in a container too narrow for 4) — that's the responsive half doing its job.

---

## 3. What changed vs. the original

| File | Change |
|------|--------|
| **Client Controller** | Deleted `calculateVisibleTabs()`. Rewrote `updateVisibleTabs()` and `rebuildTabSplit()`. Added `getBarElement`, `isBarOverflowing`, `getCeilingCount`, `getMinTabs`, `measureAndReduce`, `setupBarObserver`. Added `ResizeObserver` + `destroyed` bookkeeping and `$destroy` cleanup. New `primary_count` state. |
| **HTML** | Added `id="primary-tab-bar-{{data.instance_id}}"` to the desktop tablist so it can be measured. Nothing else. |
| **SCSS** | Added `flex-shrink: 0` to `.tab` and `.more-container` (required). Old padding/breakpoint is now cosmetic only. |
| **Server Script** | **Unchanged.** (Tab order into the bar is still record-count-descending — see section 7.) |
| **Option Schema** | Updated hints for `max_tabs_visible` and `min_tabs_visible`; both are now used. |

---

## 4. Risks (recap + status)

| Risk | Status in this design |
|------|-----------------------|
| Measurement fragility / first-paint | **Resolved** — render-then-measure, no pre-render `getElementById`. |
| Magic numbers | **Gone** — browser reports overflow directly. |
| Boundary flicker/oscillation | **Damped** — tolerance + deterministic-per-width recompute. |
| Larger test surface (width x count) | **Accepted** — testing checklist in section 12 covers it. |
| flex-shrink squish defeating detection | **Resolved** — `flex-shrink: 0` added. |
| Pending measure `$timeout` firing after teardown | **Guarded** — `destroyed` flag. |

---

## 5. HTML Template

> Only change: `id="primary-tab-bar-{{data.instance_id}}"` on the desktop tablist div.

```html
<div ng-if="c.state.show_widget || c.data.isLoading" id="{{data.instance_id}}">
  <h2 ng-if="options.widget_title" class="headline-medium list-title" ng-style="{'color': c.options.title_color}">{{ ::options.widget_title }}</h2>

  <!-- Skeleton loading - Tabs -->
  <div ng-if="data.isLoading" role="tablist" aria-label="{{ ::options.widget_title }}" class="tab-wrapper">
    <button ng-repeat="i in [].constructor(3) track by $index" class="tab tab-skeleton" type="button" role="tab" aria-selected="false" tabindex="-1">
      <div class="skeleton skeleton-text"></div>
    </button>
  </div>

  <!-- Mobile view: all tabs as a select (visible_tabs === 0) -->
  <div ng-if="!data.isLoading && c.state.visible_tabs === 0 && c.data.tabs.length > 0" class="mobile-dropdown">
    <label class="sr-only" for="tab-select-{{data.instance_id}}">${Select a tab}</label>
    <select id="tab-select-{{data.instance_id}}"
            ng-model="c.state.currentTabId"
            ng-change="c.handlers.setCurrentTabById(c.state.currentTabId)">
      <option ng-repeat="tab in c.data.tabs track by tab.id" ng-value="tab.id">
        {{ tab.name }}<span ng-if="options.show_tab_count_badge == 'true' && tab.details.record_count > 0"> ({{ c.handlers.getBadgeNumber(tab.details.record_count) }})</span>
      </option>
    </select>
    <div class="dropdown-icon-wrapper">
      <i class="fa fa-chevron-down" aria-hidden="true"></i>
    </div>
  </div>

  <!-- Desktop view: primary tab bar with optional overflow dropdown -->
  <div ng-if="!data.isLoading && c.state.visible_tabs > 0"
       id="primary-tab-bar-{{data.instance_id}}"
       role="tablist"
       aria-label="{{ ::options.widget_title }}"
       class="tab-wrapper"
       ng-keydown="c.handlers.onTablistKeydown($event)">

    <button ng-repeat="tab in c.state.primary_tabs track by tab.id"
            class="tab"
            ng-class="{'active-tab': c.state.currentTabId === tab.id}"
            id="tab-{{data.instance_id}}-{{tab.id}}"
            type="button"
            role="tab"
            aria-selected="{{ c.state.currentTabId === tab.id }}"
            aria-controls="panel-{{data.instance_id}}-{{tab.id}}"
            tabindex="{{ c.state.currentTabId === tab.id ? 0 : -1 }}"
            ng-click="c.handlers.setCurrentTabById(tab.id)">
      {{ tab.name }}<span ng-if="options.show_tab_count_badge == 'true' && tab.details.record_count > 0" class="tab-badge">{{ c.handlers.getBadgeNumber(tab.details.record_count) }}</span>
    </button>

    <!-- More button + fly-out -->
    <div id="moreContainer-{{data.instance_id}}"
         class="more-container"
         ng-if="c.state.show_more_button">
      <button type="button"
              class="tab more-tab"
              id="more-button-{{data.instance_id}}"
              aria-haspopup="true"
              aria-expanded="{{ c.state.show_more_menu }}"
              aria-controls="tab-extras-fly-out-menu-{{data.instance_id}}"
              ng-click="c.handlers.toggleMoreMenu()">
        <i class="fa fa-plus more-tab-icon" aria-hidden="true"></i>
        <span>${More}</span>
        <span ng-if="options.show_tab_count_badge == 'true' && c.handlers.getSecondaryRecordCount() > 0"
              class="tab-badge">
          {{ c.handlers.getBadgeNumber(c.handlers.getSecondaryRecordCount()) }}
        </span>
      </button>

      <div id="tab-extras-fly-out-menu-{{data.instance_id}}"
           class="more-options-container"
           ng-show="c.state.show_more_menu"
           role="menu">
        <button ng-repeat="tab in c.state.secondary_tabs track by tab.id"
                type="button"
                class="tab-button"
                role="menuitem"
                ng-class="{'active-menu-item': c.state.currentTabId === tab.id}"
                ng-click="c.handlers.setCurrentTabById(tab.id); c.handlers.closeMoreMenu()">
          {{ tab.name }}
          <span ng-if="options.show_tab_count_badge == 'true' && tab.details.record_count > 0" class="badge">{{ c.handlers.getBadgeNumber(tab.details.record_count) }}</span>
        </button>
      </div>
    </div>
  </div>

  <div ng-class="{'dark': c.state.is_dark_mode }" class="card white grid">
    <div class="card-heading" ng-if="!data.isLoading && c.handlers.getCurrentTab()">
      <h3 class="text-xl">{{ c.handlers.getCurrentTab().name }}</h3>
      <div class="card-icons">
        <!-- Search Bar -->
        <div class="search-input flex gap-sm position-relative" ng-if="c.options.show_search == 'true'">
          <input type="text" ng-model="c.state.search" ng-keypress="c.handlers.enterSearch($event)" placeholder="Search" name="Search for applications" ng-change="c.handlers.searchTextUpdate()"/>
          <div class='search-icon-wrapper'>
            <button ng-click="c.handlers.submitSearch()" ng-if="c.state.searched == false">
              <i class='fa fa-search' aria-hidden="true"></i>
            </button>
            <button ng-click="c.handlers.clearSearch()" ng-if="c.state.searched == true">
              <i class='fa fa-close' aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <!-- Options -->
        <div ng-if="c.handlers.getCurrentTab().details.record_count > 0 || c.handlers.getCurrentTab().filter_value.length > 0"
             id="options-{{data.instance_id}}"
             class='view-options'
             ng-click="c.handlers.toggleShowOptions()">
          <svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 6H24.5M24.5 18L0.5 18M4.5 0L4.5 12M20.5 24V12" stroke="#084374" stroke-width="2"/>
          </svg>
          <span class='title-extra-small'>View options</span>
          <div class='options-dropdown grid gap' ng-show='c.state.show_options'>
            <div ng-if="c.options.hide_filtering =='false' && c.handlers.getCurrentTab().table != 'task'">
              <fieldset ng-if="c.handlers.getCurrentTab().state_options">
                <div class="grid gap-xs">
                  <div class='options-section-title flex flex-start align-center gap-xs'>
                    <i class="fa-solid fa-sliders text-blue" aria-hidden="true"></i>
                    <legend class='title-small ml-2'>${Filter}</legend>
                  </div>
                  <div class="option-inputs flex flex-column align-start gap-xs text-sm">
                    <label ng-repeat="opt in c.handlers.getCurrentTab().state_options track by opt.value+c.handlers.getCurrentTab().id"
                           class='option-input flex flex-start align-center gap-sm text-sm'>
                      <input type='checkbox'
                             name="filter_option"
                             ng-value="{{ opt.value }}"
                             ng-checked="c.handlers.getCurrentTab().filter_value.includes(opt.value)"
                             ng-click="c.handlers.selectFilter(opt.value)"/>
                      ${{{ opt.label }}}
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
            <div>
              <fieldset>
                <div class="grid gap-xs">
                  <div class='options-section-title flex flex-start align-center gap-xs'>
                    <div><svg width="24" height="23" viewBox="0 0 24 23" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.85714 12H5.14286L5.14286 3L6.85714 3L6.85714 12Z" fill="#084476"></path><path d="M12 4.71429L10.8643 5.85L6.15 1.13571L7.28572 2.24802e-07L12 4.71429Z" fill="#084476"></path><path d="M1.13571 5.85L0 4.71428L4.71429 0L5.85 1.13571L1.13571 5.85Z" fill="#084476"></path><path d="M17.1429 11H18.8571L18.8571 20H17.1429V11Z" fill="#084476"></path><path d="M12 18.2857L13.1357 17.15L17.85 21.8643L16.7143 23L12 18.2857Z" fill="#084476"></path><path d="M22.8643 17.15L24 18.2857L19.2857 23L18.15 21.8643L22.8643 17.15Z" fill="#084476"></path></svg></div>
                    <legend class='title-small ml-2'>${Sort}</legend>
                  </div>
                  <div class="option-inputs flex flex-column align-start gap-xs">
                    <label class='option-input flex flex-start align-center gap-xs text-sm'>
                      <input type='radio' name="sort_option" value='sys_created_on_desc' ng-model="c.state.sortCol" ng-change="c.handlers.selectSort('sys_created_on', false)"/>
                      ${Date: Recent}
                    </label>
                    <label class='option-input flex flex-start align-center gap-xs text-sm'>
                      <input type='radio' name="sort_option" value='sys_created_on_asc' ng-model="c.state.sortCol" ng-change="c.handlers.selectSort('sys_created_on', true)"/>
                      ${Date: Oldest}
                    </label>
                    <label class='option-input flex flex-start align-center gap-xs text-sm'>
                      <input type='radio' name="sort_option" value='priority' ng-model="c.state.sortCol" ng-change="c.handlers.selectSort('priority', true)"/>
                      ${Priority: High > Low}
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
        </div>

        <!-- Export -->
        <div class='export-button' ng-if="c.options.show_export == 'true' && c.handlers.getCurrentTab()">
          <a class="exportlink"
             ng-href="/{{c.handlers.getCurrentTab().table}}_list.do?EXCEL&sysparm_query={{c.handlers.getCurrentTab().encoded_query}}&sysparm_view={{data.view}}&sysparm_fields={{data.fields}}"
             target="_new">
            <svg width="25" height="24" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M25 17V22.3333C25 23.0406 24.719 23.7189 24.219 24.219C23.7189 24.719 23.0406 25 22.3333 25H3.66667C2.95942 25 2.28115 24.719 1.78105 24.219C1.28095 23.7189 1 23.0406 1 22.3333V17M6.33333 10.3333L13 17M13 17L19.6667 10.3333M13 17V1" stroke="#084476" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class='title-extra-small'>Export List</span>
          </a>
        </div>
      </div>
    </div>

    <div class="card-body-wrapper grid gap-md" id="dla-accordian-{{ data.instance_id }}">
      <!-- Skeleton loading - Table -->
      <div ng-if="data.isLoading">
        <div class="skeleton-table-row" style="grid-template-columns: 50px 1fr 120px 120px 100px; padding: 16px; align-items: center;" ng-repeat="i in [].constructor(data.defaultRowCount) track by $index">
          <div class="skeleton skeleton-text-md" style="width: 80%;"></div>
          <div class="skeleton skeleton-text-md" style="width: 90%;"></div>
          <div class="skeleton skeleton-text-md" style="width: 85%;"></div>
          <div class="skeleton skeleton-icon" style="margin-left: auto;"></div>
        </div>
      </div>

      <div class="card-body" id="dla-accordian-body-{{ data.instance_id }}" ng-if="!data.isLoading && data.tabs.length > 0">
        <div ng-repeat="tab in data.tabs track by tab.id"
             ng-if="c.state.currentTabId === tab.id"
             id="panel-{{data.instance_id}}-{{tab.id}}"
             role="tabpanel"
             aria-labelledby="tab-{{data.instance_id}}-{{tab.id}}"
             class="tab-content-container">

          <div ng-if="!tab.details.rows || tab.details.rows.length <= 0" class="grid grid-just-center align-center gap-md margin-sm no-results">
            <svg xmlns="http://www.w3.org/2000/svg" width="134" height="97" viewBox="0 0 134 97" fill="none">
              <path d="M125.5 8L45.0625 89L8.5 52.1818" stroke="#A6D173" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="grid gap-sm grid-just-center">
              <h4 class="text-bold">{{ 'No results in ' + tab.name }}</h4>
              <p>${When there are results, you'll see them here.}</p>
            </div>
          </div>

          <div class="table-responsive-wrapper" id="tableWrapper-{{data.instance_id}}">
            <table ng-if="tab.details.rows && tab.details.rows.length > 0">
              <thead>
                <tr>
                  <th ng-repeat="col in tab.details.columns track by col.id" id="{{ col.id }}">
                    <a href ng-click="c.handlers.setColumnSort(col)" name="{{ col.name }}" class="flex gap-xxs align-center">
                      {{ col.name }}
                      <i ng-if="col.id === c.state.sortColumn" class="fa {{ c.state.sortDescending ? 'fa-caret-down' : 'fa-caret-up' }} text-sm" aria-hidden="true"></i>
                    </a>
                  </th>
                  <th ng-if="tab.table == 'sysapproval_approver'|| tab.table == 'sn_itam_common_attestation_asset_m2m'">Next Step</th>
                </tr>
              </thead>
              <tbody>
                <tr ng-repeat="row in tab.details.rows track by row.sys_id">
                  <td ng-if="tab.show_has_attachments" class="td-attachment" style="width: 5%">
                    <i ng-if="row.has_attachment" class="fa fa-paperclip fa-lg text-light-blue" aria-hidden="true"></i>
                    <span class="sr-only">{{ row.has_attachment ? 'Record has attachment(s)' : 'No attachments for this record' }}</span>
                  </td>
                  <td ng-repeat="col in tab.details.columns track by col.id+row.sys_id" headers="{{ col.id }}" ng-click="c.openRow(tab, row)">
                    <span class="text-sm" ng-class="c.handlers.setCellClasses(col.id, row[col.id]);">{{ row[col.id] || "No value" }}</span>
                  </td>
                  <td ng-if="tab.table == 'sysapproval_approver' && row['state'] == 'Requested'" class="action-container">
                    <button id="tab-approve-pop-up" class="approval-action approve" ng-click="c.onAgree(row.sys_id, tab.id, row)" uib-tooltip="Approve request" tooltip-placement="left">
                      <i class="fa fa-check"></i>
                    </button>
                    <button id="tab-reject-pop-up" class="approval-action reject" ng-click="c.onPrompt(row.sys_id, tab.id, row)" uib-tooltip="Reject request" tooltip-placement="left">
                      <i class="fa fa-close"></i>
                    </button>
                  </td>
                  <td ng-if="tab.table == 'sn_itam_common_attestation_asset_m2m' && row['status'] == 'Open'" class="action-container">
                    <button id="tab-approve-pop-up" class="approval-action approve" ng-click="c.openConfirmationModal(row.sys_id, 'yes', tab.id)" uib-tooltip="Confirm asset" tooltip-placement="left">
                      <i class="fa fa-check"></i>
                    </button>
                    <button id="tab-reject-pop-up" class="approval-action reject" ng-click="c.openConfirmationModal(row.sys_id, 'no', tab.id)" uib-tooltip="Deny asset" tooltip-placement="left">
                      <i class="fa fa-close"></i>
                    </button>
                  </td>
                  <td ng-if="(tab.table == 'sysapproval_approver' && row['state'] != 'Requested') || (tab.table == 'sn_itam_common_attestation_asset_m2m' && row['status'] != 'Open')">
                    <span class='text-sm'>No Action Required</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class='card-footer'>
            <div ng-if="tab.details.record_count > 0 && options.include_pagination == 'false'" class="non-pagination" ng-class="{'dark': c.state.is_dark_mode }">
              <span class='title-small'>Showing {{tab.details.rows.length}} of {{tab.details.record_count}}</span>
              <a class='title-small' ng-href="{{data.view_all_url}}">View All<i class='fa fa-arrow-right'></i></a>
            </div>
            <div ng-if="tab.details.record_count > 0 && options.include_pagination == 'true'" ng-class="{'dark': c.state.is_dark_mode }" class="flex flex-between flex-wrap align-center gap-md dlac-pg">
              <div class="flex flex-start align-center gap">
                <span class='body-medium'>${Showing}</span>
                <label class='body-medium' ng-if="tab.details.record_count <= data.rowCountOptions[0]">
                  {{ tab.details.record_count }}
                </label>
                <label ng-if="tab.details.record_count > data.rowCountOptions[0]">
                  <span class="sr-only">${Select the number of records to display at one time}</span>
                  <select class='body-medium' ng-model="c.state.record_limit" ng-change="c.handlers.updateLimit()">
                    <option ng-repeat="opt in data.rowCountOptions track by opt" ng-if="opt <= tab.details.record_count" ng-value="opt">{{ opt }}</option>
                  </select>
                </label>
                <span class='body-medium'>of {{tab.details.record_count}}</span>
              </div>
              <div class="flex flex-start align-center gap">
                <span class='body-medium'>${Page}</span>
                <span class="body-medium flex flex-start align-center gap-xs">
                  <label class='body-medium' ng-if="tab.total_pages == 1"> 1 </label>
                  <label ng-if="tab.total_pages > 1">
                    <span class="sr-only">${Select the page to display}</span>
                    <select class='body-medium' ng-model="tab.selected_page" ng-change="c.handlers.setTabPage(tab.selected_page)">
                      <option ng-repeat="x in [].constructor(tab.total_pages) track by $index" ng-value="$index + 1">{{ $index + 1 }}</option>
                    </select>
                  </label>
                  {{ 'of ' + tab.total_pages }}
                </span>
              </div>
              <div class="flex flex-start align-center gap dlac-pg-btns">
                <button ng-click="c.handlers.setTabPreviousPage()" class="body-medium butn butn-primary-outline butn-sm gap" ng-disabled="c.handlers.getCurrentTab().selected_page <= 1">
                  <i class="fa fa-chevron-left" aria-hidden="true"></i>
                  Previous
                </button>
                <button ng-click="c.handlers.setTabNextPage()" class="body-medium butn butn-primary-outline butn-sm gap" ng-disabled="c.handlers.getCurrentTab().selected_page >= c.handlers.getCurrentTab().total_pages">
                  Next
                  <i class="fa fa-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 6. SCSS

> Only functional change: `flex-shrink: 0` on `.tab` and `.more-container` (marked below). Everything else is identical to the original.

```scss
.card {
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  z-index: 10;
}

.list-title {
  margin-bottom: .5rem;
}

.card-body {
  overflow-x: auto;
}

.card-heading {
  display: flex;
  justify-content: space-between;

  .export-button {
    a {
      text-decoration: unset;
      padding: unset;
      border: unset;
    }
  }
  .exportlink {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    position: relative;
    span {
      color: $Sky-500;
    }
  }
  .card-icons {
    display: flex;
    flex-direction: row;
    gap: 10px;
  }

  .view-options {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    position: relative;

    span { color: $Sky-500; }

    .options-dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 10px);
      background: white;
      font-weight: $text-bolder;
      color: $Sky-500;
      text-decoration: none;
      font-size: $text-sm;
      padding: 16px;
      margin: 10px;
      border-radius: 16px;
      border: 0 !important;
      z-index: 100;
      transition: color 0.15s ease-in-out;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      width: 300px;
      max-height: 200px;
      overflow-y: scroll;

      .option-inputs .option-input label {
        color: black;
        font-size: 12px;
        font-weight: 700;
      }
    }
  }
}

.tab-wrapper {
  padding-right: 80px;
  display: flex;
  justify-content: end;
  gap: 4px;
  margin-bottom: -1px;

  .tab-skeleton {
    width: 175px;
    height: 48px;
  }

  .tab {
    padding: 12px 24px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 700;
    border-radius: 8px 8px 0 0;
    color: $Neutral-600;
    background: linear-gradient(180deg, rgba(0,0,0,0) 67.65%, rgba(0,0,0,.1) 100%), white;
    border: none;
    flex-shrink: 0; // REQUIRED: keep natural width so the bar overflows (enables scrollWidth-based fit detection) instead of squishing

    .tab-badge {
      display: flex;
      padding: 4px;
      border-radius: 50px;
      align-items: center;
      justify-content: center;
      background: $Semantic-High;
      color: white;
      min-width: 24px;
      height: 24px;
      text-align: center;
      font-weight: 700;
    }
  }

  @media (max-width: 1500px) {
    padding-right: 20px;
  }

  .active-tab {
    color: black;
    background: white;
  }

  // The "More" button sits in the tab wrapper alongside primary tabs
  .more-container {
    position: relative;
    display: inline-flex;   // match the flex context of sibling .tab buttons
    align-items: stretch;   // stretch so the child button fills vertically
    flex-shrink: 0;         // REQUIRED: same reason as .tab — must not shrink

    .more-tab {
      // Inherits .tab styling from above. Only style the leading icon.
      .more-tab-icon {
        font-size: 12px;
        line-height: 1;
      }
    }

    .more-options-container {
      position: absolute;
      top: 100%;
      right: 0;
      background: white;
      z-index: 120;
      min-width: 100%;
      margin-top: 8px;
      border-radius: 10px;
      padding: 12px;
      box-shadow: rgba(0, 0, 0, .25) 0px 2px 8px 0px;
      width: max-content;
      max-width: 260px;
      display: flex;
      flex-direction: column;
      gap: 6px;

      .tab-button {
        display: flex;
        padding: 8px 12px;
        border: none;
        background: transparent;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        color: $Neutral-600;
        text-align: left;
        width: 100%;
        cursor: pointer;

        // Divider between dropdown items; last item keeps clean rounded corners
        &:not(:last-child) {
          border-bottom: 1px solid $Neutral-100;
          border-radius: 0;
        }

        &:hover, &:focus {
          background: $Subtle-200;
          color: black;
          outline: none;
        }

        .badge {
          background: $Semantic-High;
          color: white;
          border-radius: 50px;
          min-width: 24px;
          height: 24px;
          padding: 2px 8px;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      }

      .active-menu-item {
        background: $Subtle-200;
        color: black;
      }
    }
  }

  &::-webkit-scrollbar {
    padding-top: 20px;
    height: 5px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 5px;
  }
  &::-webkit-scrollbar-thumb {
    border-radius: 5px;
    background: $color-light-blue;
    border: 1px solid transparent;
  }
}

// Mobile: all tabs collapsed into a single select
.mobile-dropdown {
  display: flex;
  align-items: center;
  position: relative;
  padding: 0 16px 16px 16px;

  select {
    min-width: 100%;
    border-width: 2px;
    border-radius: 68px;
    padding: 10px 36px 10px 18px;
    line-height: 1.25rem;
    box-shadow: 0 0 .5rem transparent !important;
    font-weight: 400;
    border: 1px solid #DEE1E8;
    transition: all .15s ease-in-out;
    position: relative;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    background: white;
  }

  select:focus {
    outline: none;
    border: 2px solid $color-blue;
  }

  .dropdown-icon-wrapper {
    position: absolute;
    right: 34px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 5;
    pointer-events: none;
  }
}

.search-input {
  align-items: center;
  justify-content: center;
  max-width: 140px;
  max-height: 40px;

  label {
    width: 75%;
    max-width: 100px;
    max-height: 40px;
  }
  input {
    max-width: 140px;
    max-height: 40px;
    border-width: 2px;
    border-radius: 8px;
    padding: 16px;
    padding-right: 32px;
    line-height: 1.25rem;
    box-shadow: 0 0 .5rem transparent !important;
    font-weight: 400;
    border: 1px solid $color-blue;
    transition: all .15s ease-in-out;
  }

  input:focus {
    outline: none;
    border: 2px solid $color-blue;
  }

  .search-icon-wrapper {
    position: relative;
    right: 45px;
    z-index: 2;
    color: $color-blue;

    button {
      background: none;
      border: none;
    }
  }
}

.tab-content-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  width: 100%;
}

.no-results {
  padding: 2rem 0 5rem 0;
}

.dlac-pg {
  margin-top: auto;
  height: 3rem;
}

.table-responsive-wrapper {
  overflow-x: auto;
  position: relative;

  // Custom scrollbar — thinner, rounded, light-blue thumb
  &::-webkit-scrollbar {
    height: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 10px;
    margin-top: 20px;
  }
  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background: $color-light-blue;
    border: 1px solid transparent;
  }

  // Firefox
  scrollbar-width: thin;
  scrollbar-color: $color-light-blue transparent;

  &.scrolled {
    th:first-child,
    td:first-child {
      border-right: none !important;
    }
    th:first-child::after,
    td:first-child::after {
      content: "";
      position: absolute;
      top: 0;
      right: 7px;
      width: 7px;
      height: 100%;
      box-shadow: 4px 0 4px rgba(0, 0, 0, .1);
    }
  }

  table {
    min-width: 100%;
    max-width: 100%;
    padding-bottom: 1rem;

    tr { background: white; }

    thead {
      position: sticky;
      top: 0;
      background: $color-white;
    }
    th, th a {
      padding: 12px 24px;
      color: $Sky-500 !important;
      font-weight: $text-bolder;
      font-size: $text-sm;
    }
    th a {
      text-decoration: none;
      padding: 0;
      border: 0 !important;
      transition: color 0.15s ease-in-out;
    }

    th, td { white-space: nowrap; }
    td { padding: 16px 24px; }

    th:first-child,
    td:first-child {
      position: sticky;
      left: 0;
      min-width: 15rem;
      max-width: 20.25rem;
      text-align: left;
      z-index: 100;
      background-color: inherit;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    td:not(:last-child),
    th:not(:last-child) {
      border-right: 1.5px solid $Neutral-100;
    }

    td:not(:first-child),
    th:not(:first-child) a,
    th:not(:first-child) {
      text-align: center;
      justify-content: center;
      z-index: 1;
    }

    td a {
      color: $color-light-blue;
      text-decoration: none;
    }
    tbody tr:nth-child(odd) { background: $color-light-gray; }

    tbody tr:hover {
      cursor: pointer;
      background: $Subtle-200 !important;
    }
    .td-attachment { padding: 12px 10px; }
  }
}

.card-footer {
  .non-pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;

    a {
      display: inline-flex;
      gap: 8px;
      color: $Sky-500;
      text-decoration: none;
      align-items: center;
      cursor: pointer;
    }
  }
}

select {
  border-radius: 4px;
  padding: 4px 10px;
  transition: border-color 0.15s ease-in-out;
  &:hover, &:focus {
    border-color: $color-light-blue !important;
  }
}

// --- dark mode ---
.dark {
  .card-heading {
    button {
      &:focus, &:hover {
        border-color: $color-sky-blue;
        color: $color-sky-blue;
      }
    }
  }

  .tab-wrapper {
    &::-webkit-scrollbar-thumb {
      background: $color-light-blue;
    }

    button {
      background: $color-black;
      color: $color-light-gray;
      border-color: $color-light-black;
      &:hover, &:focus {
        border-color: $color-light-blue !important;
        background: $color-blue !important;
        color: $color-light-gray !important;
      }
      &[aria-selected=true] {
        border-color: $color-light-blue;
        background: $color-light-blue;
        color: $color-white;
      }
    }

    .more-container {
      .more-options-container {
        background: $color-light-black;
        color: $color-light-gray;

        .tab-button {
          color: $color-light-gray;

          &:not(:last-child) {
            border-bottom-color: $color-gray;
          }

          &:hover, &:focus {
            background: $color-blue;
            color: $color-white;
          }
        }
        .active-menu-item {
          background: $color-blue;
          color: $color-white;
        }
      }
    }
  }

  .mobile-dropdown select {
    background: $color-light-black;
    color: $color-light-gray;
    border-color: $color-gray;
    &:hover, &:focus {
      border-color: $color-sky-blue !important;
    }
  }

  table {
    thead {
      background: $color-light-black;
      &:after { background: $color-gray; }
    }
    th {
      &:hover, &:focus-within {
        background: $color-blue;
        a { color: $color-white !important; }
      }
    }
    th a { color: $color-light-gray !important; }
    td a { color: $color-sky-blue; }
    tbody tr:nth-child(even) { background: $color-black; }
  }

  .dlac-pg {
    container-type: inline-size;
    container-name: pagination;
    overflow: hidden;
  }

  select {
    background: $color-light-black;
    border-color: $color-gray;
    &:hover, &:focus {
      border-color: $color-sky-blue !important;
    }
  }

  .dlac-pg-btns {
    display: none;
    :disabled {
      border-color: $color-middle-gray !important;
      color: $color-middle-gray !important;
      background: $color-white !important;
    }
    button {
      background: $color-sky-blue;
      color: $color-light-black;
      border-color: $color-sky-blue;
      i { color: $color-light-black; }
      &:hover, &:focus { background: $color-lighter-blue; }
    }
  }

  @container pagination (min-width: 600px) {
    .dlac-pg-btns {
      display: flex !important;
    }
  }
}
```

---

## 7. Server Script

**Unchanged.** Included for completeness.

> **Note on tab ordering:** the server still re-sorts tabs by record count descending, which overrides the configured `order` field. So the tabs that stay in the bar are the busiest ones. If you'd rather the bar respect the configured `order`, remove the `data.tabs.sort(...)` line marked below — no controller changes needed.

```javascript
(function() {

  var common = new x_g_dla_dla_connec.DLACommon();
  var dlacMyAssetUtil = new x_g_dla_dla_connec.DLACMyAssetsUtil();

  data.rowCountOptions = options.row_count_options.split(",");
  data.defaultRowCount = parseInt(data.rowCountOptions[0]);
  data.always_show_waag_items = options.always_show_waag_items;
  data.portal = $sp.getPortalRecord().getDisplayValue('url_suffix');
  data.view_all_url = data.portal + "?id=dla_connect_my_items";
  data.color_mapped = ['state', 'state', 'priority'];
  data.color_mapping = gs.getProperty("x_g_dla_dla_connec.my_items_value_color_mapping");
  data.instance_id = $sp.getInstanceRecord().sys_id.toString();
  data.is_collapsed = common.getWidgetCollapsedStatus($sp.getInstanceRecord().sp_widget.id.toString());
  data.isLoading = true;
  data.tabs = [];

  /* force async */
  if (!input) {
    return;
  }

  if (input) {
    if (input.action) {
      if (input.action == 'loadData') {
        // get custom table items
        var gRec = new GlideRecord('x_g_dla_dla_connec_waag_list');
        gRec.addActiveQuery();
        if (options.included_waag_items && options.included_waag_items.toString() != "") {
          gRec.addQuery('sys_id', "IN", options.included_waag_items);
        }
        gRec.orderBy('order');
        gRec.query();

        while (gRec.next()) {
          // if can_view is not matched or cannot_view is matched, then skip
          if (!common.checkUserCriteria(gRec.can_view, true) || common.checkUserCriteria(gRec.cannot_view, false)) {
            continue;
          }

          // get 'work at a glance' items and the data it contains
          var waag = {
            id: gRec.getUniqueValue(),
            name: gRec.name.getDisplayValue(),
            table: gRec.table.name.getDisplayValue(),
            encoded_query: gRec.encoded_query.getDisplayValue(),
            query: null,
            sort: gRec.sort_descending === 'true',
            sort_field: gRec.getDisplayValue('sort_field'),
            limit: data.rowCountOptions[0],
            open_backend: gRec.getDisplayValue('open_records_in_backend'),
            fields: gRec.getDisplayValue('list_view_fields').split(","),
            should_count: true,
            masked_names: gRec.getValue('masked_column_names').split(","),
            show_has_attachments: false,
            link_object: {
              id: gRec.target_page.getDisplayValue('id'),
              table: gRec.table.name.toString(),
              sys_id: "{sys_id}"
            },
            target_page: gRec.target_page.getDisplayValue('id'),
            view_all_page: gRec.view_all_page.getDisplayValue('id'),
            total_pages: 10,
            selected_page: 1,
            searched: false,
            filter_column: gRec.getValue("alt_filter_column") || 'state',
            filter_value: gRec.getValue('default_states') ? gRec.getValue("default_states").split(",").map(function(v) { return v.trim(); }) : [],
            color_mapping: gRec.getValue("color_mapping"),
            default_states: gRec.getValue("default_states")
          };

          // confirm that options indicate to include state filters and that table has 'state' field
          if (options.include_state_filter == 'true' && checkHasStateField(waag.table, waag.filter_column)) {
            waag.state_options = getFieldChoices(waag.table, waag.filter_column);
            if (!waag.state_options) {
              delete waag.state_options;
            }
          }

          data.tabs.push(waag);
        }

        // set up tabs and query the tables indicated by waag records
        for (var i = 0; i < data.tabs.length; i++) {
          var dt = data.tabs[i];
          var intialEncodedQuery = dt.encoded_query;
          if (dt.filter_value.length > 0) {
            intialEncodedQuery += "^" + dt.filter_column + "IN" + dt.filter_value.join(",");
          }

          data.tabs[i].details = common.getTableDetails(dt.table, intialEncodedQuery, dt.query, !dt.sort, dt.sort_field, dt.limit, dt.fields, dt.should_count, dt.masked_names, dt.link_object);

          data.tabs[i].total_pages = Math.ceil(data.tabs[i].details.record_count / parseInt(data.rowCountOptions[0]));

          // convert date fields to clean format, check if each record has attachment
          var date_fields = data.tabs[i].details.columns.filter(function(cl) {
            return cl.type.includes('date');
          });

          var shouldCheckAttachments = data.tabs[i].show_has_attachments;
          data.tabs[i].details.rows.map(function(rw) {
            date_fields.forEach(function(df) {
              rw[df.id] = common.getConvertedDate(rw[df.id], "M/d/yyyy");
            });
            if (shouldCheckAttachments) {
              rw.has_attachment = checkHasAttachments(rw.sys_id);
            }
            return rw;
          });
        }

        // order the tabs by record count
        // (Remove this sort to have the bar respect the configured `order` field instead.)
        data.tabs = data.tabs.sort(function(a, b) {
          return b.details.record_count - a.details.record_count;
        });

        // Filter out empty tabs except the ones that are designated to Always Show in options
        data.tabs = data.tabs.filter(tab => tab.details.record_count > 0 || options.always_show_waag_items.indexOf(tab.id) !== -1);

        return;
      }

      if (input.action == 'refresh-tab') {
        var currentTab = input.tab;
        data.curTab = currentTab;
        var offset = (parseInt(currentTab.selected_page) - 1) * parseInt(input.limit);
        data.offsets = offset;

        // add to encoded query for 'state' filters if they exist
        let encoded_query = currentTab.encoded_query;
        if (currentTab.state_options && currentTab.filter_value.length) {
          encoded_query += "^" + currentTab.filter_column + "IN" + currentTab.filter_value.join(",");
        }

        var details = common.getTableDetails(currentTab.table, encoded_query, currentTab.query, !currentTab.sort, currentTab.sort_field, input.limit, currentTab.fields, currentTab.should_count, currentTab.masked_names, currentTab.link_object, offset, input.searchText);
        data.testDetails = details;

        var currentDateFields = details.columns.filter(function(cl) {
          return cl.type.includes('date');
        });
        var currentShouldCheckAttachments = currentTab.show_has_attachments;
        details.rows.map(function(rw) {
          currentDateFields.forEach(function(df) {
            rw[df.id] = common.getConvertedDate(rw[df.id], "M/d/yyyy");
          });
          if (currentShouldCheckAttachments) {
            rw.has_attachment = checkHasAttachments(rw.sys_id);
          }
          return rw;
        });

        data.tabDetails = details;
        return;
      }
      if (input.action == "reject") {
        updateApproval(input.approval, "rejected", input.reason);
        return;
      }
      if (input.action == "approve") {
        updateApproval(input.approval, "approved", null);
        return;
      }

      if (input.action == 'updateAttestation') {
        dlacMyAssetUtil.updateAttestation(input.attestationId, input.answer);
      }
    }
  }

  data.tabsWithRecords = [];
  data.tabsWithOutRecords = [];
  for (var r in data.tabs) {
    var recordLength = data.tabs[r].details.rows.length;
    if (recordLength > 0) {
      data.tabsWithRecords.push(data.tabs[r]);
    } else {
      data.tabsWithOutRecords.push(data.tabs[r]);
    }
  }
})();


function updateApproval(recordId, newState, comment) {
  var app = new GlideRecord("sysapproval_approver");
  app.addQuery("sys_id", recordId);
  app.query();

  if (app.next()) {
    app.setValue("state", newState);

    if (comment != "" && comment != null) {
      app.comments = comment;
    }

    app.update();
  }
}

function checkHasAttachments(id) {
  var gRec = new GlideRecord('sys_attachment');
  gRec.addQuery('table_sys_id', id);
  gRec.query();

  if (gRec.next()) {
    return true;
  }
  return false;
}

function checkHasStateField(table, field_id) {
  try {
    var recGR = new GlideRecord(table);
    recGR.query();

    recGR.next();
    return recGR.isValidField(field_id);
  } catch (err) {
    return null;
  }
}

function getExtendedTable(table) {
  const recGR = new GlideRecord('sys_db_object');
  recGR.addQuery('name', table);
  recGR.query();

  if (!recGR.hasNext()) return null;

  recGR.next();

  return recGR.super_class.name.toString();
}

function getFieldChoices(table, field_id) {
  const choice_table = 'sys_choice';
  const parent_table = getExtendedTable(table);
  const table_query = [table];
  if (parent_table) {
    table_query.push(parent_table);
  }

  const choiceGR = new GlideRecord(choice_table);
  choiceGR.addQuery('name', 'IN', table_query);
  choiceGR.addQuery('element', field_id);
  choiceGR.addQuery('inactive', false);
  choiceGR.orderBy('sequence');
  choiceGR.query();

  if (!choiceGR.hasNext()) return null;

  const choices = [];
  while (choiceGR.next()) {
    choices.push({
      label: choiceGR.getDisplayValue('label'),
      value: choiceGR.getDisplayValue('value'),
      table: choiceGR.name.toString()
    });
  }

  const table_choices = choices.filter(ch => {
    return ch.table === table;
  });
  if (table_choices.length) {
    return table_choices;
  }
  return choices;
}
```

---

## 8. Client Controller

This is where the marriage lives. Full file below.

```javascript
api.controller = function($scope, $window, $timeout, $rootScope, spModal, spUtil, $document) {
  var c = this;

  // Absorbs sub-pixel rounding when deciding whether the tab bar overflows,
  // so the fit boundary doesn't jitter on a 1px resize.
  var OVERFLOW_TOLERANCE_PX = 2;

  c.tabSkeleton = [...new Array(3).keys()];

  c.setShowWidget = function() {
    if (c.options.always_show_waag_items != "") {
      return true;
    }
    for (var i in c.data.tabs) {
      if (c.data.tabs[i].details.record_count > 0) {
        return true;
      }
    }
    return false;
  };

  c.state = {
    collapsed: c.data.is_collapsed || false,
    bodyHeight: null,
    search: "",
    searched: false,
    sortColumn: null,
    sortDescending: null,
    is_dark_mode: null,
    record_limit: c.data.rowCountOptions[0],

    // Tab selection — keyed by tab.id (sys_id)
    currentTabId: null,

    // --- Tab-split state ---
    primary_tabs: [],
    secondary_tabs: [],
    // 0 => mobile <select>; > 0 => desktop tab bar.
    // Made authoritative by container measurement (measureAndReduce()).
    visible_tabs: 1,
    // Number of real (non-More) tabs currently rendered in the bar. Starts
    // at the count-rule ceiling; measurement can only reduce it from there.
    primary_count: parseInt(c.options.max_tabs_visible, 10) || 5,
    show_more_button: false,
    show_more_menu: false,

    // Feature toggles
    show_widget: c.setShowWidget(),
    show_options: false
  };

  // Debounce + observer + teardown bookkeeping
  var resizeTimeoutPromise = null;
  var barResizeObserver = null;
  var destroyed = false;

  /*
   * Async Load Data
   */
  c.server.get({action: 'loadData'}).then(function(response) {
    c.data = response.data;
    c.state.show_widget = c.setShowWidget();

    // Pick the first tab as active by default
    if (c.data.tabs.length > 0 && !c.state.currentTabId) {
      c.state.currentTabId = c.data.tabs[0].id;
      c.state.sortColumn = c.data.tabs[0].sort_field;
      c.state.sortDescending = !c.data.tabs[0].sort;
    }

    // Render the real bar first so measurement has actual DOM to read.
    c.data.isLoading = false;

    // First fit pass (renders the ceiling set, then measures & reduces).
    c.handlers.updateVisibleTabs();

    // Observe the widget container so we re-fit on ANY width change —
    // window resize, sibling panel collapsing, dashboard grid reflow, etc.
    $timeout(function() { c.handlers.setupBarObserver(); }, 0);

    // Horizontal scroll shadow on the table
    $timeout(function() {
      var tableWrapper = document.getElementById("tableWrapper-" + c.data.instance_id);
      if (tableWrapper) {
        tableWrapper.addEventListener('scroll', onTableWrapperScroll);
      }
    }, 0);

    // Outside-click to close view-options dropdown
    $timeout(function() {
      document.addEventListener("click", onDocumentClickForOptions);
    }, 0);
  });

  // --- named handlers (so we can remove on $destroy) ---

  function onTableWrapperScroll() {
    var tableWrapper = document.getElementById("tableWrapper-" + c.data.instance_id);
    if (!tableWrapper) return;
    if (tableWrapper.scrollLeft > 0) {
      tableWrapper.classList.add('scrolled');
    } else {
      tableWrapper.classList.remove('scrolled');
    }
  }

  function onDocumentClickForOptions(event) {
    if (!c.state.show_options) return;
    var target = 'options-' + c.data.instance_id;
    var optionsEl = document.getElementById(target);
    if (optionsEl && !optionsEl.contains(event.target)) {
      c.state.show_options = false;
      $scope.$apply();
    }
  }

  function onDocumentClickForMoreMenu(event) {
    if (!c.state.show_more_menu) return;
    var menu = document.getElementById('tab-extras-fly-out-menu-' + c.data.instance_id);
    var button = document.getElementById('more-button-' + c.data.instance_id);
    if (!menu || !button) return;
    if (!menu.contains(event.target) && !button.contains(event.target)) {
      c.state.show_more_menu = false;
      $scope.$apply();
    }
  }

  function onWindowResize() {
    c.handlers.handleResize();
  }

  // Attach listeners that don't need to wait for loadData.
  // The window-resize listener is a fallback for browsers without
  // ResizeObserver; when RO is present, both simply funnel into the same
  // debounced handler (idempotent).
  document.addEventListener("click", onDocumentClickForMoreMenu);
  angular.element($window).on('resize', onWindowResize);

  // Clean up listeners on destroy
  $scope.$on('$destroy', function() {
    destroyed = true;

    document.removeEventListener("click", onDocumentClickForOptions);
    document.removeEventListener("click", onDocumentClickForMoreMenu);
    angular.element($window).off('resize', onWindowResize);

    var tableWrapper = document.getElementById("tableWrapper-" + c.data.instance_id);
    if (tableWrapper) {
      tableWrapper.removeEventListener('scroll', onTableWrapperScroll);
    }

    if (barResizeObserver) {
      barResizeObserver.disconnect();
      barResizeObserver = null;
    }

    if (resizeTimeoutPromise) {
      $timeout.cancel(resizeTimeoutPromise);
      resizeTimeoutPromise = null;
    }
  });

  // Recompute the split whenever the tab set changes.
  $scope.$watchCollection(function() {
    return c.data && c.data.tabs;
  }, function(newVal, oldVal) {
    if (newVal && newVal !== oldVal) {
      c.handlers.updateVisibleTabs();
    }
  });

  c.openRow = function(tab, row) {
    var url = "";
    var target = '_self';
    if (tab.open_backend == 'true') {
      url = "/nav_to.do?uri=" + tab.table + ".do?sys_id=" + row.sys_id;
      target = "_blank";
    } else {
      url = row.link + "&list_page=" + tab.view_all_pages;
    }
    $window.open(url, target);
  };

  c.handlers = {

    // --- tab lookup helpers ---

    getCurrentTab: function() {
      if (!c.data || !c.data.tabs) return null;
      return c.data.tabs.find(function(t) { return t.id === c.state.currentTabId; }) || null;
    },

    getCurrentTabIndex: function() {
      if (!c.data || !c.data.tabs) return -1;
      for (var i = 0; i < c.data.tabs.length; i++) {
        if (c.data.tabs[i].id === c.state.currentTabId) return i;
      }
      return -1;
    },

    getTabById: function(id) {
      if (!c.data || !c.data.tabs) return null;
      return c.data.tabs.find(function(t) { return t.id === id; }) || null;
    },

    /**
     * Sum the record counts of all tabs currently in the overflow dropdown.
     * Recomputed on read so it stays in sync after promotions, refreshes,
     * filter changes, etc.
     */
    getSecondaryRecordCount: function() {
      var secondary = c.state.secondary_tabs || [];
      var total = 0;
      for (var i = 0; i < secondary.length; i++) {
        var count = Number(secondary[i].details && secondary[i].details.record_count) || 0;
        total += count;
      }
      return total;
    },

    // --- fit calculation (count rule + container measurement) ---

    /**
     * The desktop tab bar element, measured for overflow. Selected by id so
     * a leading-digit sys_id can't break a querySelector('#...') call.
     */
    getBarElement: function() {
      if (!c.data) return null;
      return document.getElementById('primary-tab-bar-' + c.data.instance_id);
    },

    /**
     * Does the bar's content exceed its box? scrollWidth/clientWidth lets the
     * browser do the layout math (including the More button when present),
     * so there are no per-tab width constants to maintain.
     */
    isBarOverflowing: function() {
      var bar = c.handlers.getBarElement();
      if (!bar) return false;
      return (bar.scrollWidth - bar.clientWidth) > OVERFLOW_TOLERANCE_PX;
    },

    /**
     * STAGE 1 — count-rule ceiling. The most real tabs we'd ever show before
     * measurement trims further. max_tabs_visible counts the More tab, so an
     * overflow leaves (max - 1) real slots.
     */
    getCeilingCount: function() {
      var total = (c.data && c.data.tabs) ? c.data.tabs.length : 0;
      var maxTotal = parseInt(c.options.max_tabs_visible, 10) || 5;
      return (total <= maxTotal) ? total : (maxTotal - 1);
    },

    /**
     * STAGE 3 — the floor. Fewest real tabs allowed in the bar before we
     * collapse to the mobile <select>. Clamped to [1, max - 1].
     */
    getMinTabs: function() {
      var maxTotal = parseInt(c.options.max_tabs_visible, 10) || 5;
      var minTabs = parseInt(c.options.min_tabs_visible, 10);
      if (isNaN(minTabs) || minTabs < 1) minTabs = 1;
      return Math.min(minTabs, Math.max(1, maxTotal - 1));
    },

    /**
     * Entry point. Seed the bar with the ceiling set (optimistic), commit it
     * so the DOM renders, then hand off to the measure/reduce loop.
     */
    updateVisibleTabs: function() {
      try {
        c.state.visible_tabs = 1;                          // assume desktop; loop may flip to 0
        c.state.primary_count = c.handlers.getCeilingCount();
        c.handlers.rebuildTabSplit();
        c.handlers.measureAndReduce();
      } catch (e) {
        console.error("Error updating tab split: ", e);
      }
    },

    /**
     * STAGE 2 — measure the rendered bar; if it overflows, drop one real tab
     * into More and re-measure. Repeat until it fits or we hit the floor
     * (then go mobile). Runs across $timeout ticks so each reduction repaints
     * before the next measurement.
     */
    measureAndReduce: function() {
      $timeout(function step() {
        if (destroyed || !c.data || !c.data.tabs) return;
        if (c.data.isLoading) return;                      // bar not rendered yet
        if (c.state.visible_tabs === 0) return;            // already mobile
        if (!c.handlers.isBarOverflowing()) return;        // fits — done

        var next = c.state.primary_count - 1;
        var minTabs = c.handlers.getMinTabs();

        if (next < minTabs) {
          // Can't fit even the minimum — collapse to the mobile <select>.
          c.state.visible_tabs = 0;
          c.handlers.rebuildTabSplit();
          return;
        }

        c.state.primary_count = next;
        c.handlers.rebuildTabSplit();

        // Re-measure after this reduction re-renders.
        $timeout(step, 0);
      }, 0);
    },

    /**
     * Attach a ResizeObserver to the widget container so we re-fit on ANY
     * width change, not just window resizes. Falls back to the window-resize
     * listener (wired above) when ResizeObserver is unavailable.
     */
    setupBarObserver: function() {
      if (barResizeObserver || destroyed) return;
      var container = document.getElementById(c.data.instance_id);
      if (!container) return;
      if (typeof ResizeObserver === 'undefined') return;

      barResizeObserver = new ResizeObserver(function() {
        c.handlers.handleResize();
      });
      barResizeObserver.observe(container);
    },

    /**
     * Split c.data.tabs into primary_tabs (bar) and secondary_tabs (More)
     * using the current primary_count. Pure/no measurement — safe to call on
     * tab selection to re-run active-tab promotion.
     */
    rebuildTabSplit: function() {
      var all = (c.data && c.data.tabs) ? c.data.tabs : [];
      var total = all.length;

      // Mobile: everything lives in the <select>.
      if (c.state.visible_tabs === 0) {
        c.state.primary_tabs = [];
        c.state.secondary_tabs = all.slice();
        c.state.show_more_button = false;
        return;
      }

      var count = c.state.primary_count;
      if (count < 1) count = 1;
      if (count > total) count = total;

      // Everything fits without a More tab.
      if (total <= count) {
        c.state.primary_tabs = all.slice();
        c.state.secondary_tabs = [];
        c.state.show_more_button = false;
        return;
      }

      // Overflow: `count` real tabs + More; the rest go into the dropdown.
      var primary = all.slice(0, count);
      var secondary = all.slice(count);

      // --- Active-tab promotion ---
      // If the selected tab landed in the dropdown, swap it into the last
      // bar slot so its selected state stays visible in the bar.
      var activeId = c.state.currentTabId;
      var isActiveInPrimary = primary.some(function(t) { return t.id === activeId; });
      if (!isActiveInPrimary && activeId) {
        var idx = secondary.findIndex(function(t) { return t.id === activeId; });
        if (idx !== -1) {
          var activeTab = secondary[idx];
          var displaced = primary[primary.length - 1];
          primary[primary.length - 1] = activeTab;
          secondary[idx] = displaced;
        }
      }

      c.state.primary_tabs = primary;
      c.state.secondary_tabs = secondary;
      c.state.show_more_button = true;
    },

    handleResize: function() {
      if (resizeTimeoutPromise) {
        $timeout.cancel(resizeTimeoutPromise);
      }
      resizeTimeoutPromise = $timeout(function() {
        c.handlers.updateVisibleTabs();
        resizeTimeoutPromise = null;
      }, 150);
    },

    // --- more-menu controls ---

    toggleMoreMenu: function() {
      c.state.show_more_menu = !c.state.show_more_menu;
    },

    closeMoreMenu: function() {
      c.state.show_more_menu = false;
    },

    // --- tab selection ---

    setCurrentTabById: function(tabId) {
      if (!tabId) return;
      var tab = c.handlers.getTabById(tabId);
      if (!tab) return;

      c.state.currentTabId = tabId;

      c.state.sortColumn = tab.sort_field;
      c.state.sortDescending = !tab.sort;

      // Re-run the split so active-tab promotion reflects the new selection.
      // No re-measure — width hasn't changed, so primary_count stands.
      c.handlers.rebuildTabSplit();
      c.state.show_more_menu = false;

      var totalRecordCount = tab.details.record_count;
      var currentRecordCount = tab.details.rows.length;
      var recordLimit = c.state.record_limit;
      if (currentRecordCount !== Math.min(recordLimit, totalRecordCount)) {
        c.handlers.refreshCurrentTab();
        c.handlers.setCurrentTabTotalPages();
      }
    },

    // Shim for any legacy callers
    setCurrentIndex: function(index) {
      var tab = c.data.tabs[parseInt(index)];
      if (tab) c.handlers.setCurrentTabById(tab.id);
    },

    // --- keyboard navigation ---

    onTablistKeydown: function(event) {
      var key = event.which || event.keyCode;
      var LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40, HOME = 36, END = 35;

      if ([LEFT, RIGHT, HOME, END].indexOf(key) === -1) return;

      event.preventDefault();

      var primaries = c.state.primary_tabs;
      if (!primaries.length) return;

      var currentIdx = primaries.findIndex(function(t) {
        return t.id === c.state.currentTabId;
      });

      var nextIdx;
      if (key === LEFT) {
        nextIdx = currentIdx <= 0 ? primaries.length - 1 : currentIdx - 1;
      } else if (key === RIGHT) {
        nextIdx = currentIdx >= primaries.length - 1 ? 0 : currentIdx + 1;
      } else if (key === HOME) {
        nextIdx = 0;
      } else if (key === END) {
        nextIdx = primaries.length - 1;
      }

      var nextTab = primaries[nextIdx];
      if (!nextTab) return;

      c.handlers.setCurrentTabById(nextTab.id);

      $timeout(function() {
        var btn = document.getElementById('tab-' + c.data.instance_id + '-' + nextTab.id);
        if (btn) btn.focus();
      }, 0);
    },

    // --- other handlers ---

    handleSetCollapsed: function(bool) {
      if (!c.state.bodyHeight) {
        c.handlers.handleHeightCalculation();
      }
      if ([true, false].indexOf(bool) !== -1) {
        c.state.collapsed = bool;
        return;
      }
      c.state.collapsed = !c.state.collapsed;
    },

    handleHeightCalculation: function() {
      var id = 'dla-accordian-body-' + c.data.instance_id;
      var el = document.getElementById(id);
      if (!el) return;
      c.state.bodyHeight = el.clientHeight;
    },

    getBadgeNumber: function(num) {
      return Math.abs(num) > 999
        ? Math.sign(num) * ((Math.abs(num) / 1000).toFixed(1)) + 'k'
        : Math.sign(num) * Math.abs(num);
    },

    setColumnSort: function(column) {
      if (column.id === c.state.sortColumn) {
        c.state.sortDescending = !c.state.sortDescending;
      } else {
        c.state.sortColumn = column.id;
        c.state.sortDescending = true;
      }
      var tab = c.handlers.getCurrentTab();
      if (!tab) return;
      tab.sort_field = c.state.sortColumn;
      tab.sort = c.state.sortDescending;
      c.handlers.refreshCurrentTab();
    },

    setTabPage: function(page) {
      var tab = c.handlers.getCurrentTab();
      if (!tab) return;
      tab.selected_page = parseInt(page);
      c.handlers.refreshCurrentTab();
    },

    setTabPreviousPage: function() {
      var tab = c.handlers.getCurrentTab();
      if (tab) c.handlers.setTabPage(tab.selected_page - 1);
    },

    setTabNextPage: function() {
      var tab = c.handlers.getCurrentTab();
      if (tab) c.handlers.setTabPage(tab.selected_page + 1);
    },

    updateLimit: function() {
      c.handlers.refreshCurrentTab();
      c.handlers.setCurrentTabTotalPages();
      var tab = c.handlers.getCurrentTab();
      if (tab) tab.selected_page = 1;
    },

    setAllTabTotalPages: function() {
      for (var i in c.data.tabs) {
        c.handlers.setTabTotalPagesForTab(c.data.tabs[i]);
      }
    },

    setCurrentTabTotalPages: function() {
      var tab = c.handlers.getCurrentTab();
      if (tab) c.handlers.setTabTotalPagesForTab(tab);
    },

    setTabTotalPagesForTab: function(tab) {
      var tabRecordCount = tab.details.record_count;
      var currentLimit = parseInt(c.state.record_limit);
      tab.total_pages = Math.ceil(tabRecordCount / currentLimit);
    },

    resetSelectedPageForTab: function(tab) {
      if (tab) tab.selected_page = 1;
    },

    submitSearch: function() {
      if (c.state.search) {
        for (var i in c.data.tabs) {
          c.handlers.refreshTab(c.data.tabs[i]);
          c.handlers.resetSelectedPageForTab(c.data.tabs[i]);
        }
      }
      c.state.searched = true;
    },

    enterSearch: function(event) {
      if (event.keyCode === 13) c.handlers.submitSearch();
    },

    clearSearch: function() {
      c.state.search = "";
      for (var i in c.data.tabs) {
        c.handlers.refreshTab(c.data.tabs[i]);
      }
      c.handlers.setAllTabTotalPages();
      c.state.searched = false;
    },

    searchTextUpdate: function() {
      if (c.state.searched) c.state.searched = false;
    },

    refreshCurrentTab: function() {
      var tab = c.handlers.getCurrentTab();
      if (tab) c.handlers.refreshTab(tab);
    },

    refreshTab: function(tab) {
      if (!tab) return;
      c.server.get({
        action: "refresh-tab",
        tab: tab,
        searchText: c.state.search,
        limit: c.state.record_limit
      }).then(function(resp) {
        tab.details = resp.data.tabDetails;
        c.handlers.setTabTotalPagesForTab(tab);
      });
    },

    setCellClasses: function(column, displayValue) {
      var classes = [];
      if (!c.data.color_mapped.includes(column)) return null;
      classes.push("tag");

      var colorMapping = c.data.color_mapping;
      if (!colorMapping) return;
      colorMapping = JSON.parse(colorMapping);

      var columnMapping = colorMapping.find(function(mapping) {
        return mapping.field === column;
      });
      if (!columnMapping && columnMapping != "") return null;

      var colorConfig = columnMapping.classes.find(function(config) {
        return config.options.includes(displayValue);
      });
      if (colorConfig) classes.push(colorConfig.name);

      return classes;
    },

    toggleShowOptions: function() {
      c.state.show_options = !c.state.show_options;
    },

    selectSort: function(col, desc) {
      var tab = c.handlers.getCurrentTab();
      if (!tab) return;
      tab.sort_field = col;
      tab.sort = desc;
      c.state.sortColumn = col;
      c.state.sortDescending = desc;
      c.handlers.refreshCurrentTab();
    },

    selectFilter: function(value) {
      var tab = c.handlers.getCurrentTab();
      if (!tab) return;
      var has = tab.filter_value.includes(value);
      if (has) {
        tab.filter_value = tab.filter_value.filter(function(v) { return v !== value; });
      } else {
        tab.filter_value = tab.filter_value.concat(value);
      }
      c.handlers.resetSelectedPageForTab(tab);
      c.handlers.refreshCurrentTab();
    }
  };

  // --- cross-widget events ---

  $rootScope.$emit("get_is_dark_mode");

  $rootScope.$on("color_theme_dark", function(event, bool) {
    c.state.is_dark_mode = bool;
  });

  // --- approval / attestation flows ---

  function decrementTabRecordCount(tab) {
    // Coerce to a number first to avoid the old bug where getBadgeNumber()
    // returned a stringified "1.2k" for counts over 999 and + -1 produced
    // "1.2k-1" / NaN. Operate on the raw numeric count.
    var n = Number(tab.details.record_count) || 0;
    tab.details.record_count = Math.max(0, n - 1);
  }

  function removeRowFromTab(tabId, rowSysId) {
    for (var i in c.data.tabs) {
      if (c.data.tabs[i].id !== tabId) continue;
      var rows = c.data.tabs[i].details.rows;
      for (var j in rows) {
        if (rows[j].sys_id === rowSysId) {
          rows.splice(j, 1);
          decrementTabRecordCount(c.data.tabs[i]);
          break;
        }
      }
      break;
    }
  }

  c.onPrompt = function(approval_id, tab_id, row) {
    var m = 'Are you sure you wish to reject this item "' + row.document_id + '"?';
    spModal.open({
      title: 'Confirm Rejection',
      message: m,
      buttons: [
        { label: 'Cancel', cancel: true },
        { label: 'Confirm Rejection', submit: true, primary: true }
      ]
    }).then(function() {
      spModal.prompt("Rejection Reasoning", c.reason).then(function(reason) {
        c.reason = reason;
        c.server.get({ reason: c.reason, action: "reject", approval: approval_id }).then(function(resp) {
          spUtil.addInfoMessage("Your approval has been rejected successfully.");
          removeRowFromTab(tab_id, approval_id);
          c.reason = "";
        });
      });
    });
  };

  c.onAgree = function(approval_id, tab_id, row) {
    var m = 'Are you sure you wish to approve this item "' + row.document_id + '"?';
    spModal.open({
      title: 'Confirm Approval',
      message: m,
      buttons: [
        { label: 'Cancel', cancel: true },
        { label: 'Confirm Approval', approve: true, primary: true }
      ]
    }).then(function() {
      c.server.get({
        action: "approve",
        approval: approval_id,
        tab: c.handlers.getTabById(tab_id)
      }).then(function(resp) {
        spUtil.addInfoMessage("Your approval has been approved successfully!");
        removeRowFromTab(tab_id, approval_id);
      });
    });
  };

  c.updateAttestation = function(attestationId, answer, tab_id) {
    c.server.get({
      action: 'updateAttestation',
      attestationId: attestationId,
      answer: answer
    }).then(function(resp) {
      removeRowFromTab(tab_id, attestationId);
    });
  };

  c.openConfirmationModal = function(attestationId, answer, tab_id) {
    var isConfirm = answer === 'yes';
    spModal.open({
      title: isConfirm ? 'Are you sure you have this asset?' : "Are you sure you don't have this asset?",
      message: isConfirm
        ? 'You are confirming that you have this asset in your possession. This device will be added to your account.'
        : "You are confirming you don't have this asset. Your admin will begin an investigation to find this asset.",
      buttons: [
        { label: 'Cancel', cancel: true },
        { label: 'Confirm', primary: true }
      ],
      size: 'md'
    }).then(function() {
      c.updateAttestation(attestationId, isConfirm ? "yes" : "no", tab_id);
    });
  };

  // Close any open menus when a tab button is clicked at document level
  $document.on('click', function(e) {
    if (e.target.classList && e.target.classList.contains("tab")) {
      e.target.blur();
    }
  });
};
```

---

## 9. Option Schema

> Updated hints for `max_tabs_visible` and `min_tabs_visible`; both are now active.

```json
[
  {"hint":"Enter the title for this card.","name":"widget_title","section":"Presentation","default_value":"","label":"Title","type":"string"},
  {"name":"hide_collapse","section":"Presentation","default_value":"true","label":"Hide Collapse","type":"boolean"},
  {"displayValue":"WaaG List","name":"included_waag_items","display_value_list":[],"section":"Data","label":"Included WaaG Items","type":"glide_list","value":"x_g_dla_dla_connec_waag_list","ed":{"reference":"x_g_dla_dla_connec_waag_list"}},
  {"hint":"Integers separated by comma","name":"row_count_options","section":"Behavior","default_value":"6,12,24","label":"Row Count Options","type":"string"},
  {"hint":"Maximum number of tab slots in the bar, INCLUDING the More tab. If there are more tabs than this, the bar shows (max - 1) tabs plus a More dropdown. A narrow container can reduce the number of visible tabs below this.","name":"max_tabs_visible","section":"Behavior","default_value":"5","label":"Max Tabs Visible","type":"integer"},
  {"hint":"Fewest real tabs shown in the bar before the widget collapses to the mobile dropdown. If the container is too narrow to fit at least this many tabs, all tabs move into a single select.","name":"min_tabs_visible","section":"Behavior","default_value":"2","label":"Min Tabs Visible","type":"integer"},
  {"displayValue":"WaaG List","name":"always_show_waag_items","display_value_list":[],"section":"Data","label":"Always Show WaaG Items","type":"glide_list","value":"x_g_dla_dla_connec_waag_list","ed":{"reference":"x_g_dla_dla_connec_waag_list"}},
  {"name":"show_search","section":"Presentation","default_value":"","label":"Show Search","type":"boolean"},
  {"name":"include_pagination","section":"Behavior","default_value":"false","label":"Include Pagination","type":"boolean"},
  {"name":"title_color","section":"Presentation","label":"Title Color","type":"string"},
  {"hint":"Indicate the filter should be provided for the tables for the different state values.","name":"include_state_filter","section":"Behavior","default_value":"true","label":"Include State Filter","type":"boolean"},
  {"name":"show_export","section":"Presentation","default_value":"false","label":"Show Export","type":"boolean"},
  {"name":"show_tab_count_badge","section":"Presentation","default_value":"false","label":"Show Tab Count Badge","type":"boolean"},
  {"name":"hide_filtering","section":"Behavior","default_value":"false","label":"Hide Filtering","type":"boolean"}
]
```

---

## 10. Data flow

```
loadData resolves
   |- isLoading = false                      (real bar can render)
   |- updateVisibleTabs()
   |    |- primary_count = getCeilingCount() (STAGE 1: count rule)
   |    |- rebuildTabSplit()                 (commit optimistic set -> DOM renders)
   |    \- measureAndReduce() -- $timeout -->  isBarOverflowing()?
   |                                              |- no  -> done (fits)
   |                                              \- yes -> primary_count--            (STAGE 2)
   |                                                        |- < min? -> visible_tabs=0 (STAGE 3: mobile)
   |                                                        \- else   -> rebuildTabSplit() -> re-measure
   |
setupBarObserver() -- ResizeObserver on container --> handleResize() (debounced) --> updateVisibleTabs()
$watchCollection(tabs) ------------------------------> updateVisibleTabs()
setCurrentTabById() ---------------------------------> rebuildTabSplit() only (no re-measure)
```

---

## 11. Optional enhancements (not implemented)

- **Hard viewport floor in addition to container-fit.** If touch ergonomics ever require "always mobile below X px viewport regardless of container width," OR-in a check at the top of `measureAndReduce`'s step (before the overflow test):
  ```javascript
  if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) {
    c.state.visible_tabs = 0; c.handlers.rebuildTabSplit(); return;
  }
  ```
- **Suppress the single-item More dropdown.** When exactly one tab would overflow, keep it in the bar and drop the More button. Minor polish; adds a special case.
- **Cancel in-flight measure timeouts on teardown.** The `destroyed` guard already no-ops them; tracking and `$timeout.cancel`-ing is marginally cleaner if you prefer zero stray callbacks.

---

## 12. Testing checklist

**Count rule (wide container)**
- [ ] 3 / 4 / 5 tabs -> all in bar, no More.
- [ ] 6 tabs -> 4 in bar + More (2 in dropdown).
- [ ] 8 tabs -> 4 in bar + More (4 in dropdown).
- [ ] max_tabs_visible = 4, 5 tabs -> 3 in bar + More.

**Container reducer**
- [ ] 4 tabs, container narrowed so only 2 fit -> 2 in bar + More (2). (More appears with no count overflow.)
- [ ] 6 tabs, narrow container fits 3 -> 3 in bar + More (3).
- [ ] Widen the container back -> tabs return to the bar (expansion works, not just reduction).
- [ ] Resize a sibling/panel with no window resize -> ResizeObserver re-fits.

**Floor / mobile**
- [ ] Shrink until fewer than min_tabs_visible fit -> collapses to select.
- [ ] Grow back above the floor -> returns to the desktop bar.
- [ ] Select drives the active tab/panel.

**Retained behavior**
- [ ] Select a dropdown tab -> promoted into the last bar slot, shown selected.
- [ ] More badge = sum of dropdown record counts (show_tab_count_badge on).
- [ ] Keyboard nav (left/right/Home/End) cycles the bar tabs and moves focus.
- [ ] Dark mode renders correctly across bar / More / mobile / table.
- [ ] Approve/reject/attest decrements count; bar does not reshuffle mid-session.
- [ ] Search, filter, sort, pagination, export unaffected.

**Robustness**
- [ ] No boundary jitter when parked at a width right at the fit threshold.


# WaaG Widget — Tab Overflow Not Reducing (Bugfix + Logging)

## Symptom

Shrinking the container does not reduce the number of visible tabs. The count rule works (6 tabs render as 4 + a "more (2)"), but as the container narrows the tabs **overrun the container** instead of collapsing to 3+more, 2+more, etc. Stage 1 (count rule) runs; Stage 2 (the width reducer) never fires.

## Root cause

`isBarOverflowing()` detects overflow with `scrollWidth > clientWidth`, but `.tab-wrapper` right-aligns its tabs (`justify-content: end`). When the tabs don't fit, they overflow off the **left / start** edge — and `scrollWidth` does **not** count content that overflows to the left; it only measures content extending past the **right** edge.

So with right-aligned tabs, `scrollWidth` stays approximately equal to `clientWidth` no matter how badly the tabs overrun, `isBarOverflowing()` returns `false`, and the reducer concludes everything fits. That is exactly the observed behavior.

## Fix

Stop asking the browser "are you scroll-overflowing" (direction-dependent) and instead measure directly: **sum the flex children's widths + gaps and compare to the container's inner (content-box) width.** This is alignment- and scroll-direction-agnostic. `[WaaG fit]` logs are added across the pipeline to make the decision observable.

---

## Code changes (Client Controller)

### 1. Add a debug flag

Next to `OVERFLOW_TOLERANCE_PX`:

```javascript
  var OVERFLOW_TOLERANCE_PX = 2;
  var FIT_DEBUG = true;   // set false once verified
```

### 2. Replace `isBarOverflowing` (the actual fix)

```javascript
    /**
     * Overflow via direct measurement: sum the flex children's widths + gaps
     * and compare to the container's inner (content-box) width. This is
     * independent of justify-content / scroll direction — unlike scrollWidth,
     * which does NOT report content overflowing off the LEFT edge (which is
     * exactly what happens here because .tab-wrapper right-aligns its tabs).
     */
    isBarOverflowing: function() {
      var bar = c.handlers.getBarElement();
      if (!bar) return false;

      var cs = window.getComputedStyle(bar);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padR = parseFloat(cs.paddingRight) || 0;
      var gap  = parseFloat(cs.columnGap || cs.gap) || 0;

      var available = bar.clientWidth - padL - padR;

      var required = 0;
      var count = 0;
      var kids = bar.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].nodeType !== 1) continue;   // skip ng-if/ng-repeat comment nodes
        required += kids[i].offsetWidth;
        count++;
      }
      if (count > 1) required += gap * (count - 1);

      var overflow = (required - available) > OVERFLOW_TOLERANCE_PX;

      if (FIT_DEBUG) {
        console.log('[WaaG fit] check', {
          clientWidth: bar.clientWidth,
          available: available,
          required: required,
          children: count,
          primary_count: c.state.primary_count,
          overflow: overflow
        });
      }
      return overflow;
    },
```

### 3. Replace `updateVisibleTabs` (adds one log)

```javascript
    updateVisibleTabs: function() {
      try {
        c.state.visible_tabs = 1;
        c.state.primary_count = c.handlers.getCeilingCount();
        if (FIT_DEBUG) console.log('[WaaG fit] updateVisibleTabs: ceiling =', c.state.primary_count,
          'totalTabs =', (c.data && c.data.tabs ? c.data.tabs.length : 0));
        c.handlers.rebuildTabSplit();
        c.handlers.measureAndReduce();
      } catch (e) {
        console.error("Error updating tab split: ", e);
      }
    },
```

### 4. Replace `measureAndReduce` (adds decision logs)

```javascript
    measureAndReduce: function() {
      $timeout(function step() {
        if (destroyed || !c.data || !c.data.tabs) return;
        if (c.data.isLoading) return;
        if (c.state.visible_tabs === 0) return;

        if (!c.handlers.isBarOverflowing()) {
          if (FIT_DEBUG) console.log('[WaaG fit] fits at primary_count =', c.state.primary_count);
          return;
        }

        var next = c.state.primary_count - 1;
        var minTabs = c.handlers.getMinTabs();

        if (next < minTabs) {
          if (FIT_DEBUG) console.log('[WaaG fit] below floor (min =', minTabs, ') -> mobile <select>');
          c.state.visible_tabs = 0;
          c.handlers.rebuildTabSplit();
          return;
        }

        if (FIT_DEBUG) console.log('[WaaG fit] overflow -> reduce', c.state.primary_count, '->', next);
        c.state.primary_count = next;
        c.handlers.rebuildTabSplit();
        $timeout(step, 0);
      }, 0);
    },
```

### 5. Replace `setupBarObserver` and `handleResize` (adds observer logs)

```javascript
    setupBarObserver: function() {
      if (barResizeObserver || destroyed) return;
      var container = document.getElementById(c.data.instance_id);
      if (!container) { if (FIT_DEBUG) console.warn('[WaaG fit] no container to observe'); return; }
      if (typeof ResizeObserver === 'undefined') {
        if (FIT_DEBUG) console.warn('[WaaG fit] no ResizeObserver; using window-resize fallback');
        return;
      }
      barResizeObserver = new ResizeObserver(function(entries) {
        if (FIT_DEBUG && entries && entries[0]) {
          console.log('[WaaG fit] observer fired; container width =', Math.round(entries[0].contentRect.width));
        }
        c.handlers.handleResize();
      });
      barResizeObserver.observe(container);
      if (FIT_DEBUG) console.log('[WaaG fit] observing container', c.data.instance_id);
    },
```

```javascript
    handleResize: function() {
      if (resizeTimeoutPromise) $timeout.cancel(resizeTimeoutPromise);
      resizeTimeoutPromise = $timeout(function() {
        if (FIT_DEBUG) console.log('[WaaG fit] resize/observer -> recompute');
        c.handlers.updateVisibleTabs();
        resizeTimeoutPromise = null;
      }, 150);
    },
```

---

## How to read the logs

Filter the console by `[WaaG fit]` and shrink the width. Two things to watch:

1. **Does `observer fired; container width = …` change as you drag?**
   If the number never changes while the tabs overrun, the container itself isn't reflowing — the widget's parent column likely has a fixed/min width and the page is scrolling horizontally instead. That would be a layout problem (parent width constraints), not a detection one, and would need a different fix.

2. **In the `check` log, compare `required` vs `available`.**
   With the fix, once the tabs overrun you should see `required` clearly exceed `available` and a chain of `overflow -> reduce 4 -> 3 -> 2 …` until it fits or hits the floor. If `required` and `available` look right but it still doesn't reduce, capture a couple of those `check` lines for review.

## Expected result

The direct sum-based measurement reports overflow regardless of `justify-content`, so the width reducer now fires and the bar collapses tab-by-tab as the container narrows, down to the mobile `<select>` when it can't fit `min_tabs_visible`.

## After verifying

Set `FIT_DEBUG = false` to silence the logs (or remove the flag and log lines entirely). Fold this corrected `isBarOverflowing` into `solution.md` so that file remains the source of truth.

- [ ] No console errors on load, resize, tab switching, or widget teardown.
- [ ] Widget with 0 visible tabs (all empty, no always-show) stays hidden.
