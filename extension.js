/* GNOME Floating Clock — minimal working extension
 * - Centered translucent clock
 * - Updates every second
 * - Enable/disable safe
 * - Compatible with GNOME Shell 45–50
 */

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

function _getTimeString(use24h = true) {
  const dt = GLib.DateTime.new_now_local();
  return use24h ? dt.format('%H:%M:%S') : dt.format('%I:%M:%S %p');
}

function _getDateString(showWeekday, dateFormat) {
  const dt = GLib.DateTime.new_now_local();
  let fmt;
  switch (dateFormat) {
    case 'long-name':
      fmt = showWeekday ? '%A, %B %-e' : '%B %-e';
      break;
    case 'short-numeric':
      fmt = showWeekday ? '%a %-m/%-e' : '%-m/%-e';
      break;
    case 'long-numeric':
      fmt = showWeekday ? '%a %F' : '%F';
      break;
    case 'short-name':
    default:
      fmt = showWeekday ? '%a, %b %-e' : '%b %-e';
      break;
  }
  return dt.format(fmt);
}

export default class FloatingClockExtension extends Extension {
  _container = null;
  _label = null;
  _timerId = 0;
  _allocSignalId = 0;
  _signals = [];      // {obj, id} pairs
  _monitoredWindows = null; // WeakSet of windows we've already instrumented
  _settings = null;
  _settingsSignalIds = [];
  _dragging = false;
  _dragOffsetX = 0;
  _dragOffsetY = 0;
  _grab = null;

  /* ── visibility logic ── */

  _hasFullscreenWindow() {
    try {
      const ws = global.workspace_manager.get_active_workspace();
      const wins = ws.list_windows();
      const targetIdx = this._getTargetMonitorIndex();

      return wins.some(w => {
        if (w.minimized) return false;

        // Only consider windows that are (mostly) on the same monitor as
        // the clock — prevents cross-monitor toggles.
        if (!this._windowIsOnTargetMonitor(w, targetIdx))
          return false;

        // Normal fullscreen window (method on older Shells, property on newer)
        if (typeof w.is_fullscreen === 'function' ? w.is_fullscreen() : w.fullscreen)
          return true;

        // Maximized windows are treated like fullscreen. get_maximized() was
        // removed in newer Mutter, so prefer is_maximized() and the properties.
        if (typeof w.is_maximized === 'function')
          return w.is_maximized();
        if (w.maximized_horizontally && w.maximized_vertically)
          return true;

        return false;
      });
    } catch (e) {
      return false;
    }
  }

  _isOverviewVisible() {
    return Main.overview.visible;
  }

  _setPanelHidden(hidden) {
    if (hidden === !!this._panelHidden) return;
    this._panelHidden = hidden;
    if (hidden) {
      Main.panel.hide();
      this._createHotEdge();
    } else {
      this._endPanelReveal();
      this._destroyHotEdge();
      Main.panel.show();
    }
  }

  /* ── hover-to-reveal top bar ── */

  // A 1px reactive strip along the top of the primary monitor. Pointing at it
  // while the top bar is hidden slides the bar in on top of the windows.
  _createHotEdge() {
    if (this._hotEdge) return;
    this._hotEdge = new Clutter.Actor({ reactive: true });
    this._hotEdge.connect('enter-event', () => {
      this._beginPanelReveal();
      return Clutter.EVENT_PROPAGATE;
    });
    Main.layoutManager.addChrome(this._hotEdge, {
      affectsStruts: false,
      trackFullscreen: false,
    });
    this._positionHotEdge();
  }

  _positionHotEdge() {
    if (!this._hotEdge) return;
    const m = Main.layoutManager.primaryMonitor;
    if (!m) return;
    this._hotEdge.set_position(m.x, m.y);
    this._hotEdge.set_size(m.width, 1);
  }

  _destroyHotEdge() {
    if (!this._hotEdge) return;
    Main.layoutManager.removeChrome(this._hotEdge);
    this._hotEdge.destroy();
    this._hotEdge = null;
  }

  _getPanelTrackedActor() {
    const tracked = Main.layoutManager._trackedActors || [];
    return tracked.find(t => t.actor === Main.layoutManager.panelBox) ?? null;
  }

