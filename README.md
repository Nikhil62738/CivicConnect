# CivicConnect 🏙️

**A Civic Issue Management System** — enabling citizens to report, track, and manage local civic problems with real-time location tagging and status updates.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Database Setup](#1-database-setup)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
- [Environment Variables](#environment-variables)
- [Firebase Notifications (Optional)](#firebase-notifications-optional)
- [Usage](#usage)
- [Contributing](#contributing)

---

## Overview

CivicConnect is a full-stack web application that bridges the gap between citizens and local authorities. Citizens can submit civic issues (potholes, broken streetlights, water leaks, etc.) with location data pinned on a map, and administrators can triage and update issue statuses — with push notification support via Firebase.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|--------------------------------------|
| Frontend    | React.js, Tailwind CSS, Vite         |
| Backend     | Node.js, Express                     |
| Database    | MySQL                                |
| Maps        | Google Maps API                      |
| Notifications | Firebase (FCM / Web Push)          |

---

## Project Structure

```
CivicConnect/
├── backend/          # Express API server
│   ├── src/
│   ├── .env          # Backend environment variables
│   └── package.json
├── frontend/         # React + Vite client
│   ├── src/
│   │   └── App.jsx   # Replace API key here
│   └── package.json
└── README.md
```

---

## Prerequisites

Ensure you have the following installed before getting started:

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MySQL](https://www.mysql.com/) (v8 or higher)
- A [Google Maps API Key](https://developers.google.com/maps/documentation/javascript/get-api-key)
- *(Optional)* A [Firebase project](https://console.firebase.google.com/) for push notifications

---

## Getting Started

### 1. Database Setup

1. Make sure your MySQL server is running.
2. Create a database named `civic_db`:
   ```sql
   CREATE DATABASE civic_db;
   ```
3. The backend will automatically create the required `issues` table on first startup — no manual migration needed.

> You can change the database name by updating the relevant variable in `backend/.env`.

---

### 2. Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend server will start at **http://localhost:5000**.

Make sure your `backend/.env` file is configured before starting (see [Environment Variables](#environment-variables)).

---

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be accessible at **http://localhost:5173**.

Before running, open `frontend/src/App.jsx` and replace the placeholder with your actual Google Maps API key:

```jsx
// Replace this:
const MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY";

// With your actual key:
const MAPS_API_KEY = "AIzaSy...";
```

---

## Environment Variables

Create a `.env` file inside the `backend/` directory with the following variables:

```env
# Server
PORT=5000

# MySQL Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=civic_db

# Firebase Admin (optional — for push notifications)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="your_private_key"
```

> ⚠️ Never commit your `.env` file to version control. Add it to `.gitignore`.

---

## Firebase Notifications (Optional)

Firebase packages (`firebase` and `firebase-admin`) are included in the dependencies but require your own project credentials to activate.

To enable push/web notifications when an issue status is updated by an admin:

1. Create a project at [Firebase Console](https://console.firebase.google.com/).
2. Generate a **service account key** (Project Settings → Service Accounts → Generate new private key).
3. Add the credentials to your `backend/.env` (see above).
4. Initialize Firebase in your backend using `firebase-admin` with the service account credentials.
5. On the frontend, use the `firebase` SDK to subscribe users to notifications using their FCM token.

---

## Usage

Once both servers are running:

1. Open **http://localhost:5173** in your browser.
2. **Citizens** can:
   - Submit a new civic issue with a description and location pin on the map.
   - View existing issues and their current statuses.
3. **Admins** can:
   - View all reported issues on a dashboard.
   - Update issue statuses (e.g., *Pending → In Progress → Resolved*).
   - Trigger notifications to reporters on status change (if Firebase is configured).

---

Please ensure your code is clean, well-commented, and tested before submitting.

---

*Built with ❤️ to empower communities and improve local governance.*
