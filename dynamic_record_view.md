# Dynamic Record View Widget — Solution Design

**Widget name (proposed):** `Dynamic Record View` (`x_gensync_record_view` or similar, scoped app)
**Goal:** A single Service Portal widget that renders a detail view for *any* task-based (or non-task) record, driven by configuration stored in a custom table. Widget receives a `table` and `sys_id` via URL params or widget options and dynamically resolves which fields to show and how.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Portal Page: /sp?id=record-view&table=sc_req_item&sys_id=..│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Widget: Dynamic Record View                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Server Script                                            │ │
│  │  1. Resolve table + sys_id from URL or options          │ │
│  │  2. Load record via GlideRecord                          │ │
│  │  3. Look up config row in x_gensync_record_view_config  │ │
│  │  4. Load child field rows (header/primary/details)       │ │
│  │  5. Fall back to defaults if no config exists            │ │
│  │  6. Build a field descriptor array per section           │ │
│  │  7. Resolve values, display values, types, links         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                               │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ HTML Template (AngularJS)                                │ │
│  │  - Title bar (record display name, white text on hero)   │ │
│  │  - Details card                                          │ │
│  │     ├── Header row (flex grid, configurable fields)      │ │
│  │     ├── Primary section (stacked, full-width)            │ │
│  │     └── "More Details" expander → 2-col details grid     │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. The Config Table — Recommended Design

### Why a parent/child table, not three List fields

You floated the idea of three List fields on a config table. That works, but has three limitations worth noting:

1. **No per-field metadata.** List fields only give you the sys_ids. You can't set a label override, column width, render hint, or order-within-section without a second structure anyway.
2. **Ordering is fragile.** List field order can get re-sorted silently. A child table with an explicit `order` column is deterministic.
3. **Admin UX is worse.** Managing three comma-separated lists of sys_ids in a List collector for every table is tedious; a related list of child records is what admins expect in ServiceNow.

**Recommended: one parent config table + one child field table.**

### Parent table: `x_gensync_record_view_config`

| Field | Type | Notes |
|---|---|---|
| `name` | String (40) | Display name, e.g. "RITM Detail Config" |
| `table` | Table Name (`sys_db_object` reference) | Unique — one config per table |
| `title_field` | String (40) | Field to use for the big "Record Name" header. Default: `number` or dictionary display value |
| `title_template` | String (255) | Optional. e.g. `${number} — ${short_description}`. Overrides `title_field` if set |
| `active` | True/False | Lets admins disable a config without deleting it |
| `description` | String (500) | Admin notes |

Make `table` unique so lookups are a single `gr.get('table', tableName)` call.

### Child table: `x_gensync_record_view_field`

| Field | Type | Notes |
|---|---|---|
| `config` | Reference → `x_gensync_record_view_config` | Parent |
| `field_name` | String (80) | Dictionary element name, e.g. `requested_for`. Validated at save time via business rule (see §2.1). |
| `section` | Choice | `header`, `primary`, `details` |
| `order` | Integer | Display order within the section |
| `label_override` | String (80) | Optional. Empty = use dictionary label |
| `visible_when` | String (255) | Optional. Simple JS condition evaluated server-side against record values, e.g. `state != 'closed'`. Skip for v1 if you want to keep scope tight |

**Naming convention in your scope:** prefix with `x_` per ServiceNow scoped-app rules. Swap `x_gensync` for the actual scope prefix of your Gensync app.

**Render strategy is derived, not configured.** There is no `render_as` column. The server script reads the field's dictionary type via `element.getED().getInternalType()` and maps it to a render mode automatically — references render as links, dates format with display values, HTML fields get trusted through `$sce`, booleans become badges, everything else is plain text. Fewer config decisions, no way to misconfigure a field. See §5 for the type → render mapping.

### 2.1 Validation business rule on `x_gensync_record_view_field`

Before Insert / Before Update, on `x_gensync_record_view_field`, validate that `field_name` exists in the dictionary for the parent config's table:

```javascript
(function executeRule(current, previous) {
var fieldName = current.getValue('field_name');
var configSysId = current.getValue('config');
if (!fieldName || !configSysId) return;

var cfg = new GlideRecord('x_gensync_record_view_config');
if (!cfg.get(configSysId)) {
  gs.addErrorMessage('Invalid config reference');
  current.setAbortAction(true);
  return;
}
var tableName = cfg.getValue('table');

// TableUtils handles inherited fields (task → incident, etc.)
var tu = new TableUtils(tableName);
var tables = tu.getTables();  // includes parent tables
var dict = new GlideRecord('sys_dictionary');
dict.addQuery('name', 'IN', tables.join(','));
dict.addQuery('element', fieldName);
dict.setLimit(1);
dict.query();
if (!dict.next()) {
  gs.addErrorMessage('Field "' + fieldName + '" does not exist on table "' + tableName + '" or any parent table.');
  current.setAbortAction(true);
}
})(current, previous);
```

This catches typos at save time, costs nothing at runtime, and handles inherited fields correctly (so configuring `number` on an `incident` config validates against `task` where the field actually lives).

### Section names — my recommendation

You proposed: **header / secondary / additional body**.

I'd rename to **header / primary / details**:

- `header` — top row, 3–6 fields, key/value grid (Number, Requester, State, Priority, Updated, Created in the mockup).
- `primary` — stacked full-width fields that are long-form but always visible (Short Description, Long Description / Description).
- `details` — hidden behind "More Details", rendered in a 2-column grid (everything else worth showing — assignment group, category, CI, approvals summary, etc.).

"Secondary" is ambiguous with "additional body." `primary` / `details` reads better and matches how ServiceNow's own form layouts think about hero-level vs. supplementary info. Push back if you prefer your original names — the table schema is the same either way, it's just the choice list values.

---

## 3. Widget Option Schema

The widget should accept everything via options *or* URL params, with URL params winning when both exist (so you can embed the widget on a dedicated page and link to it).

```json
[
{
  "name": "table",
  "label": "Table",
  "type": "string",
  "hint": "Table name. Overridden by ?table= URL param."
},
{
  "name": "sys_id",
  "label": "Record Sys ID",
  "type": "string",
  "hint": "Sys ID of the record. Overridden by ?sys_id= URL param."
},
{
  "name": "allow_default_config",
  "label": "Allow Default Fallback",
  "type": "boolean",
  "default_value": "true",
  "hint": "If no config row exists for the table, fall back to sensible defaults instead of showing an error."
}
]
```

(Back link options removed — title bar is now display-only.)

---

## 4. Server Script — Pseudocode

