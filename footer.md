# genC Footer Widget — Solution

**Widget:** genC Footer
**Date:** 06/10/2026
**Scope:** Add Stay Connected social section, grayscale gen seal watermark, remove dark mode, markup/CSS cleanup, mobile & tablet responsiveness.

---

## Summary of Changes

| Change | Detail |
|---|---|
| Stay Connected section | New social link row (Facebook, X, YouTube, LinkedIn, Instagram, Flickr) driven by a hardcoded array in the Server Script. Font Awesome 4 icons preferred; `image` property as fallback for platforms with no FA glyph (X). |
| Seal watermark | Existing `x_g_gen_gen_exte_0.gen-logo.png` repositioned as an absolutely-positioned, grayscale, low-opacity watermark anchored to the right of the footer. |
| Dark mode removed | `ng-class` hook off root div, `$rootScope.$on("color_theme_dark")` listener and `c.state` removed from Client Script, entire `.dark {}` SCSS block deleted. |
| Markup cleanup | Removed invalid `<img>`-inside-`<ul>`; removed inert `li:after` separator rules; removed unused `.footer-tag` styles; social icons are proper `ul > li > a` structure. |
| Accessibility | `aria-label` on each social anchor, `aria-hidden` + empty `alt` on decorative icons/images, `rel="noopener noreferrer"` on external links, `pointer-events: none` on watermark. |
| Responsive | Breakpoints at 1170px (watermark shrinks), 906px (column stack, left-aligned social), 600px (single-column links, centered social, watermark hidden). |

---

## HTML Template

```html
<!--genC Satisfaction Drawer widget-->
<sp-widget widget="data.satisfactionDrawer"></sp-widget>
<!--footer-->
<div class="genc-footer grid">
  <div class="genc-footer-content">

    <!-- grayscale gen seal watermark -->
    <img class="footer-seal" src="x_g_gen_gen_exte_0.gen-logo.png" alt="" aria-hidden="true" />

    <div class="flex link-container">

      <!-- footer menu links -->
      <div class="footer-box">
        <ul class="footer-list-grid">
          <li ng-repeat="itm in data.menu_items track by itm.sys_id">
            <a href="{{ itm.href }}" target="{{ itm.url_target }}" class="font-title-md">{{ itm.label }}</a>
          </li>
        </ul>
      </div>

      <!-- stay connected / social -->
      <div class="footer-box stay-connected">
        <p class="stay-connected-title font-title-md">Stay Connected</p>
        <ul class="social-list">
          <li ng-repeat="soc in data.social_links track by soc.label">
            <a href="{{ soc.href }}" target="_blank" rel="noopener noreferrer"
               class="social-icon" aria-label="gen on {{ soc.label }}">
              <i ng-if="soc.icon" class="fa {{ soc.icon }}" aria-hidden="true"></i>
              <img ng-if="!soc.icon && soc.image" ng-src="{{ soc.image }}" class="social-icon-img" alt="" aria-hidden="true" />
            </a>
          </li>
        </ul>
      </div>

    </div>
  </div>
  <div class='cui-banner'>
    <span class='title-small'>CUI -</span><span class='body-small'>This page contains dynamic content and may include Controlled Unclassified Information.</span>
  </div>
</div>
```

---

## Server Script

```javascript
(function() {

  data.satisfactionDrawer = $sp.getWidget('genc_satisfaction_drawer', {"visit_count": '3'});

  // OOB api fetches menu items from a set portal menu
  // health scans dictate that we use system properties to store sys_ids rather than hardcoding
  data.menu_items = $sp.getMenuItems(gs.getProperty('x_g_gen_gen_connec.portal.menu.footer_menu_id')).filter(function(itm) {
    return itm.active;
  }).sort(function(a, b) {
    return a.order - b.order;
  });

  // Stay Connected social links (URLs are not sys_ids; safe to hardcode per scan guidance)
  // icon  = Font Awesome 4 class (preferred)
  // image = image asset fallback when no FA glyph exists (e.g. X)
  data.social_links = [
    { label: 'Facebook',  href: 'https://www.facebook.com/gen.mil',          icon: 'fa-facebook',     image: null },
    { label: 'X',         href: 'https://x.com/genmil',                      icon: null,              image: 'x_g_gen_gen_exte_0.x-logo.png' },
    { label: 'YouTube',   href: 'https://www.youtube.com/user/dodlogistics', icon: 'fa-youtube-play', image: null },
    { label: 'LinkedIn',  href: 'https://www.linkedin.com/company/defense-logistics-agency', icon: 'fa-linkedin', image: null },
    { label: 'Instagram', href: 'https://www.instagram.com/gen.mil',         icon: 'fa-instagram',    image: null },
    { label: 'Flickr',    href: 'https://www.flickr.com/photos/genmil',      icon: 'fa-flickr',       image: null }
  ];

})();
```

---

## Client Script

```javascript
api.controller = function(cdaAnalytics) {

  // gen Connect Content Analytics portal load event
  cdaAnalytics.getTracker('gen Connect Tracker').then(function(tracker){
    if (tracker) {
      tracker.trackEvent("connect", 'portal-load', 'gen Connect Load', null, 'gen Connect');
    }
  });

};
```

