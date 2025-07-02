# Swimming Club - Strava Integration Hub

An all-in-one web application built on Google Apps Script and Google Sheets to create a community hub for a sports club. It integrates deeply with the Strava API to automatically track activities, manage leaderboards, and host events. While built for swimming, it can be easily adapted for other sports like running or cycling. **This project was developed with the assistance of Google's Gemini, which served as an AI coding partner to help write, debug, and document the code.**

---

![Project Demo](./screenshots/project-demo.gif)

---

## Key Features

- **Full Strava Integration:** Secure OAuth2 authentication for members and real-time activity updates.
- **Automated Activity Sync:** A fallback system with background triggers periodically syncs activity data for all authorized members.
- **Optional Real-time Webhooks:** A secure Cloudflare Worker acts as a proxy to instantly receive events from Strava, triggering immediate data updates for a real-time experience.
- **Rich Community & Management Suite:** Features dynamic leaderboards, a central dashboard with key club stats, a full event and challenge system with member registration.
- **Customizable & Flexible:** Easily change the tracked sport from Swimming to Running, Cycling, etc., via a single configuration setting.

---

## Project Architecture

This project consists of two main components that work together:

- **Google Apps Script (Backend & Frontend):** The core logic, data storage (Google Sheets), and web app UI server.
- **Cloudflare Worker (Webhook Proxy):** A secure, public-facing endpoint for Strava Webhooks. It resolves an architectural conflict where Strava's requirement for an instant `200 OK` response clashes with Google Apps Script's `302 Redirect` behavior, ensuring reliability and security.

---

## Setup and Installation Guide

Follow these steps to set up and deploy your own instance of the club hub.

### Prerequisites

