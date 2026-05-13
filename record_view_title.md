# Record Title Widget — Implementation

A lightweight, dedicated widget that renders only the record's title. Built so it can live independently on a portal page without pulling the full record view config (sections, fields, cancel actions, etc.).

The styling matches the existing title block in the Dynamic Record View widget — same blue band, same white display-extra-large typography — so visually the page looks unchanged.

---

## 1. Script Include Changes — `GENDynamicRecordViewUtility`

Two refactors and one new method. The existing `buildTitle` is refactored to share logic with the new method via a private helper.

### 1a. Replace the existing `buildTitle` method

Find the current `buildTitle` and replace it with this version. Behavior is identical for existing callers (the Dynamic Record View widget); it now just delegates to `_computeTitle`.

```javascript
/**
 * Compute the title for a record. Uses configured title_field if provided,
 * otherwise falls back to short_description → number → record display value.
 * Callers that already have rec + config loaded should use this method.
 */
buildTitle: function (rec, config) {
    var ctx = 'buildTitle';

    try {
        if (!rec) {
            this._log('warn', ctx, 'No record provided');
            return 'Record';
        }

        var titleField = (config && config.title_field) ? (config.title_field + '') : '';
        return this._computeTitle(rec, titleField, ctx);

    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err +
            ' | stack: ' + (err.stack || 'no stack'));
        return 'Record';
    }
},
```

### 1b. Add the new `resolveTitle` method

Add this method right after `buildTitle`. It's the dedicated entry point for the title-only widget.

```javascript
/**
 * Standalone title resolver — for widgets that ONLY render the title.
 * Self-contained: takes a table + sys_id, returns the title string.
 *
 * Optimized to avoid loading the full record-view config (sections, fields,
 * cancel actions). Only fetches the title_field setting from the config table.
 *
 * Returns an object: { title: string, error: string|null }
 */
resolveTitle: function (table, sysId) {
    var ctx = 'resolveTitle';

    try {
        this._log('info', ctx, 'Called with table=' + table + ' sys_id=' + sysId);

        if (!table || !sysId) {
            this._log('warn', ctx, 'Missing table or sys_id');
            return { title: 'Record', error: 'Missing table or sys_id' };
        }

        var rec = new GlideRecordSecure(table);
        if (!rec.get(sysId)) {
            this._log('warn', ctx, 'Record not found or access denied');
            return { title: 'Record', error: 'Record not found or access denied' };
        }

        // Lightweight config lookup — fetch only title_field, not the full config
        var titleField = this._lookupTitleFieldOnly(table);
        this._log('debug', ctx, 'Resolved title_field=' + (titleField || '(none)'));

        var title = this._computeTitle(rec, titleField, ctx);
        return { title: title, error: null };

    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err +
            ' | stack: ' + (err.stack || 'no stack'));
        return { title: 'Record', error: 'Unexpected error resolving title' };
    }
},
```

### 1c. Add the two private helpers

Add these after `resolveTitle`. The first is the shared title-computation logic, the second is the lightweight config lookup.

```javascript
/**
 * Shared title computation — used by both buildTitle and resolveTitle.
 * Pure function: given a record and a (possibly empty) title field name,
 * returns the resolved title string.
 */
_computeTitle: function (rec, titleField, callerCtx) {
    var ctx = callerCtx || '_computeTitle';

    if (titleField) {
        var configured = rec.getDisplayValue(titleField);
        this._log('info', ctx, 'Using configured title_field="' + titleField +
            '" → "' + configured + '"');
        if (configured) return configured;
        this._log('warn', ctx, 'Configured title_field returned empty — falling back');
    }

    var fallback = rec.getDisplayValue('short_description') ||
        rec.getDisplayValue('number') ||
        rec.getDisplayValue() ||
        'Record';

    this._log('info', ctx, 'Using fallback title → "' + fallback + '"');
    return fallback;
},

/**
 * Fetch ONLY the title_field setting from the config table for a given table.
 * Used by resolveTitle to avoid the cost of loading sections/fields/cancel actions.
 */
_lookupTitleFieldOnly: function (table) {
    var ctx = '_lookupTitleFieldOnly';
    try {
        var gr = new GlideRecord('x_g_dla_dla_connec_record_view_config');
        gr.addQuery('table.name', table);
        gr.addQuery('active', true);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            return (gr.getValue('title_field') || '') + '';
        }
        return '';
    } catch (err) {
        this._log('warn', ctx, 'Exception: ' + err);
        return '';
    }
},
```

### Why this structure

`buildTitle` and `resolveTitle` both delegate to `_computeTitle` for the actual computation logic. This means the fallback chain (`short_description` → `number` → display value → `'Record'`) lives in one place. If you ever change that chain, you change it once.

`_lookupTitleFieldOnly` is intentionally separate from `loadConfig`. `loadConfig` does 2+ GlideRecord queries (the config row, the child field rows, child cancel action rows). `_lookupTitleFieldOnly` does exactly one query and reads exactly one field. For a widget whose only job is to render a title string, that's the right level of work.

---

## 2. New Widget: "GEN Record Title"

Create a new Service Portal widget with the pieces below. Suggested ID: `gen-record-title`.

### 2a. Option schema (paste as JSON)

```json
[]
```

The widget reads `table` and `sys_id` from URL params, like the other widgets on the page.

### 2b. Server script

