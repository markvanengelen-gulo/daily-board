# Google Drive Sync Setup Guide

This guide will help you set up Google Drive sync for the Daily Board application.

## Overview

The Daily Board supports two types of Google Drive sync:
1. **Authenticated Sync** (Full read/write) - Requires OAuth 2.0 token
2. **Public File Sync** (Read-only) - No authentication needed

## Option 1: Authenticated Google Drive Sync (Recommended)

This method allows you to read and write data to your Google Drive.

### Prerequisites
- A Google account
- Google Cloud Console access

### Setup Steps

#### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "Daily Board Sync")
4. Click "Create"

#### Step 2: Enable Google Drive API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

#### Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External
   - App name: "Daily Board"
   - User support email: Your email
   - Developer contact: Your email
   - Save and continue through the scopes and test users screens
4. Back in "Credentials", click "Create Credentials" → "OAuth client ID"
5. Application type: "Web application"
6. Add these Authorized redirect URIs:
   - `https://developers.google.com/oauthplayground`
   - `http://localhost:8080` (if testing locally)
7. Click "Create" and save your Client ID and Client Secret

#### Step 4: Get Access Token Using OAuth 2.0 Playground

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. Close the settings
6. In the left panel, find "Drive API v3"
7. Select these scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive.appdata`
8. Click "Authorize APIs"
9. Sign in with your Google account and grant permissions
10. Click "Exchange authorization code for tokens"
11. Copy the "Access token" (it will look like `ya29.a0...`)

#### Step 5: Configure Daily Board

1. Open Daily Board in your browser
2. Click "⚙️ Cloud Sync Configuration" in the header
3. Scroll to the "📁 Google Drive" section
4. Paste your access token into the field
5. Click "Save Token"
6. Refresh the page

You should now see "✓ Sync: Google Drive" in green at the top!

### Important Notes

- **Access tokens expire**: Google Drive access tokens typically expire after 1 hour. You'll need to generate a new token when it expires.
- **Refresh tokens**: For a production setup, you should implement a full OAuth flow with refresh tokens. The current implementation uses access tokens for simplicity.
- **Data location**: Your `daily-board-data.json` file will be created in your Google Drive root folder (or in the configured folder).

## Option 2: Public File Sync (Read-Only)

This method is simpler but only allows reading data (no writing).

### Setup Steps

#### Step 1: Create a data.json File

1. Create a file named `data.json` with your initial data:
   ```json
   {
     "dateEntries": {},
     "tabs": [
       {
         "id": "tab_1",
         "name": "My List"
       }
     ],
     "listItems": {
       "tab_1": []
     }
   }
   ```

#### Step 2: Upload to Google Drive

1. Go to [Google Drive](https://drive.google.com/)
2. Upload your `data.json` file
3. Right-click the file and select "Share"
4. Set sharing to "Anyone with the link" can view
5. Copy the share link (e.g., `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`)

#### Step 3: Extract File ID

From your share link `https://drive.google.com/file/d/1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq/view?usp=sharing`, the file ID is the part between `/d/` and `/view`:
- File ID: `1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq`

#### Step 4: Configure Daily Board

1. Open Daily Board in your browser
2. Open the browser console (F12)
3. Run this command:
   ```javascript
   localStorage.setItem('googleDrivePublicFileId', 'YOUR_FILE_ID_HERE');
   ```
4. Refresh the page

You should now see "✓ Sync: Google Drive (Public File)" in green!

### Limitations

- **Read-only**: Changes you make locally won't be saved to Google Drive
- **Manual updates**: To update the data, you need to manually upload a new version to Google Drive
- **Public access**: Anyone with the link can view your data

## Troubleshooting

### "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT"

This usually means a browser extension (like an ad blocker) is blocking the Google Drive request.
- Try disabling ad blockers or privacy extensions
- Add an exception for `drive.google.com`

### "Access token expired"

Access tokens expire after about 1 hour. Generate a new token using the OAuth Playground.

### "File not found" Error

- Make sure the file ID is correct
- Check that the file sharing settings are set to "Anyone with the link"
- Verify the file exists in your Google Drive

### Sync shows "Local Only"

- Make sure you saved the token correctly
- Check the browser console (F12) for error messages
- Try refreshing the page
- Verify your token is valid using the OAuth Playground

## Advanced: Using Refresh Tokens

For a more permanent solution, you should implement refresh tokens:

1. When getting the access token from OAuth Playground, also save the refresh token
2. Store both tokens in localStorage
3. Implement token refresh logic in the app to automatically get new access tokens
4. This allows the app to work indefinitely without manual token updates

This would require modifying the `GoogleDriveSyncProvider` class to handle token refresh.

## Security Considerations

- **Never commit tokens**: Don't commit access tokens to version control
- **Use HTTPS**: Always use HTTPS in production
- **Scope limitations**: Only request the minimum required scopes
- **Token rotation**: Regularly rotate access tokens
- **Local storage**: Remember that localStorage is not encrypted

## Need Help?

If you encounter issues:
1. Check the browser console (F12) for error messages
2. Click "🔍 View Error Log" in the app footer
3. Verify your token is valid
4. Check the [CLOUD_SYNC_GUIDE.md](CLOUD_SYNC_GUIDE.md) for more details
5. Open an issue on GitHub with error details
