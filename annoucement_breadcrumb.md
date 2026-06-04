# Announcements Breadcrumb Widget

A breadcrumb widget for the Agency Announcements flow. The trail is derived
entirely from the announcement URL parameters (`id`, `topic_id`, `origin_id`,
`scope`, `sys_id`) — there are no page options on the widget. It runs once on
page load and renders read-only; no client interaction or server round-trips.

## Trail behavior

|Context                          |Trail                                                      |
|---------------------------------|-----------------------------------------------------------|
|List page, no topic              |Home › **Announcements**                                   |
|List page, from a topic          |Home › Topic › **Announcements**                           |
|Single announcement              |Home › Announcements › **Article**                         |
|Single announcement, from a topic|Home › Topic › Announcements › **Article**                 |
|All Topics mode (`scope=all`)    |Home › Announcements › **Article** (topic crumb suppressed)|

The last crumb is the current page (bold, no link). The **Announcements** crumb
rebuilds the list URL carrying whatever filter the user arrived with
(`topic_id`/`origin_id`, or `scope=all`), so it returns them to the correctly
filtered list.

-----

## Client URL Code 
``` javascript
// Build the detail-page URL for a list item, carrying the current
// selection context so the detail page can show "from <topic>" framing
// or wire up a back-link that lands the user where they came from.
//
// Three cases mirror getViewAllUrl():
//   Agency Wide    → ?id=agency_announcement&sys_id=<item>&origin_id=<homepage default>
//   Specific topic → ?id=agency_announcement&sys_id=<item>&origin_id=<topic instance>&topic_id=<topic>
//   All Topics     → ?id=agency_announcement&sys_id=<item>&scope=all
//
// Same caveat as View All: passing origin_id/topic_id here is fine
// because this is a full-page navigation (new request), not a mid-session
// URL update. The recompile-on-URL-change problem only applies to
// mid-session $location writes.
c.getItemUrl = function(item) {
    var base = '?id=agency_announcement&sys_id=' + item.sys_id;
    if (!c.selectedTopic) {
        return base + '&origin_id=' + c.data.default_origin_id;
    }
    if (c.selectedTopic.scope === 'all') {
        return base + '&scope=all';
    }
    var url = base + '&origin_id=' + c.selectedTopic.origin_id;
    if (c.selectedTopic.topic_id) {
        url += '&topic_id=' + c.selectedTopic.topic_id;
    }
    return url;
};


```

## HTML Template

```html
<div class="dlac-ann-bread-wrapper">
  <div class="flex flex-between align-center gap-md">
    <ul class="breadcrumbs flex flex-start align-center gap-sm flex-wrap">

      <!-- Home — always present, always linked -->
      <li class="flex flex-start align-center gap-sm">
        <a href="/dla_connect" class="text-white">${Home}</a>
        <i class="fa fa-chevron-right fa-sm text-white" aria-hidden="true"></i>
      </li>

      <!-- Derived crumbs: [Topic] -> Announcements -> [Article] -->
      <li class="flex flex-start align-center gap-sm"
          ng-repeat="crumb in data.breadcrumbs track by $index">
        <a class="text-white" ng-href="{{crumb.url}}" ng-bind="crumb.name" ng-if="!$last"></a>
        <span class="text-white text-bold" ng-bind="crumb.name" ng-if="$last"></span>
        <i class="fa fa-chevron-right fa-sm text-white" aria-hidden="true" ng-if="!$last"></i>
      </li>

    </ul>
  </div>
</div>
```

-----

## Client Controller

```javascript
api.controller = function() {
  // Breadcrumbs are fully server-rendered from the URL params.
  // Nothing to wire up client-side.
};
```

-----

## Server Script

```javascript
(function() {

  var CONFIG = {
    list_page:   'agency_announcements',  // ?id= of the announcements list page
    detail_page: 'agency_announcement',   // ?id= of the single-announcement page
    announcements_label: 'Announcements',

    // Topic record — topic_id from the URL is a sys_id on this table
    topic_table:          'topic',
    topic_name_field:     'name',
    topic_template_field: 'template'    // reference to the sp_page that backs the topic
  };

  data.breadcrumbs = [];

  // Read-only: single server run on load
  var pageId   = $sp.getParameter('id');
  var topicId  = $sp.getParameter('topic_id') || null;
  var originId = $sp.getParameter('origin_id') || null;
  var scope    = $sp.getParameter('scope') || null;
  var sysId    = $sp.getParameter('sys_id') || null;

  var isAllTopics = (scope === 'all');
  var onDetail    = (pageId === CONFIG.detail_page);

  // Topic crumb — only for a specific topic, never in All Topics mode
  if (topicId && !isAllTopics) {
    var topicCrumb = getTopicCrumb(topicId);
    if (topicCrumb) data.breadcrumbs.push(topicCrumb);
  }

  // Announcements crumb — linked on the detail page, plain when it is the page
  var announcementsCrumb = { name: CONFIG.announcements_label };
  if (onDetail) announcementsCrumb.url = buildListUrl(originId, topicId, isAllTopics);
  data.breadcrumbs.push(announcementsCrumb);

  // Single-announcement crumb — the current page, always last and unlinked
  if (onDetail && sysId) {
    var title = getContentTitle(sysId);
    data.breadcrumbs.push({ name: title || 'Announcement' });
  }

  function getTopicCrumb(tId) {
    var gr = new GlideRecord(CONFIG.topic_table);
    if (!gr.get(tId)) return null;
    return {
      name: gr.getValue(CONFIG.topic_name_field) || gr.getDisplayValue(),
      url:  buildTopicUrl(gr, tId)
    };
  }

  function buildTopicUrl(topicGr, tId) {
    // Topic landing page is the sp_page on topic.template; re-pass topic_id
    // so a shared template resolves back to this topic.
    var templatePageSysId = topicGr.getValue(CONFIG.topic_template_field);
    if (!templatePageSysId) return null;
    var pageGr = new GlideRecord('sp_page');
    if (!pageGr.get(templatePageSysId)) return null;
    return '?id=' + pageGr.getValue('id') + '&topic_id=' + tId;
  }

  function buildListUrl(oId, tId, allTopics) {
    var url = '?id=' + CONFIG.list_page;
    if (allTopics) return url + '&scope=all';
    if (oId) url += '&origin_id=' + oId;
    if (tId) url += '&topic_id=' + tId;
    return url;
  }

  function getContentTitle(cId) {
    // Same call the detail widget makes, so the title comes from one source.
    var announcement = new sn_cd.cd_ContentDeliveryExtended().getPortalRichTextById(cId);
    return announcement ? announcement.title : null;
  }

})();
```

-----

## CSS — SCSS

```scss
.dlac-ann-bread-wrapper {
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.breadcrumbs {
  z-index: 1;
  margin: 0;
  padding: 0;
  list-style: none;
}

a {
  text-decoration: none;
  &:hover,
  &:focus { text-decoration: underline; }
}

.text-bold { font-weight: 600; }
```

-----

## Notes

- **Upstream dependency:** the detail-page crumbs depend on the announcement
  widget’s per-row links carrying `topic_id` (and ideally `origin_id`). With
  `topic_id` alone the back-to-list crumb still works; with `origin_id` it
  resolves exactly.
- **Title resolution:** `getContentTitle` uses
  `sn_cd.cd_ContentDeliveryExtended().getPortalRichTextById(sys_id)` — the same
  call the detail widget makes — and reads `.title` off the result.
- **Topic URL:** assumes the topic’s landing page is the `sp_page` referenced by
  `topic.template`. Adjust `buildTopicUrl` if topics resolve their page a
  different way.