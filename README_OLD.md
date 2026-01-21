# Daily Board

A streamlined daily discipline tracker with **simplified multi-device synchronization** using direct JSON file updates.

## Features

### Daily Disciplines
Track 5 fixed daily habits:
- WH Breathing
- Yoga
- Pull up bar / weights
- Review Goals and Actions
- Update Finances

### Dynamic Tasks
- Add custom daily tasks dynamically
- Each task can be checked off and deleted
- Tasks persist for each specific day

### Day-Specific Tracking
- Navigate between different days
- Each day maintains its own independent state
- Tasks and discipline completion are tracked per day

### List Management
- Organize and maintain lists with multiple tabs
- Create, delete, and switch between different lists
- Each list can contain multiple items with checkbox tracking
- Lists are shared across all days (not day-specific)

### Simplified Multi-Device Synchronization ⭐ ENHANCED
- **Token-optional sync** - Use local server without any token configuration ✨ NEW
- **Multiple sync modes** - Local server, Dropbox, Google Drive (public files), GitHub API, or local-only
- **Automatic mode detection** - App automatically selects best available sync method
- **Direct JSON file sync** - No complex API dependencies
- **Automatic polling** - Checks for updates every 5 seconds
- **Real-time updates** - Changes appear automatically across all devices
- **Cloud storage ready** - Works with GitHub, Dropbox, Google Drive (including public shared files)
- **Conflict resolution** - Timestamp-based merging with SHA versioning (GitHub mode)
- **Offline-first** - Changes queue locally and sync when online
- See [CLOUD_SYNC_GUIDE.md](CLOUD_SYNC_GUIDE.md) for detailed setup

### Data Retention Policy ✨ NEW
- Automatically maintains a rolling 10-day window of task history
- Keeps tasks from 5 days in the past to 5 days in the future
- Periodic cleanup runs hourly to remove old entries
- Helps keep your data manageable and focused on current/upcoming tasks

### Offline Support ✨ NEW
- Service worker enables offline functionality
- Changes are queued and synced when connection is restored
- Visual indicators show online/offline status
- Works seamlessly even with intermittent connectivity

### Enhanced Error Handling ✨ NEW
- Detailed error logging for debugging
- Error logs stored in browser localStorage
- View error log from the app footer
- Better error messages with actionable feedback

## Usage

### Getting Started

1. Clone or download this repository
2. Open `index.html` in your web browser
3. Choose your sync method:
   - **No Configuration Needed (Recommended)**: Run the local server (`npm install && npm start`) for token-free sync
   - **Google Drive Public File Sync (Easy)**: Use a publicly shared Google Drive JSON file for read-only sync ✨ NEW
   - **Dropbox/Google Drive Sync (Advanced)**: Configure cloud storage tokens for full sync
   - **GitHub Sync (Advanced)**: Configure a GitHub token for cloud-based sync
   - **Local-Only Mode**: Use without any sync for single-device access

### Sync Modes

Daily Board supports multiple sync modes that are automatically detected:

#### 1. Local Server Sync (Recommended - No Token Needed) ✨ NEW

The easiest way to sync across devices without configuring tokens:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the local server**:
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3000`

3. **Open the app**:
   - Open `index.html` in your browser
   - The app automatically detects the local server
   - You'll see "✓ Sync: Local Server (No token needed)" in green

4. **Multi-device sync**:
   - Open the app on any device on your network
   - All devices sync through the local server
   - No GitHub token configuration required!

#### 2. Google Drive Public File Sync (Easy - No Token Needed) ✨ NEW

Sync your data using a publicly shared Google Drive JSON file. This is ideal for read-only scenarios where you want to sync data from a central source:

1. **Create a Google Drive JSON file**:
   - Upload a `data.json` file to Google Drive
   - Right-click the file and select "Share"
   - Set sharing to "Anyone with the link" with at least "Viewer" access
   - Copy the share link (e.g., `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`)

2. **Configure the File ID**:
   - Extract the file ID from your share link (the part between `/d/` and `/view`)
   - For example, from `https://drive.google.com/file/d/1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq/view?usp=sharing`
   - The file ID is: `1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq`
   - Open your browser's developer console (F12)
   - Run: `localStorage.setItem('googleDrivePublicFileId', 'YOUR_FILE_ID_HERE')`
   - Or use the helper: `googleDrivePublicProvider.setFileId('YOUR_FILE_ID_HERE')`
   - Refresh the page

3. **Start Syncing**:
   - The app will automatically fetch data from the public Google Drive file
   - You'll see "✓ Sync: Google Drive (Public File)" in green
   - **Auto-sync checks for updates every 5 seconds** automatically
   - **Note**: This is a read-only mode - local changes are saved to localStorage only

