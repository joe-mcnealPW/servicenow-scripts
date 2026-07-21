# Solution — Announcement Bar (Complete Widget)

> **Companion doc:** `servicenow-announcement-dismissal-analysis.md` (the OOB dismissal research this is built on).
> This document contains the **complete, drop-in code** for each part. Each section below is the whole file, not a diff — paste it in wholesale.
>
> **Widget:** Announcement Bar · **Widget ID:** `gen-announcement-bar` · **Script Include:** `GENAnnouncementUtil` · **Scope:** *see decision 1*

---

## 1. What this delivers

A full-width horizontal bar that renders active announcements from the OOB `announcement` tables for a **portal you name in the widget options** — not necessarily the portal it's rendered on. Users dismiss with an X, and the dismissal behaves exactly as the announcement record is configured: session-only, permanent, or not at all.

Session dismissals go to `localStorage` under the OOB key convention (`dismissed_announcement_<sys_id>` = current session ID). Permanent dismissals write a row to the OOB `m2m_dismissed_announcement` table. Both storage contracts are ServiceNow's own, so this widget is a peer of the OOB banner rather than a fork of it.

Multiple announcements are paged **one at a time** with left/right chevrons flanking the content, sliding as you navigate. Zero announcements renders **nothing** — no empty strip, no layout shift. On wide screens the colored band stays full-width but the content is capped and centered to a readable measure.

The reason we can't just reuse `spAnnouncement`: it hardcodes `'X-PORTAL-ID': $rootScope.portal_id` on every request. Portal targeting — the whole ask — is the one thing it can't do. And its `dismiss(id)` does `_.find(_all, {id: id})` against its own internal list, so it throws on any announcement it didn't fetch itself. Details in §11 of the companion doc.

---

## 2. Confirmed decisions baked into the code below

1. **Prefix/scope is `GEN` / `gen-`.** Rename to `CNIC*` / `DLA*` and re-scope if this is landing somewhere else — it's the Script Include name plus the widget ID, nothing more.
2. **Logic lives in `GENAnnouncementUtil`**, not the server script. The server script is the thin init-guard-call-catch shell.
3. **Async `loadData` pattern**, per the standard: server sets `data.isLoading = true` and returns early; the client fires `c.server.get({ action: 'loadData' })`; `isLoading` is flipped to `false` **only** in the client callback, never server-side.
4. **`dismiss` is a second action on the same guard**, and it falls through to the same load — so a dismiss returns a fresh, authoritative list in one round trip.
5. **Reuse the OOB `m2m_dismissed_announcement` table**, not a custom one. Keeps us aligned with the OOB banner and any admin tooling built over it.
6. **Reuse the OOB localStorage key convention.** OOB's own `_cleanupStorage()` then housekeeps our keys for free, and the session-ID equality check gives us correct expiry with zero code.
7. **Summary is stripped to plain text** server-side. It's a one-line bar, and stripping removes the `$sce.trustAsHtml` XSS surface entirely.
8. **Multi-announcement UX is chevron paging** (one at a time, sliding), replacing the old expand-to-list `1/N` counter. Advancing slides content left, going back slides right. Left chevron inactive at the first item, right inactive at the last. Dismissing re-clamps the index to a neighbour rather than jumping to the top.
9. **Title and summary both clamp** via `-webkit-line-clamp`, line counts driven by the `title_lines` (default 1) and `summary_lines` (default 2) options so they're tunable without touching CSS.
10. **Link renders as an outlined button**; icons, chevrons, and button all derive color from `currentColor` (the foreground), with muted-foreground inactive chevrons — no hard-coded colors.
11. **Content max-width is capped and centered on wide screens** (`max_width` option, default 1200px) while the colored band stays full-bleed. Mobile is chevrons-only — no swipe.
8. **No skeleton, and no empty state** — see §10. Both are deliberate deviations from the standard for this widget specifically.

---

## 3. Pre-flight — verify before you build

Three assumptions remain in `CONFIG`. The two that used to head this list — `dismiss_options` values and the `m2m_dismissed_announcement` columns — are **resolved** (see the bottom of this section).

**Glyph value format.** The picker stores the icon name bare (`bullhorn`), and `_resolveGlyph()` assumes that by default. Confirm what your records actually hold — if they carry a prefix, the normalizer already handles it, but check that the shape is one it knows:

```javascript
var g = new GlideRecord('announcement');
g.addNotNullQuery('glyph');
g.setLimit(10);
g.query();
while (g.next())
	gs.info(g.getValue('title') + '  glyph = [' + g.getValue('glyph') + ']');
```

Anything not matching `bullhorn` / `fa-bullhorn` / `fa fa-bullhorn` / `icon-*` / `glyphicon-*` needs a branch adding to `_resolveGlyph()`.

**The rest** (cosmetic, and obvious when wrong):

```javascript
var s = new GlideRecord('announcement_style');
s.query(); s.next();
gs.info('announcement_style: ' + Object.keys(s).join(', '));

var a = new GlideRecord('announcement');
a.initialize();
gs.info('announcement: ' + Object.keys(a).join(', '));
```

→ `CONFIG.STYLE_*`, `CONFIG.LINK_PAGE`, `CONFIG.FIELD_GLYPH`.

**Resolved 07/17:**

- `announcement.dismiss_options` values are **lowercase** — `session_dismissible`, `not_dismissible`. I had these uppercase on the strength of ServiceNow's shipped `service.spAnnouncement.js`, which compares against `'SESSION_DISMISSIBLE'`. That was a bad inference: the OOB client reads the `/api/now/sp/announcement` REST layer, which transforms values on the way out — the same transform that turns `dismiss_options` into `dismissOption`. We read the table directly, so we get the raw DB value. **Anything sourced from the OOB client is evidence about the API surface, not the schema.** `_dismissMode()` now folds case on both sides so it can't bite again.
- `m2m_dismissed_announcement` is `announcement` + **`sys_user`** (not `user`).

Both are set in CONFIG.

**Also read** `sys_script_client.list` → Table = `announcement` → **"Clear dismissed announcements"**. Confirm what it does to `m2m_dismissed_announcement` on update. If it wipes rows on every edit that's arguably a feature (announcement resurfaces after an edit) — but know it, don't discover it.

**Confirmed, safe to trust:** `announcement.{active, name, title, summary, from, to, type, click_target, details_url, details_link_text, dismiss_options}` · `m2m_announcement_portal.{announcement, sp_portal}` · `click_target = 'urlNew'` · fallback colors `#006ed5` / `#ffffff`.

---

## 4. Script Include — `GENAnnouncementUtil`

**System Definition > Script Includes > New.** Name `GENAnnouncementUtil`, Accessible from *All application scopes*, Client callable **unchecked**.

