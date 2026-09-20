/* Preferences page for GNOME Floating Clock */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class FloatingClockPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage({
      title: 'Floating Clock',
      icon_name: 'preferences-system-time-symbolic',
    });
    window.add(page);

    /* ── Override group ── */
    const overrideGroup = new Adw.PreferencesGroup({
      title: 'Visibility Override',
      description: 'Force the clock to always hide.',
    });
    page.add(overrideGroup);

    const forceHideRow = new Adw.SwitchRow({
      title: 'Force Hide',
      subtitle: 'Always hide the clock regardless of other rules',
    });
    settings.bind('force-hide', forceHideRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    overrideGroup.add(forceHideRow);

    /* ── Conditions group ── */
    const conditionsGroup = new Adw.PreferencesGroup({
      title: 'Show Conditions',
      description: 'When to display the floating clock (if no override is active).',
    });
    page.add(conditionsGroup);

    const fullscreenRow = new Adw.SwitchRow({
      title: 'Show on Fullscreen',
      subtitle: 'Display the clock when a window is fullscreen',
    });
    settings.bind('show-on-fullscreen', fullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    conditionsGroup.add(fullscreenRow);

    const overviewRow = new Adw.SwitchRow({
      title: 'Show on Overview',
      subtitle: 'Display the clock during the Activities overview',
    });
    settings.bind('show-on-overview', overviewRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    conditionsGroup.add(overviewRow);

    const hidePanelRow = new Adw.SwitchRow({
      title: 'Hide Top Bar on Fullscreen',
      subtitle: 'Hide the top bar while a window is fullscreen',
    });
    settings.bind('hide-panel-on-fullscreen', hidePanelRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    conditionsGroup.add(hidePanelRow);

    const panelAnimRow = new Adw.SpinRow({
      title: 'Top Bar Animation Speed',
      subtitle: 'Seconds the top bar takes to slide away or back (0 = instant)',
      adjustment: new Gtk.Adjustment({
        lower: 0, upper: 2, step_increment: 0.05, page_increment: 0.25,
        value: settings.get_double('panel-animation-duration'),
      }),
      digits: 2,
    });
    settings.bind('panel-animation-duration', panelAnimRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    conditionsGroup.add(panelAnimRow);

    /* ── Font group ── */
    const fontGroup = new Adw.PreferencesGroup({
      title: 'Font',
      description: 'Customize the clock typeface and size.',
    });
    page.add(fontGroup);

    const fontFamilyRow = new Adw.EntryRow({
      title: 'Font Family',
    });
    fontFamilyRow.set_text(settings.get_string('font-family'));
    fontFamilyRow.connect('changed', () => {
      settings.set_string('font-family', fontFamilyRow.get_text());
    });
    fontGroup.add(fontFamilyRow);

    const sizeAdjustment = new Gtk.Adjustment({
      lower: 8, upper: 200, step_increment: 1, page_increment: 10,
      value: settings.get_int('font-size'),
    });
    const sizeRow = new Adw.ActionRow({
      title: 'Font Size',
      subtitle: '8–200 px',
    });
    const sizeSpinButton = new Gtk.SpinButton({
      adjustment: sizeAdjustment,
      numeric: true,
      valign: Gtk.Align.CENTER,
    });
    sizeRow.add_suffix(sizeSpinButton);
    fontGroup.add(sizeRow);
    sizeAdjustment.connect('value-changed', () => {
      settings.set_int('font-size', sizeAdjustment.value);
    });

    const fontWeightValues = ['normal', 'bold', 'bolder', 'lighter'];
    const fontWeightModel = new Gtk.StringList();
    fontWeightValues.forEach(v => fontWeightModel.append(v));
    const fontWeightRow = new Adw.ComboRow({
      title: 'Font Weight',
      subtitle: 'normal/bold/bolder/lighter',
      model: fontWeightModel,
    });
    const currentWeight = settings.get_string('font-weight') || 'normal';
    const weightIndex = fontWeightValues.indexOf(currentWeight);
    fontWeightRow.set_selected(weightIndex >= 0 ? weightIndex : 0);
    fontWeightRow.connect('notify::selected', () => {
      const val = fontWeightValues[fontWeightRow.selected] || 'normal';
      settings.set_string('font-weight', val);
    });
    fontGroup.add(fontWeightRow);

    const fontStyleValues = ['normal', 'italic', 'oblique'];
    const fontStyleModel = new Gtk.StringList();
    fontStyleValues.forEach(v => fontStyleModel.append(v));
    const fontStyleRow = new Adw.ComboRow({
      title: 'Font Style',
      subtitle: 'normal/italic/oblique',
      model: fontStyleModel,
    });
    const currentStyle = settings.get_string('font-style') || 'normal';
    const styleIndex = fontStyleValues.indexOf(currentStyle);
    fontStyleRow.set_selected(styleIndex >= 0 ? styleIndex : 0);
    fontStyleRow.connect('notify::selected', () => {
      const val = fontStyleValues[fontStyleRow.selected] || 'normal';
      settings.set_string('font-style', val);
    });
    fontGroup.add(fontStyleRow);

    const fontColorRow = new Adw.EntryRow({
      title: 'Font Color (e.g. #ffffff or white)',
    });
    fontColorRow.set_text(settings.get_string('font-color'));
    fontColorRow.connect('changed', () => {
      settings.set_string('font-color', fontColorRow.get_text());
    });
    fontGroup.add(fontColorRow);

    /* ── Position group ── */
    const positionGroup = new Adw.PreferencesGroup({
      title: 'Position',
      description: 'Set the clock position in pixels from the top-left corner of the monitor.',
    });
    page.add(positionGroup);

    /* ── Monitor selection ── */
    const monitorModel = new Gtk.StringList();
    monitorModel.append('Primary');

    const display = (Gdk.Display && Gdk.Display.get_default) ? Gdk.Display.get_default() : null;
    let monitors = [];

    if (display) {
      // Try several APIs (GDK/GTK versions expose different monitor APIs).
      if (typeof display.get_n_monitors === 'function') {
        for (let i = 0; i < display.get_n_monitors(); i++)
          monitors.push(display.get_monitor(i));
      } else if (typeof display.get_monitors === 'function') {
        monitors = display.get_monitors();
      } else if (typeof display.get_monitor_manager === 'function') {
        const mgr = display.get_monitor_manager();
        if (typeof mgr.get_n_monitors === 'function') {
          for (let i = 0; i < mgr.get_n_monitors(); i++)
            monitors.push(mgr.get_monitor(i));
        }
      }
    }

    if (monitors.length === 0) {
      // Fallback when we cannot query monitors from GDK
      monitorModel.append('Monitor 0');
    } else {
      for (let i = 0; i < monitors.length; i++) {
        try {
          const mon = monitors[i];
          const geo = (typeof mon.get_geometry === 'function') ? mon.get_geometry() : (mon.geometry || { width: 0, height: 0 });
          monitorModel.append(`Monitor ${i} — ${geo.width}×${geo.height}`);
        } catch (e) {
          monitorModel.append(`Monitor ${i}`);
        }
      }
    }

    const monitorRow = new Adw.ComboRow({
      title: 'Target monitor',
      subtitle: 'Which monitor the clock is displayed on',
      model: monitorModel,
    });

    const currentMonitor = settings.get_int('monitor'); // -1 = primary
    monitorRow.set_selected(currentMonitor === -1 ? 0 : currentMonitor + 1);
    monitorRow.connect('notify::selected', () => {
      const sel = monitorRow.selected;
      settings.set_int('monitor', sel === 0 ? -1 : sel - 1);
    });
    positionGroup.add(monitorRow);

    // positionGroup declared earlier (moved above monitor selection)

    const xRow = new Adw.SpinRow({
      title: 'Horizontal Position',
      subtitle: 'Pixels from the left edge of the monitor',
      adjustment: new Gtk.Adjustment({
        lower: 0, upper: 16384, step_increment: 1, page_increment: 10,
        value: settings.get_int('position-x'),
      }),
    });
    positionGroup.add(xRow);
    xRow.connect('notify::value', () => {
      settings.set_int('position-x', Math.round(xRow.value));
    });

    const yRow = new Adw.SpinRow({
      title: 'Vertical Position',
      subtitle: 'Pixels from the top edge of the monitor',
      adjustment: new Gtk.Adjustment({
        lower: 0, upper: 16384, step_increment: 1, page_increment: 10,
        value: settings.get_int('position-y'),
      }),
    });
    positionGroup.add(yRow);
    yRow.connect('notify::value', () => {
      settings.set_int('position-y', Math.round(yRow.value));
    });

    /* ── Time Format group ── */
    const timeFormatGroup = new Adw.PreferencesGroup({
      title: 'Time Format',
      description: 'Choose how the time is displayed.',
    });
    page.add(timeFormatGroup);

    const use24hRow = new Adw.SwitchRow({
      title: '24-Hour Format',
      subtitle: 'Off = 12-hour AM/PM, On = 24-hour',
    });
    settings.bind('use-24h', use24hRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    timeFormatGroup.add(use24hRow);

    /* ── Date group ── */
    const dateGroup = new Adw.PreferencesGroup({
      title: 'Date',
      description: 'Show the date alongside the time.',
    });
    page.add(dateGroup);

    const showDateRow = new Adw.SwitchRow({
      title: 'Show Date',
      subtitle: 'Display the date below the time',
    });
    settings.bind('show-date', showDateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    dateGroup.add(showDateRow);

    const showWeekdayRow = new Adw.SwitchRow({
      title: 'Show Weekday',
      subtitle: 'Include the day of the week in the date',
    });
    settings.bind('show-weekday', showWeekdayRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    dateGroup.add(showWeekdayRow);

    const dateFormatValues = ['short-name', 'long-name', 'short-numeric', 'long-numeric'];
    const dateFormatLabels = ['Short Name (Apr 3)', 'Long Name (April 3)', 'Short Numeric (4/3)', 'Long Numeric (2026-04-03)'];
    const dateFormatModel = new Gtk.StringList();
    dateFormatLabels.forEach(v => dateFormatModel.append(v));
    const dateFormatRow = new Adw.ComboRow({
      title: 'Date Format',
      subtitle: 'Choose how the date is displayed',
      model: dateFormatModel,
    });
    const currentDateFormat = settings.get_string('date-format') || 'short-name';
    const dateFormatIndex = dateFormatValues.indexOf(currentDateFormat);
    dateFormatRow.set_selected(dateFormatIndex >= 0 ? dateFormatIndex : 0);
    dateFormatRow.connect('notify::selected', () => {
      const val = dateFormatValues[dateFormatRow.selected] || 'short-name';
      settings.set_string('date-format', val);
    });
    dateGroup.add(dateFormatRow);

    /* ── Dragging group ── */
    const dragGroup = new Adw.PreferencesGroup({
      title: 'Dragging',
      description: 'Configure how to drag the clock to reposition it.',
    });
    page.add(dragGroup);

    const modifierModel = new Gtk.StringList();
    modifierModel.append('None (always draggable)');
    modifierModel.append('Ctrl');
    modifierModel.append('Alt');
    modifierModel.append('Shift');
    modifierModel.append('Super');

    const modifierRow = new Adw.ComboRow({
      title: 'Drag Modifier Key',
      subtitle: 'Key that must be held while clicking to drag the clock',
      model: modifierModel,
    });
    const currentKey = settings.get_string('drag-modifier-key').toLowerCase();
    const keyMap = {'': 0, 'ctrl': 1, 'alt': 2, 'shift': 3, 'super': 4};
    modifierRow.set_selected(keyMap[currentKey] ?? 0);
    modifierRow.connect('notify::selected', () => {
      const values = ['', 'Ctrl', 'Alt', 'Shift', 'Super'];
      settings.set_string('drag-modifier-key', values[modifierRow.selected]);
    });
    dragGroup.add(modifierRow);

    /* ── Debug group ── */
    const debugGroup = new Adw.PreferencesGroup({
      title: 'Debugging',
      description: 'Tools for troubleshooting the extension.',
    });
    page.add(debugGroup);

    const debugRow = new Adw.SwitchRow({
      title: 'Debug Mode',
      subtitle: 'Replace show/hide with a coloured border (green = show, red = hide)',
    });
    settings.bind('debug-mode', debugRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    debugGroup.add(debugRow);

  }
}
