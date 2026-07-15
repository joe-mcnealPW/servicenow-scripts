# Solution — Announcement Bar (Complete Widget)

> **Companion doc:** `servicenow-announcement-dismissal-analysis.md` (the OOB dismissal research this is built on).
> This document contains the **complete, drop-in code** for each part. Each section below is the whole file, not a diff — paste it in wholesale.
>
> **Widget:** Announcement Bar · **Widget ID:** `gen-announcement-bar` · **Script Include:** `GENAnnouncementUtil` · **Scope:** *see decision 1*

---

## 1. What this delivers

A full-width horizontal bar that renders active announcements from the OOB `announcement` tables for a **portal you name in the widget options** — not necessarily the portal it's rendered on. Users dismiss with an X, and the dismissal behaves exactly as the announcement record is configured: session-only, permanent, or not at all.

Session dismissals go to `localStorage` under the OOB key convention (`dismissed_announcement_<sys_id>` = current session ID). Permanent dismissals write a row to the OOB `m2m_dismissed_announcement` table. Both storage contracts are ServiceNow's own, so this widget is a peer of the OOB banner rather than a fork of it.

Multiple announcements collapse to one line with a `1 / 3` counter that expands. Zero announcements renders **nothing** — no empty strip, no layout shift.

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
8. **No skeleton, and no empty state** — see §10. Both are deliberate deviations from the standard for this widget specifically.

---

## 3. Pre-flight — verify before you build

Four schema facts I could not confirm from ServiceNow's shipped source. All four are isolated in the `CONFIG` block at the top of the Script Include.

**The one that matters.** Run in Scripts - Background:

```javascript
var gr = new GlideRecord('sys_choice');
gr.addQuery('name', 'announcement');
gr.addQuery('element', 'dismiss_options');
gr.orderBy('sequence');
gr.query();
while (gr.next())
	gs.info(gr.getValue('value') + '  =  ' + gr.getValue('label'));
```

You want the **non-dismissible** value → `CONFIG.DISMISS_NEVER`. `SESSION_DISMISSIBLE` is already confirmed (it's a hardcoded literal in ServiceNow's own `service.spAnnouncement.js`), and `_dismissMode()` mirrors OOB's "not session ⇒ server-side dismissal" logic so the *permanent* value never has to be named. **`DISMISS_NEVER` is the only value the logic depends on.** Get it wrong and an X renders on announcements that shouldn't have one.

**The other three** (cosmetic, and obvious when wrong):

```javascript
var d = new GlideRecord('m2m_dismissed_announcement');
d.initialize();
gs.info('m2m_dismissed_announcement: ' + Object.keys(d).join(', '));

var s = new GlideRecord('announcement_style');
s.query(); s.next();
gs.info('announcement_style: ' + Object.keys(s).join(', '));

var a = new GlideRecord('announcement');
a.initialize();
gs.info('announcement: ' + Object.keys(a).join(', '));
```