```javascript
var GENAnnouncementUtil = Class.create();

GENAnnouncementUtil.prototype = {

	/* ══════════════════════════════════════════════
	 * CONFIG
	 * ══════════════════════════════════════════════
	 * Schema that could not be read from ServiceNow's shipped source, isolated
	 * here so there is one place to fix. Lines marked VERIFY are still
	 * assumptions — check them against the instance (see §3 of solution.md).
	 * If something breaks, look here first.
	 */
	CONFIG: {

		/* announcement.dismiss_options choice VALUES (not labels).
		 *
		 * Both confirmed 07/17 against sys_choice. Note the case: the stored
		 * values are LOWERCASE. ServiceNow's shipped service.spAnnouncement.js
		 * compares against the uppercase 'SESSION_DISMISSIBLE', but that is the
		 * /api/now/sp/announcement REST layer's transformed output, NOT the
		 * database value — the same transform that camelCases dismiss_options
		 * into dismissOption. Reading the table directly with GlideRecord, as
		 * we do, gets the raw lowercase value.
		 *
		 * There is deliberately no "PERMANENT" constant: _dismissMode() mirrors
		 * OOB's own "anything that isn't session ⇒ server-side dismissal" logic,
		 * so that value never gets named and can't be got wrong. */
		DISMISS_SESSION: 'session_dismissible',   // confirmed 07/17
		DISMISS_NEVER: 'not_dismissible',         // confirmed 07/17

		/* m2m_dismissed_announcement field names.
		 * DISMISSED_USER was 'user' and is actually 'sys_user' — this was the
		 * cause of the silent "permanent dismiss does nothing" bug. setValue()
		 * on a field that doesn't exist is a no-op, insert() still returns a
		 * sys_id, so the write reported success and wrote an orphan row. */
		DISMISSED_ANN: 'announcement',            // confirmed 07/17
		DISMISSED_USER: 'sys_user',               // confirmed 07/17

		/* announcement_style field names */
		STYLE_BG: 'background_color',             // VERIFY
		STYLE_FG: 'foreground_color',             // VERIFY
		STYLE_ALIGN: 'alignment',                 // VERIFY

		/* announcement link + icon fields */
		LINK_URL: 'details_url',                  // confirmed
		LINK_TEXT: 'details_link_text',           // confirmed
		LINK_PAGE: 'details_page',                // VERIFY — page-type click targets only
		FIELD_GLYPH: 'glyph',                     // VERIFY

		/* OOB fallbacks, from directive.spAnnouncements.js */
		DEFAULT_BG: '#006ed5',
		DEFAULT_FG: '#ffffff',

		/* Hard ceiling on the announcement scan. Portal scoping is filtered in
		 * memory — the m2m tables are tiny, and a SQL expression of "mapped to
		 * me OR mapped to nobody" isn't worth the unreadability. */
		SCAN_LIMIT: 200,

		GUEST_SYS_ID: '6816f79cc0a8016401c5a33be04be441'
	},

	/**
	 * @param {string} portalId - sys_id of the sp_portal to scope announcements to.
	 */
	initialize: function(portalId) {
		this.portalId = portalId || '';
		this.userId = gs.getUserID();
		this.loggedIn = gs.isLoggedIn() && this.userId != this.CONFIG.GUEST_SYS_ID;
		this._styleCache = {};
	},


	/* ══════════════════════════════════════════════
	 * PUBLIC
	 * ══════════════════════════════════════════════ */

	/**
	 * Active, in-window announcements scoped to this.portalId, shaped for the client.
	 *
	 * @param {object} opts
	 * @param {string} opts.type - announcement_consumer_type sys_id, or '' for all
	 * @param {boolean} opts.includeGlobal - include announcements mapped to no portal
	 * @param {boolean} opts.useDisplayStyle - resolve announcement_style colors
	 * @param {number} opts.max - max announcements to return
	 * @return {array}
	 */
	getAnnouncements: function(opts) {
		var announcements = [];
		var portalMap = this._buildPortalMap();
		var dismissed = this.loggedIn ? this._getDismissedSet() : {};

		var gr = new GlideRecord('announcement');
		gr.addEncodedQuery(this._buildQuery(opts.type));
		gr.orderByDesc('from');
		gr.setLimit(this.CONFIG.SCAN_LIMIT);
		gr.query();

		while (gr.next()) {
			var id = gr.getUniqueValue();
			if (!this._inScope(id, portalMap, opts.includeGlobal)) continue;
			announcements.push(this._shape(gr, id, dismissed, opts.useDisplayStyle));
			if (announcements.length >= opts.max) break;
		}

		return announcements;
	},

	/**
	 * Record a permanent dismissal for the current user.
	 * Session dismissals never reach the server — they live in localStorage.
	 *
	 * @param {string} announcementId
	 * @return {object} { ok: boolean, error: string }
	 */
	dismiss: function(announcementId) {
		/* Gate 1 — authentication. This is the fix for Known Error KB0784548:
		 * session times out with the page open, user clicks X, and OOB happily
		 * writes a dismissal row against Guest. We refuse. */
		if (!this.loggedIn) return this._fail('not_authenticated');

		/* Gate 2 — the announcement exists. */
		var ann = new GlideRecord('announcement');
		if (!ann.get(announcementId)) return this._fail('not_found');

		/* Gate 3 — it is actually permanently dismissible. Never trust the
		 * client on this; re-derive the mode from the record itself. */
		var mode = this._dismissMode(ann.getValue('dismiss_options'));
		if (mode != 'permanent') return this._fail('not_permanently_dismissible:' + mode);

		/* Idempotent — double-click, retry after timeout, or two instances of
		 * the widget on one page all produce exactly one row. */
		var existing = new GlideRecord('m2m_dismissed_announcement');
		existing.addQuery(this.CONFIG.DISMISSED_ANN, announcementId);
		existing.addQuery(this.CONFIG.DISMISSED_USER, this.userId);
		existing.setLimit(1);
		existing.query();
		if (existing.next()) return { ok: true, alreadyDismissed: true };

		var m2m = new GlideRecord('m2m_dismissed_announcement');
		m2m.initialize();
		m2m.setValue(this.CONFIG.DISMISSED_ANN, announcementId);
		m2m.setValue(this.CONFIG.DISMISSED_USER, this.userId);
		var sysId = m2m.insert();

		if (!sysId) {
			gs.error('GENAnnouncementUtil: dismissal insert failed for announcement ' +
				announcementId + ' / user ' + this.userId + ': ' + m2m.getLastErrorMessage());
			return this._fail('insert_failed');
		}

		return { ok: true, sysId: sysId };
	},


	/* ══════════════════════════════════════════════
	 * PRIVATE
	 * ══════════════════════════════════════════════ */

	/**
	 * Active + inside the from/to window, optionally filtered by consumer type.
	 */
	_buildQuery: function(typeId) {
		/* GlideDateTime.getValue() returns UTC 'YYYY-MM-DD HH:MM:SS', which is
		 * how date/time fields are stored — so this compares like for like. */
		var now = new GlideDateTime().getValue();

		/* In an encoded query ^OR binds to the immediately preceding condition
		 * and ^ opens a new AND group. This reads as:
		 *   active=true AND (from empty OR from <= now) AND (to empty OR to >= now) */
		var q = 'active=true';
		q += '^fromISEMPTY^ORfrom<=' + now;
		q += '^toISEMPTY^ORto>=' + now;

		/* announcement.type is a glide_list of announcement_consumer_type sys_ids. */
		if (typeId) q += '^typeCONTAINS' + typeId;

		return q;
	},

	/**
	 * Two sets in one pass over m2m_announcement_portal:
	 *   mine   - mapped to this.portalId
	 *   mapped - mapped to ANY portal, so we can spot the unmapped ones
	 * OOB rule: an announcement with NO portal rows shows on every portal.
	 */
	_buildPortalMap: function() {
		var mine = {};
		var mapped = {};
		var gr = new GlideRecord('m2m_announcement_portal');
		gr.query();
		while (gr.next()) {
			var annId = gr.getValue('announcement');
			mapped[annId] = true;
			if (gr.getValue('sp_portal') == this.portalId) mine[annId] = true;
		}
		return { mine: mine, mapped: mapped };
	},

	_inScope: function(annId, portalMap, includeGlobal) {
		if (portalMap.mine[annId]) return true;
		if (!portalMap.mapped[annId] && includeGlobal) return true;
		return false;
	},

	_getDismissedSet: function() {
		var set = {};
		var gr = new GlideRecord('m2m_dismissed_announcement');
		gr.addQuery(this.CONFIG.DISMISSED_USER, this.userId);
		gr.query();
		while (gr.next()) set[gr.getValue(this.CONFIG.DISMISSED_ANN)] = true;
		return set;
	},

	_shape: function(gr, id, dismissedSet, useDisplayStyle) {
		var mode = this._dismissMode(gr.getValue('dismiss_options'));
		return {
			id: id,
			title: gr.getValue('title') || gr.getValue('name') || '',
			/* Stripped: this is a single-line bar, and plain text sidesteps
			 * $sce.trustAsHtml and the XSS surface it opens. */
			summary: $sp.stripHTML(gr.getValue('summary') || ''),
			glyph: this._resolveGlyph(gr.getValue(this.CONFIG.FIELD_GLYPH)),
			dismissMode: mode,
			dismissed: mode == 'permanent' && !!dismissedSet[id],
			style: useDisplayStyle ? this._resolveStyle(gr.getValue('display_style')) : null,
			link: this._resolveLink(gr)
		};
	},

	/**
	 * Normalize announcement.glyph into a ready-to-use CSS class string.
	 *
	 * ServiceNow's glyph picker stores the icon name WITHOUT its font prefix —
	 * OOB's own Icon Link widget builds its markup as `fa fa-{{options.glyph}}`,
	 * which is why binding the raw value straight into a class attribute
	 * renders nothing. Service Portal ships Font Awesome 4.7 (~576 icons).
	 *
	 * The stored shape varies by instance and by how the record was created
	 * (scripted inserts often write a prefix in), so handle all of them:
	 *
	 *   'bullhorn'           -> 'fa fa-bullhorn'      (what the picker stores)
	 *   'fa-bullhorn'        -> 'fa fa-bullhorn'
	 *   'fa fa-bullhorn'     -> 'fa fa-bullhorn'      (already complete)
	 *   'icon-bullhorn'      -> 'icon-bullhorn'       (SN icon font, self-prefixing)
	 *   'glyphicon-bullhorn' -> 'glyphicon glyphicon-bullhorn'
	 *
	 * @return {string} class string, or '' when no glyph is set
	 */
	_resolveGlyph: function(raw) {
		var glyph = ((raw || '') + '').trim();
		if (!glyph) return '';

		/* Already a complete class string — trust it. */
		if (glyph.indexOf(' ') > -1) return glyph;

		if (glyph.indexOf('icon-') === 0) return glyph;
		if (glyph.indexOf('glyphicon-') === 0) return 'glyphicon ' + glyph;
		if (glyph.indexOf('fa-') === 0) return 'fa ' + glyph;

		return 'fa fa-' + glyph;
	},

	/**
	 * Mirrors OOB exactly. ServiceNow's own service only ever asks "is this
	 * SESSION_DISMISSIBLE?" and treats everything else as a server-side
	 * dismissal — so we do the same and never name that value.
	 *
	 * Deliberate deviation: an EMPTY dismiss_options yields 'none' here, where
	 * OOB would fall through to the permanent path. Rendering no X on a
	 * misconfigured record is the safe failure.
	 *
	 * Compared lowercased on both sides: the DB stores 'session_dismissible'
	 * but the OOB REST layer hands out 'SESSION_DISMISSIBLE', and the two get
	 * quoted interchangeably in docs and community posts. Choice values are
	 * unique regardless of case, so folding it costs nothing and stops a case
	 * mismatch from silently turning every announcement permanent.
	 *
	 * @return {string} 'session' | 'permanent' | 'none'
	 */
	_dismissMode: function(raw) {
		var value = ((raw || '') + '').trim().toLowerCase();
		if (!value || value == this.CONFIG.DISMISS_NEVER.toLowerCase()) return 'none';
		if (value == this.CONFIG.DISMISS_SESSION.toLowerCase()) return 'session';
		return 'permanent';
	},

	_resolveStyle: function(styleId) {
		if (!styleId) return null;
		if (this._styleCache[styleId] !== undefined) return this._styleCache[styleId];

		var style = null;
		var gr = new GlideRecord('announcement_style');
		if (gr.get(styleId)) {
			style = {
				background: gr.getValue(this.CONFIG.STYLE_BG) || this.CONFIG.DEFAULT_BG,
				foreground: gr.getValue(this.CONFIG.STYLE_FG) || this.CONFIG.DEFAULT_FG,
				alignment: (gr.getValue(this.CONFIG.STYLE_ALIGN) || 'LEFT').toLowerCase()
			};
		}

		this._styleCache[styleId] = style;   // same style on many announcements = one query
		return style;
	},

	_resolveLink: function(gr) {
		var target = (gr.getValue('click_target') || '') + '';
		if (!target || target == 'none') return null;

		var url = gr.getValue(this.CONFIG.LINK_URL) || '';

		/* Page-type click target: resolve the sp_page into a portal URL. */
		if (!url && this.CONFIG.LINK_PAGE) {
			var pageId = gr.getValue(this.CONFIG.LINK_PAGE);
			if (pageId) {
				var pg = new GlideRecord('sp_page');
				if (pg.get(pageId)) url = '?id=' + pg.getValue('id');
			}
		}
		if (!url) return null;

		return {
			url: url,
			text: gr.getValue(this.CONFIG.LINK_TEXT) || '',
			/* 'urlNew' is confirmed from directive.spAnnouncements.js */
			target: target == 'urlNew' ? '_blank' : '_self'
		};
	},

	_fail: function(reason) {
		return { ok: false, error: reason };
	},

	type: 'GENAnnouncementUtil'
};
```

