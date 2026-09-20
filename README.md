# GNOME Floating Clock

Simple GNOME Shell extension that shows a centered, translucent floating clock.

## Install (local)

1. Copy the extension folder to your local extensions directory:

```bash
EXT=gnome-floating-clock@lukem
mkdir -p "$HOME/.local/share/gnome-shell/extensions/$EXT"
cp -r . "$HOME/.local/share/gnome-shell/extensions/$EXT/"
```

2. Enable the extension:

```bash
gnome-extensions enable $EXT
# then restart GNOME Shell: Alt+F2, type 'r' and press Enter (X11) or log out/in on Wayland
```

3. Troubleshooting:
- Check `journalctl /usr/bin/gnome-shell -f` for errors
- Use `gnome-extensions disable/enable <uuid>` to toggle

## Notes
- Uses inline styles so it works immediately; edit `stylesheet.css` if you prefer external styling.
- You can choose which monitor the clock is displayed on (Primary or monitor number) from the Preferences.
- If you'd like additional preferences (more positioning options, multiple clocks), tell me and I can add them.
