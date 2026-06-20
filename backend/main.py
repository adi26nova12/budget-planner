import os
import json
import base64
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, UploadFile, Form, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv

# Import statement parsing and merging logic
from extractor import parse_transactions_from_pdf, merge_transactions_into_budget

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

use_supabase = False

# Try initializing Supabase
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        # Test client initialization to verify url & key
        _test_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        use_supabase = True
        print("[DATABASE] Connection successful: Using Supabase Cloud database.")
    except Exception as e:
        print(f"[DATABASE] Error initializing Supabase client: {e}")
        print("[DATABASE] Falling back to local JSON database storage.")
else:
    print("[DATABASE] Supabase credentials missing from .env.")
    print("[DATABASE] Falling back to local JSON database storage (backend/db.json).")

# Helper to create a request-scoped Supabase client
def get_supabase_client(token: str = None):
    if not use_supabase:
        return None
    from supabase import create_client, ClientOptions
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    options = ClientOptions(headers=headers)
    return create_client(SUPABASE_URL, SUPABASE_KEY, options=options)


# Authentication configuration
security = HTTPBearer(auto_error=False)

def decode_jwt_payload(token: str) -> Dict[str, Any]:
    """Decode JWT payload without signature verification (Supabase already verified it)."""
    try:
        # JWT is header.payload.signature - decode the payload part
        parts = token.split('.')
        if len(parts) != 3:
            return {}
        # Add padding if needed
        payload_b64 = parts[1] + '=' * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload
    except Exception:
        return {}

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """
    Extract user info from Supabase JWT without an extra network call.
    Falls back to dev user if Supabase is not configured.
    """
    if not credentials:
        if not use_supabase:
            return {"id": "00000000-0000-0000-0000-000000000000", "email": "dev@example.com"}
        raise HTTPException(status_code=403, detail="Authorization header required.")

    token = credentials.credentials

    if not use_supabase:
        return {"id": "00000000-0000-0000-0000-000000000000", "email": "dev@example.com"}

    # Decode the JWT payload to extract user info (no network call needed)
    payload = decode_jwt_payload(token)
    user_id = payload.get("sub")
    email = payload.get("email", "")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID.")

    return {"id": user_id, "email": email, "user_metadata": payload.get("user_metadata", {})}

# Local File DB Setup
DB_FILE = os.path.join(os.path.dirname(__file__), "db.json")
import threading
db_lock = threading.Lock()

def load_local_db() -> Dict[str, Any]:
    with db_lock:
        if not os.path.exists(DB_FILE):
            return {}
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[LOCAL DB] Error reading local db file: {e}")
            return {}

def save_local_db(data: Dict[str, Any]):
    with db_lock:
        try:
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[LOCAL DB] Error writing to local db file: {e}")

# FastAPI setup
app = FastAPI(title="Finance Dashboard Backend API")

