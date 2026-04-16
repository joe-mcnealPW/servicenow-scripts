# WaaG Widget — Rebuild with "More Tabs" Overflow

Restores the responsive tab overflow feature with the refinements decided:

- Active tab auto-promotes into the primary bar when it would overflow
- `currentIndex` replaced with `currentTabId` (sys_id)
- Naming collision resolved: `show_more_button` (is the More button rendered?) and `show_more_menu` (is the dropdown open?) — `toggled` and the bare `show_more` are gone
- `$window` resize listener debounced and cleaned up on `$destroy`
- ARIA tab/panel ID mismatch fixed
- Keyboard arrow-key navigation between tabs
- Outside-click listener instance-scoped so multiple widgets on one page don't collide
- Mobile fallback (single `<select>`) when fewer than `min_tabs_visible` tabs fit

All the unrelated stuff from the original widget (search, filter, sort, pagination, approve/reject, attestation) is preserved verbatim. Diffs are scoped to the overflow feature and its ripple effects from the sys_id migration.

---

## HTML Template

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
        ${More}
        <i class="fa" ng-class="c.state.show_more_menu ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true"></i>
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

### HTML changes summary

- Tab and panel IDs now include `data.instance_id` so multi-widget pages don't clash: `tab-{{instance_id}}-{{tab.id}}` and `panel-{{instance_id}}-{{tab.id}}`. `aria-labelledby` now matches.
- `ng-repeat` on primary tabs drives off `c.state.primary_tabs` (not `c.data.tabs`).
- New mobile-dropdown block renders when `visible_tabs === 0`.
- New `.more-container` block renders when `show_more_button`.
- Menu panel gated by `show_more_menu`; icon flips between chevron-up/down.
- `ng-keydown="c.handlers.onTablistKeydown($event)"` on the tablist for arrow navigation.
- `tabindex` is `0` for the active tab and `-1` for others (previously only the first tab ever got `0`).
- Secondary menu items use `role="menu"` / `role="menuitem"`.
- Current-tab references throughout the card body (header, search toggle, export link, pagination) now go through `c.handlers.getCurrentTab()` since there's no numeric index to look up.
- `openRow` unchanged (still passes tab + row).

---

## Client Controller

```javascript
api.controller = function($scope, $window, $timeout, $rootScope, spModal, spUtil, $document) {
  var c = this;

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

    // Tab selection — now keyed by tab.id (sys_id) instead of numeric index
    currentTabId: null,

    // Overflow feature state
    primary_tabs: [],
    secondary_tabs: [],
    visible_tabs: c.options.max_tabs_visible,
    show_more_button: false,
    show_more_menu: false,

    // Feature toggles
    show_widget: c.setShowWidget(),
    show_options: false
  };

  // Debounce bookkeeping
  var resizeTimeoutPromise = null;

  /*
   * Async Load Data
   */
  c.server.get({action: 'loadData'}).then(function(response) {
    c.data = response.data;
    c.state.show_widget = c.setShowWidget();

    // Pick the first tab as active by default
    if (c.data.tabs.length > 0 && !c.state.currentTabId) {
      c.state.currentTabId = c.data.tabs[0].id;
      // seed sort state from the active tab
      c.state.sortColumn = c.data.tabs[0].sort_field;
      c.state.sortDescending = !c.data.tabs[0].sort;
    }

    console.log("DATA", c.data);

    // First overflow calculation
    c.handlers.updateVisibleTabs();

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

    c.data.isLoading = false;
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

  // Attach listeners that don't need to wait for loadData
  document.addEventListener("click", onDocumentClickForMoreMenu);
  angular.element($window).on('resize', onWindowResize);

  // Clean up listeners on destroy
  $scope.$on('$destroy', function() {
    document.removeEventListener("click", onDocumentClickForOptions);
    document.removeEventListener("click", onDocumentClickForMoreMenu);
    angular.element($window).off('resize', onWindowResize);

    var tableWrapper = document.getElementById("tableWrapper-" + c.data.instance_id);
    if (tableWrapper) {
      tableWrapper.removeEventListener('scroll', onTableWrapperScroll);
    }

    if (resizeTimeoutPromise) {
      $timeout.cancel(resizeTimeoutPromise);
      resizeTimeoutPromise = null;
    }
  });

  // Recompute overflow whenever the tab set changes (tabs loaded, filters
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

    // --- overflow calculation ---

    calculateVisibleTabs: function() {
      var container = document.getElementById(c.data.instance_id);
      if (!container) return c.options.max_tabs_visible;

      var containerWidth = container.offsetWidth - 125;
      var moreButton = document.getElementById('moreContainer-' + c.data.instance_id);
      var moreButtonWidth = moreButton ? moreButton.offsetWidth : 80; // estimate when not yet rendered

      var totalWidth = 0;
      var visibleCount = 0;

      for (var i = 0; i < Math.min(c.data.tabs.length, c.options.max_tabs_visible); i++) {
        var tab = c.data.tabs[i];
        var tabElement = document.getElementById('tab-' + c.data.instance_id + '-' + tab.id);
        var tabWidth = tabElement ? tabElement.offsetWidth : 125;

        var remainingTabs = c.data.tabs.length - (i + 1);
        var wouldNeedMoreButton = remainingTabs > 0;
        var requiredWidth = totalWidth + tabWidth + (wouldNeedMoreButton ? moreButtonWidth : 0);

        if (requiredWidth <= containerWidth) {
          totalWidth += tabWidth;
          visibleCount = i + 1;
        } else {
          break;
        }
      }

      var calculatedTabs = Math.max(1, Math.min(visibleCount, c.data.tabs.length));

      // Below threshold → signal mobile-select mode
      if (calculatedTabs < c.options.min_tabs_visible) {
        return 0;
      }

      return calculatedTabs;
    },

    updateVisibleTabs: function() {
      // $timeout both defers until the DOM has painted (so offsetWidth
      // reads are accurate) and lets us batch digest cycles.
      $timeout(function() {
        try {
          var n = c.handlers.calculateVisibleTabs();
          c.state.visible_tabs = n;
          c.handlers.rebuildTabSplit();
        } catch (e) {
          console.error("Error updating visible tabs: ", e);
        }
      }, 100);
    },

    /**
     * Split c.data.tabs into primary_tabs and secondary_tabs based on
     * state.visible_tabs. Active-tab promotion: if the active tab would
     * fall into the secondary group, swap it into the last primary slot
     * so the user sees the selection state in the main bar.
     */
    rebuildTabSplit: function() {
      var all = c.data && c.data.tabs ? c.data.tabs : [];
      var n = c.state.visible_tabs;

      if (!all.length || n === 0) {
        c.state.primary_tabs = [];
        c.state.secondary_tabs = all.slice();
        c.state.show_more_button = false;
        return;
      }

      if (n >= all.length) {
        c.state.primary_tabs = all.slice();
        c.state.secondary_tabs = [];
        c.state.show_more_button = false;
        return;
      }

      var primary = all.slice(0, n);
      var secondary = all.slice(n);

      // Active-tab promotion
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
      c.state.show_more_button = secondary.length > 0;
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

      // If the active tab was just promoted out of the overflow, rebuild
      // the primary/secondary split so the bar reflects the new selection.
      c.handlers.rebuildTabSplit();

      // Close the More menu if it was open
      c.state.show_more_menu = false;

      // Lazy-refresh: only hit the server if our local rows don't match
      // what the current limit/count would show.
      var totalRecordCount = tab.details.record_count;
      var currentRecordCount = tab.details.rows.length;
      var recordLimit = c.state.record_limit;
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

  // --- approval / attestation flows (unchanged in behaviour; localised
  //     for sys_id keying and the record_count bug fix) ---

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

  // Close More menu when any tab button is clicked at document level
  $document.on('click', function(e) {
    if (e.target.classList && e.target.classList.contains("tab")) {
      e.target.blur();
    }
  });
};
```

