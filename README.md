# CivicConnect - Civic Issue Management System

This project is built using:
- **Frontend**: React.js, Tailwind CSS (via Vite)
- **Backend**: Node.js, Express
- **Database**: MySQL 
- **APIs**: Google Maps API, Firebase (installed for notifications setup)

## Setup Instructions

### 1. Database Setup
1. Make sure you have MySQL installed and running.
2. Create a database named `civic_db` (or modify `.env` variables in backend).
3. The backend will automatically create the required `issues` table on startup.

### 2. Backend Setup
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the backend server:
   ```bash
   npm run dev
   ```
   *The server will start on port 5000.*

### 3. Frontend Setup
1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Edit `frontend/src/App.jsx` and replace `YOUR_GOOGLE_MAPS_API_KEY` with your actual Google Maps API Key to ensure the map loads correctly.
4. Run the development server:
   ```bash
   npm run dev
   ```
   *The frontend will be accessible at http://localhost:5173.*

### Note on Firebase
Firebase packages (`firebase` and `firebase-admin`) have been included in the dependencies. You will need to initialize them with your own Firebase project credentials to implement push/web notifications when an issue status is updated by an admin.
"# CivicConnect" 
