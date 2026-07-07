# WaaG Widget — Asset Attestation Card View

Converts the asset attestation tab (`sn_itam_common_attestation_asset_m2m`) from the table render path to a **card grid**, mirroring the existing approvals card functionality (skeleton loading, pagination, card drop-off on action) with the UI modeled on the **My Assets** reference widget (asset image + tag/model/serial layout, Reject/Approve Asset buttons, "Under Review"-style pill).

Baseline: `waag-integrated.md`. This doc contains the full updated HTML, SCSS, and Client Controller. **Server Script, Link Function, and Option Schema are unchanged** — use them from `waag-integrated.md` §6, §8–9. The My Assets reference widget itself is **not modified**.

---

## 1. Approach

The widget already has the pattern: approvals render as path A (card grid) while everything else renders as path B (table). This adds **render path C** for the attestation table, built from the same machinery:

| Approval behavior to mirror | How path C gets it |
|---|---|
| Skeleton while refreshing | Same `tab.is_refreshing` flag (already set/cleared by `refreshTab`); asset-card-shaped skeletons. |
| Pagination | **No work needed** — the card footer paginates off `tab.details` and is render-path-agnostic. Page changes call `refreshTab`, which re-fetches the rows. |
| Card drop-off on action | Same `removeRowFromTab` + `refreshTab` flow the attestation handlers already use — **plus a call-site bug fix** (see §2). |
| Card data fields | **Via the WaaG list record** — `asset_tag`, `model`, `serial_number` arrive on the rows through the tab's configured `list_view_fields` and `getTableDetails`, exactly like every other tab. **No server-side enrichment**; the HTML binds the row fields directly. |
| Pending vs. resolved states | `status == 'Open'` → buttons; otherwise → status pill via new `getAttestationStatusClass` (parallel to `getApprovalStateClass`). |

From the reference widget's UI: card layout (image placeholder, `asset_tag` / `model` / `Serial Number:` stack), button order (Reject left, Approve right), and the "Under Review" pill styling (warning background, italic) — mapped to the `pill-warning` class.

## 2. Bug fix included: attestation card drop-off