* A **Google Account** (for Google Sheets and Apps Script).
* A **Cloudflare Account** (optional, only if using webhooks).
* **Node.js** and **npm** installed on your machine (optional, only if using webhooks).
* A **Strava API Application**. You can create one at [Strava's API Settings](https://www.strava.com/settings/api).

### Step 1: Strava API Application Setup
1.  Create a new application on the Strava API page.
2.  Note down your **Client ID** and **Client Secret**.
3.  For the **Authorization Callback Domain**, enter `script.google.com`.

### Step 2: Google Sheets & Apps Script Setup

1.  **Create the Spreadsheet:**
    * Create a new Google Sheet. This will be your database.
    * Create the following sheets inside it with the specified headers. The order of columns matters.

    | Sheet Name | Required Headers |
    | :--- | :--- |
    | `Database` | `ID`, `NAME`, `USER_DATA`, `LAST_UPDATED` |
    | `Activities` | `id`, `athlete_id`, `name`, `type`, `distance`, `moving_time`, `start_date` |
    | `Events` | `ID`, `Title`, `Description`, `ImageURL`, `Date`, `Location`, `MaxParticipants`, `Status`, `EventType`, `RegistrationType`, `ShowAttendees` |
    | `Challenges` | `ChallengeID`, `Name`, `Description`, `ImageURL`, `Type`, `Goal`, `StartDate`, `EndDate`, `Status` |
    | `ChallengeParticipants` | `ChallengeID`, `UserID`, `Progress`, `LastUpdated` |
    | `Registrations` | `EventID`, `Name`, `ParticipationType`, `RegisteredAt`, `Notes`, `StravaLink` |
    | `Pools` | `Name`, `Description`, `ImageURL`, `Address`, `OperatingHours`, `PoolLength` |
    | `Posts` | `ID`, `Title`, `Summary`, `ImageURL`, `DocID` |


2.  **Create the Apps Script Project:**
    * In your new Google Sheet, go to `Extensions > Apps Script`.
    * Copy all the code from the `google_apps_script` directory into your Apps Script project, creating new files as needed for each `.js` and `.html` file.
    * Copy the content of `appsscript.json` into the `appsscript.json` file in the editor.

3.  **Set up Script Properties:**
    * In the Apps Script editor, go to `Project Settings`.
    * Click `Edit script properties`.
    * Add the following properties:
        * `STRAVA_CLIENT_ID`: Your Client ID from Strava.
        * `STRAVA_CLIENT_SECRET`: Your Client Secret from Strava.
        * **(Optional - For Webhooks)** `STRAVA_VERIFY_TOKEN`: A strong, unique string you create.
        * **(Optional - For Webhooks)** `WORKER_SHARED_SECRET`: A very strong, random password you create.
        * **(Optional - For Webhooks)** `CLOUDFLARE_WORKER_URL`: You will fill this in after deploying the worker.

4.  **Deploy the Web App:**
    * In the editor, click **Deploy > New deployment**.
    * Select Type: **Web app**.
    * Configure: **Execute as:** `Me`, **Who has access:** `Anyone`.
    * Click **Deploy**.
    * Copy the **Web app URL** (the one ending in `/exec`).

### Step 3: Cloudflare Worker Setup (Optional - For Webhooks)

1.  Navigate to the `cloudflare_worker` directory in your terminal.
2.  Run `npm install`.
3.  Log in to Cloudflare: `wrangler login`.
4.  Set up your secrets. Wrangler will prompt you for each value.
    ```bash
    npx wrangler secret put GAS_WEB_APP_URL
    npx wrangler secret put STRAVA_VERIFY_TOKEN
    npx wrangler secret put WORKER_SHARED_SECRET
    ```
5.  Deploy the worker: `npx wrangler deploy`.
6.  Copy the **worker URL** that is output.

### Step 4: Finalizing Connections

1.  **Update GAS Properties:** Go back to your GAS Script Properties and fill in the `CLOUDFLARE_WORKER_URL` with the URL you just copied from the worker deployment.
2.  **Run Setup Functions:** In the GAS editor, run these functions manually one by one from the "Run" menu:
    * `setupWorkerUrl()` (if using webhooks)
    * `setupWebhookSecret()` (if using webhooks)
3.  **Create Webhook Subscription:** Run the `createWebhookSubscription()` function from the GAS editor to tell Strava to start sending events to your Worker.
4.  **Set up Triggers:** In the GAS editor, go to `Triggers` and create triggers for the following functions based on your setup:
    * `processCommunityChallenges`: Time-driven, every hour.
    * **If using Webhooks:**
        * `monitorWebhookHealth`: Time-driven, every day.
    * **If NOT using Webhooks:**
        * `processActivitySyncQueue`: Time-driven, every 15 minutes.

Your application is now live!

---

## Troubleshooting

- **Problem:** After deploying the Google Apps Script Web App, you get a "Page Not Found" error from Google when trying to access it or send a POST request.
- **Solution:** This almost always means there is an issue with your deployment settings.
    1.  **Redeploy:** After ANY code change, you **must** create a new version of your deployment. Go to `Deploy > Manage deployments > Edit Version: New version > Deploy`. Just saving the project is not enough.
    2.  **Check Permissions:** Ensure `Who has access` is set to `Anyone`. If it's set to `Anyone with a Google account`, anonymous requests from services like Cloudflare Workers or `curl` will be rejected.
    3.  **Check URL:** Ensure you are using the Web App URL ending in `/exec`, not `/dev`.

---

## Development with `clasp` (Recommended)

Manually copying and pasting code into the Apps Script editor is slow. For a professional workflow, use `clasp`, the official command-line tool for Google Apps Script.

1.  **Install clasp:** `npm install -g @google/clasp`
2.  **Log in:** `clasp login`
3.  **Link the project:** Navigate to the `google_apps_script` directory and run `clasp clone <Script ID>`. You can get the Script ID from `Project Settings` (⚙️ icon).
4.  **Push changes:** After editing code locally in your favorite editor (like VS Code), run `clasp push` to upload the files to your Apps Script project instantly.

---

## Customization for Other Sports

This project can be easily adapted from Swimming to other sports like Running, Cycling, or Hiking.

1.  **Primary Configuration:**
    * Open the `Constants.js` file.
    * Find the `STRAVA_SETTINGS` object.
    * Change the value of `ACTIVITY_TYPE_TO_SYNC` from `'Swim'` to your desired activity type (e.g., `'Run'`, `'Ride'`, `'Walk'`). This must match one of [Strava's activity types](https://developers.strava.com/docs/reference/#api-models-ActivityType).

2.  **UI Text and Images (Optional):**
    * For a more polished experience, you may want to update text and images in the `home.html` file.
    * For example, change the title from "Dive In" to "Lace Up", update background images, and change labels from "Swimmers" to "Runners".

---

## License

This project is licensed under the MIT License.