# Agency Announcements — Topic Dropdown Feature

Adds a topic selector to the **Agency Announcements** widget. The dropdown
sits in the top-right of the widget header and offers three modes:

1. **Agency Wide** *(default)* — the hardcoded homepage origin (today's behavior)
2. **All Topics** — every announcement across Agency Wide + every topic, deduped, newest first
3. **Any specific topic** — every topic whose template page hosts an instance of this widget

Selecting an option updates the URL via `$location.search()` (no reload) and re-fetches.

---

## Known Issue & Fix — Dropdown Disappears After Load

**Symptom:** `data.topics` is populated with valid data on initial render,
but the dropdown never shows.

**Root cause:** The two-phase server pattern wipes `data.topics` on the
`loadData` round-trip:

1. **Initial render** — server runs with `!input`, builds `data.topics`. ✅
2. **Controller fires** `c.server.get({action:'loadData'})` — server runs
   *again*, but now `input` is truthy, so the (original) `if (!input)`
   guard **skips** the topics block. The response `data` has no `topics`.
3. **`.then()` does `c.data = response.data`** — overwrites the entire
   data object, so `data.topics` is gone and the dropdown's
   `ng-if="data.topics.length > 0"` evaluates false.

**Fix (applied below):** Two changes work together:

1. **Build `data.topics` on every server run** (drop the `if (!input)`
   guard) so the topic list survives the `loadData` overwrite.
2. **Build the option list and pre-selection inside the `.then()`**, not
   synchronously at controller init. The original code built `c.topicOptions`
   and set `c.selectedTopic` at construction time, then `loadAnnouncements()`
   replaced `c.data` asynchronously — so the options were locked to the
   initial payload and never re-derived from the resolved fetch. Moving
   `buildTopicOptions()` and `preselectFromUrl()` into the promise callback
   guarantees options always reflect the data actually rendering.

> Note: in the Service Portal lifecycle `c.data` *is* populated synchronously
> from the initial server run before the controller executes, so the init-time
> read wasn't undefined on first paint. The real fragility was that the option
> list was built once and never rebuilt while `c.data` got replaced underneath
> it — the two fell out of sync (exactly what the topics-wipe bug caused).
> Deriving options inside `.then()` removes the whole class of problem.

> Alternative considered: preserve `topics` client-side (`c.topics = c.data.topics`,
> restore after overwrite). Rejected in favor of the simpler server-side
> approach unless the topic walk proves expensive at scale.

---

## How It Works End-to-End

```
Page load
  │
  ▼
Server runs once
  ├─ Sets instance_id, viewAllURL, isLoading=true
  ├─ Builds data.topics  ← list of topics whose template page hosts this widget
  └─ Returns early (no input.action)
  │
  ▼
HTML renders → skeleton loaders + dropdown (pre-selected from URL)
  │
  ▼
Client controller → c.server.get({ action: 'loadData' })
  │
  ▼
Server re-runs with input
  ├─ If URL has scope=all
  │    └─ Loop getContent() across [Agency Wide + every topic origin],
  │       concat, dedupe by sys_id, sort newest first, slice to max_rows
  └─ Otherwise (Agency Wide or a specific topic)
       └─ Resolve queryId (origin_id from URL || homepage default || instance_id)
          └─ getContent($sp, queryId)  ← UNCHANGED — reads topic_id internally
  │
  ▼
Client receives data.items → renders
  │
  ▼
User picks an option from dropdown
  ├─ Agency Wide    → origin_id = homepage default, topic_id = null, scope = null
  ├─ All Topics     → origin_id = null,             topic_id = null, scope = 'all'
  └─ Specific topic → origin_id = topic's instance, topic_id = topic sys_id, scope = null
  │
  ├─ $location.search() applies the three params (nulls remove the param)
  ├─ data.isLoading = true
  └─ c.server.get({ action: 'loadData' })  → loop
```

---

## Topic Discovery — The Upstream Walk

Given this widget's sys_id (`d0dd830647ae3e10d1dbf8ba436d4314`), find every
topic whose template page contains an instance of it:

```
sp_widget          (hardcoded sys_id)
   ▲
sp_instance        (all instances of this widget)
   │  sp_column → sp_row → sp_container → sp_page
   ▼
sp_page            (the page each instance lives on)
   ▲
topic.template     (topics whose template = that page)
```

For each topic returned we also carry the **sp_instance sys_id** of the
widget on that topic's template page — that becomes the `origin_id` when
the user selects the topic.

---

## File: Script Include — `cd_ContentDeliveryExtended`

Adds one new method: `getTopicsForWidget(widgetSysId)`. Leaves
`getContent` and `getPortalRichTextById` untouched.

```javascript
var cd_ContentDeliveryExtended = Class.create();
cd_ContentDeliveryExtended.prototype = Object.extendsObject(cd_ContentDelivery, {

    /**
     * Retrieve basic content information (title + processed rich_text) for a portal content record.
     * Uses the existing getRichTextForContent() method for proper parsing and user-specific substitution.
     *
     * @param {string} contentSysId - sys_id of the sn_cd_content_portal record
     * @returns {object} { title: string, rich_text: string, sys_created_on: string }
     *                   Returns null if record not found or invalid
     */
    getPortalRichTextById: function (contentSysId) {
        if (!contentSysId || typeof contentSysId !== 'string') {
            return null;
        }

        var gr = new GlideRecord('sn_cd_content_portal');
        if (!gr.get(contentSysId)) {
            return null;
        }

        return {
            title: gr.getDisplayValue('title') || gr.getValue('title') || '',
            rich_text: cd_ContentDelivery.getRichTextForContent(gr, 'rich_text') || '',
            sys_created_on: gr.getValue('sys_created_on')
        };
    },

    /**
     * Routes content retrieval through preview-aware paths. Unchanged.
     */
    getContent: function ($sp, instanceId, sysId, options) {
        var grInstanceRecord = $sp.getInstanceRecord();
        var spInstanceId = grInstanceRecord && grInstanceRecord.getUniqueValue();
        var topicId = $sp.getParameter('topic_id');
        var isNewsFeedRequest = options && options.newsFeed;

        if ($sp.getParameter('sca_content_id') && $sp.getParameter('sca_instance_id') && $sp.getParameter('sca_instance_id') === instanceId) {
            return cd_ContentDelivery.getScaPreviewContent($sp, true, null);
        }
        if ($sp.getParameter('sca_content_id') && !$sp.getParameter('sca_instance_id') && !isNewsFeedRequest) {
            return cd_ContentDelivery.getScaPreviewContent($sp, !!$sp.getParameter('is_news_portal_preview'));
        }
        if (cd_ContentDelivery.isContentPreview($sp) && !$sp.getParameter('sca_instance_id') && !isNewsFeedRequest) {
            return sn_ca.ca_CampaignPortalPreview.getContentForPreview($sp);
        }
        return cd_ContentDelivery.getContentForWidgetInstance(instanceId, topicId, sysId, options);
    },

    /**
     * Given a widget sys_id, walk sp_instance → sp_column → sp_row → sp_container → sp_page
     * to find every page hosting an instance of the widget. Then return every topic whose
     * `template` field points at one of those pages, along with the specific sp_instance
     * sys_id of the widget on that topic's template page (used as origin_id when the topic
     * is selected in the dropdown).
     *
     * @param {string} widgetSysId - sys_id of the sp_widget record
     * @returns {Array<{ sys_id: string, name: string, instance_id: string }>}
     *          Sorted alphabetically by name. Empty array on bad input or no matches.
     */
    getTopicsForWidget: function (widgetSysId) {
        if (!widgetSysId || typeof widgetSysId !== 'string') {
            return [];
        }

        // Step 1: walk every sp_instance of this widget up to its sp_page
        // Build a map of page sys_id -> first matching instance sys_id we found
        var pageToInstance = {};
        var inst = new GlideRecord('sp_instance');
        inst.addQuery('sp_widget', widgetSysId);
        inst.query();

        while (inst.next()) {
            var instanceId = inst.getValue('sys_id');
            var columnId = inst.getValue('sp_column');
            if (!columnId) continue;

            var col = new GlideRecord('sp_column');
            if (!col.get(columnId)) continue;
            var rowId = col.getValue('sp_row');
            if (!rowId) continue;

            var row = new GlideRecord('sp_row');
            if (!row.get(rowId)) continue;
            var containerId = row.getValue('sp_container');
            if (!containerId) continue;

            var container = new GlideRecord('sp_container');
            if (!container.get(containerId)) continue;
            var pageId = container.getValue('sp_page');
            if (!pageId) continue;

            // First instance found per page wins. If a page has multiple
            // instances of this widget the topic dropdown only needs one
            // anchor instance to act as origin_id.
            if (!pageToInstance[pageId]) {
                pageToInstance[pageId] = instanceId;
            }
        }

        var pageIds = Object.keys(pageToInstance);
        if (pageIds.length === 0) {
            return [];
        }

        // Step 2: find every topic whose template is one of those pages
        var topics = [];
        var topicGr = new GlideRecord('topic');
        topicGr.addQuery('template', 'IN', pageIds.join(','));
        topicGr.orderBy('name');
        topicGr.query();

        while (topicGr.next()) {
            var templatePageId = topicGr.getValue('template');
            topics.push({
                sys_id: topicGr.getValue('sys_id'),
                name: topicGr.getDisplayValue('name') || topicGr.getValue('name') || '',
                instance_id: pageToInstance[templatePageId]
            });
        }

        return topics;
    },

    type: 'cd_ContentDeliveryExtended'
});
```

**Notes on the walk:**

- We do a separate `.get()` per parent because there is no
  dot-walk available across `sp_instance → sp_column → sp_row →
  sp_container → sp_page` in a single query (these are independent
  reference fields, not flattened). The query count is bounded by the
  number of instances of this widget across the platform — small.
- `orderBy('name')` gives us alphabetical sort server-side; client
  receives a pre-sorted array.
- We dedupe by page (first instance wins). If the same widget is dropped
  twice on the same topic template page, only one of those instances is
  used as the dropdown's `origin_id` anchor — which is fine, both would
  load identical content.

---

## File: Widget — `agency_announcements`

### Server Script

Adds two things: populate `data.topics` on initial load, and a new
`scope=all` branch that loops `getContent` across every origin and
merges the results.

```javascript
(function() {
    gs.info('[AgencyAnn] server run START — input: ' + JSON.stringify(input));

    data.instance_id = $sp.getInstanceRecord().sys_id.toString();
    data.isLoading = true;
    data.origin_id = $sp.getParameter('origin_id');
    data.page_id = $sp.getParameter('id');
    data.topic_id = $sp.getParameter('topic_id') || null;
    data.scope = $sp.getParameter('scope') || null;

    // Default origin_id for the "Agency Wide" dropdown option (homepage instance)
    data.default_origin_id = 'ace327ce47a67e10d1dbf8ba436d439b';

    data.viewAllURL = '?id=agency_announcements&origin_id=' + data.instance_id;
    if (data.topic_id) {
        data.viewAllURL += '&topic_id=' + data.topic_id;
    }

    // Build the topic dropdown list on EVERY run.
    // NOTE: this must NOT be guarded by `if (!input)`. The client controller's
    // loadData round-trip replaces c.data with this response object, so if
    // topics aren't rebuilt here they'd be wiped after the first fetch and the
    // dropdown would never render. The walk is cheap relative to the content fetch.
    data.topics = new cd_ContentDeliveryExtended().getTopicsForWidget('d0dd830647ae3e10d1dbf8ba436d4314');
    gs.info('[AgencyAnn] topics built — count: ' + (data.topics ? data.topics.length : 'null') + ' | ' + JSON.stringify(data.topics));

    /* force async */
    if (!input || input.action !== 'loadData') {
        gs.info('[AgencyAnn] early return (no loadData action)');
        return;
    }

    var extended = new cd_ContentDeliveryExtended();

    if (data.scope === 'all') {
        // All Topics: loop getContent() across Agency Wide + every topic origin,
        // dedupe by sys_id, sort newest first.
        var seen = {};
        var merged = [];

        // Stash the user's URL topic_id so we can clear it for the loop and restore after.
        // getContent() reads topic_id from $sp.getParameter() internally; for the
        // Agency-Wide leg we want it absent, and for each topic leg we set it explicitly.
        var originalTopicParam = $sp.getParameter('topic_id');

        // Build the full list of origins to query: Agency Wide first, then every topic
        var origins = [{ origin_id: data.default_origin_id, topic_id: null }];
        var topicsForLoop = extended.getTopicsForWidget('d0dd830647ae3e10d1dbf8ba436d4314');
        topicsForLoop.forEach(function(t) {
            origins.push({ origin_id: t.instance_id, topic_id: t.sys_id });
        });

        origins.forEach(function(o) {
            // getContent reads topic_id from $sp.getParameter; we can't mutate $sp,
            // but the underlying getContentForWidgetInstance accepts topicId as an arg.
            // So we call it directly here to avoid the param-reading branch.
            var items = cd_ContentDelivery.getContentForWidgetInstance(o.origin_id, o.topic_id, null, null) || [];
            items.forEach(function(item) {
                var sysId = item.sys_id;
                if (sysId && !seen[sysId]) {
                    seen[sysId] = true;
                    merged.push(item);
                }
            });
        });

        // Sort newest first by sys_created_on (raw string compare works for ISO-ish format)
        merged.sort(function(a, b) {
            var aDate = a.sys_created_on || '';
            var bDate = b.sys_created_on || '';
            if (aDate < bDate) return 1;
            if (aDate > bDate) return -1;
            return 0;
        });

        data.items = merged;

    } else {
        // Single-origin path (Agency Wide default or a specific topic)
        if (data.page_id && data.page_id == 'agency_announcements' && !data.origin_id) {
            data.origin_id = data.default_origin_id;
        }
        data.queryId = data.origin_id ? data.origin_id : data.instance_id;
        data.items = extended.getContent($sp, data.queryId);
    }

    if (options.max_rows) {
        data.items = data.items.splice(0, options.max_rows);
    }

    data.items.forEach(function(item) {
        var additionalDetails = [{
            label: gs.getMessage('Portal Content'),
            value: 'Portal Rich Text'
        }];
        cd_ContentDelivery.setInfoObjectOnContentItem(item, additionalDetails);
    });
})();
```

**Why the `scope=all` branch calls `getContentForWidgetInstance` directly
instead of `getContent`:** `getContent` reads `topic_id` from `$sp.getParameter`,
which we can't change between iterations of the loop. The underlying
`getContentForWidgetInstance(instanceId, topicId, ...)` method takes
`topicId` as an explicit arg, so we bypass the param-reading wrapper.
The preview routing in `getContent` (`sca_content_id`, campaign preview)
only fires when authors are previewing content — not relevant in the
All Topics view, so skipping that routing is fine.

**Dedupe:** keyed by `item.sys_id`. If the same announcement is published
to Agency Wide and to a topic (or to multiple topics), it shows once.

**Sort:** newest first by `sys_created_on`. Slicing to `max_rows` happens
*after* sort/dedupe, so we keep the most recent N across everything.

### Client Controller

Adds: dropdown state (Agency Wide + All Topics + topics), selection
handler, URL sync via `$location.search()`. Also fixes the missing
`$rootScope` injection from the existing code.

```javascript
function cdAnnouncementController($scope, $sce, $location, $rootScope, $timeout, i18n, cdAnalytics) {
    var c = this;
    c.state = { current_side_nav_id: '' };
    c.topicOptions = [];
    c.selectedTopic = null;

    console.log('[AgencyAnn] controller init — c.data.topics:', c.data.topics);

    // Kick off the load. Everything that depends on the resolved server data
    // (option list, pre-selection) is built INSIDE the .then() so it always
    // reflects the payload actually driving the view — never a stale/initial one.
    loadAnnouncements();

    function loadAnnouncements() {
        c.data.isLoading = true;
        c.server.get({ action: 'loadData' }).then(function(response) {
            console.log('[AgencyAnn] loadData response.data.topics:', response.data.topics);
            c.data = response.data;
            console.log('[AgencyAnn] AFTER overwrite — c.data.topics:', c.data.topics, '| length:', (c.data.topics || []).length);

            // Build options + pre-selection against the freshly resolved data
            buildTopicOptions();
            preselectFromUrl();

            if (c.data.items && c.data.items.length > 0) {
                Object.keys(c.data.items).map(modifyItem);
            }
            c.data.isLoading = false;
        });
    }

    function buildTopicOptions() {
        // Agency Wide → All Topics → every discovered topic
        c.topicOptions = [
            {
                label: 'Agency Wide',
                origin_id: c.data.default_origin_id,
                topic_id: null,
                scope: null
            },
            {
                label: 'All Topics',
                origin_id: null,
                topic_id: null,
                scope: 'all'
            }
        ].concat((c.data.topics || []).map(function(t) {
            return {
                label: t.name,
                origin_id: t.instance_id,
                topic_id: t.sys_id,
                scope: null
            };
        }));
        console.log('[AgencyAnn] topicOptions built:', c.topicOptions);
    }

    function preselectFromUrl() {
        // scope=all wins, then topic_id, else default (Agency Wide)
        c.selectedTopic = c.topicOptions[0];
        if (c.data.scope === 'all') {
            c.selectedTopic = c.topicOptions[1];
        } else if (c.data.topic_id) {
            var match = c.topicOptions.find(function(opt) { return opt.topic_id === c.data.topic_id; });
            if (match) c.selectedTopic = match;
        }
    }

    function modifyItem(o) {
        var item = c.data.items[o];
        item.html = $sce.trustAsHtml(item.rich_text);
        item.rich_text = item.rich_text.replace(/<[^>]*>/g, '');
        item.sys_created_on = c.getCleanDate(item.sys_created_on);
        item.url = '?id=agency_announcement&sys_id=' + item.sys_id;
    }

    c.getCleanDate = function(dt) {
        return moment(dt).format('MMM DD, YYYY');
    };

    c.onTopicChange = function() {
        // Sync URL params, then trigger a fresh server load.
        // Setting a param to null removes it from the URL.
        $location.search('origin_id', c.selectedTopic.origin_id || null);
        $location.search('topic_id', c.selectedTopic.topic_id || null);
        $location.search('scope', c.selectedTopic.scope || null);
        loadAnnouncements();
    };

    c.containerStyle = {
        background: c.options.background_color || 'rgba(255, 255, 255, .2)'
    };

    $rootScope.$on('topic-side-nav:activeChanged', function(event, data) {
        c.state.current_side_nav_id = data.activeId;
    });
}
```

**URL state per dropdown option:**

| Selection | `origin_id` | `topic_id` | `scope` |
|---|---|---|---|
| Agency Wide | homepage default sys_id | *(removed)* | *(removed)* |
| All Topics | *(removed)* | *(removed)* | `all` |
| Specific topic | topic's instance sys_id | topic sys_id | *(removed)* |

**Fixes folded in while we're here:**

- `$rootScope` is now actually injected (it was used but undeclared in the original).
- `$location` is injected for URL sync.
- The original kept `i18n`, `cdAnalytics`, `$timeout` as injections — preserved in case other code in the page references them, but they're still unused.

### HTML Template

Dropdown lives inside `.section-title-container` to the right of the title.
Hidden entirely when the page hosts the widget but yields no topics
(i.e., the only option would be "Agency Wide" alone) — that means the
dropdown only appears when there's actually something to switch between.

```html
<div class="widget-container"
     id="{{ data.instance_id }}"
     ng-if="!options.topic_side_nav_id || c.state.current_side_nav_id == options.topic_side_nav_id">

    <div class="section-title-container">
        <h3 class="section-title headline-medium">
            {{options.title}}
        </h3>

        <!-- Topic dropdown — shown whenever at least one topic was discovered.
             When 0 topics, dropdown would only show "Agency Wide" + "All Topics"
             which is redundant (both render the same homepage content), so hide. -->
        <div class="topic-selector" ng-if="data.topics && data.topics.length > 0">
            <select class="topic-select"
                    ng-model="c.selectedTopic"
                    ng-options="opt.label for opt in c.topicOptions"
                    ng-change="c.onTopicChange()"
                    aria-label="Filter announcements by topic">
            </select>
        </div>
    </div>

    <div class="content-container" ng-style="c.containerStyle">
        <div class="item-container">

            <!-- Skeleton Loading -->
            <div class="content-item"
                 ng-repeat="i in [].constructor(options.max_rows || 6) | limitTo:options.max_rows || 6 track by $index"
                 ng-if="data.isLoading">
                <div class="content-title">
                    <div class="skeleton skeleton-title" style="width: 60%; margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton-text-sm" style="width: 100px;"></div>
                </div>
                <div class="content-body body-small">
                    <div class="skeleton skeleton-text" style="width: 95%; margin-bottom: 6px;"></div>
                    <div class="skeleton skeleton-text" style="width: 88%; margin-bottom: 6px;"></div>
                    <div class="skeleton skeleton-text" style="width: 75%;"></div>
                </div>
            </div>

            <!-- Loaded Content -->
            <div class="content-item"
                 ng-repeat="item in data.items"
                 ng-if="data.items.length > 0 && !data.isLoading">
                <div class="content-title">
                    <a ng-href="{{item.url}}"><span class="title-extra-large">{{item.title}}</span></a>
                    <span class="body-small">{{item.sys_created_on}}</span>
                </div>
                <div class="content-body body-small">
                    {{item.rich_text}}
                </div>
            </div>

            <div ng-if="data.items.length === 0 && !data.isLoading">
                <span class="body-medium">Currently no announcements</span>
            </div>
        </div>

        <div class="view-all" ng-if="data.items.length > 0 && options.max_rows">
            <a class="title-small" ng-href="{{data.viewAllURL}}">
                View All Announcements <i class="fa fa-arrow-right"></i>
            </a>
        </div>
    </div>
</div>
```

### SCSS

Adds the flex layout for header (title left, dropdown right) and styles
the select to read on the translucent white background. All other rules
unchanged.

```scss
.widget-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    z-index: 0;
    color: white;

    .section-title-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex: 1;

        .section-title {
            color: white;
            margin: 0;
        }

        .topic-selector {
            flex-shrink: 0;

            .topic-select {
                background: rgba(255, 255, 255, 0.15);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.4);
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 14px;
                cursor: pointer;
                min-width: 180px;
                appearance: none;
                -webkit-appearance: none;
                background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='white' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 12px center;
                padding-right: 32px;

                &:hover {
                    background-color: rgba(255, 255, 255, 0.25);
                }

                &:focus {
                    outline: 2px solid white;
                    outline-offset: 2px;
                }

                option {
                    color: #222;
                    background: white;
                }
            }
        }
    }

    .content-container {
        padding: 32px 24px;
        border-radius: 16px;

        .content-item {
            padding: 24px 0px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            border-bottom: 1px solid white;

            &:first-child { padding-top: 0; }
            &:last-child {
                padding-bottom: 0;
                border-bottom: none;
            }

            span { color: white; }

            .content-title {
                display: flex;
                gap: 12px;
                justify-content: space-between;
                color: white;
                align-items: flex-start;

                a {
                    text-decoration: none;
                    padding: 0 !important;
                    border: none;
                }

                .body-small {
                    margin-top: 4px;
                    white-space: nowrap;
                }
            }

            .content-body {
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }

        .view-all {
            display: flex;
            justify-content: end;
            align-items: center;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid white;

            a {
                text-decoration: none;
                color: white;
            }
        }
    }
}
```

### Link Function

Unchanged from current — kept for any carousel parent that wraps this
widget. Not relevant to the topic-dropdown feature.

### Option Schema

Unchanged. The dropdown is data-driven from `topic` records, not from
widget options.

---

## Debugging — Expected Log Readout

The logging above is **temporary diagnostic instrumentation** — strip the
`console.log` and `gs.info` lines once the dropdown is confirmed working.

**With the fix applied,** the browser console should show on load:

```
[AgencyAnn] controller init — c.data.topics: (Array of topics)
[AgencyAnn] topics length: N | scope: null | topic_id: null
[AgencyAnn] topicOptions built: (Array — Agency Wide, All Topics, + N topics)
[AgencyAnn] loadData response.data.topics: (Array of topics)   ← populated, not undefined
[AgencyAnn] BEFORE overwrite — c.data.topics: (Array)
[AgencyAnn] AFTER overwrite — c.data.topics: (Array) | length: N  ← survives the overwrite
```

**The bug signature (before the fix)** was:

```
[AgencyAnn] loadData response.data.topics: undefined   ← topics block skipped on loadData
[AgencyAnn] AFTER overwrite — c.data.topics: undefined | length: 0   ← dropdown dies here
```

Server-side, `System Logs → All` filtered to `AgencyAnn` should show the
topics built on **both** the initial run and the `loadData` run:

```
[AgencyAnn] server run START — input: null
[AgencyAnn] topics built — count: N | [...]
[AgencyAnn] early return (no loadData action)
[AgencyAnn] server run START — input: {"action":"loadData"}
[AgencyAnn] topics built — count: N | [...]   ← key: now built on loadData too
```

---

## Test Cases

**Agency Wide (default behavior):**
- [ ] **Homepage load** — Land on `?id=index` with the widget instance.
  Dropdown shows "Agency Wide" selected. Content matches the homepage
  hardcoded `origin_id`.
- [ ] **Topic template page load with no `topic_id` / `scope` URL param** —
  Dropdown shows "Agency Wide" selected by default.

**All Topics:**
- [ ] **Select "All Topics" from dropdown** — URL gets `scope=all`,
  `origin_id` and `topic_id` removed. Content shows every announcement
  across Agency Wide + every topic.
- [ ] **Page load with `scope=all` already in URL** — Dropdown
  pre-selects "All Topics", content loads accordingly.
- [ ] **Dedup verified** — Announcements published to multiple origins
  appear once in the All Topics view.
- [ ] **Sort verified** — All Topics view shows newest first.
- [ ] **`max_rows` applied after merge** — All Topics with `max_rows=5`
  shows the 5 most recent across all origins, not 5 per origin.

**Specific topic:**
- [ ] **Topic template page load with `topic_id` URL param** — Dropdown
  pre-selects that topic.
- [ ] **Topic template page load with `topic_id` NOT in the topic list** —
  Falls back to "Agency Wide" without erroring.
- [ ] **Select a topic from dropdown** — URL updates with `origin_id`
  and `topic_id`, `scope` removed, content reloads.

**Switching:**
- [ ] **Specific topic → Agency Wide** — `topic_id` removed,
  `origin_id` set to homepage default, `scope` removed.
- [ ] **Specific topic → All Topics** — all three params updated
  correctly (`scope=all`, others removed).
- [ ] **All Topics → Agency Wide** — `scope` removed, `origin_id`
  set to homepage default.

**Edge cases:**
- [ ] **Page hosts widget but no topic uses it as template** —
  Dropdown still shows "Agency Wide" + "All Topics" but no topic
  options. (Decision: still show the dropdown? Or hide entirely
  when only 2 options? See Open Items.)
- [ ] **Multiple instances of the widget on the same topic template
  page** — First instance found wins; both load identical content
  anyway.
- [ ] **`getTopicsForWidget` with bad input** — Returns `[]` for
  null, undefined, non-string, or unknown sys_id.
- [ ] **Alphabetical order verified** — Topic names appear A→Z below
  the two fixed options.

---

## Open Items / Out of Scope

- **Browser back/forward syncing** — `$location` updates the URL but
  the controller doesn't watch `$location` for external changes. If
  the user hits back, the URL changes but content stays. Add a
  `$scope.$on('$locationChangeSuccess', ...)` watcher if we want that.
- **All Topics detail URLs** — Clicking into an announcement from the
  All Topics view opens it standalone (no context persisted). If we
  want back-navigation to land on All Topics, stamp `scope=all` (and
  optionally the item's `origin_id`/`topic_id`) onto the detail URL.
  Deferred for now.
- **Performance of the All Topics merge** — `getContentForWidgetInstance`
  is called once per origin (Agency Wide + N topics). If the topic
  count grows large, consider a single-query path that hits
  `sn_cd_content_portal` directly across all relevant visibility
  records, bypassing the per-origin loop.
- **Dead-code cleanup from the existing widget** (the carousel link
  function, the unused `item.html`, the unused injections) — not
  touched here to keep the diff focused on the new feature. Worth a
  follow-up pass.
- **Hardcoded homepage `origin_id`** — still hardcoded in both the
  server script and as the default in the dropdown. A future change
  could promote this to a system property or widget option.
