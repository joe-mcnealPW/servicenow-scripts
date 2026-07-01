/**
 * Background Script: Create Production Batch Update Sets + Batch Story Update Sets
 * -------------------------------------------------------------------------------
 * For each change provided, this script:
 *   1. Creates ONE new update set to serve as the production batch (the parent).
 *   2. For every story number in that change, finds existing update sets whose
 *      NAME contains that story number (anchored match, see matchesStory()).
 *   3. Attaches each matched update set to the new batch by setting its
 *      `parent` field to the new batch's sys_id. (Batch model — NEVER merges.)
 *
 * Safe by default: DRY_RUN = true logs everything it WOULD do without writing.
 * Flip DRY_RUN to false to actually create/attach.
 *
 * Run from: System Definition > Scripts - Background  (run in the right scope).
 */

(function run() {

    // ============================== CONFIG ==============================

    var DRY_RUN = true;  // <-- leave true until the logs look right, then set false

    // ---- Script-level properties (apply to the whole run) ----
    var TEAM_NAME  = 'TBD';               // leads the batch name
    var SCOPE_NAME = 'global';            // sys_scope name OR namespace (e.g. 'global', 'x_co_app').
                                          //   Resolved to a real scope and stamped on the batch.
                                          //   Leave '' to derive scope from the first matched set instead.

    /**
     * Naming convention for the new batch update set.
     *
     * Format:
     *   <Team_name>.<scope>.R<releaseNumber>.<changeNumber>.Production_Batch.V<version>
     * Example:
     *   Family_Services.global.R2026.1.CHG0030001.Production_Batch.V1.0
     */
    function buildBatchName(change) {
        return [
            TEAM_NAME,
            SCOPE_LABEL,
            'R' + change.releaseNumber,
            change.changeNumber,
            'Production_Batch',
            'V' + change.version
        ].join('.');
    }

    // ----- The run payload: array of changes -----
    // changeNumber     : string, REQUIRED, goes in the batch name
    // releaseNumber    : string, REQUIRED, per-change, goes in the batch name
    // version          : string, REQUIRED, per-change, goes in the batch name
    // shortDescription : string, REQUIRED, goes in the batch name + description
    // storyNumbers     : array of strings, each matched against existing US names
    var CHANGES = [
        {
            changeNumber:     '',
            releaseNumber:    '1',
            version:          '1',
            shortDescription: '',
            storyNumbers:     []
        }
        // , { changeNumber: '', releaseNumber: '1', version: '1',
        //     shortDescription: '', storyNumbers: [] }
    ];

    // ============================ END CONFIG ============================


    var LOG = 'PROD_BATCH';
    var summary = [];

    // SCOPE_NAME drives both the <scope> name segment and the batch's application.
    var scopeInfo        = resolveScope(SCOPE_NAME);
    var SCOPE_LABEL      = scopeInfo.label;   // namespace string for the batch name
    var CONFIGURED_SCOPE = scopeInfo.sysId;   // sys_id stamped on the batch's application field
    if (SCOPE_NAME && !CONFIGURED_SCOPE) {
        gs.warn('[' + LOG + '] SCOPE_NAME "' + SCOPE_NAME + '" did not resolve to a sys_scope — '
            + 'the batch will be created in the script session scope instead.');
    }

    for (var i = 0; i < CHANGES.length; i++) {
        processChange(CHANGES[i]);
    }

    gs.info('[' + LOG + '] ====== RUN COMPLETE ' + (DRY_RUN ? '(DRY RUN — nothing written)' : '(LIVE)') + ' ======');
    for (var s = 0; s < summary.length; s++) {
        gs.info('[' + LOG + '] ' + summary[s]);
    }


    // --------------------------------------------------------------------
    function processChange(change) {
        // ---- validate the change payload ----
        if (!change.changeNumber || !change.releaseNumber || !change.version || !change.shortDescription) {
            gs.warn('[' + LOG + '] SKIPPING change — missing changeNumber/releaseNumber/version/shortDescription: ' + JSON.stringify(change));
            return;
        }
        if (!change.storyNumbers || !change.storyNumbers.length) {
            gs.warn('[' + LOG + '] ' + change.changeNumber + ' has no story numbers — a batch will be created but nothing will be attached.');
        }

        var batchName = buildBatchName(change);
        gs.info('[' + LOG + '] ---- Processing ' + change.changeNumber + ' -> batch "' + batchName + '" ----');

        // ---- collect all matched update sets first (so we can resolve scope) ----
        var matches = [];        // { sysId, name, scope, state, alreadyParented, story }
        var storyResults = {};   // storyNumber -> count, for logging zero/multi matches

        for (var n = 0; n < (change.storyNumbers || []).length; n++) {
            var story = String(change.storyNumbers[n]).trim();
            storyResults[story] = 0;

            var us = new GlideRecord('sys_update_set');
            us.addQuery('name', 'CONTAINS', story);   // coarse DB filter
            us.query();
            while (us.next()) {
                var name = us.getValue('name') + '';
                if (!matchesStory(name, story)) continue;   // anchored match guard

                matches.push({
                    sysId: us.getUniqueValue(),
                    name: name,
                    scope: us.getValue('application'),
                    state: us.getValue('state'),
                    alreadyParented: !!us.getValue('parent'),
                    story: story
                });
                storyResults[story]++;
            }
        }

        // ---- log zero / multi match situations ----
        for (var st in storyResults) {
            if (storyResults[st] === 0)
                gs.warn('[' + LOG + '] ' + change.changeNumber + ' — NO update set found for ' + st);
            else if (storyResults[st] > 1)
                gs.warn('[' + LOG + '] ' + change.changeNumber + ' — ' + storyResults[st] + ' update sets matched ' + st + ' (all will be attached)');
        }

        // ---- batch scope: exactly what SCOPE_NAME resolved to (e.g. global) ----
        var batchScope = CONFIGURED_SCOPE;

        // ---- create the batch update set (the parent) ----
        var batchSysId = null;
        if (DRY_RUN) {
            gs.info('[' + LOG + '] [DRY RUN] WOULD create batch update set: "' + batchName + '"'
                + (batchScope ? ' (scope sys_id ' + batchScope + ')' : ' (scope: current)'));
        } else {
            var batch = new GlideRecord('sys_update_set');
            batch.initialize();
            batch.setValue('name', batchName);
            batch.setValue('description', 'Production Batch for ' + change.shortDescription);
            batch.setValue('state', 'in progress');
            if (batchScope) batch.setValue('application', batchScope);
            batchSysId = batch.insert();
            gs.info('[' + LOG + '] Created batch update set ' + batchSysId + ' : "' + batchName + '"');
        }

        // ---- attach each match as a batch member ----
        var attached = 0, skipped = 0;
        var attachedChildren = [];   // sysIds of direct children — roots for the PSR tree walk
        for (var a = 0; a < matches.length; a++) {
            var match = matches[a];

            if (match.alreadyParented) {
                gs.warn('[' + LOG + '] SKIP "' + match.name + '" — already belongs to another batch.');
                skipped++;
                continue;
            }

            if (DRY_RUN) {
                gs.info('[' + LOG + '] [DRY RUN] WOULD attach "' + match.name + '" (' + match.story + ') -> batch');
                attached++;
                attachedChildren.push(match.sysId);
            } else {
                var child = new GlideRecord('sys_update_set');
                if (child.get(match.sysId)) {
                    child.setValue('parent', batchSysId);
                    child.update();
                    gs.info('[' + LOG + '] Attached "' + match.name + '" (' + match.story + ') -> batch');
                    attached++;
                    attachedChildren.push(match.sysId);
                }
            }
        }

        // ---- build the PSR roll-up from the FULL subtree under the batch ----
        // Walks each direct child and recurses into its own children (any depth), so a
        // child that is itself a batch parent contributes its line plus all its members'.
        var psrLines = [];
        var seen = {};
        for (var pc = 0; pc < attachedChildren.length; pc++) {
            collectPsrLines(attachedChildren[pc], psrLines, seen);
        }
        var batchDescription = 'Production Batch for ' + change.shortDescription;
        if (psrLines.length) batchDescription += '\n\n' + psrLines.join('\n');

        // ---- finalize: write the PSR roll-up description (batch stays IN PROGRESS) ----
        if (DRY_RUN) {
            gs.info('[' + LOG + '] [DRY RUN] WOULD set batch "' + batchName + '" description to:\n' + batchDescription);
        } else if (batchSysId) {
            var done = new GlideRecord('sys_update_set');
            if (done.get(batchSysId)) {
                done.setValue('description', batchDescription);
                done.update();
                gs.info('[' + LOG + '] Batch "' + batchName + '" finalized (PSR roll-up written, left in progress).');
            }
        }

        summary.push(change.changeNumber + ': batch "' + batchName + '" | attached ' + attached + ' | skipped ' + skipped);
    }

    /**
     * Resolve a scope name/namespace to { sysId, label }.
     * Matches either the namespace (`scope`, e.g. 'x_co_app' / 'global') or the
     * display `name`. `sysId` is what gets stamped on the batch's application
     * field; `label` is the real namespace used in the batch name. Falls back to
     * the raw input (or 'global') for the label when nothing resolves.
     */
    function resolveScope(scopeName) {
        var result = { sysId: null, label: scopeName || 'global' };
        if (!scopeName) return result;
        var sc = new GlideRecord('sys_scope');
        var q = sc.addQuery('scope', scopeName);
        q.addOrCondition('name', scopeName);
        sc.query();
        if (sc.next()) {
            result.sysId = sc.getUniqueValue();
            result.label = sc.getValue('scope') + '';   // namespace for the name
        }
        return result;
    }

    /**
     * Recursively walk an update set and ALL of its descendants (children, their
     * children, etc.), appending one PSR line per set to `lines`. `seen` guards
     * against double-listing and cycles. Children are collected before recursing
     * so the GlideRecord cursor isn't disturbed mid-walk.
     *
     *   "PSR12345 - <name>"            (one PSR)
     *   "PSR12345,PSR67890 - <name>"   (multiple PSRs)
     *   "[No PSR number found] - <name>"
     */
    function collectPsrLines(sysId, lines, seen) {
        if (!sysId || seen[sysId]) return;
        seen[sysId] = true;

        var gr = new GlideRecord('sys_update_set');
        if (!gr.get(sysId)) return;

        var name = gr.getValue('name') + '';
        var psrs = extractPSRs(gr.getValue('description') + '');
        lines.push((psrs.length ? psrs.join(',') : '[No PSR number found]') + ' - ' + name);

        // collect child sysIds first, then recurse
        var childIds = [];
        var kids = new GlideRecord('sys_update_set');
        kids.addQuery('parent', sysId);
        kids.query();
        while (kids.next()) childIds.push(kids.getUniqueValue() + '');
        for (var i = 0; i < childIds.length; i++) collectPsrLines(childIds[i], lines, seen);
    }

    /**
     * Pull every PSR token (form: PSR followed by digits, e.g. PSR12345) out of a
     * description, de-duplicated, preserving first-seen order.
     */
    function extractPSRs(text) {
        var out = [], seenPsr = {};
        if (!text) return out;
        var re = /PSR\d+/g, m;
        while ((m = re.exec(text)) !== null) {
            if (!seenPsr[m[0]]) { seenPsr[m[0]] = true; out.push(m[0]); }
        }
        return out;
    }

    /**
     * Anchored match so STRY0012345 does NOT match STRY00123456.
     * Story token must be bounded by a non-alphanumeric char (or string edge).
     */
    function matchesStory(name, story) {
        var idx = name.indexOf(story);
        while (idx !== -1) {
            var before = idx === 0 ? '' : name.charAt(idx - 1);
            var afterIdx = idx + story.length;
            var after = afterIdx >= name.length ? '' : name.charAt(afterIdx);
            var beforeOk = before === '' || !/[A-Za-z0-9]/.test(before);
            var afterOk  = after === ''  || !/[A-Za-z0-9]/.test(after);
            if (beforeOk && afterOk) return true;
            idx = name.indexOf(story, idx + 1);
        }
        return false;
    }

})();