The current HTML passes the **row object** as `record_id` — `c.onAssetApprove(row.sys_id, tab.id, row)` — so `removeRowFromTab` compares a sys_id string against an object and never matches. The card/row only disappeared after the server refresh round-trip. Path C passes `row.sys_id`, restoring the instant drop-off approvals have. (The old table call sites are now dead code behind path B's gate, so no second fix needed.)

## 3. Configuration dependency + assumptions to verify

1. **WaaG list record config is the data contract.** The attestation tab's `list_view_fields` on the WaaG list record must include the asset tag, model, and serial number fields (plus `status`, which the buttons/pill key off). The HTML binds `row.asset_tag`, `row.model`, `row.serial_number` — i.e., it assumes those are the field IDs as configured. **If the configured fields are dot-walks** (e.g., `asset.asset_tag`), switch the bindings to bracket notation: `{{ row['asset.asset_tag'] }}`. One place to adjust, marked in the HTML.
2. **"Under Review" trigger.** The reference widget keys "Under Review" off `item.remediation_task`. Path C keys the pill off the `status` display value instead (anything matching review/remediation/pending gets the warning styling). If you want it driven by a remediation-task field, add that field to `list_view_fields` and key the pill's `ng-if`/class off it.
3. **Cards are clickable** (`openRow`), preserving the table behavior where clicking a row opened the record; buttons `stopPropagation`. The reference widget's cards weren't clickable — flag if you'd rather match that.
4. **Grid breakpoints standardized to 992/576** (matching the approval grid) rather than the reference's 1278/540, for in-widget consistency.

⚠️ Side note on the reference widget you pasted: its server script has the client controller accidentally embedded inside the `getImage` function (`return name;api.controller = ...`). No action taken here since it's reference-only — but if that's the live code for that widget, it's worth checking.

## 4. Change summary

| File | Change |
|------|--------|
| **HTML** | Path B gate now also excludes `sn_itam_common_attestation_asset_m2m`. New render path C: refresh skeleton + asset card grid binding row fields directly, Reject/Approve buttons (fixed `record_id` call sites), status pill. |
| **SCSS** | New `.attestation-card-grid` block (grid, `.asset-card`, buttons, pills incl. `pill-warning` from the reference's Under Review styling) + dark-mode parity. |
| **Controller** | New `getAttestationStatusClass` handler. Nothing else — `onAssetApprove`/`onAssetReject`/`updateAttestation` already have the right signatures; the fix was at the HTML call sites. |
| **Server / Link / Schema** | **Unchanged** (`waag-integrated.md` §6, §8–9). |

Everything else — tab fit pipeline, approvals card grid, deep-linking, search/sort/filter, dark mode — untouched.

---

## 5. HTML Template

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

          <!-- Render path C: asset card grid (Asset Attestation tab) -->

          <!-- Skeleton while refreshing -->
          <div ng-if="tab.is_refreshing && tab.table == 'sn_itam_common_attestation_asset_m2m'"
               class="attestation-card-grid">
            <div ng-repeat="i in [].constructor(6) track by $index"
                 class="asset-card asset-card-skeleton">
              <div class="skeleton skeleton-icon" style="width: 87px; height: 71px;"></div>
              <div class="skeleton skeleton-text-md" style="width: 60%; height: 14px; margin-top: 8px;"></div>
              <div class="skeleton skeleton-text" style="width: 80%; height: 12px; margin-top: 6px;"></div>
            </div>
          </div>

          <div ng-if="!tab.is_refreshing && tab.table == 'sn_itam_common_attestation_asset_m2m' && tab.details.rows && tab.details.rows.length > 0"
               class="attestation-card-grid">
            <div ng-repeat="row in tab.details.rows track by row.sys_id"
                 class="asset-card"
                 ng-click="c.openRow(tab, row)">

              <div class="primary-content">
                <img src="x_g_dla_dla_connec.asset_placeholder.png" width="87" height="71" alt=""/>
                <!-- Field IDs come from the WaaG list record's list_view_fields.
                     If configured as dot-walks, use bracket notation, e.g. {{ row['asset.asset_tag'] }} -->
                <div class="asset-info">
                  <div class="title-small">{{ row.asset_tag }}</div>
                  <div class="body-small">{{ row.model }}</div>
                  <div class="body-extra-small" ng-if="row.serial_number">Serial Number: {{ row.serial_number }}</div>
                </div>
              </div>

              <div class="asset-card-actions">
                <!-- Open: Reject + Approve buttons (order mirrors the My Assets reference UI) -->
                <!-- NOTE: record_id is now row.sys_id (fixes the instant drop-off bug; was passing the row object) -->
                <div ng-if="row['status'] == 'Open'" class="asset-card-buttons">
                  <button type="button"
                          class="approval-action reject"
                          ng-click="c.onAssetReject(row.sys_id, tab.id, row.sys_id); $event.stopPropagation()"
                          uib-tooltip="Deny asset"
                          tooltip-placement="top">
                    <i class="fa fa-close" aria-hidden="true"></i> Reject Asset
                  </button>
                  <button type="button"
                          class="approval-action approve"
                          ng-click="c.onAssetApprove(row.sys_id, tab.id, row.sys_id); $event.stopPropagation()"
                          uib-tooltip="Confirm asset"
                          tooltip-placement="top">
                    <i class="fa fa-check" aria-hidden="true"></i> Approve Asset
                  </button>
                </div>

                <!-- Resolved / in progress: status pill -->
                <div ng-if="row['status'] != 'Open'"
                     class="asset-card-status-pill"
                     ng-class="c.handlers.getAttestationStatusClass(row['status'])">
                  {{ row['status'] }}
                </div>
              </div>
            </div>
          </div>

          <!-- Render path B: existing table view (all other tabs) -->
          <div ng-if="tab.table != 'sysapproval_approver' && tab.table != 'sn_itam_common_attestation_asset_m2m'" class="table-responsive-wrapper" id="tableWrapper-{{data.instance_id}}">
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

## 6. SCSS

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

// Asset attestation card grid (mirrors approval grid; UI from My Assets reference widget)
.attestation-card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 4px;

  // Breakpoints match .approval-card-grid for in-widget consistency
  // (reference widget used 1278/540; standardized to 992/576 here)
  @media (max-width: 992px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 576px) {
    grid-template-columns: 1fr;
  }

  .asset-card {
    background: white;
    border: 1px solid $Neutral-100;
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    cursor: pointer;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
    min-height: 160px;

    &:hover {
      border-color: $color-light-blue;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .primary-content {
      display: flex;
      align-items: center;
      gap: 12px;

      .asset-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: $Sky-500;

        .body-small {
          line-height: 125%;
        }

        .body-extra-small {
          color: $Neutral-700;
        }
      }
    }

    .asset-card-actions {
      margin-top: auto;
      padding-top: 8px;

      .asset-card-buttons {
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

      .asset-card-status-pill {
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
        // "Under Review" styling carried over from the reference widget's card-notices
        &.pill-warning {
          background: $Semantic-Warning-100;
          color: $Semantic-Medium;
          font-style: italic;
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
.dark .attestation-card-grid {
  .asset-card {
    background: $color-light-black;
    border-color: $color-gray;

    &:hover {
      border-color: $color-sky-blue;
    }

    .primary-content .asset-info {
      color: $color-sky-blue;

      .body-extra-small {
        color: $color-light-gray;
      }
    }

    .asset-card-actions .asset-card-status-pill {
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

## 7. Client Controller

```javascript
api.controller = function($scope, $window, $timeout, $rootScope, spModal, spUtil, $document) {
	var c = this;

	// --- INTEGRATION: fit-pipeline constants ---
	// Absorbs sub-pixel rounding at the fit boundary so a 1px resize can't jitter.
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
		/**
 * Map an attestation status display value to a CSS class for the card pill.
 * Confirmed/complete -> green; under review/remediation/pending -> warning
 * (the reference widget's "Under Review" styling); denied -> red; else grey.
 */
		getAttestationStatusClass: function (statusDisplayValue) {
			if (!statusDisplayValue) return 'pill-neutral';
			var normalized = ('' + statusDisplayValue).toLowerCase();
			if (normalized.indexOf('confirm') !== -1 || normalized.indexOf('complete') !== -1) return 'pill-success';
			if (normalized.indexOf('review') !== -1 || normalized.indexOf('remediat') !== -1 || normalized.indexOf('pending') !== -1) return 'pill-warning';
			if (normalized.indexOf('denied') !== -1 || normalized.indexOf('reject') !== -1) return 'pill-danger';
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

				if (!c.handlers.isBarOverflowing()) return;    // fits — done

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
			if (typeof ResizeObserver === 'undefined') return;   // window-resize fallback covers this
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

## 8. Verification checklist

**Configuration (do first)**
- [ ] The attestation WaaG list record's `list_view_fields` includes asset tag, model, serial number, and status — and the field IDs match the HTML bindings (`row.asset_tag`, `row.model`, `row.serial_number`, `row['status']`). Blank card fields = ID mismatch; adjust bindings (bracket notation for dot-walks).

**New attestation card view**
- [ ] Attestation tab renders asset cards (tag, model, serial) — not the table.
- [ ] Open rows show Reject Asset / Approve Asset; both modals fire; confirming **instantly drops the card** and decrements the tab badge, then the tab refreshes.
- [ ] Non-Open rows show a status pill; an "under review"-type status gets the warning (italic) styling.
- [ ] Refresh (page change, filter, sort, limit change) shows asset-card skeletons, then cards — pagination works exactly as on approvals.
- [ ] Clicking a card opens the record; clicking a button does not.

**No regressions**
- [ ] Approvals card grid unchanged; all other tabs still render the table.
- [ ] Tab fit pipeline (shrink → More → mobile select) unaffected.
- [ ] Dark mode renders correctly for the new cards and pills.
- [ ] No console errors on load, tab switch, action, or refresh.
