# Claude Monitor

A lightweight always-on-top overlay app for Windows that displays your Claude Pro usage in real time. It sits in the corner of your screen so you can keep an eye on your rate limits while working.

## Features

- **Always-on-top overlay** — transparent, click-through window that stays above all apps
- **Session usage** — current message count within the 5-hour rolling window
- **Daily reset timer** — countdown to when your usage resets
- **Multi-account support** — monitor multiple Claude accounts simultaneously, color-coded
- **Per-organization visibility** — show or hide specific orgs per account
- **Auto-refresh** — polls usage data every 60 seconds (configurable)
- **Compact mode** — minimized single-line view; double-click to toggle
- **Draggable** — move the overlay anywhere on screen
- **System tray** — minimize to tray; double-click tray icon to show/hide
- **Configurable opacity** — adjust transparency to your preference
- **Zoom in/out** — `Ctrl +` / `Ctrl -` to resize the overlay

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18 or later
- Windows 10/11

### Run in Development Mode

```bash
npm install
npm start
```

### Build an Installer

```bash
npm run build
```

The installer will be generated in the `dist/` directory.

## How to Get Your Session Key

Claude Monitor authenticates with the Claude API using your `sessionKey` cookie.

1. Go to [claude.ai](https://claude.ai) and log in
2. Open DevTools — press `F12` or `Ctrl+Shift+I`
3. Navigate to the **Application** tab
4. In the sidebar, expand **Cookies** and click **https://claude.ai**
5. Find the `sessionKey` row and copy its **Value**
6. Paste it into the app settings

> **Warning:** Your session key is equivalent to a password. Do not share it with anyone.
> It expires when you log out or after extended inactivity — re-enter it when needed.

## Usage Data

Claude Pro enforces rate limits on two dimensions:

| Limit | Window | Description |
|-------|--------|-------------|
| Session | 5-hour rolling | Messages sent in the last 5 hours |
| Weekly | 7 days | Total messages this billing week |

## Troubleshooting

### "Session expired" error
Re-copy your session key from claude.ai and update it in the app settings.

### Data shows "?"
The Claude API response format may have changed, or the request failed. Click the refresh button to retry.

### App is not visible
Double-click the system tray icon to toggle visibility.

## Tech Stack

- **Electron** — desktop application framework
- **claude.ai internal API** — `/api/account`, `/api/organizations`, `/api/organizations/{id}/usage`
- **electron-store** — persistent local configuration

## License

MIT
