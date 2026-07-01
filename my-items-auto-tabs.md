# WaaG Widget — Integrated: Current Production Code + Fixed-Count/Container-Fit Tab Solution

Integrates the marriage tab solution (count-rule ceiling → container-fit reducer → mobile floor, including the left-edge-overflow measurement bugfix) into the **current up-to-date widget code**, preserving all existing functionality.

---

## 1. What's different in the current code (vs. the base the solution was designed on)

Functionality present in the current code that the solution's earlier codebase did not have — **all preserved untouched**:

| Area | New functionality |
|------|-------------------|
| HTML | **Approval card grid** render path for `sysapproval_approver` tabs (cards with number/title/requester, Approve/Reject buttons, state pills), with the table as render path B for all other tabs. Refresh skeleton driven by `tab.is_refreshing`. |
| HTML | **View All** now routes through `c.viewAllUrl()`; new `view-under` footer block gated by the `include_view_all` option. |
| HTML | Attestation buttons call `c.onAssetApprove` / `c.onAssetReject` (replacing `openConfirmationModal`); "No Action Required" cells split into two `ng-if` tds. |
| SCSS | `.approval-card-grid` styles + dark-mode parity; `.tab` font/color hardened with `!important`; dropdown item padding 12px; `.dlac-pg` margin change; `view-under` styles. |
| Server | `data.default_tab = $sp.getParameter("tab")` for **deep-linking to a tab via URL param**; `gs.info` logging; null-guards on `getTableDetails` results (`continue` + `filter(tab.details != null)`); `common.enrichApprovalRows()` on loadData and refresh-tab; `view_all` field on each waag. |
| Controller | Default-tab selection honors `default_tab` from the URL before falling back to first tab; `getApprovalStateClass`; `refreshTab` sets/clears `is_refreshing`; `onPrompt` refreshes the tab after reject; new attestation flow (`updateAttestation(attestationId, answer, tab_id, record_id)`, `onAssetReject`, `onAssetApprove`); `viewAllUrl()`. |
| Link | New **Link function** adding native arrow-key focus listeners to `button[role='tab']`. Preserved as-is. |
| Schema | New `include_view_all` option. |

## 2. Issues found in the current code (fixed + flagged)

1. **`c.onAgree` was missing from the controller.** The HTML calls it from the Approve button in both the card grid and the table, but the function is not defined — it appears to have been lost when the commented-out attestation block was created. As-is, Approve throws and does nothing. **Restored** below, modeled on `onPrompt` (including the post-action `refreshTab`). ⚠️ Verify against your instance: if the real file still has its own `onAgree`, prefer that version.
2. **`<ledlad>` appeared twice** where `<legend>` belongs (Filter and Sort fieldsets) — restored to `<legend>`. Flag if intentional.
3. **Dead commented-out block removed** (the old `onAssetApprove`/`onConfirm` variants). Zero functional impact; noted for transparency.
4. *Observation only (no change):* the Link function captures `button[role='tab']` once on a `setTimeout` at load. Because `primary_tabs` re-renders on every split rebuild, those native listeners can go stale. The controller's `onTablistKeydown` (via `ng-keydown` on the tablist) is the one that survives re-renders. Not touched — flagged in case keyboard nav ever behaves oddly.

## 3. Integration changes (the solution being baked in)

| File | Change |
|------|--------|
| **HTML** | Added `id="primary-tab-bar-{{data.instance_id}}"` to the desktop tablist (measurement target). Only change. |
| **SCSS** | Added `flex-shrink: 0` to `.tab` and `.more-container` — **REQUIRED**: without it tabs squish instead of overflowing and fit detection never fires. Only change. |
| **Server** | **No changes.** |
| **Controller** | Removed `calculateVisibleTabs()`. Added the fit pipeline: `getBarElement`, `isBarOverflowing` (child-width **sum vs. container inner width** — the bugfix; `scrollWidth` misses left-edge overflow under `justify-content: end`), `getCeilingCount` (Stage 1: `max_tabs_visible` includes the More tab; overflow ⇒ max−1 real tabs), `getMinTabs` (Stage 3 floor), rewritten `updateVisibleTabs` + new `measureAndReduce` (Stage 2 render-then-measure reduce loop), `setupBarObserver` (ResizeObserver on the widget container), count-based `rebuildTabSplit` with active-tab promotion retained. `FIT_DEBUG` logging (`[WaaG fit]`) throughout. `destroyed` flag + observer disconnect on `$destroy`. `isLoading = false` moved **before** the first fit pass (render-then-measure). |
| **Link** | **No changes.** |
| **Schema** | Updated hints for `max_tabs_visible` (now includes the More tab) and `min_tabs_visible` (now the mobile floor). |

