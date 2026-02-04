# Skeleton Loading System

A standardized, pulse-style skeleton loading component library for consistent loading states across your website.

## Features

- 🎯 **Pulse animation** - Clean, minimal fade effect
- 📦 **Modular components** - Mix and match skeleton shapes
- 📱 **Responsive** - Works on all screen sizes
- ♿ **Accessible** - Respects `prefers-reduced-motion`
- 🎨 **Customizable** - Easy to theme and modify
- 🚀 **Lightweight** - Pure CSS, no dependencies

## Installation

1. Include the CSS file in your HTML:
```html
<link rel="stylesheet" href="skeleton-loading.css">
```

2. Add skeleton elements to your markup where loading states are needed.

## Basic Usage

### Text Lines
```html
<div class="skeleton skeleton-text"></div>
<div class="skeleton skeleton-text skeleton-2-3"></div>
```

**Note:** Skeleton elements have no default margins. Control spacing using container gap properties (e.g., `display: flex; flex-direction: column; gap: 8px;`) or add margin utilities as needed.

### Avatar
```html
<div class="skeleton skeleton-avatar"></div>
```

### Title/Heading
```html
<div class="skeleton skeleton-title"></div>
```

### Button
```html
<div class="skeleton skeleton-button"></div>
```

## Common Patterns

### 1. Card Pattern
Perfect for user profiles, comments, or posts:
```html
<div class="skeleton-card">
    <div class="skeleton skeleton-avatar-lg"></div>
    <div class="skeleton-card-content">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text skeleton-3-4"></div>
    </div>
</div>
```

The `skeleton-card-content` already has `gap: 8px` for spacing between elements.

### 2. List Pattern
For navigation or item lists:
```html
<div class="skeleton-list-item">
    <div class="skeleton skeleton-icon"></div>
    <div class="skeleton skeleton-text" style="flex: 1;"></div>
</div>
```

### 3. Table Pattern
For data tables:
```html
<div class="skeleton-table-row" style="grid-template-columns: 1fr 2fr 1fr 1fr;">
    <div class="skeleton skeleton-table-cell"></div>
    <div class="skeleton skeleton-table-cell"></div>
    <div class="skeleton skeleton-table-cell"></div>
    <div class="skeleton skeleton-table-cell"></div>
</div>
```

### 4. Grid Pattern
For product grids or image galleries:
```html
<div class="skeleton-grid">
    <div class="skeleton-grid-item">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
    </div>
</div>
```

### 5. Form Pattern
For loading forms:
```html
<div class="skeleton-form-group">
    <div class="skeleton skeleton-form-label"></div>
    <div class="skeleton skeleton-input"></div>
</div>
<div class="skeleton skeleton-button"></div>
```

## Available Classes

### Base Classes
- `.skeleton` - Base skeleton element (required)

### Text & Content
- `.skeleton-text` - Standard text line (14px height)
- `.skeleton-text-lg` - Large text (16px)
- `.skeleton-text-md` - Medium text (12px)
- `.skeleton-text-sm` - Small text (10px)
- `.skeleton-title` - Title/heading (20px height, 70% width)
- `.skeleton-heading` - Large heading (24px height, 60% width)
- `.skeleton-paragraph` - Text block container

### Width Utilities
- `.skeleton-full` - 100% width
- `.skeleton-3-4` - 75% width
- `.skeleton-2-3` - 67% width
- `.skeleton-1-2` - 50% width
- `.skeleton-1-3` - 33% width
- `.skeleton-1-4` - 25% width

### Avatars
- `.skeleton-avatar-sm` - 32px circle
- `.skeleton-avatar` - 40px circle
- `.skeleton-avatar-md` - 48px circle
- `.skeleton-avatar-lg` - 64px circle
- `.skeleton-avatar-xl` - 96px circle

### Images
- `.skeleton-image-sm` - 120px height
- `.skeleton-image-md` - 160px height
- `.skeleton-image` - 200px height
- `.skeleton-image-lg` - 300px height

### Shapes
- `.skeleton-icon` - 24px square icon
- `.skeleton-square-sm` - 32px square
- `.skeleton-square-md` - 40px square
- `.skeleton-square` - 48px square
- `.skeleton-square-lg` - 64px square

### Buttons & Inputs
- `.skeleton-button-sm` - Small button (28px height)
- `.skeleton-button-md` - Medium button (32px height)
- `.skeleton-button` - Standard button (36px height)
- `.skeleton-button-lg` - Large button (44px height)
- `.skeleton-input-sm` - Small input (32px height)
- `.skeleton-input-md` - Medium input (36px height)
- `.skeleton-input` - Standard input (40px height)

