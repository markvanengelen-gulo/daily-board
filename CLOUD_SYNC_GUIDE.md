# Cloud Storage Synchronization Guide

## Overview

Daily Board supports seamless multi-device synchronization using multiple sync methods. This guide explains how to synchronize your task data across multiple devices (phone, laptop, desktop, etc.) with or without cloud storage.

## Sync Modes ✨ UPDATED

Daily Board now supports **six automatic sync modes** that are detected automatically in priority order:

1. **Local Server** (Priority 1) - No token needed
2. **Dropbox** (Priority 2) - Cloud storage
3. **Google Drive Public File** (Priority 3) - No token needed, read-only ✨ NEW
4. **Google Drive** (Priority 4) - Cloud storage, full access
5. **GitHub** (Priority 5) - Cloud storage
6. **Local-Only** (Fallback) - No cross-device sync

### 1. Local Server Sync (Recommended - No Token Needed)

The easiest and most user-friendly option for cross-device sync:

**How It Works:**
- Runs a local Node.js server that manages data.json
- No GitHub token or cloud service configuration needed
- Works on your local network
- Perfect for home/office use

**Setup:**

1. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3000`

3. **Access from devices**:
   - Same device: Open `index.html` in browser
   - Other devices: Navigate to `http://YOUR-SERVER-IP:3000`
   - App automatically detects and uses local server
   - No token configuration needed!

**Features:**
- ✅ No GitHub token required
- ✅ Real-time sync via WebSocket
- ✅ REST API fallback
- ✅ Works offline (data cached locally)
- ✅ Automatic conflict handling
- ✅ Perfect for personal/family use

### 2. Dropbox Sync (Cloud-Based) ✨ NEW

For cloud-based sync with Dropbox:

**How It Works:**
- Stores `data.json` in your Dropbox account at `/daily-board/data.json`
- Uses Dropbox API for file upload/download
- Automatic sync every 5 seconds
- Works from anywhere with internet

**Setup:**

1. **Create a Dropbox App**:
   - Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
   - Click "Create app"
   - Choose "Scoped access"
   - Choose "Full Dropbox" or "App folder" access
   - Give your app a name (e.g., "Daily Board Sync")

2. **Generate an Access Token**:
   - In your app settings, scroll to "OAuth 2"
   - Under "Generated access token", click "Generate"
   - Copy the generated access token

3. **Configure the token in the app**:
   - Open the app in your browser
   - Scroll to the top and expand "⚙️ Cloud Sync Configuration"
   - Find the Dropbox section
   - Paste your token in the input field
   - Click "Save Token"

4. **Verify sync is working**:
   - The app will show "✓ Sync: Dropbox" in blue
   - Make a change (add a task, check a discipline)
   - Check your Dropbox folder - you should see `daily-board/data.json`
   - Open the app on another device with the same token
   - Changes should appear automatically within 5 seconds

**Features:**
- ✅ Access from anywhere with internet
- ✅ 2GB free storage (Basic plan)
- ✅ Native mobile app support
- ✅ Automatic file versioning
- ✅ Easy token management

### 3. Google Drive Public File Sync (Easy - No Token Needed) ✨ NEW

For simple read-only sync from a publicly shared Google Drive file:

**How It Works:**
- Fetches data from a publicly shared Google Drive JSON file
- No authentication or token required
- Perfect for distributing reference data across devices
- Read-only mode (local changes saved to localStorage only)
- Automatic sync every 5 seconds with caching

**Setup:**

1. **Create and share a Google Drive JSON file**:
   - Create or upload a `data.json` file to your Google Drive
   - Right-click the file and select "Share"
   - Click "Change to anyone with the link"
   - Set permission to "Viewer" (or "Editor" if you plan to update it manually)
   - Click "Copy link" - you'll get something like:
     `https://drive.google.com/file/d/1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq/view?usp=sharing`

2. **Extract the File ID**:
   - From the share link, extract the file ID (the part between `/d/` and `/view`)
   - Example: From `https://drive.google.com/file/d/1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq/view?usp=sharing`
   - The file ID is: `1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq`

