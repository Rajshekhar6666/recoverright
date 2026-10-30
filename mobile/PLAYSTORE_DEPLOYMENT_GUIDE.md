# RecoverRight Patient Companion — Google Play Store Deployment Guide

This document contains everything required to deploy the **RecoverRight Patient Companion** app (`org.recoverright.companion`) to the **Google Play Store**.

---

## 1. App Identity & Store Listing Metadata

| Field | Production Value |
|---|---|
| **App Name** | `RecoverRight Patient Companion` |
| **Short Description** (Max 80 chars) | `Discharge recovery companion with alarms, vitals tracker & voice safety care.` |
| **Package Name / Application ID** | `org.recoverright.companion` |
| **Version Name** | `1.0.0` |
| **Version Code** | `1` |
| **Category** | `Medical` |
| **Tags** | `Health & Fitness`, `Medication Reminder`, `Clinical Care` |
| **Content Rating** | `Everyone / PEGI 3 / USK 0` (Non-violent health management) |

### Full Description (Copy & Paste for Store Listing)
```markdown
RecoverRight is your personal hospital discharge recovery companion, ensuring you heal safely, stay on track with medications, and stay connected with your clinical care team at home.

After hospital discharge, navigating prescriptions, follow-up dates, and symptom warnings can feel overwhelming. RecoverRight translates complex clinical discharge summaries into natural, empathetic daily recovery routines tailored to your needs.

🌟 KEY FEATURES:

1. Personalized Voice Companions:
Choose a comforting voice persona that feels like family caring for you:
• Maa (Mother): Loving, gentle Hindi/English reminders ("Beta, paracetamol lele").
• Didi (Elder Sister): Calm, reassuring encouragement.
• Bhai (Brother): Energetic, motivating recovery partner.
• Dr. Uncle: Reassuring, clinical guidance.
• Dada Ji: Patient, wise traditional care.
• Guruji: Mindful, meditative wellness encouragement.

2. Smart Medication Alarms & Offline Adherence:
• Spoken voice alarms tailored to your persona.
• Lock screen interactive notifications ("Taken", "Snooze 10m").
• Works 100% offline — alarms ring even without internet access.

3. Background Voice Distress Safety:
• Hands-free voice emergency detection for critical words like "Help", "Bachao", or "Bohot dard hai".
• Zero audio recording — analyzes keywords strictly in volatile device memory and alerts your care team immediately.

4. Daily Vitals & MEWS Risk Index:
• Record Heart Rate, Blood Pressure, Temperature, and SpO2.
• Calculates clinical Modified Early Warning Score (MEWS) to detect early deterioration before it becomes critical.

5. Recovery Milestone Certificate & Streaks:
• Build medication streaks and celebrate milestones.
• Earn official hospital recovery certificates and share progress with family.

6. Family Caregiver Circle:
• Keep family and caregivers informed of your recovery milestones and emergency status.

🔒 PRIVACY & MEDICAL DISCLAIMER:
RecoverRight is compliant with ABDM and DISHA healthcare data protection standards. All health data is encrypted in transit using TLS 1.3. Microphones are utilized strictly for real-time distress detection with zero audio recording or cloud storage. RecoverRight is an adherence companion designed to support post-discharge recovery and is not a substitute for professional medical diagnosis.
```

---

## 2. Graphic Assets Specifications

| Asset | Dimensions | Status in Repo |
|---|---|---|
| **App Icon** | 512 x 512 px (32-bit PNG, no alpha) | `assets/icon.png` ✅ |
| **Adaptive Icon Foreground** | 512 x 512 px (PNG) | `assets/adaptive-icon.png` ✅ |
| **Splash Screen** | 1024 x 1024 px (PNG) | `assets/splash.png` ✅ |
| **Notification Icon** | 96 x 96 px (Monochrome White on transparent) | `assets/notification-icon.png` ✅ |
| **Feature Graphic** | 1024 x 500 px (JPEG or 24-bit PNG) | Required for Play Store Listing |
| **Phone Screenshots** | Minimum 4 (1080 x 1920 or 1080 x 2400 px) | Capture from Home, Alarms, Voice, & Certificate |

