# Agency Announcements — Topic Dropdown Feature

Adds a topic selector to the **Agency Announcements** widget. The dropdown
sits in the top-right of the widget header and offers three modes:

1. **Agency Wide** *(default)* — the hardcoded homepage origin (today's behavior)
2. **All Topics** — every announcement across Agency Wide + every topic, deduped, newest first
3. **Any specific topic** — every topic whose template page hosts an instance of this widget

Selecting an option sends the choice through the `get()` payload to re-fetch
(no reload). The URL is not updated on selection — clicking "View All
Announcements" carries the selection to the full page via normal navigation.

---

## Known Issues & Fixes

### Issue 1 — Dropdown Disappears After Load

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

### Issue 2 — Skeleton Flashes Twice on Topic Change (full widget recompile)

**Symptom:** Changing the dropdown loads correctly (skeleton → data), then a
few seconds later flashes the skeleton again and re-renders. Does **not**
happen on initial page load — only on dropdown change.

**Root cause (confirmed via console logs):** The whole controller
**re-instantiates** ~5 seconds after the change — the `controller init` log
fires a second time, followed by a fresh initial load. This is not two reload
paths inside one controller instance; Service Portal is **fully recompiling
the widget**, tearing down the controller and building a new one.

The trigger is how the URL was being updated:

1. Params were written with **three separate** `$location.search(key, val)`
   calls — three mid-sequence URL mutations, any of which SP can react to.
2. Each plain `$location.search()` **pushes a new history entry**, which SP
   interprets as a navigation worth re-resolving the page/widget context
   (especially `origin_id`, which is an instance sys_id tied to page routing).

So the sequence was: explicit `c.server.get()` reload finishes in the current
controller → SP reacts to the pushed URL change → recompiles the widget →
fresh controller runs its own initial load (the second skeleton, seconds later).

**Fix (final architecture):** Decouple the content fetch from the URL
entirely, and **don't write the URL at all** on dropdown change.

1. **The client sends the selection through the `get()` payload** —
   `c.server.get({action:'loadData', origin_id, topic_id, scope})`. The
   server reads `input.origin_id` / `input.topic_id` / `input.scope`
   first, falling back to `$sp.getParameter(...)` only when the payload
   is absent (fresh page load, full-page navigation). So the in-session
   reload has **zero URL dependency**.
2. **`getContent` takes an optional `topicIdOverride` arg** (5th param,
   back-compatible) so it no longer needs `$sp.getParameter('topic_id')`
   when the caller supplies the value. The All Topics loop already passed
   `topic_id` explicitly via `getContentForWidgetInstance`, so it was
   already URL-independent.
3. **The URL is NOT updated on dropdown change.** Testing confirmed
   Service Portal recompiles the widget whenever `origin_id` or `topic_id`
   appears in the URL — regardless of how the URL was written (`$location`
   vs raw `history.replaceState`). The trigger is the **param value being
   present**, not the write mechanism. So we removed the URL write
   entirely: selection lives in controller state only.

Net result: one explicit reload path (`loadAnnouncements(selection)`),
no URL touched mid-session, no recompile, no double skeleton.

**Tradeoff accepted:** the selection doesn't survive refresh and isn't
shareable via URL — refreshing reverts to Agency Wide. The View All
button *does* carry the selection (full-page navigation, recompile-on-load
is the intended behavior there). If shareable in-page selection becomes
needed, the path would be namespaced URL keys SP doesn't recognize
(e.g. `annTopic`/`annOrigin`) — deferred.

> Evolution of this fix: (1) first attempt kept the URL as the value
> carrier with atomic write + `.replace()` — still recompiled, because SP
> reacts to the `$location` change. (2) Moving the value into the
> `get()` payload removed the *fetch's* dependency on the URL, but the
> leftover `$location` write for shareability **still** recompiled. (3)
> Switched to raw `history.replaceState` — still recompiled, because SP
> watches the URL content, not the write mechanism. (4) Final: drop the
> URL write entirely. Selection is session-only; View All carries it via
> normal full-page navigation.

---

## How It Works End-to-End

```
Page load
  │
  ▼
Server runs once (no input)
  ├─ Resolves origin_id/topic_id/scope: input.* → URL fallback
  ├─ Sets instance_id, default_origin_id, isLoading=true
  ├─ Builds data.topics  ← list of topics whose template page hosts this widget
  └─ Returns early (no input.action)
  │
  ▼
HTML renders → skeleton loaders + dropdown
  │
  ▼
Client controller → loadAnnouncements()  (initial: no selection arg)
  └─ c.server.get({ action: 'loadData' })   ← server falls back to URL params
  │
  ▼
Server re-runs with input
  ├─ origin_id = input.origin_id || URL || homepage default || instance_id
  ├─ topic_id  = input.topic_id  || URL
  ├─ scope     = input.scope     || URL
  ├─ If scope=all
  │    └─ Loop across [Agency Wide + every topic origin],
  │       dedupe by sys_id, sort newest first, slice to max_rows
  └─ Otherwise
       └─ getContent($sp, queryId, null, null, topic_id)  ← topic_id passed explicitly
  │
  ▼
Client receives data.items → buildTopicOptions() → preselectFromUrl() (initial only) → renders
  │
  ▼
User picks an option from dropdown / filter panel
  └─ loadAnnouncements(selection)  ← selection sent in get() PAYLOAD only
       → server reads input.* → no URL touched → no recompile → one skeleton → data
  │
  ▼
User clicks "View All" → c.getViewAllUrl() builds destination from c.selectedTopic
  └─ Full-page navigation to ?id=agency_announcements&... carrying the selection
     (origin_id/topic_id/scope) — destination page reads URL on its own initial load
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
     * Routes content retrieval through preview-aware paths.
     *
     * @param {object} $sp - Service Portal scope object
     * @param {string} instanceId - origin/instance sys_id selecting the content
     * @param {string} [sysId] - optional specific content sys_id
     * @param {object} [options] - optional flags (e.g. { newsFeed: true })
     * @param {string} [topicIdOverride] - OPTIONAL. When supplied, this topic_id
     *        is used instead of reading $sp.getParameter('topic_id'). Lets callers
     *        pass the selection through the server-script `input` payload so the
     *        fetch no longer depends on the URL. Back-compatible: when omitted,
     *        behavior is identical to before (reads from $sp).
     */
    getContent: function ($sp, instanceId, sysId, options, topicIdOverride) {
        var grInstanceRecord = $sp.getInstanceRecord();
        var spInstanceId = grInstanceRecord && grInstanceRecord.getUniqueValue();
        // Override wins; fall back to the URL param for legacy callers / fresh loads.
        var topicId = (topicIdOverride !== undefined && topicIdOverride !== null)
            ? topicIdOverride
            : $sp.getParameter('topic_id');
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

    // Resolve selection params. Prefer the input payload (passed by the client
    // on dropdown change — no URL dependency, so no widget recompile), and fall
    // back to the URL params so fresh page loads, refreshes, and shareable links
    // still work. `input` is only present on the loadData round-trip.
    data.origin_id = (input && input.origin_id) || $sp.getParameter('origin_id') || null;
    data.page_id = $sp.getParameter('id');
    data.topic_id = (input && input.topic_id) || $sp.getParameter('topic_id') || null;
    data.scope = (input && input.scope) || $sp.getParameter('scope') || null;

    // Default origin_id for the "Agency Wide" dropdown option (homepage instance)
    data.default_origin_id = 'ace327ce47a67e10d1dbf8ba436d439b';

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
        // All Topics: query content across Agency Wide + every topic origin,
        // dedupe by sys_id, sort newest first. This path already passes topic_id
        // explicitly per-origin (via getContentForWidgetInstance), so it never
        // depended on the URL param.
        var seen = {};
        var merged = [];

        // Build the full list of origins to query: Agency Wide first, then every topic
        var origins = [{ origin_id: data.default_origin_id, topic_id: null }];
        var topicsForLoop = extended.getTopicsForWidget('d0dd830647ae3e10d1dbf8ba436d4314');
        topicsForLoop.forEach(function(t) {
            origins.push({ origin_id: t.instance_id, topic_id: t.sys_id });
        });

        origins.forEach(function(o) {
            // Call getContentForWidgetInstance directly with an explicit topicId
            // so each leg fetches the right topic's content without touching $sp.
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
        // Pass topic_id explicitly as the override (5th arg) so getContent does
        // not depend on $sp.getParameter('topic_id') — data.topic_id already
        // resolved from input payload OR URL above.
        data.items = extended.getContent($sp, data.queryId, null, null, data.topic_id);
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
instead of `getContent`:** the loop needs a *different* `topic_id` per
iteration. It calls `getContentForWidgetInstance(instanceId, topicId, ...)`
directly, passing each topic explicitly — so it never depended on the URL
param (it predates the `topicIdOverride` arg now on `getContent`, and
either approach works here). The preview routing in `getContent`
(`sca_content_id`, campaign preview) only fires when authors are previewing
content — not relevant in the All Topics view, so skipping it is fine.

**Dedupe:** keyed by `item.sys_id`. If the same announcement is published
to Agency Wide and to a topic (or to multiple topics), it shows once.

**Sort:** newest first by `sys_created_on`. Slicing to `max_rows` happens
*after* sort/dedupe, so we keep the most recent N across everything.

### Client Controller

Adds: dropdown state (Agency Wide + All Topics + topics), selection
handler, a responsive icon/panel for narrow widths, and a selection-aware
"View All" URL builder. The selection is sent to the server through the
**`get()` payload** (not the URL); the URL is **not** updated on dropdown
change to avoid Service Portal's recompile-on-`origin_id`-change reaction.
Also fixes the missing `$rootScope` injection from the existing code.

```javascript
function cdAnnouncementController($scope, $sce, $rootScope, $timeout, i18n, cdAnalytics) {
    var c = this;
    c.state = { current_side_nav_id: '', compact: false };
    c.topicOptions = [];
    c.selectedTopic = null;
    var initialized = false;

    console.log('[AgencyAnn] controller init — c.data.topics:', c.data.topics);

    // Initial load. On first run we have no selection yet, so we let the server
    // resolve params from the URL (shareable/refreshable links work), then build
    // options and pre-select to match. Subsequent loads pass the selection
    // through the payload — see loadAnnouncements(selection).
    loadAnnouncements();

    // selection (optional): { origin_id, topic_id, scope }. When provided, it's
    // passed in the get() payload so the server reads input.* — NO URL dependency,
    // so Service Portal never recompiles the widget. When omitted (initial load),
    // the server falls back to URL params.
    function loadAnnouncements(selection) {
        c.data.isLoading = true;

        var payload = { action: 'loadData' };
        if (selection) {
            payload.origin_id = selection.origin_id || null;
            payload.topic_id = selection.topic_id || null;
            payload.scope = selection.scope || null;
        }

        c.server.get(payload).then(function(response) {
            console.log('[AgencyAnn] loadData response.data.topics:', response.data.topics);
            c.data = response.data;

            // Always rebuild options against the freshly resolved data.
            buildTopicOptions();

            // Only derive the selection FROM the URL on the initial load. After
            // that, c.selectedTopic is owned by the dropdown / selectTopic(), and
            // re-reading the URL would fight the payload-driven selection.
            if (!initialized) {
                preselectFromUrl();
            } else {
                // Re-resolve the selected option object against the new options
                // array so the <select> stays bound to a current reference.
                syncSelectedReference(selection);
            }

            if (c.data.items && c.data.items.length > 0) {
                Object.keys(c.data.items).map(modifyItem);
            }
            c.data.isLoading = false;
            initialized = true;
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
        // scope=all wins, then topic_id, else default (Agency Wide).
        // Used ONLY on the initial load to match the dropdown to the URL.
        c.selectedTopic = c.topicOptions[0];
        if (c.data.scope === 'all') {
            c.selectedTopic = c.topicOptions[1];
        } else if (c.data.topic_id) {
            var match = c.topicOptions.find(function(opt) { return opt.topic_id === c.data.topic_id; });
            if (match) c.selectedTopic = match;
        }
    }

    function syncSelectedReference(selection) {
        // After a payload-driven reload, point c.selectedTopic at the matching
        // object in the freshly rebuilt topicOptions array, so the <select>'s
        // ng-model stays bound to a live reference (ng-options compares by ref).
        if (!selection) return;
        var match = c.topicOptions.find(function(opt) {
            return opt.origin_id === selection.origin_id &&
                   opt.topic_id === selection.topic_id &&
                   opt.scope === selection.scope;
        });
        if (match) c.selectedTopic = match;
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

    // Build the "View All Announcements" URL from the current selection. The
    // destination is the full agency_announcements page, which is itself an
    // instance of this same widget — so we pass selection params via the URL
    // and let the destination page's server script read them on initial load
    // (via $sp.getParameter). Three cases:
    //
    //   Agency Wide    → ?id=agency_announcements&origin_id=<homepage default>
    //   Specific topic → ?id=agency_announcements&origin_id=<topic instance>&topic_id=<topic>
    //   All Topics     → ?id=agency_announcements&scope=all
    //
    // NOTE: passing origin_id/topic_id here is fine even though they trigger SP's
    // recompile reaction — this is a full-page navigation (a new request), not
    // an in-session URL update, so "recompile on URL change" is exactly what we
    // want. The recompile problem only applies to mid-session $location writes.
    c.getViewAllUrl = function() {
        if (!c.selectedTopic) {
            // Fallback: Agency Wide
            return '?id=agency_announcements&origin_id=' + c.data.default_origin_id;
        }
        if (c.selectedTopic.scope === 'all') {
            return '?id=agency_announcements&scope=all';
        }
        var url = '?id=agency_announcements&origin_id=' + c.selectedTopic.origin_id;
        if (c.selectedTopic.topic_id) {
            url += '&topic_id=' + c.selectedTopic.topic_id;
        }
        return url;
    };

    c.onTopicChange = function() {
        var selection = {
            origin_id: c.selectedTopic.origin_id || null,
            topic_id: c.selectedTopic.topic_id || null,
            scope: c.selectedTopic.scope || null
        };

        // Payload-driven fetch — server reads input.*, no URL touched at all.
        // The URL is NOT mirrored: testing showed Service Portal recompiles the
        // widget whenever `origin_id` or `topic_id` appears in the URL,
        // regardless of how the URL was written ($location vs raw History API).
        // The trigger is the param values themselves, not the write mechanism.
        // Tradeoff: selection does not survive refresh and is not shareable via
        // URL — it lives in controller state only. Shareable links would have
        // required namespaced URL keys (`annTopic`/`annOrigin`) SP doesn't
        // recognize; deferred unless explicitly needed.
        loadAnnouncements(selection);
    };

    c.containerStyle = {
        background: c.options.background_color || 'rgba(255, 255, 255, .2)'
    };

    // --- Responsive filter (narrow widths) ---
    // Below the CSS breakpoint the <select> is hidden and a filter icon is
    // shown instead; clicking it toggles a panel of the same options.
    c.filterOpen = false;

    c.toggleFilter = function() {
        c.filterOpen = !c.filterOpen;
    };

    // Used by the icon-panel option buttons. Sets the model the same way the
    // native <select> would, then runs the shared change handler and closes.
    c.selectTopic = function(opt) {
        c.selectedTopic = opt;
        c.filterOpen = false;
        c.onTopicChange();
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
- URL is not touched on selection (see Issue 2 fix).
- The original kept `i18n`, `cdAnalytics`, `$timeout` as injections — preserved in case other code in the page references them, but they're still unused.

### HTML Template

Dropdown lives inside `.section-title-container` to the right of the title.
Hidden entirely when the page hosts the widget but yields no topics
(i.e., the only option would be "Agency Wide" alone) — that means the
dropdown only appears when there's actually something to switch between.

At narrow widths the `<select>` is replaced by a Font Awesome filter icon
that toggles a panel of the same options. Which one renders is driven by
`c.state.compact`, a flag set in the link function from the widget's
measured width — **not** a CSS `@container` query, because the Service
Portal SASS compiler can't be relied on to support `@container`.

```html
<div class="widget-container"
     id="{{ data.instance_id }}"
     ng-if="!options.topic_side_nav_id || c.state.current_side_nav_id == options.topic_side_nav_id">

    <div class="section-title-container">
        <h3 class="section-title headline-medium">
            {{options.title}}
        </h3>

        <!-- Topic selector — shown whenever at least one topic was discovered.
             When 0 topics, it would only show "Agency Wide" + "All Topics"
             which is redundant (both render the same homepage content), so hide. -->
        <div class="topic-selector" ng-if="data.topics && data.topics.length > 0">

            <!-- Wide layout: native select. Shown via JS width flag (the SP SCSS
                 compiler can't be relied on for @container queries). -->
            <select class="topic-select"
                    ng-if="!c.state.compact"
                    ng-model="c.selectedTopic"
                    ng-options="opt.label for opt in c.topicOptions"
                    ng-change="c.onTopicChange()"
                    aria-label="Filter announcements by topic">
            </select>

            <!-- Narrow layout: filter icon + popover panel -->
            <div class="topic-filter-compact" ng-if="c.state.compact">
                <button type="button"
                        class="filter-toggle"
                        ng-click="c.toggleFilter()"
                        aria-haspopup="true"
                        aria-expanded="{{c.filterOpen}}"
                        aria-label="Filter announcements by topic">
                    <i class="fa fa-filter"></i>
                </button>

                <div class="filter-panel" ng-if="c.filterOpen" role="menu">
                    <button type="button"
                            class="filter-option"
                            role="menuitemradio"
                            ng-repeat="opt in c.topicOptions"
                            ng-class="{ 'is-selected': opt === c.selectedTopic }"
                            aria-checked="{{opt === c.selectedTopic}}"
                            ng-click="c.selectTopic(opt)">
                        <i class="fa fa-check" ng-if="opt === c.selectedTopic"></i>
                        <span>{{opt.label}}</span>
                    </button>
                </div>
            </div>
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
            <a class="title-small" ng-href="{{c.getViewAllUrl()}}">
                View All Announcements <i class="fa fa-arrow-right"></i>
            </a>
        </div>
    </div>
</div>
```

### SCSS

Adds the flex header layout, the select styling, and the compact filter
(icon + popover panel) styling. Which control is visible is decided by
`ng-if="c.state.compact"` in the template — driven by a JS width check in
the link function — so the SCSS does **not** use an `@container` query
(the SP SASS compiler can't be relied on to support it). The breakpoint
lives in JS (`width < 600`), tune it there.

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
            position: relative;

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

            // Compact (icon) variant. Presence is controlled by ng-if on
            // c.state.compact, so no display toggle is needed here.
            .topic-filter-compact {
                position: relative;

                .filter-toggle {
                    background: rgba(255, 255, 255, 0.15);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.4);
                    border-radius: 8px;
                    padding: 8px 10px;
                    font-size: 16px;
                    line-height: 1;
                    cursor: pointer;

                    &:hover { background-color: rgba(255, 255, 255, 0.25); }
                    &:focus { outline: 2px solid white; outline-offset: 2px; }
                }

                .filter-panel {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    z-index: 10;
                    min-width: 200px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
                    padding: 6px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;

                    .filter-option {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 100%;
                        text-align: left;
                        background: transparent;
                        border: none;
                        border-radius: 6px;
                        padding: 10px 12px;
                        font-size: 14px;
                        color: #222;
                        cursor: pointer;

                        .fa-check {
                            font-size: 12px;
                            color: #A94E2F;
                        }

                        // Reserve space for the check so labels align whether or not selected
                        span { flex: 1; }

                        &:hover { background: rgba(0, 0, 0, 0.05); }

                        &.is-selected {
                            font-weight: 600;
                            background: rgba(169, 78, 47, 0.08);
                        }

                        &:focus {
                            outline: 2px solid #A94E2F;
                            outline-offset: -2px;
                        }
                    }
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

Three responsibilities now:

1. The existing keyboard/carousel handling — unchanged, kept for any
   carousel parent that wraps this widget.
2. **Width check:** measure the widget's actual rendered width and set
   `c.state.compact` so the template swaps the `<select>` for the filter
   icon below the breakpoint. Re-checked on window resize (debounced).
   This replaces the unreliable CSS `@container` query.
3. **Outside-click / Escape:** close the compact filter panel. Bound here
   because the link function already has `$elem` (the widget root).

```javascript
function cdAnnouncementLink($scope, $elem, $attr, c) {
    c.$announcement = jQuery($elem[0]);

    var COMPACT_BREAKPOINT = 600; // px — widget width below which we collapse

    // --- Width check: drive c.state.compact from the WIDGET's rendered width ---
    function checkWidth() {
        var width = c.$announcement.width();
        var compact = width > 0 && width < COMPACT_BREAKPOINT;
        if (compact !== c.state.compact) {
            $scope.$apply(function() {
                c.state.compact = compact;
                if (!compact) { c.filterOpen = false; } // tidy up when expanding
            });
        }
    }
    // Initial measure — defer one tick so layout has settled.
    setTimeout(checkWidth, 0);

    // Self-contained debounce so we don't depend on lodash being on window.
    var resizeTimer = null;
    function onResize() {
        if (resizeTimer) { clearTimeout(resizeTimer); }
        resizeTimer = setTimeout(checkWidth, 150);
    }
    jQuery(window).on('resize.topicFilter', onResize);

    // --- Existing carousel keyboard handling (unchanged) ---
    c.$announcement.bind('keyup', function(e) {
        if (e.keyCode === 13) {
            var $focusedIndicator = c.$announcement.find('.carousel-indicator:focus');
            var $targetedTabpanel = c.$announcement.find("#" + $focusedIndicator.attr('aria-controls'));
            var $currentTargedTabpanel = c.$announcement.find('[tabindex="-1"]');
            if ($currentTargedTabpanel) $currentTargedTabpanel.attr('tabindex', 0);
            $focusedIndicator.trigger('click');
            $targetedTabpanel.attr('tabindex', -1);
        } else if (e.keyCode == 37 && jQuery(e.target).hasClass('carousel-indicator')) {
            c.$announcement.find('.left.carousel-control').click();
            c.$announcement.find('.carousel-indicator.active').focus();
        } else if (e.keyCode == 39 && jQuery(e.target).hasClass('carousel-indicator')) {
            c.$announcement.find('.right.carousel-control').click();
            c.$announcement.find('.carousel-indicator.active').focus();
        }
    });

    // --- Close the compact filter panel on outside click ---
    c.$announcement.on('click.topicFilter', function(e) {
        if (!c.filterOpen) return;
        // If the click landed outside the compact filter wrapper, close.
        if (jQuery(e.target).closest('.topic-filter-compact').length === 0) {
            $scope.$apply(function() { c.filterOpen = false; });
        }
    });

    // Also close on Escape
    c.$announcement.on('keyup.topicFilter', function(e) {
        if (e.keyCode === 27 && c.filterOpen) {
            $scope.$apply(function() { c.filterOpen = false; });
        }
    });

    $scope.$on('$destroy', function() {
        c.$announcement.off('.topicFilter');
        jQuery(window).off('.topicFilter');
    });
}
```

> Note on the breakpoint: it measures the **widget's** width
> (`c.$announcement.width()`), not the viewport — so the collapse is
> correct even when the widget sits in a narrow column on a wide screen,
> which is what the `@container` query was trying (and failing) to do.
> Tune `COMPACT_BREAKPOINT` to taste.

> Note on outside-click: this listens within the widget root (`$elem`).
> A click on the filter toggle itself is inside `.topic-filter-compact`,
> so it won't self-close — the toggle's own `ng-click` handles open/close.
> If you need clicks *fully outside* the widget to close it too, bind to
> `$document` instead — omitted here to avoid a global listener.

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
- [ ] **Single fetch per change (no double skeleton)** — Changing the
  dropdown fetches exactly once: skeleton → data, with no second
  skeleton flash a few seconds later, and NO second `controller init`
  log (confirms no widget recompile). This is the core Issue 2 fix.
- [ ] **No recompile on change** — The controller is NOT re-instantiated
  on dropdown change (watch for a SINGLE `controller init` in console
  across multiple changes, and NO second skeleton flash seconds later).
- [ ] **URL unchanged on selection** — Address bar does NOT change when
  the dropdown is used; selection lives in controller state only.
- [ ] **Refresh reverts to default** — Refreshing the page after picking
  a topic resets to Agency Wide (intentional tradeoff; URL is not used
  to persist in-page selection).
- [ ] **Fresh load with URL params still works** — A URL like
  `?id=...&topic_id=<id>&origin_id=<id>` (e.g. from a View All link, or
  hand-crafted) loads correctly on initial render via the server's URL
  fallback, and `preselectFromUrl()` matches the dropdown to it.

**View All button (selection-aware):**
- [ ] **Agency Wide selected → View All** — URL is
  `?id=agency_announcements&origin_id=<homepage default>` and the
  destination page shows the full Agency Wide list with "Agency Wide"
  selected in its dropdown.
- [ ] **Specific topic selected → View All** — URL is
  `?id=agency_announcements&origin_id=<topic instance>&topic_id=<topic>`
  and the destination shows that topic's full list with the topic
  pre-selected in its dropdown.
- [ ] **All Topics selected → View All** — URL is
  `?id=agency_announcements&scope=all` and the destination shows the
  merged list with "All Topics" pre-selected.
- [ ] **View All is hidden when `max_rows` is not set** — same as
  current behavior (the link only renders when the list is truncated).

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

**Responsive filter (narrow width):**
- [ ] **Wide widget** — Native `<select>` renders (`c.state.compact`
  false); filter icon absent.
- [ ] **Narrow widget (widget width below `COMPACT_BREAKPOINT`)** —
  `<select>` absent; `fa-filter` icon renders. Confirm it keys off
  WIDGET width, not viewport (place the widget in a narrow column on a
  wide screen — it should still collapse).
- [ ] **Resize across the breakpoint** — Dragging the window/column
  across 600px flips between select and icon (debounced, no flicker).
- [ ] **Initial render at narrow width** — On first paint in a narrow
  container, the icon shows (the deferred `setTimeout(checkWidth, 0)`
  measures after layout settles). This was the bug where neither
  control appeared.
- [ ] **Tap filter icon** — Panel opens listing all options; current
  selection shows the check + highlight.
- [ ] **Select an option from panel** — Panel closes, content reloads,
  same `onTopicChange` behavior as the select.
- [ ] **Click outside panel** — Panel closes without changing selection.
- [ ] **Escape key** — Panel closes.
- [ ] **Selection persists across the breakpoint** — Pick a topic while
  narrow, widen the widget; the `<select>` reflects the same selection
  (both bind `c.selectedTopic`).

---

## Open Items / Out of Scope

- **Shareable / refreshable in-page selection** — Not supported.
  Selecting a topic doesn't update the URL, so refresh reverts to Agency
  Wide and you can't share a URL pointing at a specific selection within
  the embedded widget. Testing showed Service Portal recompiles the
  widget whenever `origin_id` or `topic_id` is in the URL (any write
  method — `$location` or raw History API). If this becomes needed, the
  workaround is namespaced URL keys SP doesn't recognize, e.g.
  `annTopic` and `annOrigin`, with the server reading those on initial
  load. The View All button does carry the selection — see test cases.
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


  # Updates

  # Empty-Topic Filtering — Implementation Steps

Three files to change. No template, SCSS, or link-function edits in this round.

---

## 1. Script Include — `cd_ContentDeliveryExtended`

**Replace the entire `getTopicsForWidget` method** with this version. The
signature gains an optional `opts` param, and a new Step 3 filters empties:

```javascript
/**
 * @param {string} widgetSysId - sys_id of the sp_widget record
 * @param {object} [opts] - optional flags
 * @param {boolean} [opts.requireContent=false] - when true, drops topics
 *        with zero active announcements (uses getContentForWidgetInstance
 *        for true parity with what the dropdown selection will load).
 *        Adds N small content queries — fine for initial load only.
 */
getTopicsForWidget: function (widgetSysId, opts) {
    if (!widgetSysId || typeof widgetSysId !== 'string') {
        return [];
    }
    var requireContent = !!(opts && opts.requireContent);

    // Step 1: walk sp_instance → sp_column → sp_row → sp_container → sp_page
    // (unchanged from before)
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
        var topicSysId = topicGr.getValue('sys_id');
        var anchorInstanceId = pageToInstance[templatePageId];

        // Step 3 (NEW): drop topics with no active announcements
        if (requireContent) {
            var items = cd_ContentDelivery.getContentForWidgetInstance(
                anchorInstanceId, topicSysId, null, null
            ) || [];
            if (items.length === 0) {
                continue;
            }
        }

        topics.push({
            sys_id: topicSysId,
            name: topicGr.getDisplayValue('name') || topicGr.getValue('name') || '',
            instance_id: anchorInstanceId
        });
    }

    return topics;
},
```

**What changed vs your existing version:**

- Method signature: `getTopicsForWidget(widgetSysId)` → `getTopicsForWidget(widgetSysId, opts)`
- Added `var requireContent = !!(opts && opts.requireContent);` at the top
- In the topic loop, replaced the inline `topics.push(...)` with:
  pull `topicSysId` and `anchorInstanceId` into local vars first,
  run the optional content check that `continue`s on empty,
  then push.

---

## 2. Widget Server Script

**Find this block** (the one that builds `data.topics` on every run):

```javascript
// Build the topic dropdown list on EVERY run.
// NOTE: this must NOT be guarded by `if (!input)`. ...
data.topics = new cd_ContentDeliveryExtended().getTopicsForWidget('d0dd830647ae3e10d1dbf8ba436d4314');
gs.info('[AgencyAnn] topics built — count: ' + ...);
```

**Replace it with:**

```javascript
// Build the topic dropdown list ONLY on initial load (`!input`).
// Filtered to topics that actually have active announcements (requireContent: true).
// On loadData round-trips we leave data.topics unset; the client preserves the
// list across the c.data overwrite so options stay stable AND we don't re-run
// the per-topic content query on every dropdown change.
if (!input) {
    data.topics = new cd_ContentDeliveryExtended().getTopicsForWidget(
        'd0dd830647ae3e10d1dbf8ba436d4314',
        { requireContent: true }
    );
    gs.info('[AgencyAnn] topics built (initial, content-filtered) — count: ' + (data.topics ? data.topics.length : 'null'));
} else {
    gs.info('[AgencyAnn] loadData run — topics NOT rebuilt (client preserves the initial list)');
}
```

Nothing else in the server script changes.

---

## 3. Widget Client Controller

Two small edits in the controller.

### Edit A — Add the cache variable near the top

**Find:**

```javascript
var initialized = false;

console.log('[AgencyAnn] controller init — c.data.topics:', c.data.topics);
```

**Replace with:**

```javascript
var initialized = false;

// Cache of the filtered topic list from the initial server run. The server
// only computes this list (with empty-topic filtering) on initial load —
// subsequent loadData round-trips do NOT include data.topics in the response,
// so we preserve it here and restore it after each c.data overwrite.
var cachedTopics = (c.data && c.data.topics) ? c.data.topics : [];

console.log('[AgencyAnn] controller init — c.data.topics:', c.data.topics, '| cached count:', cachedTopics.length);
```

### Edit B — Restore the cache after `c.data` overwrite

**Find inside `loadAnnouncements`:**

```javascript
c.server.get(payload).then(function(response) {
    console.log('[AgencyAnn] loadData response.data.topics:', response.data.topics);
    c.data = response.data;

    // Always rebuild options against the freshly resolved data.
    buildTopicOptions();
```

**Replace with:**

```javascript
c.server.get(payload).then(function(response) {
    console.log('[AgencyAnn] loadData response.data.topics:', response.data.topics);
    c.data = response.data;

    // Restore the cached topic list — the server intentionally omits it on
    // loadData runs to avoid re-running the content-filter cost. If the
    // response DID include topics (initial load only), prefer that.
    if (c.data.topics && c.data.topics.length) {
        cachedTopics = c.data.topics;
    } else {
        c.data.topics = cachedTopics;
    }

    // Always rebuild options against the freshly resolved data.
    buildTopicOptions();
```

---

## How to verify it's working

1. Open the page and watch the System Logs filtered to `AgencyAnn` — you
   should see **`topics built (initial, content-filtered)`** once on page
   load, and **`topics NOT rebuilt`** on every dropdown change after.
2. Confirm topics with zero active announcements are absent from the
   dropdown.
3. In the browser console after a dropdown change, `c.data.topics` should
   still be a populated array (restored from cache), and the dropdown
   options should remain stable.
4. Add an announcement to a previously-empty topic, reload the page —
   that topic should now appear in the dropdown (initial-load filter
   re-runs).