## 4.1 Script Include
```javascript
var GENDynamicRecordViewUtility = Class.create();
GENDynamicRecordViewUtility.prototype = {

    // ── Logging configuration ───────────────────────────────────────────────
    LOG_PREFIX: 'GENDynamicRecordView',
    LOG_LEVEL: 'debug',  // 'debug' | 'info' | 'warn' | 'error' — controls verbosity

    initialize: function () {
        this._taskExtensionCache = {};
        this._log('info', 'initialize', 'Utility instance created');
    },

    // ── Public methods ──────────────────────────────────────────────────────

    /**
     * Load the record view config for a given table.
     * Returns null if no active config exists, or if an error occurs.
     */
    loadConfig: function (table) {
        var ctx = 'loadConfig';
        this._log('info', ctx, 'Called with table=' + table);

        if (!table) {
            this._log('warn', ctx, 'No table provided — returning null');
            return null;
        }

        try {
            var gr = new GlideRecord('x_g_dla_dla_connec_record_view_config');
            gr.addQuery('table', table);
            gr.addQuery('active', true);
            gr.setLimit(1);
            gr.query();

            this._log('debug', ctx, 'Query encoded: ' + gr.getEncodedQuery());

            if (!gr.next()) {
                this._log('info', ctx, 'No active config found for table=' + table);
                return null;
            }

            var cfg = {
                sys_id: gr.getUniqueValue(),
                title_field: gr.getValue('title_field'),
                fields: { header: [], primary: [], details: [] }
            };

            this._log('debug', ctx, 'Config record loaded: sys_id=' + cfg.sys_id +
                ', title_field=' + cfg.title_field);

            // Load child field rows
            var fg = new GlideRecord('x_g_dla_dla_connec_record_view_field');
            fg.addQuery('config', cfg.sys_id);
            fg.orderBy('section');
            fg.orderBy('order');
            fg.query();

            var fieldCount = 0;
            while (fg.next()) {
                var section = fg.getValue('section') + '';
                var fieldName = fg.getValue('field_name') + '';
                var labelOverride = (fg.getValue('label_override') || '') + '';

                var fieldEntry = {
                    field_name: fieldName,
                    label_override: labelOverride
                };

                if (section === 'header') {
                    cfg.fields.header.push(fieldEntry);
                    fieldCount++;
                } else if (section === 'primary') {
                    cfg.fields.primary.push(fieldEntry);
                    fieldCount++;
                } else if (section === 'details') {
                    cfg.fields.details.push(fieldEntry);
                    fieldCount++;
                } else {
                    this._log('warn', ctx, 'Unknown section value: "' + section +
                        '" (length=' + section.length + ') for field=' + fieldName);
                }
            }
            this._log('info', ctx, 'Config loaded successfully. Total fields=' + fieldCount +
                ' (header=' + cfg.fields.header.length +
                ', primary=' + cfg.fields.primary.length +
                ', details=' + cfg.fields.details.length + ')');
            this._log('debug', ctx, 'Full config: ' + JSON.stringify(cfg));

            return cfg;

        } catch (err) {
            this._log('error', ctx, 'Exception while loading config: ' + err +
                ' | stack: ' + (err.stack || 'no stack'));
            return null;
        }
    },

    /**
     * Build the array of field descriptors for a given section.
     * Falls back to default field selection when no config is provided.
     */
    buildSection: function (rec, config, section) {
        var ctx = 'buildSection[' + section + ']';
        var self = this;

        try {
            this._log('debug', ctx, 'Called. config provided=' + !!config +
                ', table=' + (rec ? rec.getTableName() : 'null'));

            if (!rec) {
                this._log('error', ctx, 'No record provided — returning empty array');
                return [];
            }

            var fields;
            var usingConfig = !!(config && config.fields && config.fields[section] &&
                config.fields[section].length > 0);

            if (usingConfig) {
                fields = config.fields[section];
                this._log('info', ctx, 'Using configured fields. count=' + fields.length);
            } else {
                fields = this._getDefaultFields(rec, section);
                this._log('info', ctx, 'Using default fields (no config). count=' + fields.length);
            }

            this._log('debug', ctx, 'Field list: ' + JSON.stringify(fields));

            var descriptors = fields.map(function (f) {
                return self._describeField(rec, f);
            }).filter(function (d) {
                return d !== null;
            });

            this._log('info', ctx, 'Built ' + descriptors.length + ' descriptor(s) (filtered from ' +
                fields.length + ' raw)');

            return descriptors;

        } catch (err) {
            this._log('error', ctx, 'Exception: ' + err +
                ' | stack: ' + (err.stack || 'no stack'));
            return [];
        }
    },

    /**
     * Resolve the title for the record. Uses config.title_field if set,
     * otherwise falls back to short_description → number → record display value.
     */
    buildTitle: function (rec, config) {
        var ctx = 'buildTitle';

        try {
            if (!rec) {
                this._log('warn', ctx, 'No record provided');
                return 'Record';
            }

            if (config && config.title_field) {
                var configured = rec.getDisplayValue(config.title_field);
                this._log('info', ctx, 'Using configured title_field="' + config.title_field +
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

        } catch (err) {
            this._log('error', ctx, 'Exception: ' + err +
                ' | stack: ' + (err.stack || 'no stack'));
            return 'Record';
        }
    },

    /**
     * Build variable descriptors for an sc_req_item record.
     * Returns an empty array for any other table.
     *
     * Strategy:
     *  1. Query item_option_new for all active variables on this RITM's catalog item
     *     AND from any variable sets attached to that catalog item.
     *  2. For each variable definition, read the value off rec.variables[<name>] —
     *     this handles the joins through sc_item_option_mtom / sc_item_option for us.
     *  3. Skip layout-only types (container_start, container_end, container_split,
     *     label, break, macro, etc.) since they hold no data.
     *  4. Skip HTML variables for v1 to avoid having to sanitize rich text in the
     *     widget — can be added later via the existing 'html' render mode.
     */
    buildVariables: function (rec) {
        var ctx = 'buildVariables';

        try {
            if (!rec) {
                this._log('warn', ctx, 'No record provided');
                return [];
            }

            var tableName = rec.getTableName() + '';
            if (tableName !== 'sc_req_item') {
                this._log('debug', ctx, 'Not an sc_req_item (table=' + tableName + ') — skipping');
                return [];
            }

            var catItemId = rec.getValue('cat_item');
            if (!catItemId) {
                this._log('warn', ctx, 'RITM has no cat_item — cannot resolve variables');
                return [];
            }

            this._log('info', ctx, 'Building variables for RITM cat_item=' + catItemId);

            // Collect variable set sys_ids attached to this catalog item.
            var variableSetIds = this._getVariableSetIdsForCatItem(catItemId);
            this._log('debug', ctx, 'Found ' + variableSetIds.length +
                ' variable set(s) for cat_item');

            // Query variable definitions: those on the catalog item directly OR on any of its sets.
            // Encoded query: cat_item=X^ORvariable_setINid1,id2,...
            var defs = new GlideRecord('item_option_new');
            defs.addQuery('active', true);

            var ownership = defs.addQuery('cat_item', catItemId);
            if (variableSetIds.length > 0) {
                ownership.addOrCondition('variable_set', 'IN', variableSetIds.join(','));
            }
            defs.orderBy('order');
            defs.query();

            var descriptors = [];
            var skippedLayout = 0;
            var skippedHtml = 0;

            while (defs.next()) {
                var varName = defs.getValue('name') + '';
                var typeCode = defs.getValue('type') + '';
                var label = (defs.getValue('question_text') || varName) + '';

                // Skip layout-only and HTML types per v1 scope.
                if (this._isLayoutVariableType(typeCode)) {
                    skippedLayout++;
                    continue;
                }
                if (this._isHtmlVariableType(typeCode)) {
                    skippedHtml++;
                    continue;
                }

                var desc = this._describeVariable(rec, varName, typeCode, label);
                if (desc) {
                    descriptors.push(desc);
                }
            }

            this._log('info', ctx, 'Built ' + descriptors.length + ' variable descriptor(s). ' +
                'Skipped ' + skippedLayout + ' layout, ' + skippedHtml + ' html');

            return descriptors;

        } catch (err) {
            this._log('error', ctx, 'Exception: ' + err +
                ' | stack: ' + (err.stack || 'no stack'));
            return [];
        }
    },

    // ── Private helpers ─────────────────────────────────────────────────────

    /**
     * Returns the array of variable set sys_ids associated with a given catalog item,
     * via the io_set_item join table.
     */
    _getVariableSetIdsForCatItem: function (catItemId) {
        var ctx = '_getVariableSetIdsForCatItem';
        var ids = [];

        try {
            var ios = new GlideRecord('io_set_item');
            ios.addQuery('sc_cat_item', catItemId);
            ios.query();
            while (ios.next()) {
                var setId = ios.getValue('variable_set');
                if (setId) ids.push(setId + '');
            }
        } catch (err) {
            this._log('error', ctx, 'Exception: ' + err);
        }

        return ids;
    },

    /**
     * Build a descriptor for a single RITM variable.
     * Shape matches _describeField output so the widget template can render both with
     * the same ng-switch block.
     */
    _describeVariable: function (rec, varName, typeCode, label) {
        var ctx = '_describeVariable';

        try {
            // The .variables.<name> accessor walks sc_item_option_mtom → sc_item_option for us.
            var variableValue = rec.variables[varName];
            var rawValue = '';
            var displayValue = '';

            if (variableValue !== undefined && variableValue !== null) {
                // toString() gives the raw stored value (sys_id for references, raw for others).
                rawValue = variableValue.toString();

                // getDisplayValue() resolves references and choice labels. Falls back to raw.
                if (typeof variableValue.getDisplayValue === 'function') {
                    displayValue = variableValue.getDisplayValue() + '';
                } else {
                    displayValue = rawValue;
                }
            }

            var desc = {
                name: 'variable_' + varName,   // namespaced to avoid collision with field names
                label: label,
                type: 'variable_' + typeCode,
                value: rawValue,
                display_value: displayValue,
                render_as: this._deriveVariableRenderAs(typeCode),
                is_variable: true              // flag for template/CSS if useful later
            };

            // For reference-type variables, expose ref info if the target extends task.
            // Type code 8 = reference variable.
            if (typeCode === '8' && rawValue) {
                var refTable = this._getReferenceVariableTargetTable(rec, varName);
                if (refTable && this._targetExtendsTask(refTable)) {
                    desc.ref_sys_id = rawValue;
                    desc.ref_table = refTable;
                } else {
                    desc.render_as = 'text';
                }
            }

            return desc;

        } catch (err) {
            this._log('error', ctx, 'Exception describing variable "' + varName + '": ' + err +
                ' | stack: ' + (err.stack || 'no stack'));
            return null;
        }
    },

    /**
     * For reference variables, look up which table they reference.
     * The reference table is stored on the item_option_new definition.
     */
    _getReferenceVariableTargetTable: function (rec, varName) {
        try {
            var def = new GlideRecord('item_option_new');
            def.addQuery('cat_item', rec.getValue('cat_item'));
            def.addQuery('name', varName);
            def.setLimit(1);
            def.query();
            if (def.next()) {
                return def.getValue('reference') + '';
            }

            // Fallback — variable might be on a variable set
            var defSet = new GlideRecord('item_option_new');
            defSet.addQuery('name', varName);
            defSet.addNotNullQuery('variable_set');
            defSet.setLimit(1);
            defSet.query();
            if (defSet.next()) {
                return defSet.getValue('reference') + '';
            }
        } catch (err) {
            // Non-fatal; just return null and let caller render as text
        }
        return null;
    },

    /**
     * Variable type code → render mode.
     * Type codes are integers stored as strings on item_option_new.type.
     *
     * Common codes:
     *   1 = Yes/No                  → badge
     *   2 = Multi Line Text         → text (preserve line breaks via primary-style CSS)
     *   3 = Multiple Choice         → badge
     *   4 = Numeric Scale           → text
     *   5 = Select Box              → badge
     *   6 = Single Line Text        → text
     *   7 = Checkbox                → badge
     *   8 = Reference               → link (handled in _describeVariable)
     *   9 = Date                    → date
     *  10 = Date/Time               → date
     *  16 = HTML                    → (skipped in v1)
     *  17 = Breakpoint (layout)     → (skipped in v1)
     *  18 = Macro (layout)          → (skipped in v1)
     *  19 = UI Page (layout)        → (skipped in v1)
     *  20 = Wide Single Line Text   → text
     *  21 = Container Start         → (skipped in v1)
     *  22 = Container End           → (skipped in v1)
     *  23 = List Collector          → text
     *  24 = Lookup Select Box       → badge
     *  25 = Lookup Multiple Choice  → badge
     *  26 = HTML (alt)              → (skipped in v1)
     *  31 = Container Split         → (skipped in v1)
     *  32 = Masked                  → text
     */
    _deriveVariableRenderAs: function (typeCode) {
        switch (typeCode + '') {
            case '9':
            case '10':
                return 'date';
            case '8':
                return 'link';   // overridden to 'text' in _describeVariable if non-task
            case '1':
            case '3':
            case '5':
            case '7':
            case '24':
            case '25':
                return 'badge';
            default:
                return 'text';
        }
    },

    /**
     * True if the variable type is layout-only (container, label, break, macro, etc.) —
     * these hold no user data and should be skipped.
     */
    _isLayoutVariableType: function (typeCode) {
        var layoutTypes = { '11': 1, '17': 1, '18': 1, '19': 1, '21': 1, '22': 1, '31': 1 };
        return !!layoutTypes[typeCode + ''];
    },

    /**
     * True if the variable type is HTML/rich text — skipped in v1.
     */
    _isHtmlVariableType: function (typeCode) {
        var htmlTypes = { '16': 1, '26': 1 };
        return !!htmlTypes[typeCode + ''];
    },

    /**
     * Cache-aware check for whether a target table extends task.
     * Cache lives on the instance — survives across calls within a single execution.
     */
    _targetExtendsTask: function (targetTable) {
        var ctx = '_targetExtendsTask';
        if (!targetTable) return false;

        if (this._taskExtensionCache.hasOwnProperty(targetTable)) {
            this._log('debug', ctx, 'Cache hit for "' + targetTable + '" → ' +
                this._taskExtensionCache[targetTable]);
            return this._taskExtensionCache[targetTable];
        }

        var result = false;
        if (targetTable === 'task') {
            result = true;
        } else {
            try {
                var tu = new TableUtils(targetTable);
                var parents = tu.getTables() || [];
                result = parents.indexOf('task') !== -1;
            } catch (err) {
                this._log('warn', ctx, 'TableUtils failed for "' + targetTable + '": ' + err);
                result = false;
            }
        }

        this._taskExtensionCache[targetTable] = result;
        this._log('debug', ctx, 'Resolved "' + targetTable + '" → ' + result + ' (cached)');
        return result;
    },

    /**
     * Build a field descriptor for a single field on the record.
     * Returns null if the field doesn't exist on the record's table.
     */
    _describeField: function (rec, fieldDef) {
        var ctx = '_describeField';

        try {
            if (!fieldDef || !fieldDef.field_name) {
                this._log('warn', ctx, 'Invalid fieldDef: ' + JSON.stringify(fieldDef));
                return null;
            }

            var element = rec.getElement(fieldDef.field_name);
            if (!element) {
                this._log('warn', ctx, 'Field "' + fieldDef.field_name +
                    '" does not exist on table "' + rec.getTableName() + '" — skipping');
                return null;
            }

            var ed = element.getED();
            var type = ed.getInternalType() + '';
            var label = fieldDef.label_override || (ed.getLabel() + '');
            var value = rec.getValue(fieldDef.field_name);
            var displayValue = rec.getDisplayValue(fieldDef.field_name);

            var desc = {
                name: fieldDef.field_name,
                label: label,
                type: type,
                value: value,
                display_value: displayValue,
                render_as: this._deriveRenderAs(type)
            };

            // Reference fields — only link if the target extends task.
            if (type === 'reference') {
                var refTable = ed.getReference() + '';
                if (this._targetExtendsTask(refTable)) {
                    desc.ref_sys_id = value;
                    desc.ref_table = refTable;
                    this._log('debug', ctx, 'Reference field "' + fieldDef.field_name +
                        '" → task-based table "' + refTable + '" — linking');
                } else {
                    desc.render_as = 'text';
                    this._log('debug', ctx, 'Reference field "' + fieldDef.field_name +
                        '" → non-task table "' + refTable + '" — rendering as text');
                }
            }

            return desc;

        } catch (err) {
            this._log('error', ctx, 'Exception describing field "' +
                (fieldDef ? fieldDef.field_name : 'unknown') + '": ' + err +
                ' | stack: ' + (err.stack || 'no stack'));
            return null;
        }
    },

    /**
     * Pure mapping from dictionary internal type → render mode.
     */
    _deriveRenderAs: function (type) {
        switch (type) {
            case 'glide_date_time':
            case 'glide_date':
            case 'due_date':
                return 'date';
            case 'reference':
                return 'link';
            case 'boolean':
            case 'choice':
                return 'badge';
            case 'html':
            case 'translated_html':
            case 'journal':
            case 'journal_input':
                return 'html';
            case 'currency':
            case 'price':
                return 'text';
            case 'url':
                return 'external_link';
            default:
                return 'text';
        }
    },

    /**
     * Fallback when no config exists — introspects the dictionary to pick fields per section.
     */
    _getDefaultFields: function (rec, section) {
        var ctx = '_getDefaultFields[' + section + ']';

        try {
            if (section === 'header') {
                var candidates = [
                    this._pickFirstExistingField(rec, ['number', 'name']),
                    this._pickFirstExistingField(rec, ['opened_by', 'caller_id', 'requested_for', 'requested_by']),
                    'state',
                    'priority',
                    'sys_updated_on',
                    'sys_created_on'
                ];
                var picked = candidates
                    .filter(function (f) { return f && rec.getElement(f); })
                    .slice(0, 6)
                    .map(function (name) { return { field_name: name }; });

                this._log('debug', ctx, 'Picked ' + picked.length + ' header fields: ' +
                    JSON.stringify(picked));
                return picked;
            }

            if (section === 'primary') {
                var primary = ['short_description', 'description']
                    .filter(function (f) { return rec.getElement(f); })
                    .map(function (name) { return { field_name: name }; });

                this._log('debug', ctx, 'Picked ' + primary.length + ' primary fields: ' +
                    JSON.stringify(primary));
                return primary;
            }

            if (section === 'details') {
                var excluded = {
                    number: 1, name: 1, opened_by: 1, caller_id: 1, requested_for: 1, requested_by: 1,
                    state: 1, priority: 1, sys_updated_on: 1, sys_created_on: 1,
                    short_description: 1, description: 1
                };
                var skipTypes = {
                    'collection': 1, 'password2': 1, 'password': 1,
                    'script': 1, 'script_plain': 1, 'xml': 1
                };

                var fields = [];
                var elements = rec.getElements();
                for (var i = 0; i < elements.size(); i++) {
                    var el = elements.get(i);
                    var name = el.getName() + '';
                    if (excluded[name]) continue;
                    if (name.indexOf('sys_') === 0 && name !== 'sys_id') continue;

                    var ed = el.getED();
                    var type = ed.getInternalType() + '';
                    if (skipTypes[type]) continue;

                    var value = rec.getValue(name);
                    if (value === null || value === '' || value === undefined) continue;

                    fields.push({ field_name: name, _label: ed.getLabel() + '' });
                }

                fields.sort(function (a, b) { return a._label.localeCompare(b._label); });
                var trimmed = fields.slice(0, 20).map(function (f) {
                    return { field_name: f.field_name };
                });

                this._log('debug', ctx, 'Picked ' + trimmed.length + ' details fields (from ' +
                    fields.length + ' candidates): ' + JSON.stringify(trimmed));
                return trimmed;
            }

            this._log('warn', ctx, 'Unknown section — returning empty');
            return [];

        } catch (err) {
            this._log('error', ctx, 'Exception: ' + err +
                ' | stack: ' + (err.stack || 'no stack'));
            return [];
        }
    },

    _pickFirstExistingField: function (rec, candidates) {
        for (var i = 0; i < candidates.length; i++) {
            if (rec.getElement(candidates[i])) return candidates[i];
        }
        return null;
    },

    // ── Logging helper ──────────────────────────────────────────────────────

    /**
     * Centralized logger. Routes to gs.info/warn/error based on level.
     * All messages are prefixed with LOG_PREFIX and the calling context for grep-ability.
     *
     * Usage: this._log('info', 'methodName', 'message');
     */
    _log: function (level, ctx, message) {
        var levelOrder = { debug: 0, info: 1, warn: 2, error: 3 };
        var configured = levelOrder[this.LOG_LEVEL] || 0;
        var msgLevel = levelOrder[level] || 0;

        if (msgLevel < configured) return;

        var fullMsg = '[' + this.LOG_PREFIX + '][' + level.toUpperCase() + '][' + ctx + '] ' + message;

        if (level === 'error') {
            gs.error(fullMsg);
        } else if (level === 'warn') {
            gs.warn(fullMsg);
        } else {
            // gs.info handles both 'info' and 'debug'
            gs.info(fullMsg);
        }
    },

    type: 'GENDynamicRecordViewUtility'
};

```

