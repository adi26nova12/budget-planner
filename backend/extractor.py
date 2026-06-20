import io
import re
import os

# Category keywords mapping
DEBT_KEYWORDS = ["hdfc", "sbi", "icici", "loan", "credit card", "cc", "card", "axis", "amex", "snapmint"]
BILL_KEYWORDS = ["rent", "internet", "airtel", "jio", "electricity", "gym", "netflix", "phone", "cable", "spotify", "broadband", "water bill", "insurance", "apple"]
EXPENSE_CATEGORY_MAPPINGS = {
    "Food": ["chef", "food", "rest", "cafe", "bakery", "sweets", "swiggy", "zomato", "dining", "hotel", "kitchen", "biryani", "dhaba", "pizza", "maggie hotspot", "hotspot", "southern", "calcutta", "cuisine", "coffee", "subway", "culinary ", "quench", "snapeats" , "chatpata", "snap eats"],
    "Groceries": ["grocer", "supermarket", "mart", "store", "milk", "vegetable", "fruit", "dairy", "bigbasket", "blinkit", "zepto", "surya tuckshop", "tuckshop", "bu basiks", "basiks", "tuck shop", "daalchini" ],
    "Travel": ["travel", "cab", "uber", "ola", "train", "flight", "bus", "metro", "auto", "railway", "irctc"],
    "Pets": ["pet", "vet", "dog", "cat", "animal"],
    "Education": ["book", "school", "college", "tutor", "tuition", "academy", "course", "udemy", "coursera"],
    "Entertainment": ["movie", "show", "play", "game", "theatre", "netflix", "prime video", "hotstar", "multiplex", "cinema"],
    "Fuel": ["fuel", "petrol", "diesel", "gas", "cng", "shell", "hpcl", "iocl", "bpcl"],
    "Personal Care": ["salon", "parlour", "spa", "hair", "med", "pharmacy", "clinic", "hospital", "doctor", "health", "dentist"]
}

def parse_gpay_text(text: str) -> list:
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    transactions = []
    
    months_short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    months_long = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if any(kw in line_lower for kw in ["self transfer", "self-transfer", "to self", "from self", "own account", "self transaction"]):
            continue
            
        is_sent = "Paid to" in line
        is_received = "Received from" in line or "Refund from" in line
        
        if is_sent or is_received:
            # 1. Extract Description
            desc = ""
            if is_sent:
                match = re.search(r"Paid to\s+(.+)", line)
                if match:
                    desc = match.group(1).split("₹")[0].strip()
            else:
                match = re.search(r"(Received|Refund) from\s+(.+)", line)
                if match:
                    desc = match.group(2).split("₹")[0].strip()
            
            desc = re.sub(r"\s+UPI\s+Transaction.*", "", desc, flags=re.IGNORECASE)
            desc = re.sub(r"\s+Paid\s+(to|by).*", "", desc, flags=re.IGNORECASE)
            desc = desc.split("UPI ID")[0].strip()
            
            # 2. Extract Amount
            amount = 0.0
            amt_match = re.search(r"₹\s*([\d,]+(?:\.\d+)?)", line)
            if amt_match:
                amount = float(amt_match.group(1).replace(",", ""))
            else:
                for offset in range(1, 4):
                    if i + offset < len(lines):
                        next_line = lines[i + offset]
                        if "Paid to" in next_line or "Received from" in next_line:
                            break
                        amt_match = re.search(r"₹\s*([\d,]+(?:\.\d+)?)", next_line)
                        if amt_match:
                            amount = float(amt_match.group(1).replace(",", ""))
                            break
            
            # 3. Extract Date
            date_str = ""
            for offset in [0, -1, -2, -3]:
                check_idx = i + offset
                if 0 <= check_idx < len(lines):
                    date_match = re.search(r"\b\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}\b", lines[check_idx])
                    if date_match:
                        date_str = date_match.group(0)
                        break
                        
            tx_month = None
            tx_year = None
            if date_str:
                for m_idx, m_name in enumerate(months_short):
                    if m_name.lower() in date_str.lower():
                        tx_month = months_long[m_idx].upper()
                        break
                if not tx_month:
                    for m_idx, m_name in enumerate(months_long):
                        if m_name.lower() in date_str.lower():
                            tx_month = m_name.upper()
                            break
                year_match = re.search(r"\b(20\d{2})\b", date_str)
                if year_match:
                    tx_year = year_match.group(1)
            
            transactions.append({
                "type": "received" if is_received else "sent",
                "description": desc or "Transaction",
                "amount": amount,
                "date": date_str,
                "month": tx_month,
                "year": tx_year
            })
            
    return transactions

