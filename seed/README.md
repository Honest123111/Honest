# Seed files (not committed)

Put the source spreadsheets here locally if you like — everything in this folder
except this README is git-ignored because the files contain owner PII.

The app doesn't read this folder: load each file through **Imports** in the app
(Admin or Acquisitions), which previews matches and never duplicates an APN.

| File | Import as | Notes |
|---|---|---|
| `2025 PTS INVENTORY - TAG ORDER.xlsx` | Riverside TTC tax-default inventory | Header on row 4 (auto-detected). "Data as of" 2025-07-01. |
| `Riverside_TaxDefault_Leads.xlsx` | I-10 tax-default leads workbook | All tabs except Summary are included; duplicate APNs across tabs merge. "Data as of" 2025-10-01 (taxes owed column). |
| `list 2 excel 3.xlsx` — Sheet1 | Off-market portfolio list | APN = map book + page + parcel; co-owners and % from "ownership form". |
| `list 2 excel 3.xlsx` — Sheet2 | Sold history / comps | Upload the file again, choose "Sold history / comps", include only Sheet2. |