```javascript
// 5. Build variables (only populated for sc_req_item records; empty array otherwise)
data.variables = dlacDRVU.buildVariables(rec);
data.hasVariables = data.variables.length > 0;
```

```html
<!-- More Details expander -->
<div ng-if="data.hasDetails || data.hasVariables" class="details-section">
  <a ng-click="showDetails = !showDetails" class="title-medium more-details-toggle">
    {{showDetails ? 'Less Details' : 'More Details'}}
    <i class="fa" ng-class="{'fa-angle-down': !showDetails, 'fa-angle-up': showDetails}"></i>
  </a>

  <div ng-if="showDetails">

    <!-- Existing details grid -->
    <div ng-if="data.hasDetails" class="details-grid">
      <div class="details-cell field-block"
           ng-repeat="f in data.sections.details track by f.name">
        <div class="title-medium field-label">{{f.label}}:</div>
        <div class="body-large field-value">
          <!-- ... existing ng-switch block ... -->
        </div>
      </div>
    </div>

    <!-- Variables sub-section, only for RITMs -->
    <div ng-if="data.hasVariables" class="variables-subsection">
      <h5 class="title-medium variables-heading">Variables</h5>
      <div class="details-grid">
        <div class="details-cell field-block"
             ng-repeat="v in data.variables track by v.name">
          <div class="title-medium field-label">{{v.label}}:</div>
          <div class="body-large field-value">
            <!-- same ng-switch block, with `v` instead of `f` -->
            <span ng-switch="v.render_as">
              <span ng-switch-when="link">
                <a ng-if="v.ref_sys_id" ng-href="/sp?id=record-view&table={{v.ref_table}}&sys_id={{v.ref_sys_id}}">{{v.display_value}}</a>
                <span ng-if="!v.ref_sys_id">{{v.display_value || '—'}}</span>
              </span>
              <span ng-switch-when="badge"><span class="label label-default">{{v.display_value || '—'}}</span></span>
              <span ng-switch-when="date"><span title="{{v.value}}">{{v.display_value || 'N/A'}}</span></span>
              <span ng-switch-default>{{v.display_value || v.value || '—'}}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>
```

