# 🔒 OCR PROJECT – CURSOR RULES

This project contains a production OCR system.

DO NOT modify the Firebase Cloud Function named `ocrImage`.
DO NOT refactor or change any logic related to OCR processing.
DO NOT change its request or response format.

The function `ocrImage` is a frozen legacy OCR core
and is already used by real customers in production.

All new features (template-based OCR, x/y zone mapping,
real-time preview, Excel export, UI improvements)
must be implemented in new files or new Cloud Functions only.

If new OCR behavior is required, create a new function
(e.g. `ocrImageV2`) and never modify `ocrImage`.

Breaking the legacy OCR core is forbidden.

1. SYSTEM OVERVIEW

This project is a production OCR SaaS system built on Firebase.

The system allows users to:

Upload document images / PDFs

Extract text using OCR

Map extracted text using x/y coordinate templates

Preview results in real time

Export results to Excel (.xlsx)

The system must support legacy OCR (v1) and template-based OCR (v2)
without breaking existing customers.

2. CORE OCR (LEGACY – v1)
2.1 Description

Implemented as Firebase Cloud Function: ocrImage

Trigger: HTTP

Status: Production / Stable

Currently used by real customers

2.2 Rules

ocrImage MUST NEVER be modified

No refactor, no logic changes

No response format changes

No new feature added inside this function

2.3 Responsibility

Receive image/PDF

Run OCR engine (e.g. Google Vision)

Return raw OCR result

3. OCR v2 (TEMPLATE-BASED OCR)
3.1 Description

Implemented as new Cloud Function (e.g. ocrImageV2)

Does NOT replace ocrImage

Must be optional and feature-flagged

3.2 Behavior

Uses OCR engine (can reuse same engine as v1)

Extracts words with bounding boxes (x, y, w, h)

Applies template-based zone extraction

Output format must be identical to OCR v1

3.3 Rollback Requirement

System must be able to switch back to OCR v1 instantly

No data migration required to rollback

4. SHARED OCR INTERFACE (MANDATORY)
4.1 OCR Word
interface OCRWord {
  text: string
  x: number
  y: number
  w: number
  h: number
}

4.2 OCR Result
interface OCRResult {
  fileName: string
  page: {
    width: number
    height: number
  }
  words: OCRWord[]
}


Both OCR v1 and OCR v2 must return this exact structure

5. TEMPLATE SYSTEM
5.1 Template Scope

Templates are saved per user

One user can have multiple templates

Templates are selected before scanning

5.2 Template Structure
{
  "templateId": "tpl_001",
  "userId": "USER_UID",
  "templateName": "ID Card",
  "columns": [
    {
      "columnKey": "fullname",
      "label": "ชื่อ-สกุล",
      "zone": {
        "x": 0.20,
        "y": 0.30,
        "w": 0.50,
        "h": 0.06
      }
    }
  ]
}

5.3 Zone Rules

Coordinates are percentage-based (0–1)

Zones are relative to page width/height

1 zone = 1 Excel column

Zones must not depend on fixed DPI or pixel size

6. USER INTERFACE REQUIREMENTS
6.1 Document Preview

Display scanned document

Show OCR bounding boxes

Allow hover / selection

6.2 Zone Editor

Users can draw / resize zones

Zones map directly to Excel columns

Zones update template immediately

6.3 Realtime Preview

Excel-like table preview

Updates instantly when:

Zone changes

Template changes

New file is scanned

7. SCANNING FLOW
User Login
 ↓
Select Template (or Legacy Mode)
 ↓
Upload / Scan Files
 ↓
OCR Engine
 ↓
OCR v1 OR OCR v2
 ↓
Template Mapping (v2 only)
 ↓
Realtime Preview
 ↓
Export Excel

8. EXCEL EXPORT SPECIFICATION
8.1 Row Mapping

1 scanned file = 1 Excel row

Batch scan = multiple rows

8.2 Column Mapping

Excel columns are defined by template

Column order follows template definition

8.3 File Naming Rules

Single file scan:

<source_filename>.xlsx


Batch scan:

ocr_export_<timestamp>.xlsx

8.4 Optional

Add source_file column if needed

Support 1 sheet per file or 1 sheet per batch

9. FEATURE FLAGS & SAFETY
9.1 Feature Flag
if (user.enableTemplateMode && template) {
  use OCR v2
} else {
  use OCR v1
}

9.2 Safety Guarantees

Legacy customers must not be affected

OCR v2 is opt-in only

OCR v1 remains default and stable

10. DEVELOPMENT RULES (FOR CURSOR)

Never modify ocrImage

Never merge v2 logic into v1

Always create new files/functions for new behavior

Follow this PROGRAM SPEC strictly

If unsure, propose a new function instead of modifying existing ones

✅ END OF PROGRAM SPEC

## Function Naming Rule

Never create or rename any Cloud Function
using the name `ocrImage`.

All v2 functions must use unique names
(e.g. ocrImageV2, ocrTemplateImage).

Function name collision is forbidden
because it will overwrite production functions.

## Firebase Function Naming Rule (Critical)

The function name `ocrImage` is reserved for OCR v1
and must never appear in this project.

All OCR-related functions in v2 must use unique names
(e.g. ocrImageV2).

Function name collision is strictly forbidden.

- Never modify `ocrImage`
- v2 must use `ocrImageV2` only
- No refactor of v1