def parse_paytm_text(text: str) -> list:
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    statement_year = "2026"
    year_match = re.search(r"\b20(\d{2})\b", text)
    if year_match:
        statement_year = "20" + year_match.group(1)
    else:
        short_year_match = re.search(r"'\d{2}\b", text)
        if short_year_match:
            statement_year = "20" + short_year_match.group(0)[1:]
            
    transactions = []
    
    months_short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    months_long = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    
    for idx, line in enumerate(lines):
        line_lower = line.lower()
        if any(kw in line_lower for kw in ["self transfer", "self-transfer", "to self", "from self", "own account", "self transaction"]):
            continue
            
        is_sent = "Money sent to" in line
        is_received = "Money received from" in line or "Refund from" in line
        is_cashback = "Cashback Received from" in line
        
        if is_sent or is_received or is_cashback:
            # Determine initial type
            tx_type = "sent" if is_sent else "received"
            if is_cashback:
                tx_type = "cashback"
                
            # Extract Description
            desc = line
            desc = desc.replace("Money sent to", "")
            desc = desc.replace("Cashback Received from", "")
            desc = desc.replace("Money received from", "")
            desc = desc.replace("Refund from", "")
            desc = desc.strip()
            
            # Join subsequent description lines
            offset = 1
            while idx + offset < len(lines):
                next_line = lines[idx + offset]
                if any(next_line.startswith(prefix) for prefix in ["UPI ID:", "UPI Ref", "Tag:", "Note:", "HDFC Bank", "Punjab National", "Rs.", "-", "+"]):
                    break
                if re.match(r"\b\d{1,2}\s+[A-Za-z]{3,9}\b", next_line) or re.match(r"\b\d{1,2}:\d{2}\s*(?:AM|PM)\b", next_line):
                    break
                desc += " " + next_line
                offset += 1
            
            # Clean description
            desc = re.sub(r"\s+UPI\s+Transaction.*", "", desc, flags=re.IGNORECASE)
            desc = re.sub(r"\s+Paid\s+(to|by).*", "", desc, flags=re.IGNORECASE)
            desc = desc.split("UPI ID")[0].strip()
            
            # Extract Amount
            amount = 0.0
            for k in range(1, 15):
                if idx + k >= len(lines):
                    break
                curr = lines[idx + k]
                amt_match = re.search(r"([+-])\s*Rs\.\s*([\d,]+(?:\.\d+)?)", curr)
                if amt_match:
                    amount = float(amt_match.group(2).replace(",", ""))
                    break
                    
            # Double check if Tag: # Cashback exists in subsequent lines to override type
            for k in range(1, 10):
                if idx + k >= len(lines):
                    break
                if "# Cashback" in lines[idx + k]:
                    tx_type = "cashback"
                    break
                    
            # Extract Date
            date_str = ""
            tx_month = None
            tx_year = statement_year
            
            for k in range(1, 6):
                if idx - k < 0:
                    break
                prev = lines[idx - k]
                date_match = re.match(r"^(\d{1,2})\s+([A-Za-z]{3,9})$", prev)
                if date_match:
                    day = date_match.group(1)
                    month_name = date_match.group(2)
                    date_str = f"{day} {month_name}, {tx_year}"
                    
                    for m_idx, m_name in enumerate(months_short):
                        if m_name.lower() in month_name.lower():
                            tx_month = months_long[m_idx].upper()
                            break
                    if not tx_month:
                        for m_idx, m_name in enumerate(months_long):
                            if m_name.lower() in month_name.lower():
                                tx_month = m_name.upper()
                                break
                    break
            
            transactions.append({
                "type": tx_type,
                "description": desc or "Transaction",
                "amount": amount,
                "date": date_str,
                "month": tx_month,
                "year": tx_year
            })
            
    return transactions