---

## 5. Server script

```javascript
(function() {

	data.isLoading = true;
	data.error = '';
	data.announcements = [];
	data.dismissResult = null;
	data.userLoggedIn = gs.isLoggedIn();
	data.sticky = options.sticky == 'true';

	/* Presentation options passed straight to the client. Ints are floored to
	 * sane minimums so a blank or zero option can't break the clamp/layout. */
	data.titleLines = Math.max(1, parseInt(options.title_lines, 10) || 1);
	data.summaryLines = Math.max(1, parseInt(options.summary_lines, 10) || 2);
	data.maxWidth = parseInt(options.max_width, 10) || 0;   // 0 = no cap, full bleed

	data.msg = {
		dismiss: gs.getMessage('Dismiss'),
		prev: gs.getMessage('Previous announcement'),
		next: gs.getMessage('Next announcement'),
		dismissFailed: gs.getMessage('We could not save your dismissal. Please try again.'),
		loadFailed: gs.getMessage('We ran into an issue loading announcements.')
	};

	/* The whole reason this widget exists: an explicit portal option beats
	 * page context. spAnnouncement can't do this — it hardcodes the current
	 * portal into every request header. */
	var portal = $sp.getPortalRecord();
	data.portalId = options.portal || (portal ? portal.getUniqueValue() : '');

	/* ──────────────────────────────────────────────
	 * Force async — return early on initial page load
	 * ────────────────────────────────────────────── */
	if (!input || (input.action != 'loadData' && input.action != 'dismiss')) return;

	try {
		var au = new GENAnnouncementUtil(data.portalId);

		/* A dismiss falls through to the load below, so one round trip both
		 * writes the dismissal and returns a fresh, authoritative list. */
		if (input.action == 'dismiss') {
			data.dismissResult = au.dismiss(input.announcementId + '');
		}

		data.announcements = au.getAnnouncements({
			type: options.announcement_type || '',
			includeGlobal: options.include_global != 'false',
			useDisplayStyle: options.use_display_style != 'false',
			max: parseInt(options.max_announcements, 10) || 5
		});
	} catch (e) {
		data.error = data.msg.loadFailed;
		gs.error('gen-announcement-bar: ' + e);
	}

})();
```