```javascript
(function() {
    data.table = $sp.getParameter('table');
    data.sys_id = $sp.getParameter('sys_id');
    data.title = 'Record';
    data.error = null;

    if (!data.table || !data.sys_id) {
        data.error = 'Missing table or sys_id';
        return;
    }

    var utility = new GENDynamicRecordViewUtility();
    var result = utility.resolveTitle(data.table, data.sys_id);

    data.title = result.title;
    data.error = result.error;
})();
```

That's the whole server script. One method call, all the heavy lifting lives in the script include.

### 2c. Client controller

```javascript
function($scope) {
    var c = this;

    // Refresh the title if a record action executes elsewhere on the page
    // (e.g. cancel might change a field that the title is based on)
    $scope.$on('record-actions:executed', function() {
        c.server.refresh();
    });
}
```

This catches the same event the Record Actions widget emits after a successful action, so if a cancel/approval ends up changing the field that drives the title (e.g. state-based title), the title widget refreshes too.

### 2d. HTML template (Body HTML)

Markup mirrors the title block currently inside the Dynamic Record View widget — same class names so the existing CSS styles it identically.

```html
<div class="record-view-header" ng-if="!data.error">
    <h1 class="record-view-title display-extra-large">{{data.title}}</h1>
</div>

<div class="panel panel-danger" ng-if="data.error">
    <div class="panel-body">{{data.error}}</div>
</div>
```

### 2e. CSS (SCSS)

The existing Dynamic Record View widget already styles `.record-view-header` and `.record-view-title` for the blue band + white extra-large typography. To keep the styling working when the title is rendered by its own widget (a separate widget = separate CSS scope), copy the same rules into this widget's CSS:

```scss
.record-view-header {
    .record-view-title {
        color: #fff;   // record name is white per spec; theme utility class .display-extra-large handles typography
        margin: 0;
    }
}
```

If your existing record-view-header styles include the blue background band, padding, or border-radius (your CSS in the original widget didn't, since the band was applied via the page background), make sure those styles are accessible to this widget too. Two paths:

- **Easier:** copy the relevant header styles into this widget's CSS as well
- **Cleaner:** move shared `.record-view-header` / `.record-view-title` styles to a portal-wide stylesheet or Theme CSS, so every widget that uses the class gets the same look

For v1, copying into this widget's CSS is fine and keeps deployment self-contained.

---

## 3. Cleanup — Remove the Title Block from Dynamic Record View Widget

Once the new Title widget is on the page, the Dynamic Record View widget should stop rendering its own title block to avoid two titles showing up.

In the Dynamic Record View widget's HTML template, **remove** this block:

```html
<div class="record-view-header">
    <h1 class="record-view-title display-extra-large">{{data.title}}</h1>
</div>
```

The widget's server script can also stop computing `data.title` since nothing uses it anymore — but that's optional cleanup. Leaving the line in is harmless.

---

## 4. Portal Page Setup

On the `record_view` portal page, place the widgets top-to-bottom in this order:

1. **GEN Record Title** — the title band
2. **GEN Record Actions** — the action buttons (Approve/Reject/Cancel)
3. **GEN Dynamic Record View** — the record details card

All three widgets read `table` and `sys_id` from URL params independently, so no wiring is needed between them. The optional cross-widget refresh event (`record-actions:executed`) is the only inter-widget communication.

---

## 5. Deployment Order

1. Update the script include (section 1 — refactor `buildTitle`, add `resolveTitle`, add the two private helpers)
2. Test in Scripts - Background:
   ```javascript
   var u = new GENDynamicRecordViewUtility();
   gs.print(JSON.stringify(u.resolveTitle('sc_req_item', '<a RITM sys_id>'), null, 2));
   ```
   Expected: `{"title": "...", "error": null}`. Confirm the resolved title matches what the Dynamic Record View widget shows on the same record.
3. Create the new GEN Record Title widget (section 2)
4. Remove the title block from the existing Dynamic Record View widget (section 3)
5. Place the new widget on the `record_view` portal page above the others (section 4)

---

## 6. Why a separate widget instead of just leaving the title in the record view widget?

A few reasons this is worth doing:

- **Composability.** Each widget does one thing. The page is assembled from independent pieces — title, actions, details — each of which can be tested, restyled, or replaced without touching the others.
- **Reuse.** The title widget can appear on other portal pages too (e.g. a print view, an approval-summary page) without dragging the rest of the record view machinery along.
- **Performance.** The title widget skips the full `loadConfig` cost (it would otherwise do a config row query + child field rows + child cancel action rows for every render). For a widget that only renders a string, that's significant overhead avoided.
- **Refresh control.** When an action fires, each widget decides for itself whether to refresh. The title widget refreshes because the title might depend on the changed field; the details widget refreshes for the same reason; the actions widget refreshes because available actions might change. Three independent refreshes are more efficient than a full page reload.

---

## 7. Log Patterns to Watch

The new method uses the same `_log` helper as the rest of the utility. Filter logs by `[GENDynamicRecordView][INFO][resolveTitle]` to see title resolution activity:

```
[INFO][resolveTitle] Called with table=sc_req_item sys_id=...
[DEBUG][resolveTitle] Resolved title_field=number
[INFO][resolveTitle] Using configured title_field="number" → "RITM0001234"
```

If a title falls through to the fallback chain unexpectedly, the logs show exactly where:

```
[INFO][resolveTitle] Called with table=...
[DEBUG][resolveTitle] Resolved title_field=
[INFO][resolveTitle] Using fallback title → "<short description text>"
```

An empty `title_field` value typically means either no config row exists for this table or the config's `title_field` column is blank.
