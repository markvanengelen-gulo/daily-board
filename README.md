# Daily Board

A streamlined daily discipline tracker with cross-device synchronization via GitHub.

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

### Cross-Device Synchronization ✨ NEW
- Sync your data across all devices using GitHub as centralized storage
- All data is stored in a `data.json` file in your repository
- Automatic synchronization when configured with a GitHub Personal Access Token
- Fallback to local storage when offline or not configured

## Usage

### Getting Started

1. Clone or download this repository
2. Open `index.html` in your web browser
3. (Optional) Configure GitHub sync for cross-device access

### Setting Up GitHub Synchronization

To enable cross-device synchronization:

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

**Note**: The repository is configured to use `markvanengelen-gulo/daily-board`. If you fork this repository, update the `GITHUB_CONFIG` object in `app.js` with your username and repository name.

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

## Security

- GitHub Personal Access Tokens are stored securely in browser localStorage
- Tokens are never exposed in the UI (displayed as masked)
- All API calls use HTTPS
- Tokens are never committed to the repository

## Privacy

- All your data is stored in your own GitHub repository
- No third-party services are used
- You have complete control over your data
