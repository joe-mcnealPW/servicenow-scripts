# Record Actions Widget — Implementation

This doc contains all the code and schema changes needed to deploy the Record Actions widget. Organized by where each piece lives in ServiceNow so you can work through it section by section.

---

## 1. Schema Changes (do these first in the platform UI)

### 1a. New columns on `x_g_dla_dla_connec_record_view_config`

| Field | Type | Notes |
|---|---|---|
| `allow_cancel` | True/False | Default false. Master switch — if false, Cancel button never shows. |
| `cancel_role` | String (40) | Role required to cancel. Empty = no role check. |
| `cancel_condition` | String (1000) | Encoded query evaluated against the record. Supports `${current_user}` token. Empty = no condition check. |
| `cancel_button_label` | String (40) | Override button text. Defaults to "Cancel". |
| `cancel_confirm_message` | String (255) | Confirmation prompt. Defaults to "Are you sure you want to cancel this record?" |

**Permission logic:** user can cancel if `allow_cancel = true` AND `(role empty OR user has role)` AND `(condition empty OR record matches condition)`. If `allow_cancel = true` but both role and condition are empty, defaults to admin-only.

### 1b. New child table: `x_g_dla_dla_connec_record_view_cancel_action`

| Field | Type | Notes |
|---|---|---|
| `config` | Reference → `x_g_dla_dla_connec_record_view_config` | Parent record |
| `field_name` | String (80) | Dictionary field on the parent's table to update |
| `value` | String (255) | New value. Supports `${current_user}`, `${now}`, `${empty}` tokens |
| `order` | Integer | Execution order |
| `description` | String (255) | Admin notes |

### 1c. Validation business rule on `x_g_dla_dla_connec_record_view_cancel_action`

Before Insert / Before Update — validates `field_name` exists on the parent config's table:

```javascript
(function executeRule(current, previous) {
    var fieldName = current.getValue('field_name');
    var configSysId = current.getValue('config');
    if (!fieldName || !configSysId) return;

    var cfg = new GlideRecord('x_g_dla_dla_connec_record_view_config');
    if (!cfg.get(configSysId)) {
        gs.addErrorMessage('Invalid config reference');
        current.setAbortAction(true);
        return;
    }

    // table is a reference to sys_db_object — dot-walk to get the table name
    var tableName = cfg.getDisplayValue('table');
    if (!tableName) {
        gs.addErrorMessage('Parent config has no table set');
        current.setAbortAction(true);
        return;
    }

    var tu = new TableUtils(tableName);
    var tables = tu.getTables();
    var dict = new GlideRecord('sys_dictionary');
    dict.addQuery('name', 'IN', tables.join(','));
    dict.addQuery('element', fieldName);
    dict.setLimit(1);
    dict.query();
    if (!dict.next()) {
        gs.addErrorMessage('Field "' + fieldName +
            '" does not exist on table "' + tableName + '" or any parent table.');
        current.setAbortAction(true);
    }
})(current, previous);
```

---

## 2. Updates to the Script Include `GENDynamicRecordViewUtility`

### 2a. Update `loadConfig` to read the new cancel fields

Find the existing `cfg` object construction inside `loadConfig` and replace it with this version (adds five new fields):

```javascript
var cfg = {
    sys_id: gr.getUniqueValue(),
    title_field: gr.getValue('title_field'),
    allow_cancel: (gr.getValue('allow_cancel') || 'false') + '',
    cancel_role: (gr.getValue('cancel_role') || '') + '',
    cancel_condition: (gr.getValue('cancel_condition') || '') + '',
    cancel_button_label: (gr.getValue('cancel_button_label') || '') + '',
    cancel_confirm_message: (gr.getValue('cancel_confirm_message') || '') + '',
    fields: { header: [], primary: [], details: [] }
};
```

### 2b. New methods to add to the script include

Add this entire block to `GENDynamicRecordViewUtility.prototype`, just before the closing `type: 'GENDynamicRecordViewUtility'` line:

```javascript
// ── Record Actions: Approve / Reject / Cancel ──────────────────────────

/**
 * Determine which actions are available for the current user on this record.
 * Returns an object the widget uses to decide which buttons to render.
 */
getAvailableActions: function (rec, config) {
    var ctx = 'getAvailableActions';
    var result = {
        can_approve: false,
        approval_sys_id: null,
        can_cancel: false,
        cancel_label: 'Cancel',
        cancel_confirm: 'Are you sure you want to cancel this record?'
    };

    try {
        if (!rec) {
            this._log('warn', ctx, 'No record provided');
            return result;
        }

        this._log('info', ctx, 'Resolving actions for table=' + rec.getTableName() +
            ' sys_id=' + rec.getUniqueValue() + ' user=' + gs.getUserID());

        // Approval check
        var approvalSysId = this._getPendingApprovalForUser(rec);
        if (approvalSysId) {
            result.can_approve = true;
            result.approval_sys_id = approvalSysId;
        }
        this._log('debug', ctx, 'Pending approval check: found=' + !!approvalSysId +
            ' approval_sys_id=' + approvalSysId);

        // Cancel check
        var canCancel = this._userCanCancel(rec, config);
        if (canCancel) {
            result.can_cancel = true;
            if (config) {
                var labelOverride = (config.cancel_button_label || '') + '';
                var confirmOverride = (config.cancel_confirm_message || '') + '';
                if (labelOverride) result.cancel_label = labelOverride;
                if (confirmOverride) result.cancel_confirm = confirmOverride;
            }
        }
        this._log('debug', ctx, 'Cancel permission resolved: can_cancel=' + canCancel);

        return result;

    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err +
            ' | stack: ' + (err.stack || 'no stack'));
        return result;
    }
},

/**
 * Execute an approve or reject action on a pending approval.
 * Re-validates ownership at execution time to prevent TOCTOU attacks.
 */
executeApproval: function (approvalSysId, decision) {
    var ctx = 'executeApproval';

    try {
        if (!approvalSysId) {
            return { success: false, error: 'Missing approval sys_id' };
        }
        if (decision !== 'approve' && decision !== 'reject') {
            return { success: false, error: 'Invalid decision: ' + decision };
        }

        var currentUser = gs.getUserID();
        this._log('info', ctx, 'User ' + currentUser + ' executing "' + decision +
            '" on approval row ' + approvalSysId);

        var appr = new GlideRecord('sysapproval_approver');
        if (!appr.get(approvalSysId)) {
            this._log('warn', ctx, 'Approval row not found: ' + approvalSysId);
            return { success: false, error: 'Approval not found' };
        }

        // Re-validate at execution time — prevents stale-page attacks
        if ((appr.getValue('state') + '') !== 'requested') {
            this._log('warn', ctx, 'Approval row ' + approvalSysId +
                ' is no longer in "requested" state (current state=' +
                appr.getValue('state') + ') — refusing');
            return { success: false, error: 'This approval is no longer pending' };
        }

        if ((appr.getValue('approver') + '') !== currentUser) {
            this._log('warn', ctx, 'Approval row ' + approvalSysId +
                ' is not assigned to current user — refusing');
            return { success: false, error: 'You are not the approver on this request' };
        }

        // Set state and save. ServiceNow's approval engine will recompute the
        // parent record's overall approval status.
        appr.setValue('state', decision === 'approve' ? 'approved' : 'rejected');
        var updated = appr.update();

        if (!updated) {
            this._log('error', ctx, 'Failed to update approval row ' + approvalSysId);
            return { success: false, error: 'Failed to save approval decision' };
        }

        this._log('info', ctx, 'Approval ' + approvalSysId + ' set to "' +
            (decision === 'approve' ? 'approved' : 'rejected') + '"');
        return {
            success: true,
            message: decision === 'approve' ? 'Approval submitted' : 'Rejection submitted'
        };

    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err +
            ' | stack: ' + (err.stack || 'no stack'));
        return { success: false, error: 'Unexpected error processing approval' };
    }
},

/**
 * Execute the configured Cancel actions on the record.
 * Re-validates permission at execution time.
 */
executeCancel: function (rec, config) {
    var ctx = 'executeCancel';

    try {
        if (!rec) {
            return { success: false, error: 'No record provided' };
        }
        if (!config) {
            return { success: false, error: 'No config available for this table' };
        }

        this._log('info', ctx, 'User ' + gs.getUserID() + ' cancelling record ' +
            rec.getTableName() + '.' + rec.getUniqueValue());

        // Re-validate permission
        if (!this._userCanCancel(rec, config)) {
            this._log('warn', ctx, 'User no longer has permission to cancel — refusing');
            return { success: false, error: 'You do not have permission to cancel this record' };
        }

        // Load and apply cancel actions
        var appliedCount = this._applyCancelActions(rec, config);
        if (appliedCount === 0) {
            this._log('warn', ctx, 'No cancel actions defined for this config — no-op');
            return { success: false, error: 'No cancel actions are configured for this table' };
        }

        var updated = rec.update();
        if (!updated) {
            this._log('error', ctx, 'rec.update() returned null/false — write failed');
            return { success: false, error: 'Failed to save changes — you may not have write access on all fields' };
        }

        this._log('info', ctx, 'Cancel applied ' + appliedCount + ' field update(s) and saved');
        return { success: true, message: 'Record cancelled' };

    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err +
            ' | stack: ' + (err.stack || 'no stack'));
        return { success: false, error: 'Unexpected error processing cancel' };
    }
},

// ── Action helpers (private) ───────────────────────────────────────────

/**
 * Find a 'requested' approval row assigned to the current user for this record.
 * For RITMs, also checks approvals on the parent Request.
 */
_getPendingApprovalForUser: function (rec) {
    var ctx = '_getPendingApprovalForUser';
    try {
        var currentUser = gs.getUserID();
        var recordIds = [rec.getUniqueValue() + ''];

        // For RITMs, include the parent Request — approvals can target either
        if ((rec.getTableName() + '') === 'sc_req_item') {
            var requestId = rec.getValue('request');
            if (requestId) recordIds.push(requestId + '');
        }

        var appr = new GlideRecord('sysapproval_approver');
        appr.addQuery('approver', currentUser);
        appr.addQuery('state', 'requested');
        appr.addQuery('sysapproval', 'IN', recordIds.join(','));
        appr.setLimit(1);
        appr.query();

        if (appr.next()) {
            return appr.getUniqueValue() + '';
        }
        return null;

    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err);
        return null;
    }
},

/**
 * Returns true if the current user can cancel this record per config.
 * If allow_cancel = true but neither role nor condition is configured, defaults to admin-only.
 */
_userCanCancel: function (rec, config) {
    var ctx = '_userCanCancel';
    try {
        if (!config) return false;
        if ((config.allow_cancel + '') !== 'true') return false;

        var role = (config.cancel_role || '') + '';
        var condition = (config.cancel_condition || '') + '';

        // Default to admin-only if neither is configured
        if (!role && !condition) {
            var isAdmin = gs.hasRole('admin');
            this._log('debug', ctx, 'No role or condition configured — admin only. isAdmin=' + isAdmin);
            return isAdmin;
        }

        // Role check
        var roleOk = !role || gs.hasRole(role);
        if (!roleOk) {
            this._log('debug', ctx, 'User lacks required role "' + role + '"');
            return false;
        }

        // Condition check
        if (!condition) return true;

        var matches = this._recordMatchesCondition(rec, condition);
        this._log('debug', ctx, 'Cancel condition check: matches=' + matches);
        return matches;

    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err);
        return false;
    }
},

/**
 * Evaluate whether a record matches an encoded query condition string.
 * Substitutes ${current_user} before evaluating.
 */
_recordMatchesCondition: function (rec, condition) {
    var ctx = '_recordMatchesCondition';
    try {
        var query = condition.replace(/\$\{current_user\}/g, gs.getUserID());

        var test = new GlideRecord(rec.getTableName() + '');
        test.addEncodedQuery(query);
        test.addQuery('sys_id', rec.getUniqueValue());
        test.setLimit(1);
        test.query();

        return test.hasNext();

    } catch (err) {
        this._log('error', ctx, 'Exception evaluating condition: ' + err);
        return false;
    }
},

/**
 * Load the configured cancel actions and apply each to the record.
 * Does NOT call rec.update() — caller does that for atomicity.
 * Returns the number of actions applied.
 */
_applyCancelActions: function (rec, config) {
    var ctx = '_applyCancelActions';
    var applied = 0;

    try {
        var act = new GlideRecord('x_g_dla_dla_connec_record_view_cancel_action');
        act.addQuery('config', config.sys_id);
        act.orderBy('order');
        act.query();

        while (act.next()) {
            var fieldName = act.getValue('field_name') + '';
            var rawValue = (act.getValue('value') || '') + '';
            var substituted = this._substituteActionTokens(rawValue);

            if (!rec.getElement(fieldName)) {
                this._log('warn', ctx, 'Cancel action targets non-existent field "' +
                    fieldName + '" on table "' + rec.getTableName() + '" — skipping');
                continue;
            }

            rec.setValue(fieldName, substituted);
            applied++;
            this._log('debug', ctx, 'Set ' + fieldName + ' = "' + substituted + '"');
        }
    } catch (err) {
        this._log('error', ctx, 'Exception: ' + err);
    }

    return applied;
},

/**
 * Replace special tokens in a cancel action value.
 *   ${current_user}  → current user's sys_id
 *   ${now}           → current datetime
 *   ${empty}         → empty string
 */
_substituteActionTokens: function (value) {
    if (!value) return value;
    value = (value + '');

    if (value === '${empty}') return '';

    return value
        .replace(/\$\{current_user\}/g, gs.getUserID())
        .replace(/\$\{now\}/g, new GlideDateTime().getDisplayValue());
},
```

