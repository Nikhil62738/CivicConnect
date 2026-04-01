# CivicConnect 🏙️

**A Civic Issue Management System** — enabling citizens to report, track, and manage local civic problems with real-time location tagging and status updates.

---

## 📌 Overview

CivicConnect is a full-stack web application that connects citizens with local authorities. Users can report civic issues like potholes, water leaks, and streetlight failures, while admins can manage and update their status.

---

## 🚀 Tech Stack

| Layer         | Technology                   |
| ------------- | ---------------------------- |
| Frontend      | React.js, Tailwind CSS, Vite |
| Backend       | Node.js (No Express)         |
| Database      | MongoDB                      |
| Maps          | Google Maps API              |
| Notifications | Firebase (Optional)          |

---

## 📁 Project Structure

```
CivicConnect/
├── backend/
│   ├── server.js        # Main server (Node.js HTTP)
│   ├── db.js            # MongoDB connection
│   ├── routes/
│   │   └── issues.js    # API routes
│   ├── .env             # Environment variables
│   └── package.json
│
├── frontend/
│   ├── src/
│   └── package.json
│
└── README.md
```

---

## ⚙️ Prerequisites

Make sure you have:

* Node.js (v18 or higher)
* MongoDB (Local or Atlas)
* Google Maps API Key
* *(Optional)* Firebase project for notifications

---

## 🛠️ Getting Started

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/civicconnect.git
cd civicconnect
```

---

### 2️⃣ Backend Setup

```bash
cd backend
npm install
```

Create `.env` file:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017
DB_NAME=civic_db
```

Start server:

```bash
node server.js
```

Server will run on:

```
http://localhost:5000
```

---

### 3️⃣ Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

## 🔗 API Endpoints

### 📌 Get All Issues

```
GET /api/issues
```

### 📌 Create Issue

```
POST /api/issues
```

**Request Body Example:**

```json
{
  "title": "Pothole on road",
  "description": "Large pothole near bus stop",
  "location": "Ratnagiri"
}
```

---

## 🌐 Features

### 👤 Citizen

* Report civic issues
* View all issues
* Track issue status

### 🛠️ Admin

* View reported issues
* Update issue status
* Manage civic complaints

---

## 🔐 Environment Variables

| Variable  | Description               |
| --------- | ------------------------- |
| PORT      | Server port               |
| MONGO_URI | MongoDB connection string |
| DB_NAME   | Database name             |

---

## 🔔 Firebase Notifications (Optional)

To enable push notifications:

1. Create Firebase project
2. Generate service account key
3. Add credentials in `.env`
4. Use Firebase Admin SDK in backend

---

## 📦 Deployment

### Backend (Render / VPS)

* Set environment variables
* Start command:

```
node server.js
```

### Frontend (Netlify / Vercel)

* Build command:

```
npm run build
```

---

## ⚠️ Important Notes

* No Express is used — pure Node.js HTTP module
* Manual routing and body parsing implemented
* Ensure MongoDB is running before backend start

---

## ❤️ Acknowledgment

Built to improve communication between citizens and authorities for better civic management.

---

## 📧 Contact

**Developer:** Nikhil Chopade
Full Stack Developer
nikhilchopade24155@gmail.com

---

⭐ If you like this project, don’t forget to star the repo!