```scss
.variables-subsection {
  margin-top: var(--field-gap);
  padding-top: var(--field-gap);
  border-top: 1px solid #eee;

  .variables-heading {
    margin: 0 0 var(--field-gap) 0;
    color: $Neutral-700;
  }
}
```

```javascript
(function() {
// 1. Resolve table + sys_id
var table = $sp.getParameter('table') || options.table;
var sysId = $sp.getParameter('sys_id') || options.sys_id;

data.error = null;
if (!table || !sysId) {
  data.error = 'Missing table or sys_id';
  return;
}

// 2. Security check — does this user have read access on this record?
var rec = new GlideRecordSecure(table);
if (!rec.get(sysId)) {
  data.error = 'Record not found or access denied';
  return;
}

// 3. Load config
var config = loadConfig(table);  // returns null if none found

// 4. Build field descriptors per section
data.table = table;
data.sys_id = sysId;
data.title = buildTitle(rec, config);
data.sections = {
  header:  buildSection(rec, config, 'header'),
  primary: buildSection(rec, config, 'primary'),
  details: buildSection(rec, config, 'details')
};
data.hasDetails = data.sections.details.length > 0;
})();

function loadConfig(table) {
var gr = new GlideRecord('x_gensync_record_view_config');
gr.addQuery('table', table);
gr.addQuery('active', true);
gr.setLimit(1);
gr.query();
if (!gr.next()) return null;

var cfg = {
  sys_id: gr.getUniqueValue(),
  title_field: gr.getValue('title_field'),
  title_template: gr.getValue('title_template'),
  fields: { header: [], primary: [], details: [] }
};

var fg = new GlideRecord('x_gensync_record_view_field');
fg.addQuery('config', cfg.sys_id);
fg.orderBy('section');
fg.orderBy('order');
fg.query();
while (fg.next()) {
  var section = fg.getValue('section');
  if (!cfg.fields[section]) continue;
  cfg.fields[section].push({
    field_name: fg.getValue('field_name'),
    label_override: fg.getValue('label_override')
  });
}
return cfg;
}

function buildSection(rec, config, section) {
var fields = (config && config.fields[section]) || getDefaultFields(rec, section);
return fields.map(function(f) {
  return describeField(rec, f);
}).filter(function(d) { return d !== null; });
}

// Cache TableUtils lookups within a single server execution.
// Same reference table may appear in multiple fields (e.g. opened_by + assigned_to both → sys_user).
var _taskExtensionCache = {};

function targetExtendsTask(targetTable) {
if (!targetTable) return false;
if (_taskExtensionCache.hasOwnProperty(targetTable)) {
  return _taskExtensionCache[targetTable];
}
var result = false;
if (targetTable === 'task') {
  result = true;
} else {
  var tu = new TableUtils(targetTable);
  var parents = tu.getTables() || [];
  result = parents.indexOf('task') !== -1;
}
_taskExtensionCache[targetTable] = result;
return result;
}

function describeField(rec, fieldDef) {
var element = rec.getElement(fieldDef.field_name);
if (!element) return null;  // field doesn't exist on this table

var ed = element.getED();
var type = ed.getInternalType();   // 'string', 'reference', 'glide_date_time', 'boolean', etc.
var label = fieldDef.label_override || ed.getLabel();
var value = rec.getValue(fieldDef.field_name);
var displayValue = rec.getDisplayValue(fieldDef.field_name);

var desc = {
  name: fieldDef.field_name,
  label: label,
  type: type,
  value: value,
  display_value: displayValue,
  render_as: deriveRenderAs(type)  // derived from dictionary type, not configured
};

// Reference fields — only link if the target extends task.
// Non-task references (sys_user, sys_user_group, cmdb_ci, etc.) render as plain text.
if (type === 'reference') {
  var refTable = ed.getReference();
  if (targetExtendsTask(refTable)) {
    desc.ref_sys_id = value;
    desc.ref_table = refTable;
  } else {
    desc.render_as = 'text';  // override — render reference display value as plain text
  }
}

return desc;
}

function deriveRenderAs(type) {
// Pure function: dictionary internal type → render strategy.
// Single source of truth for how fields render based on their type.
switch (type) {
  case 'glide_date_time':
  case 'glide_date':
  case 'due_date':
    return 'date';
  case 'reference':
    return 'link';
  case 'boolean':
  case 'choice':
    // choice renders as a badge so state/priority/etc. get the tag treatment
    return 'badge';
  case 'html':
  case 'translated_html':
  case 'journal':
  case 'journal_input':
    return 'html';
  case 'currency':
  case 'price':
    return 'text';  // display_value already formatted with currency symbol
  case 'url':
    return 'external_link';
  default:
    return 'text';
}
}

function getDefaultFields(rec, section) {
// Intelligent fallback when no config row exists.
// Introspects the dictionary and picks sensible fields per section.

if (section === 'header') {
  var candidates = [
    pickFirstExistingField(rec, ['number', 'name']),
    pickFirstExistingField(rec, ['opened_by', 'caller_id', 'requested_for', 'requested_by']),
    'state',
    'priority',
    'sys_updated_on',
    'sys_created_on'
  ];
  return candidates
    .filter(function(f) { return f && rec.getElement(f); })
    .slice(0, 6)
    .map(function(name) { return { field_name: name }; });
}

if (section === 'primary') {
  return ['short_description', 'description']
    .filter(function(f) { return rec.getElement(f); })
    .map(function(name) { return { field_name: name }; });
}

if (section === 'details') {
  var excluded = {
    number: 1, name: 1, opened_by: 1, caller_id: 1, requested_for: 1, requested_by: 1,
    state: 1, priority: 1, sys_updated_on: 1, sys_created_on: 1,
    short_description: 1, description: 1
  };
  var skipTypes = { 'collection': 1, 'password2': 1, 'password': 1, 'script': 1, 'script_plain': 1, 'xml': 1 };

  var fields = [];
  var elements = rec.getElements();
  for (var i = 0; i < elements.size(); i++) {
    var el = elements.get(i);
    var name = el.getName() + '';
    if (excluded[name]) continue;
    if (name.indexOf('sys_') === 0 && name !== 'sys_id') continue;
    var ed = el.getED();
    var type = ed.getInternalType() + '';
    if (skipTypes[type]) continue;

    var value = rec.getValue(name);
    if (value === null || value === '' || value === undefined) continue;

    fields.push({ field_name: name, _label: ed.getLabel() + '' });
  }

  fields.sort(function(a, b) { return a._label.localeCompare(b._label); });
  return fields.slice(0, 20).map(function(f) { return { field_name: f.field_name }; });
}

return [];
}

function pickFirstExistingField(rec, candidates) {
for (var i = 0; i < candidates.length; i++) {
  if (rec.getElement(candidates[i])) return candidates[i];
}
return null;
}

function buildTitle(rec, config) {
if (config && config.title_template) {
  return substituteTemplate(config.title_template, rec);
}
if (config && config.title_field) {
  return rec.getDisplayValue(config.title_field);
}
return rec.getDisplayValue('number') ||
       rec.getDisplayValue('name') ||
       rec.getDisplayValue() ||
       'Record';
}

function substituteTemplate(template, rec) {
return template.replace(/\$\{(\w+)\}/g, function(_, fieldName) {
  return rec.getDisplayValue(fieldName) || '';
});
}
```