---

## 3. New Widget: "GEN Record Actions"

Create a new Service Portal widget with the following pieces. Suggested ID: `gen-record-actions`.

### 3a. Option schema (paste as JSON)

```json
[]
```

The widget reads `table` and `sys_id` from URL params, so no options are needed.

### 3b. Server script

```javascript
(function() {
    data.table = $sp.getParameter('table');
    data.sys_id = $sp.getParameter('sys_id');
    data.error = null;
    data.action_result = null;
    data.actions = {
        can_approve: false,
        approval_sys_id: null,
        can_cancel: false,
        cancel_label: 'Cancel',
        cancel_confirm: 'Are you sure you want to cancel this record?'
    };

    if (!data.table || !data.sys_id) {
        data.error = 'Missing table or sys_id';
        return;
    }

    var rec = new GlideRecordSecure(data.table);
    if (!rec.get(data.sys_id)) {
        data.error = 'Record not found or access denied';
        return;
    }

    var utility = new GENDynamicRecordViewUtility();
    var config = utility.loadConfig(data.table);

    // Handle action execution (POSTed via c.server.get)
    if (input && input.action) {
        if (input.action === 'approve' || input.action === 'reject') {
            data.action_result = utility.executeApproval(
                input.approval_sys_id,
                input.action
            );
        } else if (input.action === 'cancel') {
            data.action_result = utility.executeCancel(rec, config);
        }

        // Re-fetch the record after the action so the next render sees fresh state
        rec = new GlideRecordSecure(data.table);
        rec.get(data.sys_id);
    }

    data.actions = utility.getAvailableActions(rec, config);
})();
```

