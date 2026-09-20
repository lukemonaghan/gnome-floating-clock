# GNOME Floating Clock

A GNOME Shell extension that shows a small floating clock on top of your windows when the top bar's clock isn't visible. Compatible with GNOME Shell 45–50.

## Why it exists

The top bar clock disappears when a window goes fullscreen. This extension floats a clock above everything in those moments so you can check the time without leaving your game, video or presentation.

By default the clock is **hidden during normal desktop use** and only appears when one of the *Show Conditions* below is met.

> **"Fullscreen" includes maximized windows.** A maximized window on the clock's monitor counts the same as a fullscreen one. Minimized windows are ignored, and only windows on the clock's target monitor are considered.

## Install (local)

1. Copy the extension folder to your local extensions directory:

```bash
EXT=gnome-floating-clock@lukem
mkdir -p "$HOME/.local/share/gnome-shell/extensions/$EXT"
cp -r . "$HOME/.local/share/gnome-shell/extensions/$EXT/"
glib-compile-schemas "$HOME/.local/share/gnome-shell/extensions/$EXT/schemas/"
```

(Or just run `./install.sh`, which does this for you.)

2. Enable the extension:

```bash
gnome-extensions enable $EXT
# then restart GNOME Shell: Alt+F2, type 'r' and press Enter (X11) or log out/in on Wayland
```

3. Open the settings:

```bash
gnome-extensions prefs $EXT
```

## Settings

Everything is configured from the extension's preferences window. Each setting is also a GSettings key under `org.gnome.shell.extensions.gnome-floating-clock`, so you can script it, e.g. `gsettings set org.gnome.shell.extensions.gnome-floating-clock font-size 64` (pass `--schemadir <extension dir>/schemas` if the schema isn't installed system-wide).

### Visibility

| Setting | Key | Default | What it does | Why it exists |
|---|---|---|---|---|
| Force Hide | `force-hide` | Off | Hides the clock no matter what the other rules say. | A quick kill switch: turn the clock off without disabling the extension or losing your other settings. |
| Show on Fullscreen | `show-on-fullscreen` | On | Shows the clock while a fullscreen (or maximized) window is on the target monitor. | The main use case: the top bar is out of sight, so the clock takes over. |
| Show on Overview | `show-on-overview` | Off | Shows the clock while the Activities overview is open. | Handy if you want a clock in the overview. While the overview is open, fullscreen visibility is suppressed, so this is the only rule that applies there. |
| Hide Top Bar on Fullscreen | `hide-panel-on-fullscreen` | Off | Hides the top bar while a fullscreen (or maximized) window is on the target monitor. The bar comes back in the overview and when you leave fullscreen. | Gives you a clean, distraction-free screen with the floating clock as the only time display. Works independently of *Force Hide* and *Show on Fullscreen*. |

### Time and date

| Setting | Key | Default | What it does | Why it exists |
|---|---|---|---|---|
| 24-Hour Format | `use-24h` | On | On: `14:30:05`. Off: `02:30:05 PM`. The clock always shows seconds. | Match your locale or personal preference. |
| Show Date | `show-date` | Off | Adds the date before the time, e.g. `Apr 3 14:30:05`. | Useful when you want the date at a glance too. |
| Show Weekday | `show-weekday` | Off | Includes the day of the week in the date (only has an effect when *Show Date* is on). | Extra context, e.g. `Fri, Apr 3`. |
| Date Format | `date-format` | Short Name | How the date is written (see below). Only has an effect when *Show Date* is on. | Lets you pick between compact and readable styles, and between regional numeric orders. |

Date formats (shown with *Show Weekday* off / on):

| Value | Without weekday | With weekday |
|---|---|---|
| `short-name` | `Apr 3` | `Fri, Apr 3` |
| `long-name` | `April 3` | `Friday, April 3` |
| `short-numeric` | `4/3` | `Fri 4/3` |
| `long-numeric` | `2026-04-03` | `Fri 2026-04-03` |

### Appearance

| Setting | Key | Default | What it does | Why it exists |
|---|---|---|---|---|
| Font Family | `font-family` | *(empty)* | Font used for the clock. Leave empty to use the system font. | Match your desktop theme or pick something more legible. |
| Font Size | `font-size` | 48 | Text size in pixels (8–200). | The clock has to be readable over games and video, so it's big by default. |
| Font Weight | `font-weight` | normal | `normal`, `bold`, `bolder` or `lighter`. | Thicker text stays readable over busy backgrounds. |
| Font Style | `font-style` | normal | `normal`, `italic` or `oblique`. | Cosmetic preference. |
| Font Color | `font-color` | *(empty)* | Any CSS color, e.g. `#ffffff`, `white` or `rgb(255,255,255)`. Leave empty to use the default GNOME text color. | Choose a color that contrasts with what you're usually watching or playing. |

### Position and monitor

| Setting | Key | Default | What it does | Why it exists |
|---|---|---|---|---|
| Target Monitor | `monitor` | Primary (`-1`) | Which monitor the clock is drawn on: Primary, or Monitor 0, 1, 2… If the chosen monitor no longer exists, the primary monitor is used. | On multi-monitor setups, put the clock on the screen you actually watch. This is also the monitor checked for fullscreen and maximized windows, so a fullscreen video on another screen won't trigger the clock. |
| Horizontal Position | `position-x` | 100 | Pixels from the left edge of the target monitor (0–16384). | Precise placement. The clock is kept fully on-screen, so oversized values are clamped. |
| Vertical Position | `position-y` | 100 | Pixels from the top edge of the target monitor (0–16384). | As above. |

### Dragging

| Setting | Key | Default | What it does | Why it exists |
|---|---|---|---|---|
| Drag Modifier Key | `drag-modifier-key` | None (always draggable) | Left-click and drag the clock to move it; the new spot is saved to *Horizontal/Vertical Position* when you release. Choose `Ctrl`, `Alt`, `Shift` or `Super` to require that key to be held while dragging. | Lets you reposition the clock without opening settings. A modifier prevents accidental moves, and stops the clock swallowing clicks meant for the window underneath. |

### Debugging

| Setting | Key | Default | What it does | Why it exists |
|---|---|---|---|---|
| Debug Mode | `debug-mode` | Off | Keeps the clock visible at all times and draws a border around it: **green** when it would normally be shown, **red** when it would normally be hidden. | Since the clock is usually hidden, this lets you tune position and style, and see why a rule is or isn't triggering, without having to go fullscreen. Turn it off when you're done. |

## Troubleshooting

- Check `journalctl /usr/bin/gnome-shell -f` for errors.
- Use `gnome-extensions disable/enable <uuid>` to toggle the extension.
- Can't see the clock? Turn on **Debug Mode**. If you see a red border, the clock is working but none of the *Show Conditions* are met; if you see nothing, check the position and target monitor.
