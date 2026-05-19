# WaaG Widget — Approval Card View

Solution doc for adding a card-based render path to the Approvals tab of the Work at a Glance (WaaG) widget. All other tabs keep the existing table view. Card view sources its data through the existing `GENDynamicRecordViewUtility` record-view config, with sensible fallbacks for tables that have no config.

---

## Requirements

### Functional

1. When the active WaaG tab's underlying table is `sysapproval_approver`, render approvals as **cards** instead of a table. All other tabs are unchanged.
2. Each card displays four pieces of content from the **parent record being approved** (not the approval row itself):
   - **Record number** — small grey caption at the top.
   - **Resolved title** — bold, link-styled. Sourced from `GENDynamicRecordViewUtility.resolveTitle()`, which honors the configured `title_field` on the record-view config and falls back through `short_description → number → display value → 'Record'`.
   - **Requester** — labeled line below the title. Sourced from a new `requester_field` column on the record-view config table.
   - **Action area** — bottom of the card.
3. Action area behavior:
   - When `state == 'Requested'` → Reject and Approve buttons (existing logic preserved).
   - Otherwise → a state pill rendering the `state` display value verbatim, color-styled (`approved` → green, `rejected` → red, anything else → grey).
4. Clicking a card opens the **approval record itself**, honoring the WaaG tab's `open_records_in_backend` setting (same as the existing table row behavior).
5. Pagination behaves exactly as it does in the table view — same selector, same page controls.
6. Approve / Reject logic is unchanged from the current widget. Existing `c.onAgree` / `c.onPrompt` flows are reused as-is.

### Configuration

1. A new column `requester_field` is added to the existing record-view config table (`x_g_dla_dla_connec_record_view_config`). String, holds the technical name of a field on the parent record's table (e.g. `opened_by`, `requested_for`, `caller_id`).
2. Requester rendering rule:
   - **Config exists for parent table + `requester_field` is set** → use that field's display value on the parent record.
   - **Config exists for parent table + `requester_field` is empty** → fall back to the parent record's overall display value (`gr.getDisplayValue()`).
   - **No config exists for parent table** → hide the Requester line entirely.

### Non-goals

- No changes to `getTableDetails` in `DLACommon`. Approval enrichment is a separate function.
- No changes to approve / reject server actions or the modals that drive them.
- Asset attestation (`sn_itam_common_attestation_asset_m2m`) keeps the existing table view. The card view applies to `sysapproval_approver` only.
- No batched title resolution. Per-row `resolveTitle` is acceptable for v1; revisit only if performance proves a real problem.

---

## Architecture

### Where each piece lives

```
┌─────────────────────────────────────────────────────────────┐
│  WaaG widget — Server Script                                │
│                                                             │
│  1. loadData: existing getTableDetails(...) per tab         │
│  2. After getTableDetails for sysapproval_approver:         │
│       common.enrichApprovalRows(rows) → mutates in place    │
│       adding parent_number, parent_title, requester,        │
│       has_requester                                          │
│  3. Same enrichment runs in refresh-tab for paging/sort     │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  DLACommon — new method                                     │
│                                                             │
│  enrichApprovalRows(rows)                                   │
│    For each row:                                            │
│      • Read approval.sysapproval (parent task sys_id)       │
│      • Read parent's sys_class_name (actual table name)     │
│      • new GENDynamicRecordViewUtility().resolveTitle(...)  │
│      • Pull parent_number via GlideRecordSecure             │
│      • Look up requester_field from record-view config      │
│      • Pull requester display value (or hide the line)      │
│      • Mutate the row with these new fields                 │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  GENDynamicRecordViewUtility — unchanged                    │
│                                                             │
│  resolveTitle(table, sysId) used as-is                      │
│  Plus a small lightweight helper added for requester field  │
│  lookup if not already present                              │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  WaaG widget — HTML / SCSS / Controller                     │
│                                                             │
│  HTML: ng-if branch on tab.table == 'sysapproval_approver'  │
│        renders card grid; otherwise renders existing table  │
│  SCSS: new .approval-card-grid + .approval-card styles      │
│  Controller: no logic changes; reuses c.onAgree, c.onPrompt │
│              and c.openRow for card click-through           │
└─────────────────────────────────────────────────────────────┘
```

### Why enrichment lives in DLACommon, not in getTableDetails