---

## 6. Client controller

```javascript
api.controller = function($scope, $rootScope, $window, $timeout, spUtil) {
	var c = this;

	/* Same key convention as OOB's service.spAnnouncement.js. Two things come
	 * free from matching it: OOB's _cleanupStorage() housekeeps our keys, and
	 * a session dismissal here is honoured by the OOB banner on next page load
	 * (and vice versa). Limits of that in §10 of solution.md. */
	var KEY_PREFIX = 'dismissed_announcement_';
	var SESSION_ID = ($window.NOW && $window.NOW.session_id) || '';
	var DISMISS_EVENT = 'gen.announcement.bar.dismissed';

	/* $rootScope.$broadcast reaches our own $scope.$on listener too. Without an
	 * origin tag that listener re-hides announcements the server just told us
	 * are visible again — which silently swallows failed writes. */
	var INSTANCE_ID = 'ann-' + Math.random().toString(36).slice(2);

	/* Paging state. c.visible is the filtered list; c.index is the one on
	 * screen. c.slideDir feeds the CSS slide-in class ('next' | 'prev' | ''). */
	c.visible = [];
	c.index = 0;
	c.total = 0;

	c.server.get({ action: 'loadData' }).then(function(response) {
		c.data = response.data;
		c.data.isLoading = false;
		refresh();
	});


	/* ──────────────────────────────────────────────
	 * Visibility
	 * ────────────────────────────────────────────── */

	function isSessionDismissed(id) {
		try {
			return $window.localStorage.getItem(KEY_PREFIX + id) === SESSION_ID;
		} catch (e) {
			/* Private mode / storage disabled. "Not dismissed" is the safe
			 * answer — the user sees the announcement, which beats silently
			 * swallowing it. */
			return false;
		}
	}

	/**
	 * Mirrors OOB: unauthenticated users ALWAYS take the session path, because
	 * there is no user record to write a dismissal row against.
	 */
	function usesSessionPath(a) {
		return a.dismissMode === 'session' || !c.data.userLoggedIn;
	}

	/**
	 * Rebuild the visible list and keep c.index in range. Called on load, on
	 * dismiss, and after a server round trip — anything that can change the set.
	 */
	function refresh() {
		c.visible = (c.data.announcements || []).filter(function(a) {
			if (a.dismissed) return false;                                     // server: m2m row exists
			if (usesSessionPath(a) && isSessionDismissed(a.id)) return false;  // client: this session
			return true;
		});
		c.total = c.visible.length;
		/* Clamp rather than reset: if the current item is dismissed the list
		 * shrinks under us, and we want to land on a sane neighbour, not jump
		 * to the top every time. Only a hard out-of-range falls back to 0. */
		if (c.index > c.total - 1) c.index = Math.max(0, c.total - 1);
	}

	c.current = function() {
		return c.visible[c.index] || null;
	};


	/* ──────────────────────────────────────────────
	 * Paging — single-item slide
	 * ──────────────────────────────────────────────
	 * One announcement shows at a time. On navigation the incoming item is
	 * re-inserted (keyed by index) and the CSS slide-in class fires on it, so it
	 * enters from the travel direction. Simpler than a full track and it doesn't
	 * fight the clamp, because the animation is on the entering node, not the
	 * clamped text.
	 *
	 * A chevron is active whenever there is an announcement in that direction.
	 * Left inactive at index 0, right inactive at the last index (Story 1).
	 */

	c.slideDir = '';      // 'next' | 'prev' | '' — drives the slide-in class
	c.animating = false;  // guards against click-spam mid-transition

	c.hasPrev = function() { return c.index > 0; };
	c.hasNext = function() { return c.index < c.total - 1; };

	c.prev = function() { page(-1); };
	c.next = function() { page(1); };

	function page(step) {
		if (c.animating) return;                       // ignore clicks mid-transition
		var target = c.index + step;
		if (target < 0 || target > c.total - 1) return;

		/* Advancing (step > 0) slides the incoming item in from the right;
		 * going back slides it in from the left. The class drives the CSS
		 * keyframes; see §8. */
		c.slideDir = step > 0 ? 'next' : 'prev';
		c.animating = true;
		c.index = target;

		/* Clear the animation flag after the transition window. Kept in sync
		 * with the CSS duration (200ms) plus a small buffer. prefers-reduced-
		 * motion shortcuts the CSS, but the timer is harmless either way. */
		$timeout(function() {
			c.animating = false;
			c.slideDir = '';
		}, 240);
	}


	/* ──────────────────────────────────────────────
	 * Dismiss
	 * ────────────────────────────────────────────── */

	c.dismiss = function(a, $event) {
		if ($event) {
			$event.preventDefault();
			$event.stopPropagation();
		}
		if (!a || a.dismissMode === 'none') return;

		if (usesSessionPath(a)) {
			try {
				$window.localStorage.setItem(KEY_PREFIX + a.id, SESSION_ID);
			} catch (e) {
				/* OOB swallows this in an empty catch. We at least leave a
				 * trace — the announcement reappears on refresh and this
				 * explains why. */
				console.warn('gen-announcement-bar: session dismissal not persisted', e);
			}
			a.dismissed = true;
			refresh();
			$rootScope.$broadcast(DISMISS_EVENT, { id: a.id, from: INSTANCE_ID });
			return;
		}

		/* Permanent. Optimistic hide, rollback on failure.
		 * OOB fires $http() with no .then() and hides regardless — a failed
		 * POST there means the announcement silently returns later with no
		 * explanation to anyone. */
		a.dismissed = true;
		refresh();

		c.server.get({ action: 'dismiss', announcementId: a.id }).then(function(response) {
			var result = response.data.dismissResult;
			if (!result || !result.ok) return rollback(a, result);

			c.data = response.data;
			c.data.isLoading = false;
			refresh();
			$rootScope.$broadcast(DISMISS_EVENT, { id: a.id, from: INSTANCE_ID });
		}, function() {
			rollback(a, null);
		});
	};

	function rollback(a, result) {
		a.dismissed = false;
		refresh();
		spUtil.addErrorMessage(c.data.msg.dismissFailed);
		console.error('gen-announcement-bar: permanent dismissal failed —',
			(result && result.error) || 'transport error');
	}


	/* ──────────────────────────────────────────────
	 * Multi-instance sync
	 * ──────────────────────────────────────────────
	 * Two instances on one page (header + footer) stay in step without a
	 * server round trip.
	 */
	$scope.$on(DISMISS_EVENT, function(evt, args) {
		if (args.from === INSTANCE_ID) return;   // our own echo — the server response is authoritative
		var hit = false;
		(c.data.announcements || []).forEach(function(a) {
			if (a.id === args.id && !a.dismissed) {
				a.dismissed = true;
				hit = true;
			}
		});
		if (hit) refresh();
	});


	/* ──────────────────────────────────────────────
	 * Presentation
	 * ────────────────────────────────────────────── */

	c.styleFor = function(a) {
		if (!a || !a.style) return {};   // no display style → inherit portal theme via CSS
		return {
			'background-color': a.style.background,
			'color': a.style.foreground
		};
	};

	c.isCentered = function(a) {
		return !!(a && a.style && a.style.alignment === 'center');
	};

	/* Clamp line counts come from options (defaults 1 / 2) so they're tunable
	 * without touching CSS. -webkit-line-clamp reads them as CSS custom props. */
	c.clampStyle = function() {
		return {
			'--ann-title-lines': c.data.titleLines,
			'--ann-summary-lines': c.data.summaryLines
		};
	};

	/* Content max-width: full-bleed band, capped/centred content (per the
	 * desktop-width requirement). 0 or empty = no cap. */
	c.contentStyle = function() {
		var mw = c.data.maxWidth;
		return mw ? { 'max-width': mw + 'px' } : {};
	};
};
```