→ `CONFIG.DISMISSED_ANN` / `DISMISSED_USER`, `CONFIG.STYLE_*`, `CONFIG.LINK_PAGE`.

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
	 * Everything in this block is schema that could NOT be confirmed from
	 * ServiceNow's shipped source. Verify against the instance before go-live
	 * (see §3 of solution.md). Everything outside this block is confirmed.
	 * If something breaks, look here first.
	 */
	CONFIG: {

		/* announcement.dismiss_options choice VALUES (not labels).
		 *
		 * SESSION is CONFIRMED — hardcoded as a string literal inside
		 * ServiceNow's own /scripts/app.$sp/service.spAnnouncement.js.
		 *
		 * NEVER is the ONE value that must be verified. Note there is
		 * deliberately no "PERMANENT" constant: _dismissMode() mirrors OOB's
		 * own "anything that isn't session ⇒ server-side dismissal" logic, so
		 * that value never gets named and can't be got wrong. */
		DISMISS_SESSION: 'SESSION_DISMISSIBLE',   // confirmed
		DISMISS_NEVER: 'NOT_DISMISSIBLE',         // VERIFY — see §3

		/* m2m_dismissed_announcement field names */
		DISMISSED_ANN: 'announcement',            // VERIFY
		DISMISSED_USER: 'user',                   // VERIFY

		/* announcement_style field names */
		STYLE_BG: 'background_color',             // VERIFY
		STYLE_FG: 'foreground_color',             // VERIFY
		STYLE_ALIGN: 'alignment',                 // VERIFY

		/* announcement link fields */
		LINK_URL: 'details_url',                  // confirmed
		LINK_TEXT: 'details_link_text',           // confirmed
		LINK_PAGE: 'details_page',                // VERIFY — page-type click targets only

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
			dismissMode: mode,
			dismissed: mode == 'permanent' && !!dismissedSet[id],
			style: useDisplayStyle ? this._resolveStyle(gr.getValue('display_style')) : null,
			link: this._resolveLink(gr)
		};
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
	 * @return {string} 'session' | 'permanent' | 'none'
	 */
	_dismissMode: function(raw) {
		if (!raw || raw == this.CONFIG.DISMISS_NEVER) return 'none';
		if (raw == this.CONFIG.DISMISS_SESSION) return 'session';
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
	data.msg = {
		dismiss: gs.getMessage('Dismiss'),
		showAll: gs.getMessage('Show all announcements'),
		showLess: gs.getMessage('Show fewer announcements'),
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
api.controller = function($scope, $rootScope, $window, spUtil) {
	var c = this;

	/* Same key convention as OOB's service.spAnnouncement.js. Two things come
	 * free from matching it: OOB's _cleanupStorage() housekeeps our keys, and
	 * a session dismissal here is honoured by the OOB banner on next page load
	 * (and vice versa). Limits of that in §10 of solution.md. */
	var KEY_PREFIX = 'dismissed_announcement_';
	var SESSION_ID = ($window.NOW && $window.NOW.session_id) || '';
	var DISMISS_EVENT = 'gen.announcement.bar.dismissed';

	c.showAll = false;
	c.visible = [];
	c.shown = [];
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

	function refresh() {
		c.visible = (c.data.announcements || []).filter(function(a) {
			if (a.dismissed) return false;                                     // server: m2m row exists
			if (usesSessionPath(a) && isSessionDismissed(a.id)) return false;  // client: this session
			return true;
		});
		c.total = c.visible.length;
		c.shown = c.showAll ? c.visible : c.visible.slice(0, 1);
	}

	c.toggleShowAll = function() {
		c.showAll = !c.showAll;
		refresh();
	};


	/* ──────────────────────────────────────────────
	 * Dismiss
	 * ────────────────────────────────────────────── */

	c.dismiss = function(a, $event) {
		if ($event) {
			$event.preventDefault();
			$event.stopPropagation();
		}
		if (a.dismissMode === 'none') return;

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
			$rootScope.$broadcast(DISMISS_EVENT, { id: a.id });
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
			$rootScope.$broadcast(DISMISS_EVENT, { id: a.id });
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
		if (!a.style) return {};   // no display style → inherit portal theme via CSS
		return {
			'background-color': a.style.background,
			'color': a.style.foreground
		};
	};

	c.isCentered = function(a) {
		return !!(a.style && a.style.alignment === 'center');
	};
};
```

---

## 7. Body HTML template

```html
<!-- Error state. Empty and loading states render nothing by design — see §10. -->
<div class="ann-bar" ng-if="!c.data.isLoading && c.data.error">
	<div class="ann-bar__item ann-bar__item--error">
		<div class="ann-bar__body">
			<span class="ann-bar__text">{{c.data.error}}</span>
		</div>
	</div>
</div>

<div class="ann-bar"
	 ng-if="!c.data.isLoading && !c.data.error && c.total > 0"
	 ng-class="{'ann-bar--sticky': c.data.sticky}">

	<div class="ann-bar__item"
		 ng-repeat="a in c.shown track by a.id"
		 ng-style="c.styleFor(a)"
		 ng-class="{'ann-bar__item--centered': c.isCentered(a),
					'ann-bar__item--expanded': c.showAll}"
		 role="region"
		 aria-live="polite"
		 aria-label="{{a.title}}">

		<div class="ann-bar__body">
			<span class="ann-bar__text">
				<span class="ann-bar__title">{{a.title}}</span>
				<span class="ann-bar__summary" ng-if="a.summary">{{a.summary}}</span>
			</span>
		</div>

		<a class="ann-bar__link"
		   ng-if="a.link"
		   ng-href="{{a.link.url}}"
		   target="{{a.link.target}}"
		   rel="noopener noreferrer">
			{{a.link.text || a.title}}
			<i class="fa fa-external-link" aria-hidden="true" ng-if="a.link.target === '_blank'"></i>
		</a>

		<button type="button"
				class="ann-bar__count"
				ng-if="c.total > 1 && $first"
				ng-click="c.toggleShowAll()"
				aria-expanded="{{c.showAll}}"
				aria-label="{{c.showAll ? c.data.msg.showLess : c.data.msg.showAll}}">
			<span ng-if="!c.showAll">1 / {{c.total}}</span>
			<span ng-if="c.showAll">{{c.total}}</span>
			<i class="fa" ng-class="c.showAll ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true"></i>
		</button>

		<button type="button"
				class="ann-bar__dismiss"
				ng-if="a.dismissMode !== 'none'"
				ng-click="c.dismiss(a, $event)"
				aria-label="{{c.data.msg.dismiss}}: {{a.title}}">
			<i class="fa fa-times" aria-hidden="true"></i>
		</button>

	</div>
</div>
```

**Two notes on the markup.** There is no `ng-bind-html` anywhere — summary is stripped server-side, so no `$sce` and no XSS surface. And there is deliberately **no jQuery tooltip binding**: that's the source of the `cannot call methods on tooltip prior to initialization` bug that breaks the OOB dismiss X on Utah/Vancouver. We don't inherit it because we don't copy it.

---

## 8. CSS - SCSS

```scss
/* Horizontal bar — full bleed, content-height, zero footprint when empty. */
.ann-bar {
	width: 100%;
}

.ann-bar--sticky {
	position: sticky;
	top: 0;
	z-index: 1030;   /* above Bootstrap 3 content, below modals (1040+) */
}

.ann-bar__item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	width: 100%;
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

.ann-bar__body {
	flex: 1 1 auto;
	min-width: 0;   /* REQUIRED — without it a flex child refuses to shrink and
					   text-overflow: ellipsis silently does nothing. */
}

.ann-bar__item--centered .ann-bar__body {
	text-align: center;
}

/* Collapsed: one clean line. Expanded: let it breathe. */
.ann-bar__text {
	display: block;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.ann-bar__item--expanded .ann-bar__text {
	white-space: normal;
	overflow: visible;
}

.ann-bar__title {
	font-weight: 600;
}

.ann-bar__summary {
	opacity: 0.9;
	margin-left: 8px;
}

.ann-bar__link {
	flex: 0 0 auto;
	color: inherit;
	text-decoration: underline;
	white-space: nowrap;
	opacity: 0.95;

	&:hover,
	&:focus {
		color: inherit;
		opacity: 1;
	}
}

.ann-bar__count,
.ann-bar__dismiss {
	flex: 0 0 auto;
	background: transparent;
	border: 0;
	color: inherit;
	opacity: 0.75;
	padding: 4px 8px;
	border-radius: 3px;
	transition: opacity 0.15s ease, background-color 0.15s ease;

	&:hover {
		opacity: 1;
		background-color: rgba(255, 255, 255, 0.15);
	}

	/* Visible keyboard focus — currentColor works against any Display Style. */
	&:focus {
		outline: 2px solid currentColor;
		outline-offset: 1px;
		opacity: 1;
	}
}

.ann-bar__count {
	font-size: 12px;
	font-weight: 600;
	white-space: nowrap;

	i {
		margin-left: 4px;
	}
}

.ann-bar__dismiss {
	font-size: 16px;
	line-height: 1;
}

/* Below tablet: stack, and let the text wrap rather than truncate to nothing. */
@media (max-width: 767px) {
	.ann-bar__item {
		flex-wrap: wrap;
		gap: 8px;
		padding: 10px 12px;
	}

	.ann-bar__body {
		flex: 1 1 100%;
		order: 1;
	}

	.ann-bar__text {
		white-space: normal;
	}

	.ann-bar__link {
		order: 2;
	}

	.ann-bar__count {
		order: 3;
		margin-left: auto;
	}

	.ann-bar__dismiss {
		order: 0;
		margin-left: auto;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ann-bar__count,
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
	}
]
```

> `reference` options return a sys_id string. Booleans arrive as the **strings** `'true'` / `'false'` — which is why the server script compares against `'true'` rather than truthiness.

---

## 10. Deliberate deviations — read before you review

**Two departures from our own widget standard**, both specific to this widget:

- **No skeleton on load.** The standard says skeleton while `isLoading`. But this bar is empty most of the time — a skeleton would flash a fake bar on every page load and then vanish, which is worse than nothing and causes layout shift on every page in the portal. It renders nothing until it has content. One `ng-if` to add back if you disagree.
- **No empty state.** Zero announcements renders nothing. An "no announcements to show" strip across the top of the portal would be absurd. The error state is present per the standard, though it's arguably too loud for a non-critical decoration — remove the first `ng-if` block in the template if you'd rather it fail silently.

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
- [ ] Three → "1 / 3", expands, collapses
- [ ] Long title → ellipsis collapsed, wraps expanded
- [ ] Sticky on → pins, doesn't cover modals
- [ ] Display Style colors apply; option off → theme fallback
- [ ] Tab to the X, press Enter → dismisses, focus ring visible against the Display Style background
- [ ] < 768px → stacks, wraps

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
