# Auto-Sync Testing Guide

## Overview

This document describes the automatic synchronization features added to Daily Board and how to test them.

## New Features

### 1. Automatic Polling

**What it does**: Checks GitHub for remote file updates every 30 seconds automatically.

**Configuration**:
```javascript
const AUTO_SYNC_CONFIG = {
    enabled: true,           // Enable/disable auto-sync
    intervalMs: 30000,       // Polling interval (30 seconds)
    lastSyncTime: null,      // Tracks last successful sync
    pollTimer: null          // Timer reference
};
```

**Functions**:
- `startAutoSync()` - Initializes polling on app startup
- `checkForRemoteUpdates()` - Compares local SHA with remote SHA
- `updateSyncStatusDisplay()` - Updates "Last sync" UI indicator

### 2. Sync Status Display

**Location**: Header section of the app, below the subtitle

**Display Format**: 
- "Last sync: Never" (when no sync has occurred)
- "Last sync: just now" (< 1 minute ago)
- "Last sync: X minutes ago" (< 1 hour)
- "Last sync: X hours ago" (≥ 1 hour)

**Updates**: Refreshes every 30 seconds to show relative time

## Testing Procedures

### Test 1: Auto-Sync Detection

**Scenario**: Verify app detects remote changes automatically

**Steps**:
1. Open the app on Device A (or Browser Tab 1)
2. Configure GitHub token: `localStorage.setItem('githubToken', 'YOUR_TOKEN')`
3. Refresh the page
4. Make a change (add a task, check a discipline)
5. Click "💾 Update" to save
6. Open the app on Device B (or Browser Tab 2) with same token
7. Wait 30 seconds (or manually trigger: click 🔄 button)
8. Verify the change appears on Device B
9. Check "Last sync" indicator shows recent time

**Expected Results**:
- Device B should automatically detect and fetch changes within 30 seconds
- Notification: "📥 Data synchronized from remote"
- "Last sync" indicator updates to "just now"
- Changes appear in the UI without manual refresh

### Test 2: Sync Status Display

**Scenario**: Verify sync status indicator works correctly

**Steps**:
1. Open the app with GitHub token configured
2. Initially see "Last sync: Never"
3. Make a change and click "💾 Update"
4. Observe "Last sync: just now"
5. Wait 2 minutes
6. Observe "Last sync: 2 minutes ago"
7. Make another change and save
8. Observe "Last sync: just now" again

**Expected Results**:
- Status updates after each successful sync
- Relative time updates every 30 seconds
- Accurate time calculations

### Test 3: Offline Mode with Auto-Sync

**Scenario**: Verify auto-sync handles offline mode gracefully

**Steps**:
1. Open the app with GitHub token
2. Open browser DevTools → Network tab
3. Set to "Offline" mode
4. Observe "⚠️ Offline Mode" indicator
5. Make changes (add tasks)
6. Changes saved to localStorage
7. Set back to "Online" mode
8. Wait 30 seconds
9. Verify auto-sync processes pending queue

**Expected Results**:
- Auto-sync pauses when offline (skips poll cycles)
- No error messages during offline mode
- Resumes automatically when online
- Pending changes sync within 30 seconds of reconnection

### Test 4: Conflict Detection

**Scenario**: Test conflict resolution with simultaneous edits

**Steps**:
1. Open app on Device A, go offline
2. Open app on Device B, go offline
3. Make different changes on both devices
4. On Device A: Add "Task A"
5. On Device B: Add "Task B"
6. Bring Device A online, click "💾 Update"
7. Bring Device B online
8. Wait 30 seconds for auto-sync to detect conflict
9. On Device B, try to save changes

**Expected Results**:
- SHA mismatch detected
- Conflict dialog appears
- Options to:
  - Fetch latest and merge manually (recommended)
  - Force save local changes (overwrites remote)
- User can choose resolution strategy

### Test 5: Configuration Changes

**Scenario**: Test with different polling intervals

**Steps**:
1. Edit `app.js` and change `intervalMs: 30000` to `intervalMs: 10000`
2. Reload the app
3. Make a change on Device A
4. Verify Device B detects changes within 10 seconds

**Expected Results**:
- Polling interval respects configuration
- Shorter intervals = faster sync detection
- Longer intervals = reduced API calls

### Test 6: Disable Auto-Sync

**Scenario**: Verify manual-only sync mode

**Steps**:
1. Edit `app.js` and change `enabled: true` to `enabled: false`
2. Reload the app
3. Make a change on Device A and save
4. On Device B, wait 60 seconds
5. Verify changes do NOT appear automatically
6. Click 🔄 refresh button manually
7. Verify changes now appear

**Expected Results**:
- No automatic polling occurs
- Console shows: "[Auto-Sync] Disabled"
- Manual refresh button still works
- Manual "💾 Update" button still works

## Performance Considerations

### API Rate Limits

GitHub API rate limits (without authentication):
- 60 requests per hour per IP

GitHub API rate limits (with authentication):
- 5,000 requests per hour per token

With 30-second polling:
- 120 requests per hour = **well within limits**

To reduce API calls:
- Increase `intervalMs` (e.g., 60000 for 1 minute)
- Use WebSocket server for real-time sync instead
- Disable auto-sync and rely on manual refresh

### Network Impact

Each poll makes 1 API request:
- `GET /repos/{owner}/{repo}/contents/data.json` (~500 bytes)
- Only fetches metadata to compare SHA
- Full file download only if SHA changed

Minimal bandwidth usage: ~1 KB per minute

## Debugging

### Console Logs

Enable verbose logging in browser console:

```javascript
// Check auto-sync status
console.log(AUTO_SYNC_CONFIG);

// Check if polling is active
console.log('Poll timer active:', AUTO_SYNC_CONFIG.pollTimer !== null);

// Check last sync time
console.log('Last sync:', AUTO_SYNC_CONFIG.lastSyncTime);
```

### Common Issues

**Issue**: "Last sync: Never" never changes
- **Check**: GitHub token is configured
- **Check**: Console for error messages
- **Check**: `GITHUB_CONFIG` matches your repository

**Issue**: Auto-sync not detecting changes
- **Check**: Both devices have same token
- **Check**: Both devices point to same repository
- **Check**: Wait full 30 seconds between checks
- **Check**: Remote file actually changed (check GitHub)

**Issue**: Too many API requests
- **Solution**: Increase `intervalMs` to 60000 or higher
- **Solution**: Use WebSocket server for real-time sync

## WebSocket Alternative

For instant sync without polling, use the WebSocket server:

1. Start server: `npm start`
2. Enable in `app.js`:
   ```javascript
   const WEBSOCKET_CONFIG = {
       enabled: true,
       url: 'ws://localhost:3000',
       socket: null
   };
   ```
3. Changes broadcast instantly to all connected clients
4. Zero polling overhead
5. See [WEBSOCKET_SETUP.md](WEBSOCKET_SETUP.md) for details

## Summary

The auto-sync feature provides:
- ✅ Automatic detection of remote changes
- ✅ Configurable polling interval
- ✅ Visual sync status indicator
- ✅ Minimal API usage
- ✅ Graceful offline handling
- ✅ Conflict detection and resolution
- ✅ No manual intervention required

For advanced users, WebSocket sync provides instant updates with zero polling overhead.
