Simple approach targeting the key attributes:
css/* Hide spans with ng-scope class that contain empty divs with widget="widget" */
span.ng-scope:has(> div[widget="widget"]:empty) {
  display: none;
}

/* Fallback for browsers without :has() support */
span.ng-scope > div[widget="widget"]:empty {
  display: none;
}
Even simpler if you want to be more general:
css/* Target any span with ng-scope containing empty widget divs */
.ng-scope:has(> [widget="widget"]:empty) {
  display: none;
}

/* Fallback */
.ng-scope > [widget="widget"]:empty {
  display: none;
}
Or if you want to target the pattern more broadly:
css/* Hide any container with ng-scope that has empty widget children */
span.ng-scope:has(div[widget="widget"]:empty:only-child) {
  display: none;
}

/* Fallback - just hide the empty widget div itself */
span.ng-scope > div[widget="widget"]:empty:only-child {
  display: none;
}