---

## 7. Body HTML template

```html
<!-- Error state. Empty and loading states render nothing by design — see §10. -->
<div class="ann-bar" ng-if="!c.data.isLoading && c.data.error">
	<div class="ann-bar__item ann-bar__item--error">
		<div class="ann-bar__content">
			<div class="ann-bar__body">
				<span class="ann-bar__text">{{c.data.error}}</span>
			</div>
		</div>
	</div>
</div>

<div class="ann-bar"
	 ng-if="!c.data.isLoading && !c.data.error && c.total > 0"
	 ng-class="{'ann-bar--sticky': c.data.sticky}">

	<!-- One item on screen at a time. The band (.ann-bar__item) is full bleed
		 and carries the Display Style background; .ann-bar__content is the
		 capped, centred inner rail (desktop max-width requirement). -->
	<div class="ann-bar__item"
		 ng-style="c.styleFor(c.current())"
		 ng-class="{'ann-bar__item--centered': c.isCentered(c.current())}"
		 role="region"
		 aria-roledescription="carousel"
		 aria-live="polite"
		 aria-label="{{c.current().title}}">

		<div class="ann-bar__content" ng-style="c.contentStyle()">

			<!-- Left chevron. Rendered only when paging is possible (>1). Inactive
				 (not just hidden) at the first item, per Story 1. -->
			<button type="button"
					class="ann-bar__nav ann-bar__nav--prev"
					ng-if="c.total > 1"
					ng-disabled="!c.hasPrev()"
					ng-click="c.prev()"
					aria-label="{{c.data.msg.prev}}">
				<i class="fa fa-chevron-left" aria-hidden="true"></i>
			</button>

			<!-- Single-item viewport. The keyed inner div is re-inserted on index
				 change, so the CSS slide-in class fires and the incoming item
				 enters from the travel direction. -->
			<div class="ann-bar__viewport">
				<div class="ann-bar__slide"
					 ng-class="'ann-bar__slide--' + c.slideDir"
					 ng-style="c.clampStyle()">

					<div class="ann-bar__body">
						<div class="ann-bar__heading">
							<!-- Glyph shares a flex row with the title, to its left.
								 Class resolved server-side by _resolveGlyph(); binding
								 announcement.glyph raw renders nothing (no prefix). -->
							<i class="ann-bar__glyph {{c.current().glyph}}"
							   ng-if="c.current().glyph"
							   aria-hidden="true"></i>
							<span class="ann-bar__title">{{c.current().title}}</span>
						</div>
						<span class="ann-bar__summary"
							  ng-if="c.current().summary">{{c.current().summary}}</span>
					</div>

					<a class="ann-bar__link"
					   ng-if="c.current().link"
					   ng-href="{{c.current().link.url}}"
					   target="{{c.current().link.target}}"
					   rel="noopener noreferrer">
						{{c.current().link.text || c.current().title}}
						<i class="fa fa-external-link"
						   aria-hidden="true"
						   ng-if="c.current().link.target === '_blank'"></i>
					</a>
				</div>
			</div>

			<!-- Right chevron. Inactive at the last item. -->
			<button type="button"
					class="ann-bar__nav ann-bar__nav--next"
					ng-if="c.total > 1"
					ng-disabled="!c.hasNext()"
					ng-click="c.next()"
					aria-label="{{c.data.msg.next}}">
				<i class="fa fa-chevron-right" aria-hidden="true"></i>
			</button>

		</div>

		<!-- Dismiss lives OUTSIDE the capped content, pinned to the band's edge.
			 It's ALWAYS rendered — for non-dismissible announcements it's hidden
			 with visibility:hidden (not ng-if), so its footprint is reserved and
			 the content never shifts when paging between dismissible and non-
			 dismissible items. ng-disabled + the modifier class make it inert. -->
		<button type="button"
				class="ann-bar__dismiss"
				ng-class="{'ann-bar__dismiss--hidden': c.current().dismissMode === 'none'}"
				ng-disabled="c.current().dismissMode === 'none'"
				ng-click="c.dismiss(c.current(), $event)"
				aria-hidden="{{c.current().dismissMode === 'none'}}"
				tabindex="{{c.current().dismissMode === 'none' ? -1 : 0}}"
				aria-label="{{c.data.msg.dismiss}}: {{c.current().title}}">
			<i class="fa fa-times" aria-hidden="true"></i>
		</button>

	</div>
</div>
```