### 3c. Client controller

```javascript
function($scope, spModal, spUtil) {
    var c = this;

    c.approve = function() {
        spModal.confirm({
            title: 'Approve Request',
            message: 'Are you sure you want to approve this record?',
            confirmLabel: 'Approve',
            cancelLabel: 'Back'
        }).then(function(confirmed) {
            if (confirmed) {
                c._executeAction('approve', c.data.actions.approval_sys_id);
            }
        });
    };

    c.reject = function() {
        spModal.confirm({
            title: 'Reject Request',
            message: 'Are you sure you want to reject this record?',
            confirmLabel: 'Reject',
            cancelLabel: 'Back'
        }).then(function(confirmed) {
            if (confirmed) {
                c._executeAction('reject', c.data.actions.approval_sys_id);
            }
        });
    };

    c.cancel = function() {
        spModal.confirm({
            title: 'Cancel Record',
            message: c.data.actions.cancel_confirm,
            confirmLabel: c.data.actions.cancel_label || 'Cancel',
            cancelLabel: 'Back'
        }).then(function(confirmed) {
            if (confirmed) {
                c._executeAction('cancel', null);
            }
        });
    };

    c._executeAction = function(action, approvalSysId) {
        c.processing = true;

        c.server.get({
            action: action,
            approval_sys_id: approvalSysId
        }).then(function(response) {
            c.processing = false;
            var result = response.data.action_result;

            if (result && result.success) {
                spUtil.addInfoMessage(result.message || 'Action completed');

                // Refresh this widget in place
                c.server.refresh();

                // Tell the rest of the page (record view widget) to refresh too
                $scope.$emit('record-actions:executed', { action: action });
            } else {
                var errMsg = (result && result.error) || 'Action failed';
                spUtil.addErrorMessage(errMsg);
            }
        }, function() {
            c.processing = false;
            spUtil.addErrorMessage('Action failed — server error');
        });
    };
}
```

### 3d. HTML template (Body HTML)

```html
<div class="record-actions" ng-if="!data.error && (data.actions.can_approve || data.actions.can_cancel)">
    <div class="action-bar">
        <button ng-if="data.actions.can_approve"
                class="btn btn-approve"
                ng-click="c.approve()"
                ng-disabled="c.processing">
            <i class="fa fa-check"></i> Approve
        </button>

        <button ng-if="data.actions.can_approve"
                class="btn btn-reject"
                ng-click="c.reject()"
                ng-disabled="c.processing">
            <i class="fa fa-times"></i> Reject
        </button>

        <span class="action-spacer" ng-if="data.actions.can_approve && data.actions.can_cancel"></span>

        <button ng-if="data.actions.can_cancel"
                class="btn btn-cancel"
                ng-click="c.cancel()"
                ng-disabled="c.processing">
            <i class="fa fa-ban"></i> {{data.actions.cancel_label || 'Cancel'}}
        </button>
    </div>
</div>
```