**Key points:**

- **`GlideRecordSecure`, not `GlideRecord`.** ACLs must apply — without this, users could see fields they shouldn't. This is non-negotiable for a portal widget.
- **`element.getED().getInternalType()`** is how you introspect field types. This is what lets the widget render dates, references, booleans, and HTML fields intelligently without hardcoded table knowledge.
- **Default fallback** means the widget still renders something useful on tables that haven't been configured yet, so rollout doesn't have to be all-or-nothing.
- **Template substitution for `title_template`** lets you produce titles like `RITM1234 — Install Chrome` without a dedicated field.

---

## 5. Field Render Modes (Derived from Dictionary Type)

Render mode is not configured per field — the server derives it from the field's dictionary type. This keeps the config table minimal and guarantees consistent rendering across all tables.

**Dictionary type → render mode mapping:**

| Internal type | Render mode | Rationale |
|---|---|---|
| `reference` | `link` if target extends `task`, else `text` | Only task-based references become links into the same widget; non-task refs (users, groups, CIs) render as plain display value text |
| `glide_date_time`, `glide_date`, `due_date` | `date` | Uses `getDisplayValue()` for locale-correct formatting, raw value in tooltip |
| `boolean`, `choice` | `badge` | State, priority, true/false — all benefit from the tag treatment |
| `html`, `translated_html`, `journal`, `journal_input` | `html` | Trust via `$sce` on client, render with `ng-bind-html` |
| `currency`, `price` | `text` | Display value already includes currency symbol |
| `url` | `external_link` | Open in new tab, external icon |
| everything else | `text` | Plain string display |