**Two notes on the markup.** There is no `ng-bind-html` anywhere — summary is stripped server-side, so no `$sce` and no XSS surface. And there is deliberately **no jQuery tooltip binding**: that's the source of the `cannot call methods on tooltip prior to initialization` bug that breaks the OOB dismiss X on Utah/Vancouver. We don't inherit it because we don't copy it.

---

## 8. CSS - SCSS

```scss
/* ══════════════════════════════════════════════
 * Structure
 * ══════════════════════════════════════════════
 * .ann-bar         host, full width
 * .ann-bar__item   full-bleed BAND — carries the Display Style background
 * .ann-bar__content  capped, centred inner rail (desktop max-width)
 * .ann-bar__nav    chevrons
 * .ann-bar__viewport / __track / __slot   the sliding content window
 * All icon/chevron/link colour derives from `currentColor`, which the item's
 * foreground colour sets — so theming flows for free (Story 4). */

.ann-bar {
	width: 100%;
}

.ann-bar--sticky {
	position: sticky;
	top: 0;
	z-index: 1030;   /* above Bootstrap 3 content, below modals (1040+) */
}

/* The BAND. Full width, holds the background. Padding 10px top/bottom, 56px
 * left/right (strict). The dismiss button is absolutely positioned at the right
 * edge; the 56px right padding is its clearance, so content never slides under it. */
.ann-bar__item {
	position: relative;
	display: flex;
	justify-content: center;
	width: 100%;
	padding: 10px 56px;
	font-size: 14px;
	line-height: 1.4;
	border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	background-color: $brand-primary;   /* fallback when no Display Style; ng-style wins */
	color: #fff;
}

.ann-bar__item--error {
	background-color: #f5f5f5;
	color: #444;
}

/* The capped inner RAIL. max-width is applied inline from the option; this is
 * the centring + flex layout for [chevron | content | chevron]. */
.ann-bar__content {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	/* max-width comes from c.contentStyle() so it's tunable per instance. */
}

/* ── Chevron nav ─────────────────────────────── */
.ann-bar__nav {
	flex: 0 0 auto;
	background: transparent;
	border: 0;
	color: currentColor;         /* foreground-driven */
	opacity: 0.85;
	padding: 4px 8px;
	font-size: 15px;
	line-height: 1;
	border-radius: 3px;
	cursor: pointer;
	transition: opacity 0.15s ease, background-color 0.15s ease;

	&:hover {
		opacity: 1;
		background-color: rgba(255, 255, 255, 0.15);
	}

	&:focus {
		outline: 2px solid currentColor;
		outline-offset: 1px;
		opacity: 1;
	}

	/* Inactive at a boundary — muted foreground, not hidden (Story 1 + 4). */
	&[disabled] {
		opacity: 0.35;
		cursor: default;
		background-color: transparent;
	}
}

/* ── Sliding viewport (single item) ──────────── */
/* The window shows the one current item. On index change the keyed inner div is
 * re-inserted and the slide-in class fires, so it enters from the travel
 * direction. The animation is on the entering node, not the clamped text, so
 * -webkit-line-clamp and the motion don't collide. */
.ann-bar__viewport {
	flex: 1 1 auto;
	min-width: 0;         /* REQUIRED for the clamp to take effect */
	overflow: hidden;     /* clips the slide so content enters cleanly */
}

.ann-bar__slide {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
}

.ann-bar__item--centered .ann-bar__slide {
	justify-content: center;
}

.ann-bar__slide--next {
	animation: annSlideInLeft 0.2s ease;
}

.ann-bar__slide--prev {
	animation: annSlideInRight 0.2s ease;
}

@keyframes annSlideInLeft {
	from { transform: translateX(24px); opacity: 0; }
	to   { transform: translateX(0);    opacity: 1; }
}

@keyframes annSlideInRight {
	from { transform: translateX(-24px); opacity: 0; }
	to   { transform: translateX(0);     opacity: 1; }
}

/* ── Content ─────────────────────────────────── */
.ann-bar__body {
	flex: 1 1 auto;
	min-width: 0;
}

/* Alignment follows the announcement's Display Style. When centered, both the
 * title row and the summary center; otherwise both sit left. The heading is a
 * flex row (justify-content moves the glyph+title), the summary is a full-width
 * -webkit-box block (text-align moves the text inside it) — so each needs its
 * own centering property. */
.ann-bar__heading {
	display: flex;
	align-items: baseline;
	gap: 8px;
	min-width: 0;
}

.ann-bar__item--centered .ann-bar__heading {
	justify-content: center;
}

.ann-bar__item--centered .ann-bar__summary {
	text-align: center;
}

.ann-bar__glyph {
	flex: 0 0 auto;
	color: currentColor;
	font-size: 16px;
	opacity: 0.95;
	position: relative;
	top: 1px;   /* optical nudge so the icon sits on the title baseline */
}

/* Title + summary both clamp. Line counts come from CSS custom properties set
 * by c.clampStyle() (options-driven), defaulting via the fallback in var().
 * -webkit-line-clamp is supported across all Service Portal target browsers. */
.ann-bar__title {
	display: -webkit-box;
	-webkit-line-clamp: var(--ann-title-lines, 1);
	-webkit-box-orient: vertical;
	overflow: hidden;
	min-width: 0;
	font-weight: 600;
}

.ann-bar__summary {
	display: -webkit-box;
	-webkit-line-clamp: var(--ann-summary-lines, 2);
	-webkit-box-orient: vertical;
	overflow: hidden;
	opacity: 0.9;
	margin-left: 0;   /* flush left under the title, no indent */
}

/* ── Link as outlined button (Story 3) ───────── */
/* Service Portal's base stylesheet sets an explicit `color` on `a` elements
 * (the theme link color), which outranks a plain `.ann-bar__link { color }`
 * rule and stops currentColor from tracking the foreground. Anchoring the
 * selector under .ann-bar__item raises specificity enough to win, and `inherit`
 * pulls the foreground the item sets via ng-style. */
.ann-bar__item a.ann-bar__link {
	flex: 0 0 auto;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: inherit;                   /* foreground-driven; beats the theme link color */
	text-decoration: none;
	white-space: nowrap;
	padding: 4px 12px;
	border: 1px solid currentColor;   /* currentColor now resolves to the inherited foreground */
	border-radius: 4px;
	opacity: 0.95;
	transition: opacity 0.15s ease, background-color 0.15s ease;

	&:hover,
	&:focus {
		color: inherit;
		text-decoration: none;
		opacity: 1;
		background-color: rgba(127, 127, 127, 0.15);   /* neutral tint reads on light OR dark foreground */
	}

	&:focus {
		outline: 2px solid currentColor;
		outline-offset: 1px;
	}
}

/* ── Dismiss — pinned to the band edge, not the rail ── */
.ann-bar__dismiss {
	position: absolute;
	top: 50%;
	right: 12px;
	transform: translateY(-50%);
	flex: 0 0 auto;
	background: transparent;
	border: 0;
	color: currentColor;
	opacity: 0.75;
	padding: 4px 8px;
	font-size: 16px;
	line-height: 1;
	border-radius: 3px;
	cursor: pointer;
	transition: opacity 0.15s ease, background-color 0.15s ease;

	&:hover {
		opacity: 1;
		background-color: rgba(255, 255, 255, 0.15);
	}

	&:focus {
		outline: 2px solid currentColor;
		outline-offset: 1px;
		opacity: 1;
	}
}

/* Non-dismissible: keep the button's footprint reserved so paging between
 * dismissible and non-dismissible announcements causes no horizontal shift.
 * visibility:hidden holds layout space; pointer-events:none + ng-disabled make
 * it fully inert. */
.ann-bar__dismiss--hidden {
	visibility: hidden;
	pointer-events: none;
}
@media (max-width: 767px) {
	.ann-bar__item {
		padding: 10px 40px 10px 12px;
	}

	.ann-bar__content {
		gap: 8px;
	}

	/* Link drops below the text rather than competing for the row. */
	.ann-bar__slide {
		flex-wrap: wrap;
		row-gap: 6px;
	}

	.ann-bar__body {
		flex: 1 1 100%;
	}

	/* Larger hit area for chevrons on touch. */
	.ann-bar__nav {
		padding: 8px 10px;
	}
}

@media (prefers-reduced-motion: reduce) {
	/* Kill the slide-in — index still advances, just instantly. */
	.ann-bar__slide--next,
	.ann-bar__slide--prev {
		animation: none;
	}

	.ann-bar__nav,
	.ann-bar__link,
	.ann-bar__dismiss {
		transition: none;
	}
}
```