4. **Extract File ID from URL** (helper function):
   - You can use the built-in helper to extract the file ID from a share URL:
   - Run in console: `GoogleDrivePublicSyncProvider.extractFileIdFromUrl('YOUR_SHARE_URL')`

**Benefits**:
- ✅ No authentication token needed
- ✅ Easy to set up - just share a file
- ✅ Perfect for syncing reference data across devices
- ⚠️ Read-only mode (changes saved locally only)

**Use Cases**:
- Distribute task templates to a team
- Sync reference lists across devices
- Share daily goals with family members

#### 3. Dropbox/Google Drive Sync (Advanced - Token Required)

For full read/write sync with Dropbox or Google Drive, see the [CLOUD_SYNC_GUIDE.md](CLOUD_SYNC_GUIDE.md) for detailed setup instructions.

#### 4. GitHub Sync (Advanced - Token Required)

To enable cross-device synchronization via GitHub:

1. **Create a GitHub Personal Access Token**:
   - Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
   - Click "Generate new token" (classic)
   - Give it a descriptive name (e.g., "Daily Board")
   - Select the `repo` scope (required for reading/writing repository files)
   - Click "Generate token" and copy it

2. **Configure the Token**:
   - Open your browser's developer console (F12)
   - Run: `localStorage.setItem('githubToken', 'YOUR_TOKEN_HERE')`
   - Replace `YOUR_TOKEN_HERE` with your actual token
   - Refresh the page

3. **Start Syncing**:
   - The app will automatically fetch the latest data from your repository
   - All changes (tasks, disciplines, lists) will be synced to `data.json`
   - Access your data from any device by setting the same token in localStorage
   - **Auto-sync checks for updates every 5 seconds** automatically
   - You'll see "✓ Sync: GitHub API" in blue

**Note**: The repository is configured to use `markvanengelen-gulo/daily-board`. If you fork this repository, update the `GITHUB_CONFIG` object in `app.js` with your username and repository name.

#### 5. Local-Only Mode (No Sync)

If neither the local server nor GitHub token is configured:
- Data is stored only in browser localStorage
- Works fully offline
- Data is device-specific (no cross-device sync)
- You'll see "⚠️ Sync: Local Only" in yellow

### Multi-Device Setup

To sync across multiple devices (phone, laptop, desktop, etc.):

**Option 1: Local Server Sync (No Token Needed)**

1. **Run the server** on one device (e.g., your main computer):
   ```bash
   cd daily-board
   npm install
   npm start
   ```

2. **Access from any device** on the same network:
   - Open `http://YOUR-COMPUTER-IP:3000` in a browser
   - Changes sync automatically across all devices
   - No token configuration needed!

**Option 2: GitHub Sync (With Token)**

1. **Configure the same GitHub token** on each device:
   ```javascript
   localStorage.setItem('githubToken', 'YOUR_TOKEN_HERE')
   ```

2. **Automatic synchronization**:
   - Changes on any device are saved to GitHub immediately
   - Other devices poll for updates every 5 seconds
   - Updates appear automatically without manual refresh
   - "Last sync" indicator shows synchronization status

3. **For alternative cloud storage** (Dropbox, Google Drive):
   - See [CLOUD_SYNC_GUIDE.md](CLOUD_SYNC_GUIDE.md) for detailed instructions

### Navigation
- Use the "Previous" and "Next" buttons to navigate between days
- The current date is displayed at the top
- Data syncs to GitHub when configured, or falls back to local storage

### Managing Tasks
- Type in the input field and click "Add Task" or press Enter
- Check off tasks as you complete them
- Delete tasks you no longer need

### Managing Lists
- Click "+ New List" to create a new list tab
- Click on a tab to switch between lists
- Click the ✎ (edit) icon on a tab to rename it
- Click the × on a tab to delete a list (you must have at least one)
- Add items to the current list using the input field

## Technical Details

Built with:
- HTML5
- CSS3 (with responsive design)
- Vanilla JavaScript
- GitHub REST API for cross-device data synchronization
- Local Storage for backup and offline fallback

No build process or dependencies required!

## Data Storage

### GitHub Sync Mode
When a GitHub token is configured:
- Data is stored in `data.json` in this repository
- Automatic sync on every change
- SHA-based version control to handle concurrent updates
- Local storage backup for offline access

### Local-Only Mode
Without a GitHub token:
- Data is stored in browser's localStorage
- Works fully offline
- Data is device-specific

### Data Structure
```json
{
  "dateEntries": {
    "2026-01-04": {
      "disciplines": { "0": true, "1": false },
      "tasks": [
        { "name": "Task 1", "completed": false }
      ]
    }
  },
  "tabs": [
    { "id": "tab_123", "name": "My List" }
  ],
  "listItems": {
    "tab_123": [
      { "name": "Item 1", "completed": false }
    ]
  }
}
```