`getTableDetails` is generic table-rendering machinery used by every WaaG tab and likely other widgets too. Branching it on `table == 'sysapproval_approver'` would couple a generic helper to a specific widget's UX. The cleaner split:

- `getTableDetails` continues returning the raw approval rows it returns today (which already include `sys_id`, `document_id`, `state`, etc).
- A new sibling method `enrichApprovalRows` on `DLACommon` takes those rows and adds the parent-record fields the card view needs.

This keeps the approval-card concern next to where it's consumed, leaves `getTableDetails` untouched, and leaves the door open later for `enrichAttestationRows` or any other enrichment without further bloat.

### Why this uses `sys_class_name` and not `source_table`

`sysapproval_approver.sysapproval` is a reference to `task`. Task is polymorphic — the actual record could be an RITM, an incident, a change, etc. The reliable way to get the actual table name for the parent is to read `sys_class_name` off the dereferenced `sysapproval` record. `source_table` exists on `sysapproval_approver` but isn't guaranteed populated in every CNIC dataset and isn't the canonical source for polymorphic resolution. Going through `sys_class_name` is one extra read but avoids surprises.

---

## Data shape — what enrichment adds to each row

Existing fields from `getTableDetails` on a `sysapproval_approver` row:

```javascript
{
  sys_id: '...',                    // approval sys_id
  document_id: 'RITM12345',         // display value of sysapproval (parent number-ish)
  state: 'Requested',                // display value of approval state
  // ...whatever other fields are configured on the WaaG record
  link: '?id=...&sys_id=...'         // built from link_object
}
```

After `enrichApprovalRows`:

```javascript
{
  // ...all existing fields above, untouched...

  parent_table:  'sc_req_item',         // actual table name from sys_class_name
  parent_sys_id: 'a1b2c3...',           // parent record sys_id
  parent_number: 'RITM12345',            // parent record's number field
  parent_title:  'New laptop for Joe',   // resolveTitle() result
  requester:     'John Smith',           // display value of configured field, or fallback
  has_requester: true                    // false when no config exists; HTML hides the line
}
```

The HTML reads `parent_number`, `parent_title`, `requester`, `has_requester`, and the existing `state`. Nothing else changes.

---

## Implementation

### 1. Schema change — `x_g_dla_dla_connec_record_view_config`

Add one column:

| Column | Type | Length | Notes |
|---|---|---|---|
| `requester_field` | String | 80 | Technical field name on the parent record's table. Optional. |

No data migration needed. Existing config rows simply have an empty `requester_field` and the enrichment falls back accordingly.

### 2. `DLACommon` — new method `enrichApprovalRows`

Add this method to the `DLACommon` script include. It mutates the rows in place so the caller doesn't need to remap.

```javascript
/**
 * Enrich rows from a sysapproval_approver query with parent-record fields
 * required by the WaaG approval card view.
 *
 * For each row, adds:
 *   parent_table   — actual table name of the approved record
 *   parent_sys_id  — sys_id of the approved record
 *   parent_number  — number/display value of the approved record
 *   parent_title   — resolved title via GENDynamicRecordViewUtility
 *   requester      — display value of the configured requester field
 *   has_requester  — false when no record-view config exists for parent_table
 *
 * Rows are mutated in place; nothing is returned.
 */
enrichApprovalRows: function (rows) {
    var ctx = 'DLACommon.enrichApprovalRows';
    if (!rows || !rows.length) return;

    var titleUtil = new GENDynamicRecordViewUtility();

    // Small per-call cache so multiple approvals against the same parent
    // table don't re-query the record-view config table.
    var configCache = {};

    function getConfigFor(table) {
        if (configCache.hasOwnProperty(table)) return configCache[table];
        var cfg = null;
        var gr = new GlideRecord('x_g_dla_dla_connec_record_view_config');
        gr.addQuery('table.name', table);
        gr.addQuery('active', true);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            cfg = {
                requester_field: (gr.getValue('requester_field') || '') + ''
            };
        }
        configCache[table] = cfg;
        return cfg;
    }

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];

        try {
            // Load the approval to dereference the parent
            var ap = new GlideRecordSecure('sysapproval_approver');
            if (!ap.get(row.sys_id)) {
                row.has_requester = false;
                continue;
            }

            var parentSysId = ap.getValue('sysapproval') || '';
            if (!parentSysId) {
                row.has_requester = false;
                continue;
            }

            // Resolve the parent's actual table via sys_class_name on the task record
            var taskGR = new GlideRecordSecure('task');
            if (!taskGR.get(parentSysId)) {
                row.has_requester = false;
                continue;
            }
            var parentTable = (taskGR.getValue('sys_class_name') || 'task') + '';

            // Re-load against the resolved table to access table-specific fields
            var parentGR = new GlideRecordSecure(parentTable);
            if (!parentGR.get(parentSysId)) {
                row.has_requester = false;
                continue;
            }

            row.parent_table = parentTable;
            row.parent_sys_id = parentSysId;
            row.parent_number = parentGR.getDisplayValue('number') || '';
            row.parent_title = titleUtil.resolveTitle(parentTable, parentSysId).title;

            // Requester resolution — three branches
            var cfg = getConfigFor(parentTable);
            if (!cfg) {
                // No config at all → hide the requester line
                row.has_requester = false;
            } else if (cfg.requester_field) {
                var val = parentGR.getDisplayValue(cfg.requester_field) || '';
                if (!val) {
                    // Configured field but empty on this record — fall back to record display value
                    val = parentGR.getDisplayValue() || '';
                }
                row.requester = val;
                row.has_requester = !!val;
            } else {
                // Config exists but requester_field empty → record display value
                row.requester = parentGR.getDisplayValue() || '';
                row.has_requester = !!row.requester;
            }
        } catch (err) {
            gs.error('[' + ctx + '] Exception enriching row ' + row.sys_id + ': ' + err);
            row.has_requester = false;
        }
    }
}
```