---

## 9. Option schema

```json
[
	{
		"hint": "Portal whose announcements should display. Leave empty to use the portal the widget is rendered on.",
		"name": "portal",
		"label": "Portal",
		"type": "reference",
		"reference_table": "sp_portal",
		"default_value": ""
	},
	{
		"hint": "Only show announcements of this consumer type (e.g. Banner). Leave empty for all types.",
		"name": "announcement_type",
		"label": "Announcement Type",
		"type": "reference",
		"reference_table": "announcement_consumer_type",
		"default_value": ""
	},
	{
		"hint": "Include announcements that are not mapped to any portal. OOB treats these as visible on every portal.",
		"name": "include_global",
		"label": "Include Unmapped (Global) Announcements",
		"type": "boolean",
		"default_value": "true"
	},
	{
		"hint": "Use each announcement's Display Style colors. Uncheck to inherit portal theme colors instead.",
		"name": "use_display_style",
		"label": "Use Display Style Colors",
		"type": "boolean",
		"default_value": "true"
	},
	{
		"hint": "Maximum announcements to render.",
		"name": "max_announcements",
		"label": "Max Announcements",
		"type": "integer",
		"default_value": "5"
	},
	{
		"hint": "Pin the bar to the top of the viewport as the user scrolls.",
		"name": "sticky",
		"label": "Sticky",
		"type": "boolean",
		"default_value": "false"
	},
	{
		"hint": "Cap the width of the announcement content on wide screens (px). The colored band still spans full width; only the text/controls are constrained and centered. 0 or empty = no cap.",
		"name": "max_width",
		"label": "Content Max Width (px)",
		"type": "integer",
		"default_value": "1200"
	},
	{
		"hint": "Number of lines the title may occupy before truncating with an ellipsis.",
		"name": "title_lines",
		"label": "Title Lines (clamp)",
		"type": "integer",
		"default_value": "1"
	},
	{
		"hint": "Number of lines the summary may occupy before truncating with an ellipsis.",
		"name": "summary_lines",
		"label": "Summary Lines (clamp)",
		"type": "integer",
		"default_value": "2"
	}
]
```

> `reference` options return a sys_id string. Booleans arrive as the **strings** `'true'` / `'false'` — which is why the server script compares against `'true'` rather than truthiness.

---

## 10. Deliberate deviations — read before you review

**Two departures from our own widget standard**, both specific to this widget:

- **No skeleton on load.** The standard says skeleton while `isLoading`. But this bar is empty most of the time — a skeleton would flash a fake bar on every page load and then vanish, which is worse than nothing and causes layout shift on every page in the portal. It renders nothing until it has content. One `ng-if` to add back if you disagree.
- **No empty state.** Zero announcements renders nothing. An "no announcements to show" strip across the top of the portal would be absurd. The error state is present per the standard, though it's arguably too loud for a non-critical decoration — remove the first `ng-if` block in the template if you'd rather it fail silently.

**Design calls made this pass** (from the 07/20 requirements; flag any to revisit):

- **Dismiss X is pinned to the band edge, outside the capped content rail.** So it doesn't shift as you page or as content width changes. Chevrons are inner (flanking content); X is outermost.
- **Dismissing re-clamps the index to a neighbour**, not a hard reset to the first item — less jarring when you dismiss item 3 of 5.
- **Slide is animated on a keyed wrapper, not the clamped text.** `-webkit-line-clamp` needs the element to remain a block box, which fights a transform on the same node. Animating the entering wrapper keeps the clamp and the motion from colliding. **This is the one piece with real implementation risk** — if the slide reads as janky against the clamp in your instance, the fallback is a cross-fade (drop the `translateX` from the keyframes, keep the opacity). Noted here so it's a known dial, not a surprise.
- **Chevron paging replaces the `1/N` expand model entirely** (confirmed). There is no longer any way to see all announcements at once — one at a time only.

**Behavior changes from OOB**, all intentional:

| | OOB | Ours |
|---|---|---|
| Failed permanent dismiss | Fire-and-forget `$http()`, no `.then()`. Hides regardless; announcement silently returns later. | Optimistic hide, **rollback + visible error**. |
| Guest dismissal after session timeout | Writes a dismissal row against Guest (**KB0784548**). | Server refuses. Three gates. |
| localStorage failure | Empty `catch {}`. | Logged; degrades gracefully. |
| Double-click / retry | Can write duplicate m2m rows. | Idempotent. |
| Client trust | Client picks the dismissal path. | Server **re-derives** the mode from the record. |
| Tooltip bug | Breaks the X on Utah/Vancouver. | Not inherited. |
| Empty `dismiss_options` | Falls through to permanent. | Renders no X. Safe failure. |
| Portal targeting | Impossible. | The point. |

**Honest limitations:**

- **No live sync with the OOB banner.** If both are on a page, a dismissal here won't update the OOB banner **until the next page load**. Broadcasting `$$:sp:announcement` doesn't help — the OOB directive's handler just re-reads `spAnnouncement`'s private `_list`, which only recomputes inside its own `_processAnnouncements()`. We can't reach it. Session dismissals converge on next load via the shared localStorage key; permanent ones via the shared m2m table. **Recommendation: don't run both on the same page.**
- **Session dismissal is per-browser, per-device.** Inherent to localStorage; identical to OOB.
- **Plain `GlideRecord`, not `GlideRecordSecure`**, for the announcement read — announcements are broadcast content and we already filter on active/date/portal. If your instance has restrictive ACLs on `announcement` (some do), switch and retest as a plain user.

---

## 11. Test plan

Dismissal state is invisible and sticky — get it wrong and the UI won't tell you. In this order.

**Portal targeting (the new capability)**
- [ ] Option empty → current portal's announcements
- [ ] Option set to portal B while rendered on portal A → shows **B's**
- [ ] No portal rows + `include_global` on → shows on every portal; off → shows on none
- [ ] `announcement_type` = Banner → Widget-only announcements excluded

**Session dismissal**
- [ ] Dismiss → gone
- [ ] **Refresh → still gone** (catches a broken session-ID comparison)
- [ ] Log out, log back in → **reappears**
- [ ] DevTools → Local Storage → key `dismissed_announcement_<sys_id>`, value = session ID
- [ ] `m2m_dismissed_announcement` → **no new row** (a row here means the mode branch is inverted)

**Permanent dismissal**
- [ ] Dismiss → gone; exactly one m2m row
- [ ] Log out / back in → still gone
- [ ] Different browser, same user → **still gone** (proves server-side, not localStorage)
- [ ] Different user → still visible
- [ ] Delete the m2m row → reappears
- [ ] Double-click the X fast → still exactly one row

**Non-dismissible**
- [ ] **No X renders.** ← if it does, `CONFIG.DISMISS_NEVER` is wrong. Back to §3.
- [ ] Forge a dismiss from the console → `not_permanently_dismissible`, no row written

**Guest / unauthenticated**
- [ ] Public page, logged out, permanent-mode announcement → dismiss → **localStorage, not a DB row**
- [ ] **KB0784548:** open the page, let the session expire, then dismiss → **no Guest row.** OOB fails this.

**Failure paths**
- [ ] Block the widget endpoint in DevTools → dismiss → announcement **comes back** + error toast
- [ ] Incognito with storage disabled → no console explosion; announcement returns on refresh

**Presentation**
- [ ] Zero announcements → **nothing renders, no layout shift**
- [ ] Glyph set → icon renders left of the title. If not, inspect the `<i>`: a class of `fa fa-bullhorn` that shows nothing means the icon name isn't in FA 4.7; a class of just `bullhorn` means `_resolveGlyph()` didn't fire
- [ ] Glyph empty → no icon, no gap where one would be
- [ ] Glyph + centered Display Style → icon stays with the title, both centered
- [ ] Long title → clamps to `title_lines` (default 1) with ellipsis
- [ ] Long summary → clamps to `summary_lines` (default 2) with ellipsis; short summary shows in full, no ellipsis
- [ ] Change `title_lines` / `summary_lines` options → clamp counts follow
- [ ] Sticky on → pins, doesn't cover modals
- [ ] Display Style colors apply; option off → theme fallback
- [ ] Tab to the X, press Enter → dismisses, focus ring visible against the Display Style background

**Paging (Story 1)**
- [ ] One announcement → **no chevrons rendered**
- [ ] Two+ → both chevrons render
- [ ] First item → left chevron inactive (muted, non-clickable), right active
- [ ] Last item → right chevron inactive, left active
- [ ] Middle item → both active
- [ ] Right advances, left goes back; index never runs off either end
- [ ] Dismiss the middle item of several → lands on a neighbour, not back at item 1
- [ ] Dismiss the last remaining item → bar disappears cleanly (no empty band)

**Slide (Story 2)**
- [ ] Advancing slides content in from the right; going back from the left (or your confirmed mapping)
- [ ] No layout jump or flicker at the swap
- [ ] Rapid chevron clicks don't stack/tear (guarded by `c.animating`)
- [ ] `prefers-reduced-motion` on → no slide, instant swap, still fully usable
- [ ] Slide doesn't fight the clamp — text stays clamped mid-animation (if janky, see the cross-fade fallback in §10)

**Link button (Story 3) + theming (Story 4)**
- [ ] Announcement with a link → renders as an outlined button (border + padding), not a text link
- [ ] Announcement without a link → no button
- [ ] Icons, chevrons, button all take the foreground color; change the Display Style foreground → all follow
- [ ] Inactive chevron is a muted foreground, not a different hard-coded color

**Desktop width**
- [ ] Wide monitor → colored band spans full width; content capped at `max_width` and centered
- [ ] `max_width` = 0 / empty → content runs full width (no cap)
- [ ] Change `max_width` → content rail resizes accordingly

**Mobile (Story 7)**
- [ ] < 768px → content and link reflow without overflow; band still full width
- [ ] Chevrons remain tappable (larger hit area); no swipe expected
- [ ] Dismiss X still reachable at the band edge

---

## 12. Build order

1. Run §3. Set `CONFIG.DISMISS_NEVER`. **Don't skip this one.**
2. Confirm decision 1 in §2 (prefix/scope) before you create anything.
3. Create `GENAnnouncementUtil` (§4).
4. Create the widget — **Service Portal > Widgets > New**. Name `GEN Announcement Bar`, ID `gen-announcement-bar`, Has preview **off** (needs portal context), Public **on** only if it must render on the login page.
5. Paste §5–§9 into Server script / Client controller / Body HTML template / CSS - SCSS / Option schema.
6. Drop it on a page in Page Designer — full-width container, top row, its own row.
7. Set the **Portal** option on the instance if targeting a portal other than the one it renders on.
8. Work §11 top to bottom.