3. **Configure the file ID in the app**:
   - **Option A** - Using browser console:
     - Open the app in your browser
     - Open browser console (F12)
     - Run: `localStorage.setItem('googleDrivePublicFileId', 'YOUR_FILE_ID_HERE')`
     - Or use: `googleDrivePublicProvider.setFileId('YOUR_FILE_ID_HERE')`
     - Refresh the page
   
   - **Option B** - Using the helper function:
     - Open browser console (F12)
     - Run: `GoogleDrivePublicSyncProvider.extractFileIdFromUrl('YOUR_FULL_SHARE_URL')`
     - This will return the file ID
     - Then set it: `googleDrivePublicProvider.setFileId('EXTRACTED_FILE_ID')`
     - Refresh the page

4. **Verify sync is working**:
   - The app will show "✓ Sync: Google Drive (Public File)" in green
   - The app will fetch data from the public file automatically
   - Changes from the Google Drive file appear within 5 seconds
   - **Note**: Your local changes are saved to localStorage only (read-only mode)

**Features:**
- ✅ **No token required** - Just share a file!
- ✅ **Easy setup** - Just 2 steps
- ✅ **Free** - No Google Cloud Console setup needed
- ✅ **Perfect for distribution** - Share task templates with teams
- ✅ **Caching** - 5-second cache reduces API calls
- ✅ **Error handling** - Graceful fallback to localStorage
- ⚠️ **Read-only** - Local changes saved to localStorage only

**Use Cases:**
- 📋 Distribute task templates to a team
- 📱 Sync reference lists across personal devices
- 👨‍👩‍👧‍👦 Share daily goals with family members
- 📚 Distribute study schedules to students
- 🏢 Share company-wide task lists

**Example Data Structure:**
```json
{
  "dateEntries": {
    "2026-01-20": {
      "disciplines": { "0": true, "1": false, "2": false, "3": false, "4": false },
      "tasks": [{ "name": "Example task", "completed": false }]
    }
  },
  "tabs": [
    { "id": "tab_default", "name": "My List" }
  ],
  "listItems": {
    "tab_default": "List content here"
  }
}
```

**Troubleshooting:**
- If you see "Failed to load data from Google Drive Public file", check:
  - ✓ File sharing is set to "Anyone with the link"
  - ✓ File ID is correct
  - ✓ File contains valid JSON data
  - ✓ Internet connection is working
- Clear the cache: `googleDrivePublicProvider.clearCache()`
- Check errors in browser console

### 4. Google Drive Sync (Cloud-Based - Full Access) ✨ NEW

For cloud-based sync with Google Drive:

**How It Works:**
- Stores `daily-board-data.json` in your Google Drive
- Uses Google Drive API v3 for file operations
- Automatic sync every 5 seconds
- Works from anywhere with internet

**Setup:**

1. **Enable Google Drive API**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable "Google Drive API" for your project
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Configure OAuth consent screen if needed
   - Choose "Web application" as application type
   - Add authorized redirect URIs if needed