**HTML output per render mode:**

| Mode | HTML |
|---|---|
| `text` | `<span>{{display_value}}</span>` |
| `link` | `<a ng-href="/sp?id=record-view&table={{ref_table}}&sys_id={{ref_sys_id}}">{{display_value}}</a>` |
| `external_link` | `<a ng-href="{{value}}" target="_blank" rel="noopener">{{display_value}} <i class="fa fa-external-link"></i></a>` |
| `badge` | `<span class="label label-default">{{display_value}}</span>` |
| `html` | `<div ng-bind-html="safe_html"></div>` (requires `$sce.trustAsHtml` in client controller) |
| `date` | `<span title="{{value}}">{{display_value}}</span>` |

If you later hit a case where a string field needs non-default rendering (e.g. a `string` column that actually holds a URL), add an optional `render_override` column to `x_gensync_record_view_field` at that point. For v1, ship without it — the type-driven derivation covers the common cases.

---

## 6. HTML Template — Structure

Layout uses **flexbox throughout** for spacing — no Bootstrap row/col grids inside the card. Vertical rhythm is controlled by `gap` on flex containers so spacing between a label and its value, between fields, and between sections is consistent and easy to tune from one place.

Typography uses **predefined utility classes** that already exist in the portal theme:

- `title-extra-large` — the "Details" section heading
- `title-medium` — every field label, plus the "More Details" toggle
- `body-large` — every field value

