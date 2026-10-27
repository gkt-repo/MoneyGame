# Room invitation links

Sharing uses `https://mgame-1.web.app/join/<room-code>`. Opening a link never reserves a paid seat. The app fills the code, loads the room, and asks the player to confirm the displayed fee. If login is required, the pending invitation stays in the app until login completes. A new link while the app is running closes the previous screen and opens the new invitation. Existing token links also work.

Without the app, the same URL opens the browser invitation preview. The page offers **Open installed app** (`moneygame://join/<code-or-token>`) as a fallback. Browsers may require that explicit tap for custom schemes.

## Android activation

The manifest registers verified HTTPS App Links for `/join/` on `mgame-1.web.app`. The website serves `/.well-known/assetlinks.json`; Firebase hosting includes this directory rather than excluding all dot directories.

The association includes the public SHA-256 fingerprints read from this workspace's debug certificate and configured signing certificate. No private keys or passwords are published. This supports development builds signed by either existing local key; it does not automatically trust other developers' keys or future Play signing certificates. Remove the debug fingerprint when this becomes a production-only domain.

1. Build and deploy the user website, including the association file.
2. Verify that `https://mgame-1.web.app/.well-known/assetlinks.json` returns the JSON file with HTTP 200, without authentication or redirects.
3. Install the updated Android app. An old installed APK cannot acquire the new link handler without an update.
4. On a connected test device, request verification and inspect its result:

```sh
adb shell pm verify-app-links --re-verify com.moneygame.user
adb shell pm get-app-links com.moneygame.user
```

The domain should show `verified`. Tap a real invitation from another app to check OS resolution, once with MoneyGame closed and once with it open. Check logged-out login continuation, a full/expired room, and the browser fallback without the app installed. A user who disabled **Open supported links** may need to enable it in Android settings.

The automated Flutter tests cover startup, platform route delivery, login continuation, replacement of an existing preview, and invalid-link rejection. APK compilation checks the manifest/build integration; it does not prove OS domain verification against a deployed website.

Official references: [Flutter Android App Links](https://docs.flutter.dev/cookbook/navigation/set-up-app-links), [Android verification](https://developer.android.com/training/app-links/verify-applinks).

## iOS

The app registers `moneygame://join/...` and uses Flutter's scene-aware link handling. The browser's **Open installed app** button can use this scheme. Direct HTTPS Universal Links still need an Apple Team ID, Associated Domains entitlement, and a deployed `apple-app-site-association` file. Those signing values are not available yet. iOS native behavior needs validation on an Apple simulator/device.

Reference: [Flutter iOS Universal Links](https://docs.flutter.dev/cookbook/navigation/set-up-universal-links).

No website deployment or device installation is performed by these source changes.