Notes:

- Uses `GlideRecordSecure` throughout so ACLs are respected. An approval the user can see but a parent they can't will gracefully degrade to `has_requester = false` with no title.
- The per-call `configCache` avoids repeated config-table queries within a single enrichment pass. With 6 RITM approvals on a page, the config table is queried once for `sc_req_item`, not six times.
- Exceptions are caught per-row so one broken record doesn't kill the whole tab.
- `resolveTitle` already has its own internal fallback chain and never throws — safe to call without additional defensive wrapping.

### 3. WaaG widget — Server Script changes

Two small additions: enrich on initial `loadData`, and enrich on `refresh-tab`.

**In `loadData`, after the per-tab `getTableDetails` loop:**

```javascript
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
```

**In `refresh-tab`, after the existing `getTableDetails` call:**

```javascript
// existing date-field conversion and attachment loop runs first, then:

if (currentTab.table === 'sysapproval_approver' && details.rows && details.rows.length) {
    common.enrichApprovalRows(details.rows);
}

data.tabDetails = details;
```

That's the entire server-side change. Everything else flows from the new row fields being available to the template.

### 4. WaaG widget — HTML template changes

Inside the `<div ng-repeat="tab in data.tabs ...">` block, branch on `tab.table` to render either the existing table or the new card grid. The empty-state, pagination, and `card-footer` blocks stay where they are — they wrap both render paths.

Replace the existing `<div class="table-responsive-wrapper">` block with this branched version:

```html
<!-- Render path A: card grid (Approvals tab) -->
<div ng-if="tab.table == 'sysapproval_approver' && tab.details.rows && tab.details.rows.length > 0"
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
                class="approval-action reject"
                ng-click="c.onPrompt(row.sys_id, tab.id, row); $event.stopPropagation()"
                uib-tooltip="Reject request"
                tooltip-placement="top">
          <i class="fa fa-close" aria-hidden="true"></i> Reject
        </button>
        <button type="button"
                class="approval-action approve"
                ng-click="c.onAgree(row.sys_id, tab.id, row); $event.stopPropagation()"
                uib-tooltip="Approve request"
                tooltip-placement="top">
          <i class="fa fa-check" aria-hidden="true"></i> Approve
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
    <!-- ...existing thead and tbody unchanged... -->
  </table>
</div>
```

The existing "no results" empty state block stays where it is — it already triggers off `!tab.details.rows || tab.details.rows.length <= 0` and applies equally well to both render paths. The `card-footer` pagination block also stays where it is and works for both paths unchanged.

`$event.stopPropagation()` on the action buttons prevents the card-level click from also firing `c.openRow` when a user clicks Approve/Reject.

### 5. WaaG widget — Client Controller changes

One small handler added; everything else is reused as-is. Add this inside the `c.handlers` object:

```javascript
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
}
```

Nothing else in the controller needs to change. `c.openRow`, `c.onAgree`, `c.onPrompt`, the pagination handlers, the tab-switching logic — all reused as-is.