```html
<div class="record-view">
<!-- Title bar -->
<div class="record-view-header">
  <h1 class="record-view-title">{{data.title}}</h1>
</div>

<!-- Error state -->
<div class="panel panel-danger" ng-if="data.error">
  <div class="panel-body">{{data.error}}</div>
</div>

<!-- Main white card -->
<div class="record-view-card" ng-if="!data.error">
  <h4 class="title-extra-large">Details</h4>

  <!-- Header section -->
  <div class="header-row">
    <div class="header-cell field-block"
         ng-repeat="f in data.sections.header track by f.name">
      <div class="title-medium field-label">{{f.label}}:</div>
      <div class="body-large field-value">
        <span ng-switch="f.render_as">
          <span ng-switch-when="link">
            <a ng-if="f.ref_sys_id" ng-href="/sp?id=record-view&table={{f.ref_table}}&sys_id={{f.ref_sys_id}}">{{f.display_value}}</a>
            <span ng-if="!f.ref_sys_id">{{f.display_value || '—'}}</span>
          </span>
          <span ng-switch-when="external_link">
            <a ng-if="f.value" ng-href="{{f.value}}" target="_blank" rel="noopener">{{f.display_value || f.value}} <i class="fa fa-external-link"></i></a>
            <span ng-if="!f.value">—</span>
          </span>
          <span ng-switch-when="badge"><span class="label label-default">{{f.display_value || '—'}}</span></span>
          <span ng-switch-when="date"><span title="{{f.value}}">{{f.display_value || 'N/A'}}</span></span>
          <span ng-switch-when="html" ng-bind-html="f.safe_html"></span>
          <span ng-switch-default>{{f.display_value || f.value || '—'}}</span>
        </span>
      </div>
    </div>
  </div>

  <!-- Primary section -->
  <div class="primary-section">
    <div class="field-block"
         ng-repeat="f in data.sections.primary track by f.name">
      <div class="title-medium field-label">{{f.label}}:</div>
      <div class="body-large field-value primary-value">
        <span ng-switch="f.render_as">
          <span ng-switch-when="link">
            <a ng-if="f.ref_sys_id" ng-href="/sp?id=record-view&table={{f.ref_table}}&sys_id={{f.ref_sys_id}}">{{f.display_value}}</a>
            <span ng-if="!f.ref_sys_id">{{f.display_value || '—'}}</span>
          </span>
          <span ng-switch-when="external_link">
            <a ng-if="f.value" ng-href="{{f.value}}" target="_blank" rel="noopener">{{f.display_value || f.value}} <i class="fa fa-external-link"></i></a>
            <span ng-if="!f.value">—</span>
          </span>
          <span ng-switch-when="badge"><span class="label label-default">{{f.display_value || '—'}}</span></span>
          <span ng-switch-when="date"><span title="{{f.value}}">{{f.display_value || 'N/A'}}</span></span>
          <span ng-switch-when="html" ng-bind-html="f.safe_html"></span>
          <span ng-switch-default>{{f.display_value || f.value || '—'}}</span>
        </span>
      </div>
    </div>
  </div>

  <!-- More Details expander -->
  <div ng-if="data.hasDetails" class="details-section">
    <a ng-click="showDetails = !showDetails" class="title-medium more-details-toggle">
      {{showDetails ? 'Less Details' : 'More Details'}}
      <i class="fa" ng-class="{'fa-angle-down': !showDetails, 'fa-angle-up': showDetails}"></i>
    </a>
    <div ng-if="showDetails" class="details-grid">
      <div class="details-cell field-block"
           ng-repeat="f in data.sections.details track by f.name">
        <div class="title-medium field-label">{{f.label}}:</div>
        <div class="body-large field-value">
          <span ng-switch="f.render_as">
            <span ng-switch-when="link">
              <a ng-if="f.ref_sys_id" ng-href="/sp?id=record-view&table={{f.ref_table}}&sys_id={{f.ref_sys_id}}">{{f.display_value}}</a>
              <span ng-if="!f.ref_sys_id">{{f.display_value || '—'}}</span>
            </span>
            <span ng-switch-when="external_link">
              <a ng-if="f.value" ng-href="{{f.value}}" target="_blank" rel="noopener">{{f.display_value || f.value}} <i class="fa fa-external-link"></i></a>
              <span ng-if="!f.value">—</span>
            </span>
            <span ng-switch-when="badge"><span class="label label-default">{{f.display_value || '—'}}</span></span>
            <span ng-switch-when="date"><span title="{{f.value}}">{{f.display_value || 'N/A'}}</span></span>
            <span ng-switch-when="html" ng-bind-html="f.safe_html"></span>
            <span ng-switch-default>{{f.display_value || f.value || '—'}}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
```

**Key patterns:**

- **`field-block`** is the shared atom: a flex column that pairs a label with its value. Used in all three sections, so vertical spacing between label and value is identical everywhere — set once via `gap` on `.field-block`.
- **`ng-include`** with the named template gives one shared renderer for all three sections — no duplication.
- **`ng-switch`** on `render_as` is how types branch cleanly.
- **No Bootstrap grid inside the card.** Header, primary, and details sections all use flex containers with `gap` and `flex-wrap` for responsive behavior.
- **"More Details"** is a client-side toggle — no round-trip needed since all fields are already loaded.

---

## 7. Client Controller

```javascript
api.controller = function($scope, $sce) {
$scope.showDetails = false;

// Trust HTML fields so ng-bind-html can render them
if ($scope.data.sections) {
  ['header', 'primary', 'details'].forEach(function(section) {
    ($scope.data.sections[section] || []).forEach(function(f) {
      if (f.render_as === 'html' && f.value) {
        f.safe_html = $sce.trustAsHtml(f.value);
      }
    });
  });
}
};
```

