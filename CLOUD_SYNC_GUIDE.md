# Cloud Storage Synchronization Guide

## Overview

Daily Board supports seamless multi-device synchronization using multiple sync methods. This guide explains how to synchronize your task data across multiple devices (phone, laptop, desktop, etc.) with or without cloud storage.

## Sync Modes ✨ NEW

Daily Board now supports **three automatic sync modes** that are detected automatically:

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

### 2. GitHub Sync (Cloud-Based)

### 2. GitHub Sync (Cloud-Based)

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

### 3. Local-Only Mode (No Sync)

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
2. **GitHub**: If a GitHub token is configured in localStorage
3. **Local-Only**: If neither server nor token is available

You can switch modes by:
- Starting/stopping the local server
- Adding/removing a GitHub token (via browser console)

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

## Alternative Cloud Storage Options

While GitHub is the default and recommended option, you can integrate other cloud storage services:

### Option 1: Dropbox Integration

**Concept**: Store `data.json` in a Dropbox folder and use Dropbox API for sync.

**Implementation Steps**:

1. **Modify app.js** to use Dropbox API instead of GitHub API
2. **Key changes needed**:
   - Replace `GITHUB_CONFIG` with `DROPBOX_CONFIG`
   - Update `fetchDataFromGitHub()` to use Dropbox API endpoints
   - Update `updateDataToGitHub()` to use Dropbox file upload
   - Implement Dropbox OAuth for authentication

3. **Dropbox API Endpoints**:
   ```javascript
   // Download file
   POST https://content.dropboxapi.com/2/files/download
   
   // Upload file
   POST https://content.dropboxapi.com/2/files/upload
   
   // Get file metadata
   POST https://api.dropboxapi.com/2/files/get_metadata
   ```

4. **Benefits**:
   - Native mobile app support
   - Larger storage (2GB free tier)
   - Better file versioning

### Option 2: Google Drive Integration

**Concept**: Store `data.json` in Google Drive and use Drive API for sync.

**Implementation Steps**:

1. **Enable Google Drive API** in Google Cloud Console
2. **Modify app.js** to use Google Drive API
3. **Key changes needed**:
   - Replace `GITHUB_CONFIG` with `DRIVE_CONFIG`
   - Implement OAuth 2.0 authentication
   - Use Drive API v3 endpoints

4. **Google Drive API Endpoints**:
   ```javascript
   // Get file
   GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
   
   // Update file
   PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}
   
   // Get file metadata
   GET https://www.googleapis.com/drive/v3/files/{fileId}
   ```

5. **Benefits**:
   - 15GB free storage
   - Integration with Google ecosystem
   - Built-in versioning and backup

### Option 3: Local File System (Desktop)

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

Daily Board implements robust conflict resolution:

### Current Strategy (GitHub)

1. **SHA-based Detection**: Before saving, checks if remote SHA matches local SHA
2. **Conflict Dialog**: If conflict detected, prompts user to:
   - Fetch latest data and merge manually (recommended)
   - Force save local changes (overwrites remote)

3. **Timestamp-based Merging**: When auto-syncing detects changes:
   - Fetches remote data automatically
   - Updates UI with latest data
   - Shows notification: "📥 Data synchronized from remote"

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
- ✅ **Multiple cloud options** - GitHub (default), Dropbox, Google Drive
- ✅ **Automatic sync** - polls every 30 seconds for changes
- ✅ **Offline support** - queue changes and sync when online
- ✅ **Conflict resolution** - SHA-based detection with manual merge option
- ✅ **Real-time collaboration** - optional WebSocket server
- ✅ **Secure** - your data, your repository, your control

For issues or questions, check the error log or GitHub repository issues page.