Set `FIT_DEBUG = false` after verifying in the instance.

---

## 4. HTML Template

> Changes: `id="primary-tab-bar-{{data.instance_id}}"` on the desktop tablist; `<ledlad>` → `<legend>` (2x, flagged fix). Everything else is your current code verbatim.

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
  <!-- INTEGRATION: id added so the fit pipeline can measure this bar -->
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
        More
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

  <!-- Skeleton loading - Table -->
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
                    <!-- FLAGGED FIX: was <ledlad> in provided code; restored to <legend> -->
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
                    <!-- FLAGGED FIX: was <ledlad> in provided code; restored to <legend> -->
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

          <!-- Render path A: card grid (Approvals tab) -->

          <!-- Skeleton while refreshing -->
          <div ng-if="tab.is_refreshing && tab.table == 'sysapproval_approver'"
               class="approval-card-grid">
            <div ng-repeat="i in [].constructor(6) track by $index"
                 class="approval-card approval-card-skeleton">
              <div class="skeleton skeleton-text" style="width: 40%; height: 12px;"></div>
              <div class="skeleton skeleton-text-md" style="width: 90%; height: 16px; margin-top: 8px;"></div>
              <div class="skeleton skeleton-text" style="width: 60%; height: 12px; margin-top: 8px;"></div>
            </div>
          </div>

          <div ng-if="!tab.is_refreshing && tab.table == 'sysapproval_approver' && tab.details.rows && tab.details.rows.length > 0"
               class="approval-card-grid">
            <div ng-repeat="row in tab.details.rows track by row.sys_id"
                 class="approval-card"
                 ng-click="c.openRow(tab, row)">

              <div class="approval-card-number">{{ row.parent_number }}</div>
              <div class="approval-card-title">{{ row.parent_title }}</div>
              <div ng-if="row.has_requester" class="approval-card-requester">
                Requester: {{ row.requester }}
              </div>

              <div class="approval-card-actions">
                <!-- Pending: Reject + Approve buttons -->
                <div ng-if="row['state'] == 'Requested'" class="approval-card-buttons">
                  <button type="button"
                          class="approval-action approve"
                          ng-click="c.onAgree(row.sys_id, tab.id, row); $event.stopPropagation()"
                          uib-tooltip="Approve request"
                          tooltip-placement="top">
                    <i class="fa fa-check" aria-hidden="true"></i> Approve
                  </button>
                  <button type="button"
                          class="approval-action reject"
                          ng-click="c.onPrompt(row.sys_id, tab.id, row); $event.stopPropagation()"
                          uib-tooltip="Reject request"
                          tooltip-placement="top">
                    <i class="fa fa-close" aria-hidden="true"></i> Reject
                  </button>
                </div>

                <!-- Resolved: state pill -->
                <div ng-if="row['state'] != 'Requested'"
                     class="approval-card-state-pill"
                     ng-class="c.handlers.getApprovalStateClass(row['state'])">
                  {{ row['state'] }}
                </div>
              </div>
            </div>
          </div>

          <!-- Render path B: existing table view (all other tabs) -->
          <div ng-if="tab.table != 'sysapproval_approver'" class="table-responsive-wrapper" id="tableWrapper-{{data.instance_id}}">
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
                    <button id="tab-confirm-pop-up" class="approval-action approve"  ng-click="c.onAssetApprove(row.sys_id, tab.id, row)" uib-tooltip="Confirm asset" tooltip-placement="left">
                      <i class="fa fa-check"></i>
                    </button>
                    <button id="tab-deny-pop-up" class="approval-action reject" ng-click="c.onAssetReject(row.sys_id, tab.id, row)" uib-tooltip="Deny asset" tooltip-placement="left">
                      <i class="fa fa-close"></i>
                    </button>
                  </td>
                  <td ng-if="(tab.table == 'sysapproval_approver' && row['state'] != 'Requested')">
                    <span class='text-sm'>No Action Required</span>
                  </td>
                  <td ng-if="(tab.table == 'sn_itam_common_attestation_asset_m2m' && row['status'] != 'Open')">
                    <span class='text-sm'>No Action Required</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class='card-footer'>
            <div ng-if="tab.details.record_count > 0 && options.include_pagination == 'false'" class="non-pagination" ng-class="{'dark': c.state.is_dark_mode }">
              <span class='title-small'>Showing {{tab.details.rows.length}} of {{tab.details.record_count}}</span>
              <a class='title-small' ng-click="c.viewAllUrl()">View All<i class='fa fa-arrow-right'></i></a>
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
            <div ng-if="options.include_view_all == 'true' && options.include_pagination == 'true'" class="view-under">
              <a class='title-small' ng-click="c.viewAllUrl()" style="text-decoration: none">View All<i class='fa fa-arrow-right'></i></a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 5. SCSS

