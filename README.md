# Muru & Saral Planner

Shared travel, annual-leave and remote-day planner.

- **Site:** `index.html`, served by GitHub Pages at https://mindmurugan.github.io/Planner/
- **Data:** the Google Sheet *Muru & Saral Planner (data)* in Google Drive, through the Apps Script API in `apps-script/Code.gs`.

No personal data or access keys are stored in this repo.

## One-time setup (about 5 minutes, on a laptop)

1. Open the Google Sheet **Muru & Saral Planner (data)** → **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs). Save.
3. Pick **initialise** in the function menu → **Run** → approve the permissions.
4. **Deploy → New deployment → Web app** with **Execute as: Me** and **Who has access: Anyone** → **Deploy**.
5. Pick **showLink** → **Run**. Copy the link from the execution log.
6. Open that link once on your phone and once on Saral's (send it to her privately). Then add the site to each Home Screen with Safari → Share → **Add to Home Screen**.
7. In the planner, tap ⚙︎, choose who the phone belongs to, and add both emails if you want change alerts.

If the connect link ever leaks, run **rotateKey** and then **showLink**, and reconnect both phones.

## Updating the Apps Script later

Paste the new code → **Deploy → Manage deployments → ✏︎ → Version: New → Deploy**. The URL stays the same, so the phones don't need reconnecting.

## How it counts

- Annual leave and remote days count Mon–Fri, skipping public holidays entered in the planner. You can override any entry (e.g. 0.5).
- "Both of us" on leave deducts from both balances.
- Allowances are set per person per year in ⚙︎ (default 24).
