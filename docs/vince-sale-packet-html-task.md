# Vince Task — Sale Packet HTML Upgrade

Objective:
Upgrade /export/sale-packet/html from a basic technical output into a buyer-facing aircraft sale document.

Context:
You are improving an existing working HTML route:
GET /export/sale-packet/html

The current output is technically correct but reads like a developer dashboard.
Your goal is to transform it into a buyer-facing aircraft sale document.

Think:
- aircraft broker
- pre-buy evaluation
- decision support for a buyer spending $100K–$500K

Do NOT:
- invent new data
- assume missing records exist
- change backend logic

You are ONLY improving presentation, structure, and interpretation of existing data.

Constraints:
- Do NOT create new routes
- Work only inside existing /export/sale-packet/html
- Do NOT change data sources
- Do NOT introduce fake data

Required upgrades:

1. Add "Buyer Summary" section at top
   - Plain language assessment of aircraft record quality
   - Must reference:
     - entry count
     - verification status
     - major gaps (if present)

2. Improve Trust Summary
   - Add label: Strong / Moderate / Weak
   - Add explanation of score
   - Keep existing scoring logic

3. Add "Logbook Continuity" section
   - first entry date
   - last entry date
   - total entries

4. Fix AD + 337 sections
   - Replace "No records found" with professional disclosure language
   - Must NOT imply data completeness

5. Improve visual hierarchy
   - Section spacing
   - Typography consistency
   - Emphasize key decision data

Definition of Done:
- Output must feel like a document used in a real aircraft sale
- No placeholder language
- No dev-style messaging

Quality bar:
If this document were sent to a buyer, it should increase confidence in the aircraft — not create uncertainty.

Output format:
Return full updated HTML route only