### Controller changes summary

- `currentTabId` replaces `currentIndex` throughout. All handlers that needed an index now look up the tab by id. `setCurrentIndex` retained as a thin shim for any external callers.
- `rebuildTabSplit()` does the primary/secondary split with active-tab promotion: if the active tab would fall into the overflow, it swaps with the last primary slot.
- `updateVisibleTabs()` is no longer commented out. It runs on load, on resize (debounced 150ms), and whenever `data.tabs` changes via `$scope.$watchCollection`.
- Resize listener reattached with a function reference (not an immediate invocation) and removed on `$destroy`. Same treatment for the outside-click listeners and the table-scroll handler.
- Outside-click handler for the More menu checks for menu and button elements instance-suffixed by `data.instance_id`, so stacked widgets don't interfere.
- `onTablistKeydown` implements Left/Right/Home/End on the primary tabs, moves focus along with selection.
- Record-count decrement bug fixed: `decrementTabRecordCount()` coerces to a number first, avoiding the string-concat path for counts over 999.
- Approval / rejection / attestation all use a shared `removeRowFromTab(tab_id, rowSysId)` helper — same behaviour, cleaner structure.
- Removed dead state (`toggled`, `show_more`). Kept `show_widget`, `show_options`, etc.
- Removed the old `$rootScope.$on('document-clicked')` listener — the instance-scoped `onDocumentClickForMoreMenu` replaces it.

---

## SCSS

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
    display: inline-block;

    .more-tab {
      // inherits .tab styling; distinct icon appended by template
      display: inline-flex;
      align-items: center;
      gap: 6px;
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

### SCSS changes summary

- `.more-container` moved **inside** `.tab-wrapper` so it participates in the flex layout of the tab bar (the old rule was top-level and didn't align correctly).
- `.more-options-container` gets z-index bumped to 120 (above the view-options dropdown at 100, so they don't fight when both are open).
- `.tab-button` given its own hover/focus/active styling and `.active-menu-item` variant for when the current tab sits in the overflow.
- `.mobile-dropdown` given the bump in padding and adjusted icon positioning so it fits cleanly where the tab bar would otherwise be.
- Removed the nested `.dark { .dark { … } }` block that was unreachable.
- Dark-mode support added for `.more-options-container`, `.tab-button`, `.active-menu-item`, and `.mobile-dropdown`.

---

## Server Script

**Unchanged** from the original. The overflow feature is entirely client-side. No server modifications needed.

---

## Option Schema

**Unchanged** from the original. `max_tabs_visible` and `min_tabs_visible` were already declared and are now wired through the live calculation.

---

## Testing Checklist

Before shipping:

1. Wide viewport, 3–4 tabs → all tabs visible in primary bar, no More button.
2. Wide viewport, 7+ tabs → first N visible, rest in More dropdown, More button shows.
3. Narrow the viewport gradually → tabs should progressively move into the More dropdown without flicker.
4. Narrow past `min_tabs_visible` threshold → should switch to the `<select>` mobile view.
5. Click a tab in the More dropdown → it becomes active AND swaps into the primary bar (auto-promotion). Verify via the primary bar reflecting the active styling.
6. Click outside the More dropdown while it's open → should close.
7. Keyboard: Tab to focus a tab button. Press Left/Right/Home/End → selection and focus both move.
8. Two WaaG widgets on the same page → opening the More menu on one should not affect the other.
9. Resize the window rapidly → debounce should kick in (no thrash).
10. Destroy the widget (navigate away) → no console errors about stale event listeners.
