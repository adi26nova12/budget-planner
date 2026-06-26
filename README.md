# Piggy Planner

Piggy Planner takes the dread out of budgeting. It splits the experience into a cozy, hand-drawn paper journal landing page and a high-fidelity, interactive modern spreadsheet dashboard.

---

## Design Theme & Page Split

* **Landing Home Page (`index.html`)**: A cozy productivity planner with a warm cream notebook paper background, handwritten fonts, sketch-style borders, and a custom hand-drawn pie chart.
* **Main Application Dashboard (`dashboard.html`)**: A clean, high-performance modern fintech interface for managing budgets, bills check-offs, debt payments, and asset allocations.

---

## Key Features

* **Visual Spreadsheet**: Track Income, Bills, Debts, and Expenses side-by-side with automatic recalculations.
* **PDF Statement Importer**: Import bank statement PDFs to merge transactions into your current budget dynamically.
* **Asset Allocation Wheel**: Interactive hand-drawn canvas chart displaying budget categories with custom hatch patterns.
* **Dual Theme**: Toggle between Light and Dark mode persistently.
* **Cloud Sync**: Secure JWT authentication and database state management powered by Supabase, with automatic local JSON file backup.

---

## Directory Structure

```text
FINANCE V2/
├── backend/
│   ├── main.py                # FastAPI server entry point
│   ├── extractor.py           # PDF transaction parser and budget merger
│   └── db.json                # Local fallback file database (git-ignored)
├── src/
│   ├── main.js                # Core JS router & spreadsheet controller (for dashboard)
│   ├── home.js                # Lightweight landing page loader
│   ├── style.css              # Modern fintech spreadsheet styling
│   ├── journal.css            # Cozy hand-drawn page styling
│   ├── hand-drawn-chart.js    # Canvas allocations wheel renderer
│   └── supabase.js            # Client-side Supabase client
├── index.html                 # Cozy Journal Landing Page
├── dashboard.html             # App Dashboard, Settings Profile, and Auth
├── vite.config.js             # Vite multi-page routing
└── schema.sql                 # Database table schema
```

---

## Setup & Installation

### 1. Environment Configuration

Create a `.env` in the root folder (frontend) and in the `backend/` folder:

**Root `.env` (Frontend)**:
```env
VITE_SUPABASE_URL=https://your-supabase-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**`backend/.env` (Backend)**:
```env
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_KEY=your-supabase-service-role-key
```

### 2. Run the Frontend (Vite)

```bash
npm install
npm run dev
```
Dev server runs at `http://localhost:5173/`.

### 3. Run the Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
python main.py
```
API server runs at `http://localhost:8000/`.