def parse_transactions_from_pdf(pdf_bytes: bytes) -> list:
    try:
        from pypdf import PdfReader
    except ImportError:
        print("[DATABASE] pypdf not installed.")
        return []
        
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
            
    if "paytm" in text.lower() or "money sent to" in text.lower():
        return parse_paytm_text(text)
    else:
        return parse_gpay_text(text)

def merge_transactions_into_budget(state: dict, transactions: list, target_month: str, target_year: str, statement_id: str, filename: str) -> dict:
    from datetime import datetime
    target_month_upper = target_month.upper()
    target_year_str = str(target_year)
    
    if "income" not in state: state["income"] = []
    if "bills" not in state: state["bills"] = []
    if "expenses" not in state: state["expenses"] = []
    if "debt" not in state: state["debt"] = []
    
    matching_txs = []
    for tx in transactions:
        tx_month = tx.get("month")
        tx_year = tx.get("year")
        
        if tx_month and tx_year:
            if tx_month == target_month_upper and str(tx_year) == target_year_str:
                matching_txs.append(tx)
        else:
            matching_txs.append(tx)
            
    if "settings" not in state:
        state["settings"] = {}
    if "importedStatements" not in state["settings"]:
        state["settings"]["importedStatements"] = []
        
    stmt_tx_log = []
            
    # 1. Sum up all cashback transactions first
    total_cashback_amount = sum(tx["amount"] for tx in matching_txs if tx["type"] == "cashback")
    
    # 2. Process all received and sent transactions (excluding cashback)
    for tx in matching_txs:
        desc = tx["description"]
        amount = tx["amount"]
        tx_type = tx["type"]
        tx_date = tx.get("date", "") or "Imported"
        
        if tx_type == "received":
            added = False
            row_id = None
            for inc in state["income"]:
                if inc["description"] == "" and inc["expected"] == 0 and inc["actual"] == 0:
                    inc["description"] = desc
                    inc["expected"] = amount
                    inc["actual"] = amount
                    inc["importedFrom"] = statement_id
                    row_id = inc["id"]
                    added = True
                    break
            if not added:
                row_id = int(os.urandom(4).hex(), 16) % 1000000
                state["income"].append({
                    "id": row_id,
                    "description": desc,
                    "expected": amount,
                    "actual": amount,
                    "importedFrom": statement_id
                })
            stmt_tx_log.append({
                "table": "income",
                "id": row_id,
                "description": desc,
                "amount": amount,
                "type": "received",
                "date": tx_date
            })
            
        elif tx_type == "cashback":
            # Skip since we process cashback consolidated below
            continue
            
        else: # sent transaction
            desc_lower = desc.lower()
            is_debt = any(kw in desc_lower for kw in DEBT_KEYWORDS)
            is_bill = any(kw in desc_lower for kw in BILL_KEYWORDS)
            
            if is_debt:
                added = False
                row_id = None
                for d in state["debt"]:
                    if d["description"] == "" and d["budget"] == 0 and d["actual"] == 0:
                        d["description"] = desc
                        d["dueDate"] = tx_date
                        d["budget"] = amount
                        d["actual"] = amount
                        d["importedFrom"] = statement_id
                        row_id = d["id"]
                        added = True
                        break
                if not added:
                    row_id = int(os.urandom(4).hex(), 16) % 1000000
                    state["debt"].append({
                        "id": row_id,
                        "description": desc,
                        "dueDate": tx_date,
                        "budget": amount,
                        "actual": amount,
                        "importedFrom": statement_id
                    })
                stmt_tx_log.append({
                    "table": "debt",
                    "id": row_id,
                    "description": desc,
                    "amount": amount,
                    "date": tx_date
                })
            elif is_bill:
                added = False
                row_id = None
                for b in state["bills"]:
                    if b["description"] == "" and b["budget"] == 0 and b["actual"] == 0:
                        b["checked"] = True
                        b["description"] = desc
                        b["dueDate"] = tx_date
                        b["budget"] = amount
                        b["actual"] = amount
                        b["importedFrom"] = statement_id
                        row_id = b["id"]
                        added = True
                        break
                if not added:
                    row_id = int(os.urandom(4).hex(), 16) % 1000000
                    state["bills"].append({
                        "id": row_id,
                        "checked": True,
                        "description": desc,
                        "dueDate": tx_date,
                        "budget": amount,
                        "actual": amount,
                        "importedFrom": statement_id
                    })
                stmt_tx_log.append({
                    "table": "bills",
                    "id": row_id,
                    "description": desc,
                    "amount": amount,
                    "date": tx_date
                })
            else: # general expense category
                matched_category = "Other"
                for cat, keywords in EXPENSE_CATEGORY_MAPPINGS.items():
                    if any(kw in desc_lower for kw in keywords):
                        matched_category = cat
                        break
                
                category_found = False
                for exp in state["expenses"]:
                    if exp["category"].lower() == matched_category.lower():
                        exp["actual"] += amount
                        category_found = True
                        break
                        
                if not category_found:
                    added = False
                    for exp in state["expenses"]:
                        if exp["category"] == "" and exp["budget"] == 0 and exp["actual"] == 0:
                            exp["category"] = matched_category
                            exp["budget"] = 0.00
                            exp["actual"] = amount
                            added = True
                            break
                    if not added:
                        state["expenses"].append({
                            "id": int(os.urandom(4).hex(), 16) % 1000000,
                            "category": matched_category,
                            "budget": 0.00,
                            "actual": amount
                        })
                stmt_tx_log.append({
                    "table": "expenses",
                    "category": matched_category,
                    "description": desc,
                    "amount": amount,
                    "date": tx_date
                })
                
    # 3. Add consolidated cashback entry to Income table if present
    if total_cashback_amount > 0:
        added = False
        row_id = None
        for inc in state["income"]:
            if inc["description"] == "" and inc["expected"] == 0 and inc["actual"] == 0:
                inc["description"] = "Cashback"
                inc["expected"] = 0.00
                inc["actual"] = total_cashback_amount
                inc["importedFrom"] = statement_id
                row_id = inc["id"]
                added = True
                break
        if not added:
            row_id = int(os.urandom(4).hex(), 16) % 1000000
            state["income"].append({
                "id": row_id,
                "description": "Cashback",
                "expected": 0.00,
                "actual": total_cashback_amount,
                "importedFrom": statement_id
            })
        # Log the consolidated entry for deletion
        stmt_tx_log.append({
            "table": "income",
            "id": row_id,
            "description": "Cashback Total",
            "amount": total_cashback_amount,
            "type": "cashback",
            "date": "Multiple"
        })
        # Also log individual cashback details for user viewing
        for tx in matching_txs:
            if tx["type"] == "cashback":
                stmt_tx_log.append({
                    "table": "cashback_detail",
                    "id": None,
                    "description": tx["description"],
                    "amount": tx["amount"],
                    "type": "cashback",
                    "date": tx.get("date", "") or "Imported"
                })
                
    # Save the statement entry metadata
    imported_at_str = datetime.now().strftime("%Y-%m-%d %I:%M %p")
    state["settings"]["importedStatements"].append({
        "id": statement_id,
        "filename": filename,
        "importedAt": imported_at_str,
        "transactions": stmt_tx_log
    })
    
    return state