### Layout Components
- `.skeleton-card` - Card container with flex layout
- `.skeleton-card-content` - Card content area
- `.skeleton-list-item` - List item with icon + text
- `.skeleton-table-row` - Table row grid
- `.skeleton-table-cell` - Table cell
- `.skeleton-grid` - Responsive grid container
- `.skeleton-grid-item` - Grid item container
- `.skeleton-form-group` - Form field group
- `.skeleton-header` - Page header layout

### Spacing Utilities
- `.skeleton-mb-1` - margin-bottom: 4px
- `.skeleton-mb-2` - margin-bottom: 8px
- `.skeleton-mb-3` - margin-bottom: 12px
- `.skeleton-mb-4` - margin-bottom: 16px
- `.skeleton-mb-5` - margin-bottom: 20px

### Animation Speed
- `.skeleton-slow` - Slower animation (2.5s)
- `.skeleton-fast` - Faster animation (1s)
- Default: 1.5s

### Theme Variants
- `.skeleton-theme-light` - Light background (default)
- `.skeleton-theme-dark` - Dark background
- `.skeleton-on-white` - For white backgrounds
- `.skeleton-on-gray` - For gray backgrounds
- `.skeleton-on-dark` - For dark backgrounds

## JavaScript Integration

### React Example
```jsx
function UserCard({ loading, user }) {
  if (loading) {
    return (
      <div className="skeleton-card">
        <div className="skeleton skeleton-avatar-lg"></div>
        <div className="skeleton-card-content">
          <div className="skeleton skeleton-title"></div>
          <div className="skeleton skeleton-text"></div>
          <div className="skeleton skeleton-text skeleton-3-4"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="user-card">
      <img src={user.avatar} alt={user.name} />
      <div>
        <h3>{user.name}</h3>
        <p>{user.bio}</p>
      </div>
    </div>
  );
}
```

### AngularJS Example
```html
<div ng-if="loading" class="skeleton-card">
    <div class="skeleton skeleton-avatar-lg"></div>
    <div class="skeleton-card-content">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text skeleton-3-4"></div>
    </div>
</div>

<div ng-if="!loading" class="user-card">
    <img ng-src="{{user.avatar}}" />
    <div>
        <h3>{{user.name}}</h3>
        <p>{{user.bio}}</p>
    </div>
</div>
```

### ServiceNow Widget Example
```javascript
// Client Script
function($scope) {
    $scope.loading = true;
    
    $scope.server.get().then(function(response) {
        $scope.data = response.data;
        $scope.loading = false;
    });
}
```

```html
<!-- Widget Template -->
<div ng-if="c.loading" class="skeleton-card">
    <div class="skeleton skeleton-avatar"></div>
    <div class="skeleton-card-content">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text skeleton-2-3"></div>
    </div>
</div>

<div ng-if="!c.loading" class="actual-content">
    <!-- Your actual content here -->
</div>
```

## Customization

### Changing Colors
```css
/* Override in your own CSS */
.skeleton {
    background-color: #d0d0d0; /* Custom gray */
}
```

### Changing Animation Speed
```css
.skeleton {
    animation-duration: 2s; /* Slower */
}
```

### Changing Animation Style
```css
/* Example: Change to shimmer effect */
.skeleton {
    background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
```

## Best Practices

1. **Match the layout**: Skeleton should mirror your actual content structure
2. **Use appropriate widths**: Vary text line widths (full, 3/4, 2/3, 1/2) for natural appearance
3. **Control spacing with containers**: Use `gap` (flexbox/grid) or margin utilities instead of relying on default margins
4. **Maintain hierarchy**: Use larger skeleton elements for titles/headings
5. **Consistent spacing**: Match gaps and padding of real content
6. **Don't overdo it**: Show skeleton only for initial loads, not every update

### Spacing Examples
```html
<!-- Using flexbox gap -->
<div style="display: flex; flex-direction: column; gap: 8px;">
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text skeleton-2-3"></div>
</div>

<!-- Using margin utilities -->
<div>
    <div class="skeleton skeleton-text skeleton-mb-2"></div>
    <div class="skeleton skeleton-text skeleton-mb-2"></div>
    <div class="skeleton skeleton-text skeleton-2-3"></div>
</div>
```

## Accessibility

The skeleton automatically respects `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
    .skeleton {
        animation: none;
        opacity: 0.7;
    }
}
```

Users who prefer reduced motion will see a static skeleton instead of the pulsing animation.

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- IE11: ⚠️ Requires autoprefixer for animations

## Tips for ServiceNow

1. Add the CSS to your theme or widget SCSS
2. Use `ng-if` to toggle between skeleton and content
3. Set `loading` state in client script
4. Match skeleton to your GlideRecord query structure

## Examples

See `skeleton-loading-demo.html` for live examples of all patterns and components.

## License

Free to use in personal and commercial projects.