Thin on purpose — all the real work happens server-side. The client just trusts HTML and toggles the expander.

---

## 8. CSS — Skeleton

Spacing tokens are defined once at the top of the widget scope and reused via `gap` on flex containers. Adjust `--field-gap` and `--section-gap` to retune the whole layout from one place.

```scss
.record-view {
// Spacing tokens — tune the whole layout from here
--label-value-gap: 6px;   // between a label and its value (inside field-block)
--field-gap: 20px;        // between adjacent field-blocks within a section
--section-gap: 28px;      // between sections (header → primary → details)

display: flex;
flex-direction: column;
gap: 16px;

// ── Title bar: white text on hero band, no back link ────────────────────
.record-view-header {
  background: #2b5f8a;
  padding: 32px 40px;
  border-radius: 8px;
}

.record-view-title {
  margin: 0;
  color: #fff;             // record name is white per spec
  font-weight: 300;
  font-size: 32px;
  line-height: 1.2;
}

// ── Main white card ─────────────────────────────────────────────────────
.record-view-card {
  background: #fff;
  border-radius: 8px;
  padding: 32px 40px 40px 40px;
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);

  // "Details" heading uses theme utility class .title-extra-large for typography;
  // we only manage spacing here.
  .title-extra-large {
    margin: 0;
  }
}

// ── Shared atom: a label + its value, vertically stacked ────────────────
// Same gap is used in every section so label→value spacing is identical
// whether the field is in the header row, primary, or details grid.
.field-block {
  display: flex;
  flex-direction: column;
  gap: var(--label-value-gap);
  min-width: 0;  // lets long values truncate/wrap inside a flex parent
}

.field-label {
  // Typography comes from .title-medium utility class.
  // Only layout-adjacent overrides go here.
  color: #555;
}

.field-value {
  // Typography comes from .body-large utility class.
  color: #333;
  word-break: break-word;
}

// ── Header section: flex row of compact fields, wraps on narrow ─────────
.header-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--field-gap);

  .header-cell {
    flex: 1 1 140px;   // grow/shrink, ~140px min — gives ~6 across at desktop
  }
}

// ── Primary section: full-width stacked fields ──────────────────────────
.primary-section {
  display: flex;
  flex-direction: column;
  gap: var(--field-gap);

  .primary-value {
    white-space: pre-wrap;  // preserve line breaks in long descriptions
  }
}

// ── Details section: 2-column flex grid ─────────────────────────────────
.details-section {
  display: flex;
  flex-direction: column;
  gap: var(--field-gap);
}

.more-details-toggle {
  // Typography from .title-medium; layout/affordance handled here.
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  align-self: flex-start;
}

.details-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--field-gap);
  padding-top: var(--field-gap);
  border-top: 1px solid #eee;

  .details-cell {
    flex: 1 1 calc(50% - var(--field-gap));  // 2-up at desktop, full-width on narrow
    min-width: 0;
  }
}
}
```

**Why this gives consistent vertical spacing across sections:**

- Every label/value pair is a `.field-block` with `gap: var(--label-value-gap)`. Header, primary, and details all use the same atom, so the visual rhythm between a label and its value is identical everywhere.
- Every section sets `gap: var(--field-gap)` on its flex container, so the space between adjacent fields is the same in primary as it is between rows in details.
- Sections themselves are separated by `gap: var(--section-gap)` on the card. One token controls every "between section" space.
- Three tokens, one source of truth. Bumping `--field-gap` from `20px` to `24px` retunes the whole card.

---

## 9. Portal Page Setup

Create a dedicated portal page `record-view` that hosts this widget:

- Page ID: `record-view`
- Layout: single-column, full width container
- Widget instance: `Dynamic Record View` (no option values set — everything comes from URL)

URLs then look like:
```
/sp?id=record-view&table=sc_req_item&sys_id=abc123...
/sp?id=record-view&table=incident&sys_id=def456...
/sp?id=record-view&table=change_request&sys_id=xyz789...
```

This is also what makes the `link` render mode work for reference fields — clicking a requester name links straight to `/sp?id=record-view&table=sys_user&sys_id=...`, and the same widget handles it. Fully recursive.

---

## 10. Rollout Plan

**Phase 1 — Foundation**
1. Create scoped app tables (`x_gensync_record_view_config`, `x_gensync_record_view_field`)
2. Build widget with server script, client controller, HTML, CSS
3. Create portal page `record-view`
4. Ship with default fallback logic — widget works on any task table out of the box

**Phase 2 — Config UI**
5. Seed config rows for the key tables you use: `sc_req_item`, `incident`, `sc_task`, `change_request`, `kb_knowledge`
6. Optionally build a lightweight admin widget for non-admins to manage configs (or just use the backend forms — they're fine for a small admin user base)

**Phase 3 — Enhancements**
7. Avatar rendering for `sys_user` reference fields (extend `deriveRenderAs` to special-case reference → `sys_user`)
8. Optional `render_override` column if edge cases emerge (string-holding-URL, etc.)
9. `visible_when` conditional field visibility
10. Related lists section (attachments, approvals, tasks)

---

## 11. Decisions Locked In

1. **Scope prefix** — `x_gensync_*` for v1 (placeholder, confirm before build).
2. **Section names** — `header` / `primary` / `details`.
3. **Default fallback** — ON. When no config row exists, the widget introspects the dictionary and picks sensible fields automatically (see `getDefaultFields` in §4).
4. **Access control** — standard. Authenticated read, admin write on both config tables. No special roles for v1.
5. **Portal page ID** — `record-view`.
6. **Reference field linking** — link to the same widget *only when* the reference target extends `task`. Non-task references render as plain text.
7. **Visual styling** —
 - Title bar: hero band, record name in **white**, no back link.
 - Card: `border-radius: 8px`, `padding: 32px 40px 40px 40px`.
 - Typography: "Details" → `title-extra-large`; all field labels and "More Details" → `title-medium`; all field values → `body-large`.
 - Layout: flexbox throughout. Three spacing tokens (`--label-value-gap`, `--field-gap`, `--section-gap`) control vertical rhythm consistently across all sections.

No open questions remaining. Ready to build.

---

## Summary

One widget, configurable via a parent/child table pair in your scoped app. Server script introspects the field dictionary so it renders reference fields, dates, HTML, and booleans correctly without per-table code. URL-driven so it's embeddable and recursive for task-based references. Non-task references render as text. Layout is flexbox-driven with three spacing tokens for consistent vertical rhythm across header / primary / details, and typography is delegated to the portal's `title-extra-large` / `title-medium` / `body-large` utility classes so the card stays in lockstep with the rest of the theme.

All open questions resolved. Ready for implementation.