2. **Get an Access Token**:
   - Use [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
   - In Step 1, select "Drive API v3" and check the scope: `https://www.googleapis.com/auth/drive.file`
   - Click "Authorize APIs"
   - In Step 2, click "Exchange authorization code for tokens"
   - Copy the "Access token"

3. **Configure the token in the app**:
   - Open the app in your browser
   - Scroll to the top and expand "⚙️ Cloud Sync Configuration"
   - Find the Google Drive section
   - Paste your token in the input field
   - Click "Save Token"

4. **Verify sync is working**:
   - The app will show "✓ Sync: Google Drive" in blue
   - Make a change (add a task, check a discipline)
   - Check your Google Drive - you should see `daily-board-data.json`
   - Open the app on another device with the same token
   - Changes should appear automatically within 5 seconds

**Features:**
- ✅ Access from anywhere with internet
- ✅ 15GB free storage
- ✅ Integration with Google ecosystem
- ✅ Built-in versioning and backup
- ✅ Mobile app support

**Note**: Access tokens from OAuth Playground expire after 1 hour by default. For production use, you should implement a full OAuth flow with refresh tokens or use a service account.

### 5. GitHub Sync (Cloud-Based)

For internet-wide access using GitHub as cloud storage:

**How It Works:**

1. **Direct JSON File Storage**: All data is stored in `data.json` in your repository
2. **Automatic Sync**: Changes are automatically saved to GitHub
3. **Conflict Resolution**: SHA-based versioning detects and handles conflicts
4. **Auto-Polling**: Checks for remote updates every 5 seconds
5. **Offline Support**: Changes queue locally when offline and sync when online

**Setup:**

1. **Fork or clone this repository** to your GitHub account

2. **Generate a Personal Access Token**:
   - Visit [GitHub Settings → Personal Access Tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Give it a name (e.g., "Daily Board Sync")
   - Select the `repo` scope (required for reading/writing files)
   - Copy the generated token

3. **Configure the token in the app**:
   - Open the app in your browser
   - Open browser console (F12)
   - Run: `localStorage.setItem('githubToken', 'YOUR_TOKEN_HERE')`
   - Refresh the page

4. **Verify sync is working**:
   - Make a change (add a task, check a discipline)
   - You'll see "✓ Sync: GitHub API" in blue
   - Check the "Last sync" indicator at the top
   - Open the app on another device with the same token
   - Changes should appear automatically within 5 seconds

**Features:**
- ✅ Access from anywhere with internet
- ✅ Automatic backups to GitHub
- ✅ SHA-based conflict detection
- ✅ Works across different networks
- ✅ Version history in Git

### 5. Local-Only Mode (No Sync)

When neither local server nor GitHub token is configured:

**How It Works:**
- All data stored in browser localStorage only
- No cross-device synchronization
- Perfect for single-device use
- Zero configuration needed

**When To Use:**
- Single device usage
- Privacy-focused (data never leaves your device)
- No network access needed
- Quick testing/demo

**Indicator:**
- You'll see "⚠️ Sync: Local Only (No cross-device sync)" in yellow

## Sync Mode Detection

The app automatically detects the best available sync mode in this priority order:

1. **Local Server**: If server is running on `http://localhost:3000`
2. **Dropbox**: If a Dropbox access token is configured in localStorage
3. **Google Drive**: If a Google Drive access token is configured in localStorage
4. **GitHub**: If a GitHub token is configured in localStorage
5. **Local-Only**: If no sync method is available

You can switch modes by:
- Starting/stopping the local server
- Adding/removing cloud storage tokens via the configuration UI
- Priority is automatically managed (Local Server > Dropbox > Google Drive > GitHub > Local-Only)

### Multi-Device Setup (Updated)

To use Daily Board across multiple devices, choose your preferred sync method:

**Option 1: Local Server Sync (Easiest - No Token Needed)**

1. **Run the server** on one device (e.g., your main computer):
   ```bash
   cd daily-board
   npm install
   npm start
   ```

2. **Access from any device** on the same network:
   - Find your server's IP address (e.g., `192.168.1.100`)
   - Open `http://YOUR-SERVER-IP:3000` in a browser
   - Changes sync automatically across all devices
   - No token configuration needed!

**Option 2: GitHub Sync (Internet-Wide Access)**

1. **Set up the same GitHub token** on each device:
   ```javascript
   localStorage.setItem('githubToken', 'YOUR_TOKEN_HERE')
   ```

2. **All devices will sync automatically**:
   - Changes on Device A → Saved to GitHub → Detected by Device B within 5 seconds
   - Conflicts are automatically resolved using last-write-wins with SHA versioning
   - Offline changes are queued and synced when connection is restored

## Cloud Storage Implementation Status ✨ UPDATED

Daily Board now supports multiple cloud storage providers out of the box:

### ✅ Fully Implemented
1. **Local Server** - Token-free sync for local networks
2. **Dropbox** - Cloud sync with Dropbox API ✨ NEW
3. **Google Drive** - Cloud sync with Google Drive API v3 ✨ NEW
4. **GitHub** - Cloud sync with GitHub Contents API

All cloud providers support:
- Automatic sync every 5 seconds
- Offline support with local caching
- Cross-device synchronization
- Easy token management via UI

### Alternative Sync Methods

### Local File System Sync (Desktop)

For desktop applications, you can use local file system sync:

**Implementation**:

1. **Use Electron** or similar framework to wrap the web app
2. **Watch the local data.json file** for changes
3. **Use a file sync service** (Dropbox, OneDrive, Google Drive) to sync the folder
4. **Automatic sync** happens via the file sync service

**Benefits**:
- No API tokens needed
- Works with any file sync service
- Simple to set up

## Conflict Resolution

Daily Board implements robust conflict resolution across all sync modes:

### Current Strategy

**For GitHub (SHA-based)**:
1. **SHA-based Detection**: Before saving, checks if remote SHA matches local SHA
2. **Conflict Dialog**: If conflict detected, prompts user to:
   - Fetch latest data and merge manually (recommended)
   - Force save local changes (overwrites remote)

**For Dropbox and Google Drive (Revision-based)**:
1. **Last-write-wins**: Latest changes overwrite previous data
2. **Auto-sync Detection**: Fetches remote data every 5 seconds
3. **UI Updates**: Automatically refreshes when remote changes detected

**For Local Server (Real-time)**:
1. **Immediate sync**: Changes saved immediately to shared file
2. **Auto-polling**: Checks for updates every 5 seconds
3. **Conflict prevention**: Real-time sync minimizes conflicts

**For All Modes**:
- **Timestamp-based Merging**: When auto-syncing detects changes:
  - Fetches remote data automatically
  - Updates UI with latest data
  - Shows notification: "📥 Data synchronized from remote"
- **Offline Support**: Changes queue locally and sync when connection restored

### Enhanced Conflict Resolution (Future)

For more sophisticated merging:

```javascript
// Pseudo-code for timestamp-based merge
function mergeWithTimestamps(localData, remoteData) {
    const merged = {};
    
    // For each date entry
    for (const dateKey in localData.dateEntries) {
        const local = localData.dateEntries[dateKey];
        const remote = remoteData.dateEntries[dateKey];
        
        if (!remote) {
            // Local only - keep local
            merged[dateKey] = local;
        } else {
            // Compare timestamps and merge
            merged[dateKey] = mergeEntries(local, remote);
        }
    }
    
    return merged;
}
```

## Offline Support

### How It Works

1. **Service Worker**: Caches app files for offline access
2. **LocalStorage Backup**: All data is backed up to browser localStorage
3. **Sync Queue**: Offline changes are queued with timestamps
4. **Auto-Sync on Reconnect**: Queue processes automatically when online

### Using Offline

1. **Make changes while offline**: App saves to localStorage
2. **See offline indicator**: "⚠️ Offline Mode" appears at top
3. **Go back online**: Changes sync automatically
4. **Notification**: "Connection restored! Syncing pending changes..."

## Testing Multi-Device Sync

### Test Procedure

1. **Setup**:
   - Open app on Device A (e.g., desktop)
   - Open app on Device B (e.g., phone)
   - Configure same GitHub token on both

2. **Test Real-time Sync**:
   - Add a task on Device A
   - Click "💾 Update" button
   - Wait 30 seconds (or click refresh on Device B)
   - Task should appear on Device B

3. **Test Offline Support**:
   - Disconnect Device A from internet
   - Add tasks on Device A
   - Reconnect Device A
   - Changes should sync automatically

4. **Test Conflict Resolution**:
   - Make different changes on both devices while offline
   - Connect both devices
   - Manually trigger update on one device
   - Should see conflict dialog with merge options

## Configuration Options

### Adjust Auto-Sync Interval

In `app.js`, modify the polling interval:

```javascript
const AUTO_SYNC_CONFIG = {
    enabled: true,
    intervalMs: 30000, // Change to desired interval (e.g., 60000 for 1 minute)
    lastSyncTime: null,
    pollTimer: null
};
```

### Disable Auto-Sync

To disable automatic polling (manual sync only):

```javascript
const AUTO_SYNC_CONFIG = {
    enabled: false, // Disable auto-sync
    // ...
};
```

### Enable WebSocket Server

For instant real-time sync, use the WebSocket server:

1. Follow [WEBSOCKET_SETUP.md](WEBSOCKET_SETUP.md) instructions
2. Run the server: `npm start`
3. Enable in `app.js`:
   ```javascript
   const WEBSOCKET_CONFIG = {
       enabled: true,
       url: 'ws://localhost:3000',
       socket: null
   };
   ```

## Troubleshooting

### Sync Not Working

**Check**:
1. GitHub token is configured: Open console and check `localStorage.getItem('githubToken')`
2. Token has `repo` permissions
3. Repository name and owner are correct in `GITHUB_CONFIG`
4. Check browser console for error messages
5. View error log: Click "🔍 View Error Log" at bottom of page

### Conflicts Keep Occurring

**Solutions**:
1. Ensure all devices have the same GitHub token
2. Click "Refresh" button before making changes
3. Use WebSocket server for instant sync
4. Increase auto-sync interval if on slow connection

### Data Not Appearing on Other Device

**Steps**:
1. Check "Last sync" indicator - should show recent time
2. Click "🔄" refresh button manually
3. Check network connection on both devices
4. Verify both devices are using the same GitHub repository
5. Check GitHub repository directly - verify `data.json` has your changes

### Offline Changes Not Syncing

**Check**:
1. View browser console for sync queue status
2. Check localStorage: `localStorage.getItem('dailyBoard_syncQueue')`
3. Manually trigger sync: Click "💾 Update" button
4. Reload the page to restart sync queue processing

## Best Practices

### For Reliable Multi-Device Sync

1. **Always refresh before making changes** on a device you haven't used recently
2. **Use WebSocket server** if you work on multiple devices simultaneously
3. **Enable notifications** to see when remote changes are synced
4. **Backup regularly** using the "📥 Download" button
5. **Monitor the error log** if you experience sync issues

### For Team/Family Use

1. **Share the same GitHub token** with all users
2. **Set up WebSocket server** on a local network or cloud host
3. **Use shorter sync intervals** (e.g., 15 seconds)
4. **Communicate** before making major changes to avoid conflicts
5. **Create backups** before significant updates

## Security Considerations

### GitHub Token Security

- **Never commit your token** to the repository
- **Use browser localStorage** only (stored securely)
- **Rotate tokens** periodically
- **Use minimum required permissions** (only `repo` scope)
- **Don't share tokens** in public channels

### Data Privacy

- All data is stored in **your repository** (not third-party servers)
- **Only you** have access with your token
- Data is transmitted via **HTTPS** (encrypted)
- **No analytics** or tracking

## Migration to Other Cloud Services

If you want to switch from GitHub to another service:

1. **Export your data**: Click "📥 Download" button
2. **Modify app.js**:
   - Replace API endpoints
   - Update authentication
   - Adjust conflict resolution for new service
3. **Test thoroughly** with test data first
4. **Import data** to new service
5. **Configure new authentication** on all devices

## Summary

Daily Board provides a **simplified, flexible architecture** for multi-device synchronization:

- ✅ **No complex backend** - direct JSON file sync
- ✅ **Multiple cloud options** - Local Server, Dropbox, Google Drive, GitHub ✨ UPDATED
- ✅ **Automatic sync** - polls every 5 seconds for changes ✨ UPDATED
- ✅ **Offline support** - queue changes and sync when online
- ✅ **Conflict resolution** - provider-specific strategies (SHA-based for GitHub, last-write-wins for cloud storage)
- ✅ **Real-time collaboration** - optional WebSocket server
- ✅ **Secure** - your data, your storage, your control
- ✅ **Easy setup** - UI-based token configuration ✨ NEW

For issues or questions, check the error log or GitHub repository issues page.
