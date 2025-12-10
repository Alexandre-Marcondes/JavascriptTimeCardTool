# HR Timecard Checker (Local Browser App)

A fully local, browser-based tool that allows HR to upload an employee's CSV timecard, run automated validations, and generate a clean summary + downloadable reports.  
No backend, no Python server, no internet required once the files are on the computer.

---

## 🚀 Features

### For HR
- Upload a **single CSV timecard** (exported from Google Sheets)
- Run automated checks:
  - Detect incorrect totals
  - Recalculate regular hours, overtime, and sick hours
  - Identify inconsistencies and mark as:
    - **Clean**
    - **Corrected**
    - **Flagged**
- View a clear summary directly in the browser
- See a reconstructed, cleaned timecard table
- Download:
  - Clean CSV (Excel compatible)
  - PDF version of the report

### For Employees
- No change in workflow  
- Continue exporting timecards as CSV (and PDF during the testing phase)  
- Upload to the same Slack channel as before

---

## 📁 Project Structure


There is **no output folder** — HR chooses where to save generated files.

---

## 🖥️ How HR Uses the Tool

1. Download the CSV timecard from Slack  
2. Open `index.html`  
3. Upload the CSV  
4. Click **Run Check**  
5. Review:
   - Summary (clean, corrected, or flagged)
   - Reconstructed timecard data  
6. Download CSV or PDF (optional)  
7. Save files anywhere on the computer

---

## 🔐 Privacy & Security

- 100% local — **no data leaves the machine**
- No network requests
- No backend, no server, no external APIs
- Safe to use for payroll workflows

---

## 🧠 Technology Used

| Layer | Technology | Reason |
|-------|------------|--------|
| UI | HTML + CSS | Simple, portable, easy for HR |
| Logic | JavaScript | Runs fully in the browser; no backend required |
| Exports | Native JS APIs + optional libraries | Allows CSV and PDF generation directly in the browser |

---

## 🛠️ Development Notes

### Why no Python?
The browser cannot run Python directly.  
For a truly self-contained HR tool that opens with a double-click (no installations), **JavaScript is required**.

However, the business logic is intentionally structured in a way that mirrors Python functions (`parse`, `clean`, `calculate`, `report`), so that I can transfer this knowledge to future Python work e.g. Apply AI Automation, MLE.

---

## 📌 Future Enhancements

- Multi-file batch processing
- Support for multiple employees in a single CSV
- Export timecard in true `.xlsx` format (using SheetJS)
- Improved PDF template
- Validation rules per employee (different OT rules)

---

## 👨‍💻 Created By

Alex Marcondes  
A fully local HR automation tool as part of my AI/Automation skill-building journey.