  _beginPanelReveal() {
    if (this._panelRevealed || !this._panelHidden) return;
    this._panelRevealed = true;

    // Overlay the bar: don't reserve screen space for it, so windows keep
    // their size, and show it even over a fullscreen window.
    const tracked = this._getPanelTrackedActor();
    if (tracked) {
      this._savedAffectsStruts = tracked.affectsStruts;
      tracked.affectsStruts = false;
    }
    Main.layoutManager.panelBox.show();
    Main.panel.show();

    this._panelRevealTimerId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT, 200, () => this._checkPanelReveal());
    this._updateVisibility();
  }

  _checkPanelReveal() {
    if (!this._panelRevealed)
      return GLib.SOURCE_REMOVE;

    const box = Main.layoutManager.panelBox;
    box.show(); // keep the layout manager from re-hiding it over fullscreen

    const [px, py] = global.get_pointer();
    const [bx, by] = box.get_transformed_position();
    const inside = px >= bx && px < bx + box.width &&
                   py >= by && py < by + box.height + 4;
    const menuOpen = !!Main.panel.menuManager?.activeMenu;

    if (!inside && !menuOpen) {
      this._panelRevealTimerId = 0;
      this._endPanelReveal();
      this._updateVisibility();
      return GLib.SOURCE_REMOVE;
    }
    return GLib.SOURCE_CONTINUE;
  }

  _endPanelReveal() {
    if (!this._panelRevealed) return;
    this._panelRevealed = false;

    if (this._panelRevealTimerId) {
      GLib.Source.remove(this._panelRevealTimerId);
      this._panelRevealTimerId = 0;
    }

    if (this._panelHidden)
      Main.panel.hide();

    const tracked = this._getPanelTrackedActor();
    if (tracked && this._savedAffectsStruts !== undefined)
      tracked.affectsStruts = this._savedAffectsStruts;
    this._savedAffectsStruts = undefined;
    Main.layoutManager._queueUpdateRegions?.();
  }

  _updateVisibility() {
    if (!this._container || !this._settings) return;

    const debugMode = this._settings.get_boolean('debug-mode');
    const forceHide = this._settings.get_boolean('force-hide');

    let shouldShow = false;

    // The revealed top bar has its own clock, so the floating one steps aside.
    if (!forceHide && !this._panelRevealed) {
      const showOnFullscreen = this._settings.get_boolean('show-on-fullscreen');
      const showOnOverview = this._settings.get_boolean('show-on-overview');

      const isFullscreen = this._hasFullscreenWindow();
      const isOverview = this._isOverviewVisible();

      if (showOnFullscreen && isFullscreen && !isOverview)
        shouldShow = true;
      if (showOnOverview && isOverview)
        shouldShow = true;
    }

    // Same fullscreen condition as the clock, but independent of force-hide
    // and show-on-fullscreen.
    this._setPanelHidden(
      this._settings.get_boolean('hide-panel-on-fullscreen') &&
      this._hasFullscreenWindow() && !this._isOverviewVisible());
    this._positionHotEdge();

    if (debugMode) {
      // Always keep the container visible; use border colour to indicate state
      this._container.show();
      const border = shouldShow
        ? 'border: 3px solid green;'
        : 'border: 3px solid red;';
      this._container.set_style(border);
    } else {
      this._container.set_style(null);
      if (shouldShow)
        this._container.show();
      else
        this._container.hide();
    }
  }

  /* ── font styling ── */

  _applyFontStyle() {
    if (!this._label || !this._settings) return;
    const family = this._settings.get_string('font-family');
    const size = this._settings.get_int('font-size');
    const weight = this._settings.get_string('font-weight');
    const fontStyle = this._settings.get_string('font-style');
    const color = this._settings.get_string('font-color');

    let style = `font-size: ${size}px;`;
    if (family)
      style += ` font-family: ${family};`;
    if (weight)
      style += ` font-weight: ${weight};`;
    if (fontStyle)
      style += ` font-style: ${fontStyle};`;
    if (color)
      style += ` color: ${color};`;

    this._label.set_style(style);
  }

  /* ── positioning ── */

  _getTargetMonitor() {
    // -1 === primary monitor, otherwise use the selected monitor index.
    if (!this._settings) return Main.layoutManager.primaryMonitor;
    const idx = this._settings.get_int('monitor');
    if (idx === -1) return Main.layoutManager.primaryMonitor;
    const mons = Main.layoutManager.monitors || [];
    if (idx < 0 || idx >= mons.length) return Main.layoutManager.primaryMonitor;
    return mons[idx];
  }

  _getTargetMonitorIndex() {
    const mons = Main.layoutManager.monitors || [];
    const settingIdx = this._settings ? this._settings.get_int('monitor') : -1;

    if (settingIdx === -1) {
      const p = Main.layoutManager.primaryMonitor;
      const pIdx = mons.indexOf(p);
      return pIdx >= 0 ? pIdx : 0;
    }

    if (settingIdx < 0 || settingIdx >= mons.length) {
      const pIdx = mons.indexOf(Main.layoutManager.primaryMonitor);
      return pIdx >= 0 ? pIdx : 0;
    }

    return settingIdx;
  }

  _windowIsOnTargetMonitor(win, targetIdx = null) {
    try {
      if (targetIdx === null) targetIdx = this._getTargetMonitorIndex();

      // Prefer explicit API when available.
      if (typeof win.get_monitor === 'function') {
        return win.get_monitor() === targetIdx;
      }

      // Try frame rect / compositor actor as a fallback — use window centre.
      let rect = null;
      if (typeof win.get_frame_rect === 'function') {
        rect = win.get_frame_rect();
      } else {
        const actor = win.get_compositor_private && win.get_compositor_private();
        if (actor && typeof actor.get_allocation_box === 'function') {
          const box = actor.get_allocation_box();
          rect = { x: box.x1, y: box.y1, width: box.x2 - box.x1, height: box.y2 - box.y1 };
        }
      }

      if (!rect)
        return false; // cannot determine — don't treat as on-target

      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const mons = Main.layoutManager.monitors || [];
      for (let i = 0; i < mons.length; i++) {
        const m = mons[i];
        if (cx >= m.x && cx < (m.x + m.width) && cy >= m.y && cy < (m.y + m.height))
          return i === targetIdx;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  _reposition() {
    if (!this._container || !this._settings) return;
    if (this._dragging) return;
    try {
      const monitor = this._getTargetMonitor();
      const maxX = Math.max(0, monitor.width - this._container.width);
      const maxY = Math.max(0, monitor.height - this._container.height);
      const offX = Math.max(0, Math.min(maxX, this._settings.get_int('position-x')));
      const offY = Math.max(0, Math.min(maxY, this._settings.get_int('position-y')));
      const x = monitor.x + offX;
      const y = monitor.y + offY;
      this._container.set_position(x, y);
    } catch (e) {
      console.error(`[floating-clock] reposition error: ${e}`);
    }
  }

  /* ── drag support ── */

  _getModifierMask() {
    const key = this._settings.get_string('drag-modifier-key');
    switch (key.toLowerCase()) {
      case 'ctrl': case 'control':
        return Clutter.ModifierType.CONTROL_MASK;
      case 'alt':
        return Clutter.ModifierType.MOD1_MASK;
      case 'shift':
        return Clutter.ModifierType.SHIFT_MASK;
      case 'super':
        return Clutter.ModifierType.MOD4_MASK;
      default:
        return 0; // no modifier needed
    }
  }

  _onButtonPress(actor, event) {
    if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;

    const requiredMask = this._getModifierMask();
    if (requiredMask !== 0) {
      const modifiers = event.get_state();
      if (!(modifiers & requiredMask)) return Clutter.EVENT_PROPAGATE;
    }

    this._dragging = true;
    const [stageX, stageY] = event.get_coords();
    const [actorX, actorY] = this._container.get_position();
    this._dragOffsetX = stageX - actorX;
    this._dragOffsetY = stageY - actorY;

    this._grab = global.stage.grab(this._container);
    return Clutter.EVENT_STOP;
  }

  _onMotionEvent(actor, event) {
    if (!this._dragging) return Clutter.EVENT_PROPAGATE;

    const [stageX, stageY] = event.get_coords();
    this._container.set_position(
      stageX - this._dragOffsetX,
      stageY - this._dragOffsetY
    );
    return Clutter.EVENT_STOP;
  }

  _onButtonRelease(actor, event) {
    if (!this._dragging) return Clutter.EVENT_PROPAGATE;

    this._dragging = false;
    if (this._grab) {
      this._grab.dismiss();
      this._grab = null;
    }

    // Save new position as pixel offsets from the monitor's top-left corner
    const monitor = this._getTargetMonitor();
    const [x, y] = this._container.get_position();
    const maxX = Math.max(0, monitor.width - this._container.width);
    const maxY = Math.max(0, monitor.height - this._container.height);

    const offX = Math.max(0, Math.min(maxX, Math.round(x - monitor.x)));
    const offY = Math.max(0, Math.min(maxY, Math.round(y - monitor.y)));

    this._settings.set_int('position-x', offX);
    this._settings.set_int('position-y', offY);

    return Clutter.EVENT_STOP;
  }

  /* ── clock tick ── */

  _update() {
    if (!this._label)
      return GLib.SOURCE_REMOVE;

      let text = '';

      if (this._settings && this._settings.get_boolean('show-date')) {
        const showWeekday = this._settings.get_boolean('show-weekday');
        const dateFormat = this._settings.get_string('date-format');
        text += _getDateString(showWeekday, dateFormat);
      }

    const use24h = this._settings ? this._settings.get_boolean('use-24h') : true;
    text += ' ' +  _getTimeString(use24h);


    this._label.set_text(text);
    return GLib.SOURCE_CONTINUE;
  }

  /* ── helpers ── */

  _connectSignal(obj, signal, handler) {
    try {
      const id = obj.connect(signal, handler);
      this._signals.push({ obj, id });
    } catch (e) {
      // Some Shell objects (e.g. ShellWM in newer GNOME Shell versions)
      // don't expose historical signals like 'size-change-complete'.
      // Ignore missing-signal errors so the extension remains compatible.
      log(`[floating-clock] couldn't connect '${signal}' on ${obj}: ${e}`);
    }
  }

  _monitorWindow(win) {
    if (!win) return;

    // Avoid instrumenting the same window more than once.
    if (!this._monitoredWindows) this._monitoredWindows = new WeakSet();
    if (this._monitoredWindows.has(win)) return;
    this._monitoredWindows.add(win);

    // Watch maximize / fullscreen property changes so _updateVisibility()
    // reacts when a window is maximized (we treat maximized like fullscreen).
    this._connectSignal(win, 'notify::maximized-horizontally', () => this._updateVisibility());
    this._connectSignal(win, 'notify::maximized-vertically', () => this._updateVisibility());

    // Some Shell versions expose a combined `maximized` property — connect
    // defensively (our _connectSignal wrapper will ignore if the signal
    // isn't available).
    this._connectSignal(win, 'notify::maximized', () => this._updateVisibility());

    // Also attempt to watch fullscreen property on the window if present.
    this._connectSignal(win, 'notify::fullscreen', () => this._updateVisibility());

    // Some effects (and other extensions) change actor size rather than
    // window properties — listen to the compositor actor's size-changed so
    // we catch those cases as well.
    try {
      const actor = win.get_compositor_private && win.get_compositor_private();
      if (actor && actor.connect)
        this._connectSignal(actor, 'size-changed', () => this._updateVisibility());
    } catch (e) { /* ignore */ }

    // Clean up our bookkeeping when the window is removed from the WM.
    this._connectSignal(win, 'unmanaged', () => {
      if (this._monitoredWindows) this._monitoredWindows.delete(win);
      this._updateVisibility();
    });
  }

  _monitorWorkspace(ws) {
    if (!ws) return;

    // When new windows appear, attach per-window monitors so maximizes are caught.
    this._connectSignal(ws, 'window-added', (_ws, win) => {
      this._monitorWindow(win);
      this._updateVisibility();
    });

    this._connectSignal(ws, 'window-removed', (_ws, win) => {
      if (this._monitoredWindows) this._monitoredWindows.delete(win);
      this._updateVisibility();
    });

    // Attach monitors to windows already present on this workspace.
    try {
      for (const win of ws.list_windows())
        this._monitorWindow(win);
    } catch (e) {
      /* ignore */
    }
  }

  _disconnectAllSignals() {
    for (const s of this._signals) {
      try { s.obj.disconnect(s.id); } catch (_) { /* already gone */ }
    }
    this._signals = [];
  }

  /* ── lifecycle ── */

  enable() {
    this._settings = this.getSettings();
    this._monitoredWindows = new WeakSet();

    this._label = new St.Label({
      text: _getTimeString(),
      style_class: 'floating-clock-label',
      x_expand: false,
    });
    this._label.clutter_text.line_wrap = false;
    this._label.clutter_text.ellipsize = 0; // Pango.EllipsizeMode.NONE

    this._container = new St.Bin({
      style_class: 'floating-clock-container',
      reactive: true,
      can_focus: true,
      track_hover: true,
      child: this._label,
    });

    this._allocSignalId = this._container.connect(
      'notify::allocation', () => this._reposition()
    );

    Main.layoutManager.addChrome(this._container, {
      affectsStruts: false,
      trackFullscreen: false,
    });

    this._container.connect('button-press-event', this._onButtonPress.bind(this));
    this._container.connect('motion-event', this._onMotionEvent.bind(this));
    this._container.connect('button-release-event', this._onButtonRelease.bind(this));

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._reposition();
      return GLib.SOURCE_REMOVE;
    });

    this._applyFontStyle();

    this._timerId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT, 1, () => this._update()
    );
    this._update();

    /* ── watch fullscreen / maximize changes ── */
    this._connectSignal(global.display, 'in-fullscreen-changed',
      () => this._updateVisibility());
    this._connectSignal(global.window_manager, 'size-change-complete',
      () => this._updateVisibility());

    // Monitor per-window maximize/fullscreen changes and new windows so that
    // maximized windows are treated the same as fullscreen windows.
    for (let i = 0; i < global.workspace_manager.get_n_workspaces(); i++) {
      const ws = global.workspace_manager.get_workspace_by_index(i);
      this._monitorWorkspace(ws);
    }

    // Also listen for global window creation to catch windows that may not
    // be observed by workspace 'window-added' in some Shells; keep the
    // workspace monitors as a fallback. We dedupe in _monitorWindow.
    this._connectSignal(global.display, 'window-created', (_disp, win) => {
      // compositor actor may not be present immediately; defer slightly.
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._monitorWindow(win);
        this._updateVisibility();
        return GLib.SOURCE_REMOVE;
      });
    });

    this._connectSignal(global.workspace_manager, 'workspace-removed', () => this._updateVisibility());

    /* ── watch workspace switches ── */
    this._connectSignal(global.workspace_manager, 'active-workspace-changed',
      () => this._updateVisibility());

    /* ── watch overview show / hide ── */
    this._connectSignal(Main.overview, 'showing',
      () => this._updateVisibility());
    this._connectSignal(Main.overview, 'hiding',
      () => this._updateVisibility());
    this._connectSignal(Main.overview, 'shown',
      () => this._updateVisibility());
    this._connectSignal(Main.overview, 'hidden',
      () => this._updateVisibility());

    /* ── react to settings changes ── */
    for (const key of ['force-hide', 'show-on-fullscreen', 'show-on-overview', 'hide-panel-on-fullscreen', 'position-x', 'position-y', 'monitor', 'debug-mode', 'use-24h', 'show-date', 'show-weekday', 'date-format']) {
      const id = this._settings.connect(`changed::${key}`, () => {
        this._updateVisibility();
        this._reposition();
      });
      this._settingsSignalIds.push(id);
    }
    for (const key of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-color']) {
      const id = this._settings.connect(`changed::${key}`, () => {
        this._applyFontStyle();
        this._reposition();
      });
      this._settingsSignalIds.push(id);
    }

    /* ── initial visibility ── */
    this._updateVisibility();
    this._reposition();
  }

  disable() {
    this._disconnectAllSignals();
    this._endPanelReveal();
    this._setPanelHidden(false);
    this._destroyHotEdge();
    this._monitoredWindows = null;

    if (this._settings) {
      for (const id of this._settingsSignalIds) {
        this._settings.disconnect(id);
      }
      this._settingsSignalIds = [];
      this._settings = null;
    }

    if (this._timerId) {
      GLib.Source.remove(this._timerId);
      this._timerId = 0;
    }

    if (this._grab) {
      this._grab.dismiss();
      this._grab = null;
    }
    this._dragging = false;

    if (this._container) {
      if (this._allocSignalId) {
        this._container.disconnect(this._allocSignalId);
        this._allocSignalId = 0;
      }

      Main.layoutManager.removeChrome(this._container);
      this._container.destroy();
      this._container = null;
    }

    this._label = null;
  }
}
