---
description: daisyUI CSS library style guide
---

# daisyUI 5
daisyUI 5 is a CSS library for Tailwind CSS 4
daisyUI 5 provides class names for common UI components

- [daisyUI 5 docs](http://daisyui.com)
- [Guide: How to use this file in LLMs and code editors](https://daisyui.com/docs/editor/)
- [daisyUI 5 release notes](https://daisyui.com/docs/v5/)
- [daisyUI 4 to 5 upgrade guide](https://daisyui.com/docs/upgrade/)

## daisyUI 5 install notes
[install guide](https://daisyui.com/docs/install/)
1. daisyUI 5 requires Tailwind CSS 4
2. `tailwind.config.js` file is deprecated in Tailwind CSS v4. do not use `tailwind.config.js`. Tailwind CSS v4 only needs `@import "tailwindcss";` in the CSS file if it's a node dependency.
3. daisyUI 5 can be installed using `npm i -D daisyui@latest` and then adding `@plugin "daisyui";` to the CSS file
4. daisyUI is suggested to be installed as a dependency but if you really want to use it from CDN, you can use Tailwind CSS and daisyUI CDN files:
```html
<link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```
5. A CSS file with Tailwind CSS and daisyUI looks like this (if it's a node dependency)
```css
@import "tailwindcss";
@plugin "daisyui";
```

## daisyUI 5 usage rules
1. We can give styles to a HTML element by adding daisyUI class names to it. By adding a component class name, part class names (if there's any available for that component), and modifier class names (if there's any available for that component)
2. Components can be customized using Tailwind CSS utility classes if the customization is not possible using the existing daisyUI classes. For example `btn px-10` sets a custom horizontal padding to a `btn`
3. If customization of daisyUI styles using Tailwind CSS utility classes didn't work because of CSS specificity issues, you can use the `!` at the end of the Tailwind CSS utility class to override the existing styles. For example `btn bg-red-500!` sets a custom background color to a `btn` forcefully. This is a last resort solution and should be used sparingly
4. If a specific component or something similar to it doesn't exist in daisyUI, you can create your own component using Tailwind CSS utility
5. when using Tailwind CSS `flex` and `grid` for layout, it should be responsive using Tailwind CSS responsive utility prefixes.
6. Only allowed class names are existing daisyUI class names or Tailwind CSS utility classes.
7. Ideally, you won't need to write any custom CSS. Using daisyUI class names or Tailwind CSS utility classes is preferred.
8. suggested - if you need placeholder images, use https://picsum.photos/200/300 with the size you want
9. suggested - when designing , don't add a custom font unless it's necessary
10. don't add `bg-base-100 text-base-content` to body unless it's necessary
11. For design decisions, use Refactoring UI book best practices

daisyUI 5 class names are one of the following categories. these type names are only for reference and are not used in the actual code
- `component`: the required component class
- `part`: a child part of a component
- `style`: sets a specific style to component or part
- `behavior`: changes the behavior of component or part
- `color`: sets a specific color to component or part
- `size`: sets a specific size to component or part
- `placement`: sets a specific placement to component or part
- `direction`: sets a specific direction to component or part
- `modifier`: modifies the component or part in a specific way

## Config
daisyUI 5 config docs: https://daisyui.com/docs/config/
daisyUI without config:
```css
@plugin "daisyui";
```
daisyUI config with `light` theme only:
```css
@plugin "daisyui" {
  themes: light --default;
}
```
daisyUI with all the default configs:
```css
@plugin "daisyui" {
  themes: light --default, dark --prefersdark;
  root: ":root";
  include: ;
  exclude: ;
  prefix: ;
  logs: true;
}
```
An example config:
In below config, all the built-in themes are enabled while bumblebee is the default theme and synthwave is the prefersdark theme (default dark mode)
All the other themes are enabled and can be used by adding `data-theme="THEME_NAME"` to the `<html>` element
root scrollbar gutter is excluded. `daisy-` prefix is used for all daisyUI classes and console.log is disabled
```css
@plugin "daisyui" {
  themes: light, dark, cupcake, bumblebee --default, emerald, corporate, synthwave --prefersdark, retro, cyberpunk, valentine, halloween, garden, forest, aqua, lofi, pastel, fantasy, wireframe, black, luxury, dracula, cmyk, autumn, business, acid, lemonade, night, coffee, winter, dim, nord, sunset, caramellatte, abyss, silk;
  root: ":root";
  include: ;
  exclude: rootscrollgutter, checkbox;
  prefix: daisy-;
  logs: false;
}
```
## daisyUI 5 colors

### daisyUI color names
- `primary`: Primary brand color, The main color of your brand
- `primary-content`: Foreground content color to use on primary color
- `secondary`: Secondary brand color, The optional, secondary color of your brand
- `secondary-content`: Foreground content color to use on secondary color
- `accent`: Accent brand color, The optional, accent color of your brand
- `accent-content`: Foreground content color to use on accent color
- `neutral`: Neutral dark color, For not-saturated parts of UI
- `neutral-content`: Foreground content color to use on neutral color
- `base-100`:-100 Base surface color of page, used for blank backgrounds
- `base-200`:-200 Base color, darker shade, to create elevations
- `base-300`:-300 Base color, even more darker shade, to create elevations
- `base-content`: Foreground content color to use on base color
- `info`: Info color, For informative/helpful messages
- `info-content`: Foreground content color to use on info color
- `success`: Success color, For success/safe messages
- `success-content`: Foreground content color to use on success color
- `warning`: Warning color, For warning/caution messages
- `warning-content`: Foreg