---

## 3. Release Signing Keystore

A production-grade RSA 2048-bit release keystore has been generated:

- **Location**: `mobile/recoverright-release.keystore`
- **Alias**: `recoverright-key`
- **Keystore Password**: `RecoverRight2026!`
- **Key Password**: `RecoverRight2026!`
- **Validity**: 10,000 Days (until March 2054)
- **SHA-256 Fingerprint**: `0B:E1:F0:D5:5E:B8:00:87:8D:34:E8:03:0A:49:F0:91:86:89:13:6F:9E:2D:4F:D8:EB:7C:C1:09:D4:86:AC:51`

Configured in `credentials.json` for automated release packaging.

---

## 4. Google Play Data Safety Questionnaire Answers

Google Play strictly requires declaring data practices in the Play Console **App Content > Data safety** section:

1. **Does your app collect or share any of the required user data types?**
   - **Yes**

2. **Is all user data collected by your app encrypted in transit?**
   - **Yes** (All requests use TLS 1.3 / HTTPS).

3. **Do you provide a way for users to request that their data be deleted?**
   - **Yes** (Users can tap "Erase Clinical Data & Reset Account" in Settings).

4. **Data Types Declared**:
   - **Personal Info**:
     - *Name*: App functionality, Account management.
     - *Phone number*: Authentication via OTP, Clinical handover.
   - **Health & Fitness**:
     - *Health info*: Medication schedule, self-reported vitals (BP, Heart Rate, SpO2), recovery mood.
     - Ephemeral / strictly clinical: Not shared with third-party advertisers.
   - **Voice & Audio Recordings**:
     - **NO AUDIO RECORDINGS COLLECTED OR SHARED**.
     - Declare: Microphone access is strictly used on-device in volatile RAM for keyword distress triggering and real-time voice assistance. Zero audio data is stored or uploaded.

---

## 5. Build Commands for Production Release

### Option A: Cloud Build using EAS (Recommended)
```bash
# 1. Install EAS CLI globally (if not already installed)
npm install -g eas-cli

# 2. Log in to your Expo account
npx eas-cli login

# 3. Build Google Play Android App Bundle (.aab)
cd d:\recoverright\mobile
npx eas-cli build --platform android --profile production
```
The command outputs a direct download link for `recoverright-companion.aab` ready for upload to Google Play Console.

### Option B: Local Build on this Machine
```bash
cd d:\recoverright\mobile
npx eas-cli build --platform android --profile production --local
```

### Option C: Build Test APK for Direct Android Device Testing
```bash
cd d:\recoverright\mobile
npx eas-cli build --platform android --profile preview --local
```

---

## 6. Google Play Console Upload Steps

1. Sign in to [Google Play Console](https://play.google.com/console).
2. Click **Create App**:
   - App Name: `RecoverRight Patient Companion`
   - Default language: `English (United States)` or `English (India)`
   - App or game: `App`
   - Free or paid: `Free`
3. In **Policy > Health apps**:
   - Select `Patient care` and `Medication management`.
   - Provide Privacy Policy URL: `https://recoverright.health/privacy`
4. In **Release > Internal testing** (or Production):
   - Click **Create new release**.
   - Upload the generated `recoverright-companion.aab` file.
   - Release name: `1.0.0 (1)`.
   - Release notes:
     ```
     Initial production release of RecoverRight Patient Companion.
     - Personalized Voice Recovery Companions (Maa, Didi, Bhai, Doctor, Dada ji, Guru)
     - Smart medication alarms and streak tracking
     - Hands-free background voice safety listener
     - MEWS vital signs safety index
     - Milestone recovery certificate and family caregiver connection
     ```
5. Click **Save** and **Review Release**.
6. Once approved by Google (typically 1–3 business days for health apps), your app will be live on Google Play!
