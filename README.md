# Muru & Saral Planner

Shared travel, annual-leave and remote-day planner.

- **Site:** `index.html`, a single static page hosted on Vercel.
- **Data and sign-in:** Supabase project **Planner** (Mumbai). Schema in `supabase/migrations/`.
- **Access:** only the two emails in the `members` table can sign in. Row-level security blocks everyone else, including anyone holding the public key.

## Sign-in

Enter your email and get a 6-digit code (or tap the link in the email). Each phone stays signed in.

## How it counts

- Annual leave and remote days count Mon–Fri, skipping public holidays entered in the planner. Any entry can be overridden (e.g. 0.5).
- "Both of us" on leave deducts from both balances.
- Allowances are set per person per year in ⚙︎ (default 24).
- Changes show up live on the other phone.

## Changing who can sign in

Edit the `members` table in Supabase (Table Editor → members). Emails must be lowercase.