### 6. WaaG widget — SCSS additions

Add these blocks to the widget SCSS. Variable names follow the existing widget convention (`$Neutral-*`, `$Sky-500`, `$Semantic-High`, etc).

```scss
.approval-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 4px;

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
        gap: 8px;

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
```

The colors in the pills and action buttons are inline rather than tied to existing variables because they need specific tints (translucent backgrounds for pills, solid for buttons) that the existing semantic palette doesn't already provide. If the design system has equivalents, those should be swapped in.

---

## Risk register

| Risk | Mitigation |
|---|---|
| `GENDynamicRecordViewUtility` not yet deployed in the same scope where the WaaG widget lives | Confirm scope access before merging. If it's cross-scope, the script include needs to be marked accessible from other scopes, or a thin wrapper added in the WaaG scope. |
| Polymorphic parent resolution fails on a non-task approval target (e.g. an `sc_request` parent rather than `sc_req_item`) | The two-step load (load `task`, read `sys_class_name`, reload against actual table) handles this naturally. `sc_request` extends task. Anything that doesn't extend task and is still an approval target would need additional handling; flag if any are in scope. |
| Performance — 2-3 GlideRecord reads per row × 6-24 rows per page | Per-call config cache cuts the config lookup to once per table. Title resolution is 2 queries per row by design. At 24 rows, worst case is ~72 queries on a page render — acceptable for v1; batch lookup is the optimization path if it becomes a problem. |
| ACLs hide the parent from a user who can see the approval | Enrichment catches this and falls back to `has_requester = false`. Card still renders number-blank, title-blank, no requester line. Confirm this graceful-degrade is acceptable; alternatively, hide the entire card. |
| State pill class doesn't match a CNIC-specific state value | `getApprovalStateClass` defaults unknowns to `pill-neutral` (grey). If CNIC uses custom states like "No Longer Required", they correctly render in grey. |
| Card click + button click overlap | `$event.stopPropagation()` on Approve/Reject prevents the card-level click handler from firing. Tested mentally; should be solid. |

---

## What does NOT change

- `getTableDetails` in `DLACommon` — untouched.
- `GENDynamicRecordViewUtility` — untouched. `resolveTitle` is used as-is.
- Approve / Reject server actions, modals, and `removeRowFromTab` helper — untouched.
- Tab navigation, overflow ("More") behavior, keyboard nav, dark mode toggle, search, view options, export — untouched.
- All non-approval tabs render exactly as they do today.

---

## Test scenarios

1. **Approvals tab renders cards** — Open a portal with the WaaG widget; switch to a tab whose WaaG record points at `sysapproval_approver`. Confirm cards render with number, title, requester, action area.
2. **Other tabs still render tables** — Switch to Requests, Incidents, or any non-approval tab. Confirm the table view is unchanged.
3. **Title fallback chain** — Approvals against a parent table with no record-view config → title falls back to the parent's `short_description`. Configured `title_field` set → uses it. Configured `title_field` empty on a specific record → falls back to short_description.
4. **Requester fallback** — Parent table has no config → Requester line is hidden. Config exists with `requester_field=opened_by` → shows opened_by display value. Config exists with empty `requester_field` → shows parent record's overall display value.
5. **State pills** — Approvals in `Approved`, `Rejected`, `No Longer Required`, etc. render the right pill with the right color.
6. **Approve / Reject still work** — Click Approve on a Requested card → modal opens → confirm → record disappears from the tab, count decrements. Same for Reject including the rejection-reason prompt.
7. **Card click → backend** — WaaG record has `open_records_in_backend = true` → click anywhere on the card body (not the buttons) → opens approval in backend in a new tab.
8. **Card click → portal** — WaaG record has `open_records_in_backend = false` → card click opens the approval via the same portal page the table view would have opened.
9. **Pagination** — Cards page the same way rows do. Changing page or limit re-runs `refresh-tab`, re-enriches, re-renders cards.
10. **ACL graceful degrade** — User has read on `sysapproval_approver` but not on the parent → card renders with empty title/number and no requester, no errors.
11. **Dark mode** — Toggle dark mode → cards re-style with the dark palette; pills and buttons remain readable.
12. **Empty state** — Approvals tab with no records → existing "no results" block renders, not the card grid.

---

## Open questions

None outstanding. All clarifications resolved in the design conversation.