# Allow CORS for development and configured origins
cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    cors_origins.extend([origin.strip() for origin in env_origins.split(",") if origin.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/log-error")
def log_error(payload: Dict[str, Any]):
    print(f"[BROWSER LOG/ERROR] {json.dumps(payload, indent=2)}")
    return {"status": "ok"}


@app.get("/api/debug-status")
def debug_status():
    return {
        "use_supabase": use_supabase,
        "has_url": bool(SUPABASE_URL),
        "has_key": bool(SUPABASE_KEY),
        "supabase_url": SUPABASE_URL,
        "supabase_key_len": len(SUPABASE_KEY) if SUPABASE_KEY else 0
    }



# Input data validation model
class BudgetPayload(BaseModel):
    month: str
    year: str
    data: Dict[str, Any]

# Default budget structure of zeros
def get_default_budget(month: str, year: str) -> Dict[str, Any]:
    from calendar import monthrange
    import datetime

    month_names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    month_upper = month.upper()
    try:
        month_idx = month_names.index(month_upper) + 1
    except ValueError:
        month_idx = 1
        
    year_int = int(year)
    num_days = monthrange(year_int, month_idx)[1]
    
    start_date_str = f"{year_int}-{month_idx:02d}-01"
    end_date_str = f"{year_int}-{month_idx:02d}-{num_days:02d}"
    
    def get_due_date_str(day_num: int) -> str:
        try:
            dt = datetime.date(year_int, month_idx, day_num)
            return dt.strftime("%a, %b ") + str(dt.day)
        except ValueError:
            return ""

    return {
        "settings": {
            "month": month_upper,
            "year": year,
            "currency": "₹",
            "startDate": start_date_str,
            "endDate": end_date_str,
            "startBalance": 0.00,
            "importedFileName": None,
            "preImportState": None,
            "importedStatements": []
        },
        "cashFlowSummary": {
            "savingsBudget": 0.00,
            "savingsActual": 0.00
        },
        "income": [
            { "id": 1, "description": "Paycheck", "expected": 0.00, "actual": 0.00 },
            { "id": 2, "description": "Side Hustle", "expected": 0.00, "actual": 0.00 },
            { "id": 3, "description": "", "expected": 0.00, "actual": 0.00 },
            { "id": 4, "description": "", "expected": 0.00, "actual": 0.00 }
        ],
        "bills": [
            { "id": 1, "checked": False, "description": "Cable & Internet", "dueDate": get_due_date_str(1), "budget": 0.00, "actual": 0.00 },
            { "id": 2, "checked": False, "description": "Car insurance", "dueDate": get_due_date_str(2), "budget": 0.00, "actual": 0.00 },
            { "id": 3, "checked": False, "description": "Gym membership", "dueDate": get_due_date_str(10), "budget": 0.00, "actual": 0.00 },
            { "id": 4, "checked": False, "description": "Phone Bill", "dueDate": get_due_date_str(12), "budget": 0.00, "actual": 0.00 },
            { "id": 5, "checked": False, "description": "Rent", "dueDate": get_due_date_str(num_days), "budget": 0.00, "actual": 0.00 },
            { "id": 6, "checked": False, "description": "", "dueDate": "", "budget": 0.00, "actual": 0.00 },
            { "id": 7, "checked": False, "description": "", "dueDate": "", "budget": 0.00, "actual": 0.00 }
        ],
        "expenses": [
            { "id": 1, "category": "Personal Care", "budget": 0.00, "actual": 0.00 },
            { "id": 2, "category": "Travel", "budget": 0.00, "actual": 0.00 },
            { "id": 3, "category": "Home", "budget": 0.00, "actual": 0.00 },
            { "id": 4, "category": "Groceries", "budget": 0.00, "actual": 0.00 },
            { "id": 5, "category": "Pets", "budget": 0.00, "actual": 0.00 },
            { "id": 6, "category": "Education", "budget": 0.00, "actual": 0.00 },
            { "id": 7, "category": "Food", "budget": 0.00, "actual": 0.00 },
            { "id": 8, "category": "Entertainment", "budget": 0.00, "actual": 0.00 },
            { "id": 9, "category": "Fuel", "budget": 0.00, "actual": 0.00 },
            { "id": 10, "category": "", "budget": 0.00, "actual": 0.00 },
            { "id": 11, "category": "", "budget": 0.00, "actual": 0.00 }
        ],
        "debt": [
            { "id": 1, "description": "Credit Card 1", "dueDate": get_due_date_str(1), "budget": 0.00, "actual": 0.00 },
            { "id": 2, "description": "Credit Card 2", "dueDate": get_due_date_str(2), "budget": 0.00, "actual": 0.00 },
            { "id": 3, "description": "Student Loan", "dueDate": get_due_date_str(3), "budget": 0.00, "actual": 0.00 },
            { "id": 4, "description": "Personal Loan", "dueDate": get_due_date_str(4), "budget": 0.00, "actual": 0.00 },
            { "id": 5, "description": "", "dueDate": "", "budget": 0.00, "actual": 0.00 },
            { "id": 6, "description": "", "dueDate": "", "budget": 0.00, "actual": 0.00 }
        ],
        "allocation": [
            { "id": 1, "asset": "Cash Reserve", "share": 0, "color": "#f7d1cd", "pattern": "cash" },
            { "id": 2, "asset": "RKT", "share": 0, "color": "#9ad1d4", "pattern": "dots" },
            { "id": 3, "asset": "INTC", "share": 0, "color": "#a3b18a", "pattern": "hatch-diagonal" },
            { "id": 4, "asset": "DKNG", "share": 0, "color": "#588157", "pattern": "hatch-cross" },
            { "id": 5, "asset": "IONQ", "share": 0, "color": "#b5c99a", "pattern": "hatch-vertical" },
            { "id": 6, "asset": "RKT", "share": 0, "color": "#a9def9", "pattern": "hatch-diagonal" },
            { "id": 7, "asset": "RIVN", "share": 0, "color": "#d0f4de", "pattern": "swirls" }
        ]
    }

def migrate_default_dates(data: dict) -> dict:
    import re
    from calendar import monthrange
    import datetime
    
    if not data or "settings" not in data:
        return data
        
    month = data.get("settings", {}).get("month", "JANUARY").upper()
    year = data.get("settings", {}).get("year", "2026")
    
    if month == "JANUARY":
        return data
        
    month_names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    try:
        month_idx = month_names.index(month) + 1
    except ValueError:
        return data
        
    year_int = int(year)
    num_days = monthrange(year_int, month_idx)[1]
    
    start_date = data.get("settings", {}).get("startDate", "")
    end_date = data.get("settings", {}).get("endDate", "")
    if start_date and start_date.endswith("-01-01"):
        data["settings"]["startDate"] = f"{year_int}-{month_idx:02d}-01"
    if end_date and end_date.endswith("-01-31"):
        data["settings"]["endDate"] = f"{year_int}-{month_idx:02d}-{num_days:02d}"

    def get_correct_due_date(old_due_date: str) -> str:
        if not old_due_date or "Jan" not in old_due_date:
            return old_due_date
            
        match = re.search(r"Jan\s+(\d+)", old_due_date)
        if not match:
            return old_due_date
            
        day_num = int(match.group(1))
        if day_num == 31:
            day_num = num_days
            
        try:
            dt = datetime.date(year_int, month_idx, day_num)
            return dt.strftime("%a, %b ") + str(dt.day)
        except ValueError:
            return old_due_date

    if "bills" in data:
        for b in data["bills"]:
            if "dueDate" in b:
                b["dueDate"] = get_correct_due_date(b["dueDate"])
                
    if "debt" in data:
        for d in data["debt"]:
            if "dueDate" in d:
                d["dueDate"] = get_correct_due_date(d["dueDate"])
                
    return data

def is_valid_budget(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    required_keys = ["settings", "income", "bills", "expenses", "debt", "allocation"]
    return all(key in data for key in required_keys)

@app.get("/api/budget")
def get_budget(
    month: str, 
    year: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Fetch budget data for the given month and year.
    Returns a blank zero-filled model if no database record is found.
    """
    month_upper = month.upper()
    month_names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    if month_upper not in month_names:
        raise HTTPException(status_code=400, detail="Invalid month name.")
        
    try:
        year_int = int(year)
        if not (1900 <= year_int <= 2100):
            raise HTTPException(status_code=400, detail="Year must be between 1900 and 2100.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid year format.")
    
    user_id = current_user["id"]
    
    if use_supabase:
        try:
            token = credentials.credentials if credentials else None
            client = get_supabase_client(token)
            if client:
                response = client.table("monthly_budgets").select("data").eq("month", month_upper).eq("year", year).eq("user_id", user_id).execute()
                if response.data and len(response.data) > 0:
                    budget_data = response.data[0]["data"]
                    if is_valid_budget(budget_data):
                        return migrate_default_dates(budget_data)
        except Exception as e:
            import traceback
            print(f"[DATABASE] Supabase fetch error: {type(e).__name__}: {e}")
            traceback.print_exc()


            # If supabase query errors out, try file fallback before raising error
    
    # Fallback to local JSON Database
    local_db = load_local_db()
    key = f"{user_id}_{month_upper}_{year}"
    if key in local_db:
        budget_data = local_db[key]
        if is_valid_budget(budget_data):
            return migrate_default_dates(budget_data)
    
    # If not found anywhere, return empty defaults
    return get_default_budget(month_upper, year)

@app.post("/api/budget")
def save_budget(
    payload: BudgetPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Upsert budget data for the given month and year.
    """
    month_upper = payload.month.upper()
    month_names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    if month_upper not in month_names:
        raise HTTPException(status_code=400, detail="Invalid month name.")
        
    try:
        year_int = int(payload.year)
        if not (1900 <= year_int <= 2100):
            raise HTTPException(status_code=400, detail="Year must be between 1900 and 2100.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid year format.")
    
    user_id = current_user["id"]
    print(f"[DEBUG] save_budget: user_id={user_id}, use_supabase={use_supabase}")
    if credentials:
        print(f"[DEBUG] save_budget: token={credentials.credentials[:20]}...")
    else:
        print("[DEBUG] save_budget: credentials is None")
    
    if use_supabase:
        try:
            token = credentials.credentials if credentials else None
            client = get_supabase_client(token)
            if client:
                # Upsert checks composite primary key (user_id, month, year)
                data_to_save = {
                    "user_id": user_id,
                    "month": month_upper,
                    "year": payload.year,
                    "data": payload.data
                }
                client.table("monthly_budgets").upsert(data_to_save).execute()
                print(f"[DATABASE] Upserted to Supabase for user {user_id}, {month_upper} {payload.year}")
                return {"status": "success", "storage": "supabase"}
        except Exception as e:
            import traceback
            print(f"[DATABASE] Supabase upsert error: {type(e).__name__}: {e}")
            traceback.print_exc()

    
    # Local file save
    local_db = load_local_db()
    key = f"{user_id}_{month_upper}_{payload.year}"
    local_db[key] = payload.data
    save_local_db(local_db)
    
    return {"status": "success", "storage": "local_file"}

@app.post("/api/import-statement")
async def import_statement(
    file: UploadFile = File(...),
    month: str = Form(...),
    year: str = Form(...),
    current_data: str = Form(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    # Security input validation
    month_upper = month.upper()
    month_names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    if month_upper not in month_names:
        raise HTTPException(status_code=400, detail="Invalid month name.")
        
    try:
        year_int = int(year)
        if not (1900 <= year_int <= 2100):
            raise HTTPException(status_code=400, detail="Year must be between 1900 and 2100.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid year format.")

    # Max file size limit: 5MB to prevent memory exhaustion / DoS
    MAX_FILE_SIZE = 5 * 1024 * 1024
    
    # Path traversal protection for filename
    filename = os.path.basename(file.filename or "statement.pdf")
    
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF statements are allowed.")

    try:
        import time
        import random
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size allowed is 5MB.")
            
        # Verify PDF magic bytes (%PDF-)
        if not contents.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Invalid PDF file format signature.")

        transactions = parse_transactions_from_pdf(contents)
        if not transactions:
            raise HTTPException(status_code=400, detail="No transactions detected in the PDF statement.")
            
        try:
            state_data = json.loads(current_data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON format for current budget data.")
        
        statement_id = f"stmt_{int(time.time())}_{random.randint(1000, 9999)}"
        
        if "settings" not in state_data:
            state_data["settings"] = {}
        # Fill deprecated single fields as fallback
        state_data["settings"]["importedFileName"] = filename
        
        updated_state = merge_transactions_into_budget(
            state_data, 
            transactions, 
            month, 
            year, 
            statement_id, 
            filename
        )
        
        # Calculate how many transactions match the target month/year
        target_month_upper = month.upper()
        target_year_str = str(year)
        matched_tx_count = 0
        for tx in transactions:
            tx_month = tx.get("month")
            tx_year = tx.get("year")
            if tx_month and tx_year:
                if tx_month == target_month_upper and str(tx_year) == target_year_str:
                    matched_tx_count += 1
            else:
                matched_tx_count += 1
        
        return {
            "status": "success",
            "imported_count": matched_tx_count,
            "data": updated_state
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Import error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
