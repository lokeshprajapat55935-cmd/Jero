# Jero Platform - Android Production Readiness & Play Store Launch Guide

This manual contains details for configuring app icons, splash screens, deep linking, app versioning, and release signing keys to launch the **Jero Pro** and **Jero Client** apps on the Google Play Store.

---

## 🎨 1. APP ICONS & SPLASH SCREENS

Play Store requirements demand distinct layouts for different screen resolutions.

### A. App Icons (Adaptive Icons)
1. **Source Assets:** Create square PNG logos of `512x512` pixels.
2. **Adaptive Layouts:** Android 8.0+ requires adaptive launcher icons consisting of a Foreground layer (logo with transparency) and a Background layer (solid color or pattern).
3. **Paths:** Place adaptive icon vector resource files inside your native Android directory:
   - Foreground: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
   - Backups (legacy sizes): `mipmap-hdpi`, `mipmap-xhdpi`, `mipmap-xxhdpi`, `mipmap-xxxhdpi`.

### B. Splash Screens (Android 12+ Splash Screen API)
Configure the Android theme to show a splash logo immediately during initialization to guarantee a load time feel under 2 seconds.
1. Add to `android/app/src/main/res/values/styles.xml`:
   ```xml
   <style name="Theme.App.Starting" parent="Theme.SplashScreen">
       <item name="windowSplashScreenBackground">#14826f</item>
       <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
       <item name="postSplashScreenTheme">@style/Theme.App</item>
   </style>
   ```
2. Apply `Theme.App.Starting` as the default theme inside your `AndroidManifest.xml` launcher activity.

---

## 🔗 2. DEEP LINKING CONFIGURATION (TWA & VERIFIED URLS)

Deep linking allows clicking `zolvo.in` links on Android to open the app directly.

### A. Hosting the Digital Asset Links (Server-side)
Ensure the JSON verification mapping is accessible without redirects at this exact URL path:
`https://zolvo.in/.well-known/assetlinks.json` (See the included [assetlinks.json](file:///c:/Users/lokeshkumar/my-app/zolvo-app/public/.well-known/assetlinks.json)).

### B. Configuring the Android Manifest Intent Filters
Inside `android/app/src/main/AndroidManifest.xml`, configure intent filters inside the main activity element:
```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="zolvo.in" />
</intent-filter>
```

---

## 📈 3. APP VERSIONING SCHEME

Enforce clean incremental version structures in `android/app/build.gradle`:

```groovy
android {
    defaultConfig {
        // Version Code: Monotonically increasing integer. Never reuse.
        versionCode 1
        
        // Version Name: Human-readable semver string shown on the Play Store.
        versionName "1.0.0"
    }
}
```

Recommended Release Cadence:
- **Major (1.0.0):** Major feature additions or database schema overhauls.
- **Minor (1.1.0):** General UI enhancements or feature iterations.
- **Patch (1.1.1):** Security patches or hotfixes.

---

## 🔑 4. SECURE RELEASE SIGNING

Never deploy debug APKs to Google Play. You must generate an encrypted release keystore.

### Step 1: Generate Keystore
Run the keytool command to generate a private signing key:
```bash
keytool -genkey -v -keystore zolvo-release-key.jks \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -alias zolvo-key-alias
```
*Keep this keystore file extremely safe. Losing it prevents uploading updates.*

### Step 2: Configure Signing Properties
Create a `key.properties` config file in `android/key.properties` (do **NOT** commit to git):
```properties
storePassword=[YOUR_KEYSTORE_PASSWORD]
keyPassword=[YOUR_KEY_PASSWORD]
keyAlias=zolvo-key-alias
storeFile=../zolvo-release-key.jks
```

### Step 3: Link Signing Config in Gradle
Modify `android/app/build.gradle` to load key properties:
```groovy
def signingPropertiesFile = rootProject.file('key.properties')
def signingProperties = new Properties()
if (signingPropertiesFile.exists()) {
    signingProperties.load(new FileInputStream(signingPropertiesFile))
}

android {
    signingConfigs {
        release {
            if (signingProperties.containsKey('storeFile')) {
                storeFile = file(signingProperties['storeFile'])
                storePassword = signingProperties['storePassword']
                keyAlias = signingProperties['keyAlias']
                keyPassword = signingProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

Generate the release Android App Bundle (AAB):
```bash
# From android/ directory
./gradlew bundleRelease
```
Upload the output AAB file (`android/app/build/outputs/bundle/release/app-release.aab`) to the Google Play Console!