## Simplified Architecture

Daily Board uses a **simplified, API-free architecture** for multi-device synchronization:

### Key Principles

1. **Direct JSON File Storage**
   - All data stored in a single `data.json` file
   - No database, no complex backend
   - Easy to backup, migrate, and understand

2. **Cloud Storage Integration**
   - Currently uses GitHub as default (with API)
   - Can be adapted for Dropbox, Google Drive, or any cloud service
   - File sync services handle the synchronization
   - See [CLOUD_SYNC_GUIDE.md](CLOUD_SYNC_GUIDE.md) for alternatives

3. **Automatic Synchronization**
   - **Auto-polling**: Checks for remote updates every 5 seconds
   - **Real-time updates**: Detects changes and updates UI automatically
   - **Conflict resolution**: SHA-based detection with timestamp merging
   - **Visual feedback**: "Last sync" indicator shows sync status

4. **Offline-First Design**
   - All changes saved to localStorage immediately
   - Sync queue holds changes when offline
   - Automatic sync when connection restored
   - Service worker enables full offline functionality

5. **Multi-Device Support**
   - Same data accessible from any device
   - Automatic cross-device synchronization
   - Optional WebSocket server for instant updates
   - Tested on desktop, mobile, and tablet

### How It Works

```
User Action → localStorage (immediate) → Sync Queue → Cloud Storage → Other Devices
                                            ↓
                                      Auto-poll detects
                                      change (5s)
```

For detailed technical information and alternative cloud storage options, see [CLOUD_SYNC_GUIDE.md](CLOUD_SYNC_GUIDE.md).

## Security

- GitHub Personal Access Tokens are stored securely in browser localStorage
- Tokens are never exposed in the UI (displayed as masked)
- All API calls use HTTPS
- Tokens are never committed to the repository

## Privacy

- All your data is stored in your own GitHub repository
- No third-party services are used
- You have complete control over your data

## New Features Details

### Automatic Multi-Device Synchronization ⭐ NEW

Real-time synchronization across all your devices:

- **Auto-Polling**: Checks for remote updates every 5 seconds automatically
- **Live Updates**: Changes from other devices appear automatically
- **Sync Status**: "Last sync" indicator shows when data was last synchronized
- **No Manual Refresh**: Updates happen in the background without user intervention
- **Conflict Detection**: Automatically detects and handles concurrent edits
- **Smart Merging**: Timestamp-based conflict resolution with user prompts

This enables seamless task management across your phone, laptop, desktop, and tablet!

### Data Retention Policy

The app now implements an automatic data retention policy to keep your task history manageable:

- **10-Day Rolling Window**: Only tasks from the past 5 days and next 5 days are kept
- **Automatic Cleanup**: Runs on app startup and every hour to remove old entries
- **Transparent**: All cleanups are logged to the console for visibility
- **Configurable**: Settings can be adjusted in the `DATA_RETENTION` configuration

This helps prevent data bloat while keeping relevant task history available.

### Offline Support

The app now works offline using modern web technologies:

- **Service Worker**: Caches app assets for offline access
- **Sync Queue**: Changes made offline are queued and synced when connection restores
- **Status Indicators**: Visual feedback shows online/offline status
- **Seamless Experience**: The app continues to work normally even when offline

All data changes are saved to localStorage when offline, then automatically synced to GitHub when you're back online.

### Enhanced Error Handling

Better error reporting and debugging capabilities:

- **Error Logging**: All errors are logged with timestamps and context
- **Error Viewer**: Click "View Error Log" in the footer to see recent errors
- **Detailed Messages**: More helpful error messages with actionable guidance
- **Debug Information**: Logs include HTTP status codes and error types

The error log helps diagnose issues with GitHub sync, network problems, or other failures.

## Troubleshooting

### Offline Mode
If you see "⚠️ Offline Mode" indicator:
- Check your internet connection
- Changes will be saved locally
- They'll sync automatically when you're back online

### Error Log
If you experience issues:
1. Click "View Error Log" in the footer
2. Check recent errors for details
3. Clear the log after addressing issues

### Data Retention
If old tasks are missing:
- The app keeps only 10 days of history (5 back, 5 forward)
- Use the Download button to export full data before cleanup
- Adjust `DATA_RETENTION` settings if needed

## WebSocket Server (Optional)

For real-time sync across devices, you can optionally run the WebSocket server:

1. Install dependencies: `npm install`
2. Start server: `npm start`
3. Enable WebSocket in app.js (see WEBSOCKET_SETUP.md)

See [WEBSOCKET_SETUP.md](WEBSOCKET_SETUP.md) for detailed instructions.