### 3e. CSS (SCSS)

```scss
.record-actions {
    margin-bottom: 24px;

    .action-bar {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        font-weight: 500;
        font-size: 14px;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.05s;

        i { font-size: 12px; }

        &:hover:not(:disabled) { opacity: 0.92; }
        &:active:not(:disabled) { transform: translateY(1px); }
        &:disabled { opacity: 0.6; cursor: not-allowed; }
    }

    .btn-approve {
        background-color: #2e7d32;
        color: #fff;
    }

    .btn-reject {
        background-color: #c62828;
        color: #fff;
    }

    .btn-cancel {
        background-color: #757575;
        color: #fff;
    }

    .action-spacer {
        flex: 1;
    }
}
```

---

## 4. Optional Update to Dynamic Record View Widget

Add this snippet to the existing Dynamic Record View widget's client controller (near the top of the existing controller function). It catches the event emitted by the Record Actions widget and refreshes the record display in place, so users see both widgets update without a full page reload.

```javascript
$scope.$on('record-actions:executed', function() {
    c.server.refresh();
});
```

---

## 5. Portal Page Setup

Add the new "GEN Record Actions" widget to the `record_view` portal page, **above** the Dynamic Record View widget. Both widgets read the same URL params, so no additional wiring is needed.

---

## 6. Deployment Order

1. Schema changes (section 1)
2. Script include updates (section 2) — replace `loadConfig`'s cfg object and append the new methods before `type:`
3. Test in Scripts - Background:
   ```javascript
   var u = new GENDynamicRecordViewUtility();
   var rec = new GlideRecord('sc_req_item');
   rec.get('<sys_id of a RITM with a pending approval to you>');
   var config = u.loadConfig('sc_req_item');
   gs.print(JSON.stringify(u.getAvailableActions(rec, config), null, 2));
   ```
   Expected: `can_approve: true`, `approval_sys_id` populated.
4. Create the widget (section 3)
5. Optional: add the listener snippet to the Dynamic Record View widget (section 4)
6. Place on portal page (section 5)
7. Configure for one table:
   - Open the config record for `sc_req_item`
   - Set `allow_cancel = true`
   - Set `cancel_role = itil` (or appropriate role)
   - Add 2-3 cancel action records: e.g. `state = 4`, `comments = Cancelled via portal`, `closed_by = ${current_user}`
   - Open an RITM, confirm Cancel button appears, click it, confirm execution

---

## 7. Cancel Action Tokens — Reference

When configuring `value` on a cancel action record:

| Token | Replaced with |
|---|---|
| `${current_user}` | Current user's sys_id |
| `${now}` | Current datetime (display value) |
| `${empty}` | Empty string |

Plain values (no tokens) are used literally. For choice fields, use the underlying value (e.g. `4` for cancelled state, not "Cancelled").

---

## 8. Instance-Specific Things to Verify

These tend to vary across ServiceNow versions:

**`sysapproval_approver.sysapproval` field name.** Most instances use `sysapproval` as the back-reference. A few use `document_id`. If approval lookup returns nothing despite an approval being pending, swap `'sysapproval'` to `'document_id'` in `_getPendingApprovalForUser`.

**Approval state values.** Standard values are `requested`, `approved`, `rejected`. Highly customized instances may differ — update the literals in `executeApproval` if so.

---

## 9. Log Patterns to Watch

All action methods use the existing `_log` helper. Filter logs by `[GENDynamicRecordView]` to see the action flow:

```
[INFO][getAvailableActions] Resolving actions for table=sc_req_item sys_id=... user=...
[DEBUG][getAvailableActions] Pending approval check: found=true approval_sys_id=...
[DEBUG][_userCanCancel] No role or condition configured — admin only. isAdmin=true
[INFO][executeApproval] User <id> executing "approve" on approval row <id>
[INFO][executeCancel] User <id> cancelling record sc_req_item.<sys_id>
[DEBUG][_applyCancelActions] Set state = "4"
```

If `can_approve` or `can_cancel` come back false unexpectedly, the DEBUG lines will tell you which check failed.