> Changes: `flex-shrink: 0` added to `.tab` and `.more-container` (marked **REQUIRED**). Everything else is your current code verbatim, including the approval card grid and view-under styles.

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

.approval-card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 4px;

  @media (max-width: 992px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 576px) {
    grid-template-columns: 1fr;
  }


  .approval-card {
    background: white;
    border: 1px solid $Neutral-100;
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
    min-height: 160px;

    &:hover {
      border-color: $color-light-blue;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .approval-card-number {
      font-size: 12px;
      font-weight: 500;
      color: $Neutral-600;
      letter-spacing: 0.02em;
    }

    .approval-card-title {
      font-size: 15px;
      font-weight: 700;
      color: $Sky-500;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .approval-card-requester {
      font-size: 13px;
      color: black;
    }

    .approval-card-actions {
      margin-top: auto;
      padding-top: 8px;

      .approval-card-buttons {
        display: flex;
        gap: 12px;

        .approval-action {
          flex: 1;
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          font-size: 13px;
          font-weight: 600;
          color: white;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: filter 0.15s ease;

          i { color: white; }

          &.reject {
            background: #B82828;
            &:hover, &:focus { filter: brightness(0.92); }
          }
          &.approve {
            background: #2A8A3E;
            &:hover, &:focus { filter: brightness(0.92); }
          }
        }
      }

      .approval-card-state-pill {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 50px;
        font-size: 12px;
        font-weight: 600;

        &.pill-success {
          background: rgba(42, 138, 62, 0.12);
          color: #2A8A3E;
        }
        &.pill-danger {
          background: rgba(184, 40, 40, 0.12);
          color: #B82828;
        }
        &.pill-neutral {
          background: $Neutral-100;
          color: $Neutral-600;
        }
      }
    }
  }
}

// Dark mode parity
.dark .approval-card-grid {
  .approval-card {
    background: $color-light-black;
    border-color: $color-gray;

    &:hover {
      border-color: $color-sky-blue;
    }

    .approval-card-number {
      color: $color-light-gray;
    }
    .approval-card-title {
      color: $color-sky-blue;
    }
    .approval-card-requester {
      color: $color-light-gray;
    }

    .approval-card-actions .approval-card-state-pill {
      &.pill-neutral {
        background: $color-gray;
        color: $color-light-gray;
      }
    }
  }
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
    font-size: 14px !important;
    font-weight: 700 !important;
    border-radius: 8px 8px 0 0;
    color: $Neutral-600 !important;
    background: linear-gradient(180deg, rgba(0,0,0,0) 67.65%, rgba(0,0,0,.1) 100%), white;
    border: none;
    flex-shrink: 0; // INTEGRATION (REQUIRED): keep natural width so the bar genuinely overflows; fit detection relies on it

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
    flex-shrink: 0;         // INTEGRATION (REQUIRED): same reason as .tab — must not shrink

    .more-tab {
      // No overrides needed — .tab above handles padding, font, gap.
      // Only style the leading icon here.
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

      .tab-button {
        display: flex;
        padding: 12px;
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
    top: 35%;
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
	margin-bottom: 14px;
}

.table-responsive-wrapper {
  overflow-x: auto;
  position: relative;

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
  .view-under{
    text-align: right;
    color: $Sky-500;
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

## 6. Server Script

**No changes** — your current server script verbatim (deep-link `default_tab`, `gs.info` logging, details null-guards, `enrichApprovalRows`, `view_all` field all preserved). Included in full so this doc is a complete drop-in set.

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
	data.default_tab = $sp.getParameter("tab")||null;
	/* force async */
	if (!input) {
		return;
	}

	if (input) {
		if (input.action) {
			if(input.action == 'loadData') {
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
						//link_object: gRec.url_query, 
						link_object: {
							id: gRec.target_page.getDisplayValue('id'),
							table: gRec.table.name.toString(),
							sys_id: "{sys_id}"
						},
						target_page: gRec.target_page.getDisplayValue('id'),
						view_all_page: gRec.view_all_page.getDisplayValue('id'),
						view_all: gRec.getValue('view_all'),
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
					if(dt.filter_value.length > 0) {
						intialEncodedQuery += "^" + dt.filter_column + "IN" + dt.filter_value.join(",");
					}

					gs.info("WAAG | in Widget | tab: " + dt.table);
					data.tabs[i].details = common.getTableDetails(dt.table, intialEncodedQuery, dt.query, !dt.sort, dt.sort_field, dt.limit, dt.fields, dt.should_count, dt.masked_names, dt.link_object);
					if(!data.tabs[i].details){
						continue;
					}

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


				// Filter out tabs where details could not be fetched				
				data.tabs = data.tabs.filter(tab => tab.details != null);

				// existing per-tab loop ends here, then:

				// Enrich approval rows with parent record data for the card view
				for (var k = 0; k < data.tabs.length; k++) {
					if (data.tabs[k].table === 'sysapproval_approver'
							&& data.tabs[k].details
							&& data.tabs[k].details.rows
							&& data.tabs[k].details.rows.length) {
						common.enrichApprovalRows(data.tabs[k].details.rows);
					}
				}

				// order the tabs by record count
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
				// convert date fields to clean format, check if each record has attachment
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

				if (currentTab.table === 'sysapproval_approver' && details.rows && details.rows.length) {
					common.enrichApprovalRows(details.rows);
				}

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

			if(input.action == 'updateAttestation') {
				dlacMyAssetUtil.updateAttestation(input.attestationId, input.answer);
			}
		}
	}

	// fetch more records of the tab selected from the tab


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



/*
 * Update Approval record
 */
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


// development of functionality to check if table / record has attachments
function checkHasAttachments(id) {
	var gRec = new GlideRecord('sys_attachment');
	gRec.addQuery('table_sys_id', id);
	gRec.query();

	if (gRec.next()) {
		return true;
	}
	return false;
}

// given the ID of a table, confirm that the table has the provided field (by field id)
function checkHasStateField(table, field_id) {
	// error handling in case the table id is invalid
	try {
		var recGR = new GlideRecord(table);
		recGR.query();

		recGR.next();
		return recGR.isValidField(field_id);

	} catch (err) {
		return null;
	}
}

// pulls the parent table of a table if one exists, for use in finding inherited choice options from parent table
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
	// add task table as an option in case the options are inherited from that table
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

	// check if there are defined choices for the requested table, default to 'task' table choices otherwise
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

## 7. Client Controller

> The merge point. Your current controller with the fit pipeline integrated. `calculateVisibleTabs` removed; `c.onAgree` **restored** (was missing — flagged in §2). `FIT_DEBUG = true` for verification; set `false` after.

```javascript
api.controller = function($scope, $window, $timeout, $rootScope, spModal, spUtil, $document) {
	var c = this;

	// --- INTEGRATION: fit-pipeline constants ---
	// Absorbs sub-pixel rounding at the fit boundary so a 1px resize can't jitter.
	var OVERFLOW_TOLERANCE_PX = 2;
	var FIT_DEBUG = true;   // set false once verified in the instance

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

		// --- INTEGRATION: tab-split state ---
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
	var barResizeObserver = null;   // INTEGRATION
	var destroyed = false;          // INTEGRATION

	/*
   * Async Load Data
   */
	c.server.get({action: 'loadData'}).then(function(response) {
		c.data = response.data;
		c.state.show_widget = c.setShowWidget();


		//choose tabs
		if (c.data.tabs.length > 0) {
			//if view all sys_id exists
			if(c.data.default_tab != null){
				for (var i = 0; i < c.data.tabs.length; i++) {
					if(c.data.tabs[i].id === c.data.default_tab){
						c.state.currentTabId = c.data.tabs[i].id;
						c.state.sortColumn = c.data.tabs[i].sort_field;
						c.state.sortDescending = !c.data.tabs[i].sort;
						break;
					}
				}
				// Fallback if the URL param didn't match any visible tab
				if (!c.state.currentTabId) {
					c.state.currentTabId = c.data.tabs[0].id;
					c.state.sortColumn = c.data.tabs[0].sort_field;
					c.state.sortDescending = !c.data.tabs[0].sort;
				}
			}
			// else Pick the first tab as active by default
			else{
				c.state.currentTabId = c.data.tabs[0].id;
				// seed sort state from the active tab
				c.state.sortColumn = c.data.tabs[0].sort_field;
				c.state.sortDescending = !c.data.tabs[0].sort;
			}
		}

		// INTEGRATION: render-then-measure — the bar must exist in the DOM
		// before the fit pass, so isLoading flips BEFORE updateVisibleTabs.
		c.data.isLoading = false;

		// First fit pass (renders the ceiling set, then measures & reduces).
		c.handlers.updateVisibleTabs();

		// INTEGRATION: observe the widget container so we re-fit on ANY width
		// change — window resize, sibling panel collapse, dashboard reflow.
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




	// Named handlers so we can remove them on $destroy
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
	// The window-resize listener doubles as a fallback for browsers without
	// ResizeObserver; both funnel into the same debounced handler.
	document.addEventListener("click", onDocumentClickForMoreMenu);
	angular.element($window).on('resize', onWindowResize);

	// Clean up listeners on destroy
	$scope.$on('$destroy', function() {
		destroyed = true;   // INTEGRATION: no-ops any in-flight measure timeouts

		document.removeEventListener("click", onDocumentClickForOptions);
		document.removeEventListener("click", onDocumentClickForMoreMenu);
		angular.element($window).off('resize', onWindowResize);

		var tableWrapper = document.getElementById("tableWrapper-" + c.data.instance_id);
		if (tableWrapper) {
			tableWrapper.removeEventListener('scroll', onTableWrapperScroll);
		}

		// INTEGRATION: disconnect the container observer
		if (barResizeObserver) {
			barResizeObserver.disconnect();
			barResizeObserver = null;
		}

		if (resizeTimeoutPromise) {
			$timeout.cancel(resizeTimeoutPromise);
			resizeTimeoutPromise = null;
		}
	});

	// Recompute the split whenever the tab set changes (tabs loaded, filters
	// alter empty-tab visibility, etc.)
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
		/**
 * Map a state display value to a CSS class for the state pill.
 * Approved → green, Rejected → red, anything else → grey.
 */
		getApprovalStateClass: function (stateDisplayValue) {
			if (!stateDisplayValue) return 'pill-neutral';
			var normalized = ('' + stateDisplayValue).toLowerCase();
			if (normalized === 'approved') return 'pill-success';
			if (normalized === 'rejected') return 'pill-danger';
			return 'pill-neutral';
		},
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
 			* Recomputed on read (not cached) so it stays in sync with the live
			* primary/secondary split after promotions, refreshes, and filters.
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

		// --- INTEGRATION: fit calculation (count rule + container measurement) ---

		/**
		 * The desktop tab bar element, measured for overflow. Selected by id so
		 * a leading-digit sys_id can't break a querySelector('#...') call.
		 */
		getBarElement: function() {
			if (!c.data) return null;
			return document.getElementById('primary-tab-bar-' + c.data.instance_id);
		},

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
				c.state.visible_tabs = 1;                        // assume desktop; loop may flip to 0
				c.state.primary_count = c.handlers.getCeilingCount();
				if (FIT_DEBUG) console.log('[WaaG fit] updateVisibleTabs: ceiling =', c.state.primary_count,
					'totalTabs =', (c.data && c.data.tabs ? c.data.tabs.length : 0));
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
				if (c.data.isLoading) return;                    // bar not rendered yet
				if (c.state.visible_tabs === 0) return;          // already mobile

				if (!c.handlers.isBarOverflowing()) {
					if (FIT_DEBUG) console.log('[WaaG fit] fits at primary_count =', c.state.primary_count);
					return;
				}

				var next = c.state.primary_count - 1;
				var minTabs = c.handlers.getMinTabs();

				if (next < minTabs) {
					// Can't fit even the minimum — collapse to the mobile <select>.
					if (FIT_DEBUG) console.log('[WaaG fit] below floor (min =', minTabs, ') -> mobile <select>');
					c.state.visible_tabs = 0;
					c.handlers.rebuildTabSplit();
					return;
				}

				if (FIT_DEBUG) console.log('[WaaG fit] overflow -> reduce', c.state.primary_count, '->', next);
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

			// Active-tab promotion: if the selected tab landed in the dropdown,
			// swap it into the last bar slot so its selected state stays visible.
			var activeId = c.state.currentTabId;
			var isActiveInPrimary = primary.some(function(t) { return t.id === activeId; });

			if (!isActiveInPrimary && activeId) {
				var activeInSecondaryIdx = secondary.findIndex(function(t) { return t.id === activeId; });
				if (activeInSecondaryIdx !== -1) {
					// Swap the active tab into the last primary slot; the displaced
					// tab goes back into secondary at the active tab's former position.
					var activeTab = secondary[activeInSecondaryIdx];
					var displaced = primary[primary.length - 1];

					primary[primary.length - 1] = activeTab;
					secondary[activeInSecondaryIdx] = displaced;
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
				if (FIT_DEBUG) console.log('[WaaG fit] resize/observer -> recompute');
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

			// Reset sort state to the newly-active tab's defaults
			c.state.sortColumn = tab.sort_field;
			c.state.sortDescending = !tab.sort;

			// Re-run the split so active-tab promotion reflects the new selection.
			// No re-measure — width hasn't changed, so primary_count stands.
			c.handlers.rebuildTabSplit();
			// Close the More menu if it was open
			c.state.show_more_menu = false;

			// Lazy-refresh: only hit the server if our local rows don't match
			// what the current limit/count would show.
			var totalRecordCount = tab.details.record_count;
			var currentRecordCount = tab.details.rows.length;
			var recordLimit = parseInt(c.state.record_limit);
			if (currentRecordCount !== Math.min(recordLimit, totalRecordCount)) {
				c.handlers.refreshCurrentTab();
				c.handlers.setCurrentTabTotalPages();
			}
		},

		// Kept for any legacy callers; routes through the id-based handler.
		setCurrentIndex: function(index) {
			var tab = c.data.tabs[parseInt(index)];
			if (tab) c.handlers.setCurrentTabById(tab.id);
		},

		// --- keyboard navigation ---

		onTablistKeydown: function(event) {
			// Arrow key navigation across the PRIMARY tab bar. We only cycle
			// through primary_tabs (menu items inside the overflow dropdown
			// have their own focus flow).
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

			// Move focus to the newly-selected tab
			$timeout(function() {
				var btn = document.getElementById('tab-' + c.data.instance_id + '-' + nextTab.id);
				if (btn) btn.focus();
			}, 0);
		},

		// --- the rest of the unchanged handlers ---

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
			tab.is_refreshing = true;
			c.server.get({
				action: "refresh-tab",
				tab: tab,
				searchText: c.state.search,
				limit: c.state.record_limit
			}).then(function(resp) {
				tab.details = resp.data.tabDetails;
				c.handlers.setTabTotalPagesForTab(tab);
				tab.is_refreshing = false;
				//c.state.record_limit = parseInt(c.state.record_limit);
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
		// Guard against the old bug where getBadgeNumber() returned a
		// stringified "1.2k" for counts over 999 and + -1 produced
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
					var refreshedTab = c.handlers.getTabById(tab_id);
					if (refreshedTab)  {
						c.handlers.refreshTab(refreshedTab);
					}
					c.reason = "";
				});
			});
		});
	};

	// RESTORED (see doc §2): c.onAgree was missing from the provided controller
	// but is called by the Approve button in BOTH the card grid and the table.
	// Modeled on onPrompt, including the post-action tab refresh. If your
	// instance's live file still has its own onAgree, prefer that version.
	c.onAgree = function(approval_id, tab_id, row) {
		var m = 'Are you sure you wish to approve this item "' + (row.parent_title || row.document_id) + '"?';
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
				var refreshedTab = c.handlers.getTabById(tab_id);
				if (refreshedTab)  {
					c.handlers.refreshTab(refreshedTab);
				}
			});
		});
	};

	//////////////////////// Asset Attestation Actions ////////////////////////
	c.updateAttestation = function(attestationId, answer, tab_id, record_id) {
		try {
			c.server.get({
				action: 'updateAttestation',
				attestationId: attestationId, 
				answer: answer
			}).then(function(resp) {
				removeRowFromTab(tab_id, record_id);
				var refreshedTab = c.handlers.getTabById(tab_id);
				if (refreshedTab)  {
					c.handlers.refreshTab(refreshedTab);
				}
			});
		} catch (err) {
			console.error(err);
		}
	}



	c.onAssetReject = function(attestationId, tab_id, record_id) {
		var m = 'You are confirming that you do not have this asset in your possession. Your admin will begin an investigation to find this asset.';

		spModal.open({
			title: "Are you sure you don't have this asset?",
			message: m,
			buttons: [
				{ label: 'Cancel', cancel: true },
				{ label: 'Confirm Rejection', primary: true }
			]
		}).then(function(resp) {
			c.updateAttestation(attestationId, "no", tab_id, record_id);
			spUtil.addInfoMessage("Your confirmation has been rejected successfully!");
		});
	};

	c.onAssetApprove = function(attestationId, tab_id, record_id) {
		var m = 'You are confirming that you have this asset in your possession. This device will be maintained under your account.';

		spModal.open({
			title: 'Are you sure you have this asset?',
			message: m,
			buttons: [
				{ label: 'Cancel', cancel: true },
				{ label: 'Confirm Approval', primary: true }
			]
		}).then(function(resp) {
			c.updateAttestation(attestationId, "yes", tab_id, record_id);
			spUtil.addInfoMessage("Your confirmation has been approved successfully!")
		});
	};

	// (Dead commented-out attestation variants removed — see doc §2, item 3.)

	// Close More menu when any tab button is clicked at document level
	$document.on('click', function(e) {
		if (e.target.classList && e.target.classList.contains("tab")) {
			e.target.blur();
		}
	});
	//view all functionality
	c.viewAllUrl = function(){
		var tab = c.handlers.getCurrentTab();
		var url = "";
		var viewID = tab.view_all;
		if (tab.view_all != null) {
			url = c.data.view_all_url + "&tab=" + viewID;
			$window.open(url, "_self");
		} else {
			url = c.data.view_all_url;
			$window.open(url, "_self");
		}
		//$window.open(url);
	}

};
```

---

## 8. Link Function

**No changes** — preserved verbatim. ⚠️ Observation (no action taken): this captures `button[role='tab']` once on a load-time `setTimeout`; because `primary_tabs` re-renders on every split rebuild, these native listeners can go stale on re-rendered buttons. The controller's `onTablistKeydown` (bound via `ng-keydown` on the tablist itself) survives re-renders and provides the same navigation. Flagged in case keyboard behavior ever looks doubled or inconsistent.

```javascript
function link(scope, element, attrs, controller) {
    var c = scope.c;
    var parent = null;
    var tabs = null;

    var resetTabs = function() {
        tabs.forEach(function(el) {
            el.setAttribute('tabIndex', -1);
        });
    };

    var moveToNextTab = function(idx) {
        resetTabs();
        if (tabs.length - 1 === idx) {
            tabs[0].setAttribute('tabIndex', 0);
            tabs[0].focus();
            //tabs[0].scrollIntoView(scrollOptions);
        } else {
            tabs[idx + 1].setAttribute('tabIndex', 0);
            tabs[idx + 1].focus();
            //tabs[idx + 1].scrollIntoView(scrollOptions);
        }
    };

    var moveToPreviousTab = function(idx) {
        resetTabs();
        if (idx === 0) {
            tabs[tabs.length - 1].setAttribute('tabIndex', 0);
            tabs[tabs.length - 1].focus();
            //tabs[tabs.length - 1].scrollIntoView(scrollOptions);
        } else {
            tabs[idx - 1].setAttribute('tabIndex', 0);
            tabs[idx - 1].focus();
            //tabs[idx - 1].scrollIntoView(scrollOptions);
        }
    };

    var addTabListeners = function() {
        // on arrow keys set the focus of a given element
        tabs.forEach(function(el, index) {
            el.removeEventListener('keydown', function() {
                // no need to copy function here, 
                // second argument is required though
            });
            el.addEventListener('keydown', function(evt) {
                switch (evt.key) {
                    case 'ArrowLeft':
                        moveToPreviousTab(index);
                        break;

                    case 'ArrowRight':
                        moveToNextTab(index);
                        break;

                    case 'Home':
                        evt.preventDefault();
                        moveToNextTab(tabs.length - 1);
                        break;

                    case 'End':
                        evt.preventDefault();
                        moveToPreviousTab(0);
                        break;

                    default:
                        break;
                }
            });
        });
    };

    var completeSetup = function() {
        tabs = parent.querySelectorAll("button[role='tab']");
        addTabListeners();
    };

    setTimeout(function() {
        parent = document.getElementById(c.data.instance_id);
        completeSetup();
    });

}
```

---

## 9. Option Schema

> Changes: hints updated for `max_tabs_visible` (now includes the More tab) and `min_tabs_visible` (now the mobile floor). `include_view_all` preserved.

```json
[
  {"hint":"Enter the title for this card.","name":"widget_title","section":"Presentation","default_value":"","label":"Title","type":"string"},
  {"name":"hide_collapse","section":"Presentation","default_value":"true","label":"Hide Collapse","type":"boolean"},
  {"displayValue":"WaaG List","name":"included_waag_items","display_value_list":[],"section":"Data","label":"Included WaaG Items","type":"glide_list","value":"x_g_dla_dla_connec_waag_list","ed":{"reference":"x_g_dla_dla_connec_waag_list"}},
  {"hint":"Integers separated by comma","name":"row_count_options","section":"Behavior","default_value":"6,12,24","label":"Row Count Options","type":"string"},
  {"hint":"Maximum number of tab slots in the bar, INCLUDING the More tab. If there are more tabs than this, the bar shows (max - 1) tabs plus a More dropdown. A narrow container can reduce visible tabs below this.","name":"max_tabs_visible","section":"Behavior","default_value":"5","label":"Max Tabs Visible","type":"integer"},
  {"hint":"Fewest real tabs shown in the bar before the widget collapses to the mobile dropdown. If the container cannot fit at least this many tabs, all tabs move into a single select.","name":"min_tabs_visible","section":"Behavior","default_value":"2","label":"Min Tabs Visible","type":"integer"},
  {"displayValue":"WaaG List","name":"always_show_waag_items","display_value_list":[],"section":"Data","label":"Always Show WaaG Items","type":"glide_list","value":"x_g_dla_dla_connec_waag_list","ed":{"reference":"x_g_dla_dla_connec_waag_list"}},
  {"name":"show_search","section":"Presentation","default_value":"","label":"Show Search","type":"boolean"},
  {"name":"include_pagination","section":"Behavior","default_value":"false","label":"Include Pagination","type":"boolean"},
  {"name":"title_color","section":"Presentation","label":"Title Color","type":"string"},
  {"hint":"Indicate the filter should be provided for the tables for the different state values.","name":"include_state_filter","section":"Behavior","default_value":"true","label":"Include State Filter","type":"boolean"},
  {"name":"show_export","section":"Presentation","default_value":"false","label":"Show Export","type":"boolean"},
  {"name":"show_tab_count_badge","section":"Presentation","default_value":"false","label":"Show Tab Count Badge","type":"boolean"},
  {"name":"hide_filtering","section":"Behavior","default_value":"false","label":"Hide Filtering","type":"boolean"},
  {"name":"include_view_all","section":"Behavior","default_value":"true","label":"Include View All","type":"boolean"}
]
```

---

## 10. Verification checklist

**Tab solution (fit pipeline)**
- [ ] Wide container: 5 tabs -> all 5, no More; 6 tabs -> 4 + More (2).
- [ ] Shrink container: bar reduces 4 -> 3 -> 2 (+More growing), then mobile select below the floor; widen -> restores.
- [ ] `[WaaG fit]` logs show observer firing on drag and `required` vs `available` driving reductions.
- [ ] Deep-link `?tab=<sys_id>` to a tab that lands in the dropdown -> promoted into the last bar slot, shown selected.
- [ ] Set `FIT_DEBUG = false` after verification.

**Preserved current functionality**
- [ ] Approvals tab renders the CARD GRID (number, title, requester, Approve/Reject or state pill); refresh shows card skeletons.
- [ ] Approve works (restored `onAgree`) — modal, server call, row removed, badge decremented, tab refreshed. ⚠️ Confirm modal copy matches what you had, if your instance still has an original.
- [ ] Reject flow with reason prompt + refresh works.
- [ ] Asset attestation Confirm/Deny modals work and refresh the tab.
- [ ] View All (footer link and view-under variant) routes via `viewAllUrl()` with the `&tab=` param when `view_all` is set.
- [ ] Non-approval tabs render the table exactly as before; sorting/filtering/search/pagination/export intact.
- [ ] Deep-link `?tab=<sys_id>` selects the right tab on load; invalid param falls back to first tab.
- [ ] Dark mode intact across cards, bar, More dropdown, mobile select, table.