---

## CSS - SCSS

```scss
.genc-footer {
  position: relative;
}

.genc-footer-content {
  position: relative;
  padding: $padding 0;
  background: $color-white;
  overflow: hidden; // contain the watermark
}

// grayscale seal watermark, anchored right
.footer-seal {
  position: absolute;
  right: 2rem;
  top: 50%;
  transform: translateY(-50%);
  height: 130%;
  width: auto;
  filter: grayscale(1);
  opacity: 0.12;
  pointer-events: none;
  user-select: none;
}

.link-container {
  position: relative; // sit above the watermark
  z-index: 1;
  width: 90%;
  justify-content: space-between;
  align-items: center;
  padding-left: 2%;
  padding-right: 2%;
  flex-wrap: wrap;
  display: flex;
  gap: 24px;
}

.footer-box {
  min-width: max-content;
}

// ---- menu links ----
.footer-list-grid {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(5, auto);
  gap: 16px 48px;
  list-style: none;
  margin: 0;
  padding: 0;
}

li {
  font-weight: 500;
  a {
    padding: 4px;
    border: 2px solid transparent;
    border-radius: 4px;
    text-decoration: none;
    font-weight: 700;
    font-size: 14px;
    color: #084476 !important;
    transition: all 0.15s ease-in-out;
    &:hover, &:focus {
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 2px;
      color: $color-primary-800 !important;
    }
  }
}

// ---- stay connected ----
.stay-connected {
  text-align: center;
}

.stay-connected-title {
  font-weight: 700;
  font-size: 16px;
  color: #084476;
  margin: 0 0 12px;
}

.social-list {
  display: flex;
  align-items: center;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.social-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #084476;
  color: $color-white !important;
  font-size: 16px;
  text-decoration: none;
  transition: all 0.15s ease-in-out;

  &:hover, &:focus {
    background: $color-primary-800;
    color: $color-white !important;
    text-decoration: none;
    outline-offset: 2px;
  }
}

.social-icon-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  // white-on-navy to match the FA icons; works if the asset is dark/black
  filter: brightness(0) invert(1);
}

// ---- responsive ----

// tablet: watermark shrinks, padding widens
@media (max-width: 1170px) {
  .link-container {
    padding-left: 5%;
  }
  .footer-seal {
    height: 100%;
    opacity: 0.08;
  }
}

@media (max-width: 906px) {
  .link-container {
    flex-direction: column;
    align-items: flex-start;
    padding-left: 2%;
  }
  .stay-connected {
    text-align: left;
    width: 100%;
  }
}

// mobile: single-column links, centered social
@media (max-width: 600px) {
  .footer-list-grid {
    grid-auto-flow: row;
    grid-template-rows: none;
  }
  .stay-connected {
    text-align: center;
  }
  .social-list {
    justify-content: center;
    flex-wrap: wrap;
  }
  .footer-seal {
    display: none; // too noisy behind stacked content on small screens
  }
}
```

---

## Implementation Notes

**`ng-src` not `src` on fallback images.** Plain `src` with `{{ }}` interpolation fires a 404 for the literal template string before Angular compiles. The `ng-if` guards ensure exactly one of icon/image renders per link.

**X logo asset required.** `x_g_gen_gen_exte_0.x-logo.png` is a placeholder name following the existing db_image convention. Upload an X logo PNG/SVG to `db_image` with that name (or update the array to match the real name). The `filter: brightness(0) invert(1)` on `.social-icon-img` forces any dark asset to render white inside the navy circle — drop that line if the uploaded asset is already white.

**Font Awesome 4 constraint.** Service Portal ships FA4, which predates the X rebrand — `fa-twitter` (the bird) exists, but no X glyph. The `image` fallback property exists for exactly this case and any future platform additions.

**Social URLs are placeholders from public knowledge.** Confirm the final URL list against the comms team before promoting.

**Link grid sizing.** `grid-template-rows: repeat(5, auto)` matches the mockup (5 links in column one, 4 in column two). The grid flows automatically if the menu count changes; for fully dynamic balancing, compute rows from `data.menu_items.length` server-side instead.

**Watermark layering.** `.link-container` carries `z-index: 1` so links and icons sit above the seal; the seal has `pointer-events: none` so it never intercepts clicks; `overflow: hidden` on `.genc-footer-content` clips the oversized (130% height) bleed.

## Testing Checklist

- [ ] Footer menu links render from portal menu (system property `x_g_gen_gen_connec.portal.menu.footer_menu_id`) sorted by order, active only
- [ ] All six social icons render; X shows image fallback in white inside navy circle
- [ ] Each social link opens correct destination in a new tab
- [ ] Seal watermark appears grayscale/faded on right, does not block link clicks
- [ ] Satisfaction drawer widget still loads at top of footer
- [ ] CUI banner renders at bottom
- [ ] No dark-mode behavior remains when portal theme toggles
- [ ] Tablet (~906–1170px): content stacks left-aligned, watermark reduced
- [ ] Mobile (<600px): links single column, social centered and wrapping, watermark hidden
- [ ] Screen reader announces "gen on [platform]" for each social link
- [ ] Analytics `portal-load` event still fires (gen Connect Tracker)
