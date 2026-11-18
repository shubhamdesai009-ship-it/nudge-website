# Nudge website — starter MVP

A responsive static website and browser-only invoice demo, ready for GitHub and Cloudflare Pages.

## What's included

- Responsive Nudge marketing landing page
- Invoice creation with line items, subtotal, optional tax and total
- Invoice list and overview dashboard
- Paid / pending / overdue status tracking
- Client list derived from saved invoices
- Print dialog for saving an invoice as PDF
- WhatsApp share link and email draft
- Local browser storage for demo invoices

## Important limitations

This is a front-end prototype, not yet a production SaaS. There is no user authentication, cloud database, automatic WhatsApp/email delivery, payment gateway, subscription billing, or server-side PDF generation. Demo invoices are stored in the visitor's browser only and are not synced across devices. WhatsApp and email actions open the visitor's own app with a pre-filled message; they do not attach a PDF automatically.

Do not enter sensitive customer or financial information into this demo. Before public production use, add authentication, a secure database, server-side validation, backups, privacy policy, terms, and verified payment / messaging integrations.

## Test locally

Open `index.html` in a modern browser. No build command or package installation is required.

## Deploy to GitHub + Cloudflare Pages

1. Create a GitHub repository named `nudge-website`.
2. Upload **all files and folders in this project** to the repository root. Make sure `index.html`, `styles.css`, `app.js`, `_headers`, and `README.md` are at the top level.
3. In Cloudflare, open **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
4. Select the GitHub repository.
5. For a static site, leave the framework preset as **None**.
6. Leave Build command blank.
7. Set Build output directory to `/` (or the repository root, if the interface asks for a directory).
8. Click **Save and Deploy**.

After deployment, Cloudflare will provide a `*.pages.dev` address. Test it on desktop and mobile.

## Suggested next development stages

1. Add Supabase authentication and a private database for each user's invoices and clients.
2. Add business profile settings and invoice numbering rules.
3. Generate downloadable PDF files.
4. Integrate Razorpay payment links after merchant account approval.
5. Add scheduled email reminders through a transactional email provider.
6. Add WhatsApp Business Platform templates and opt-in handling.
7. Add subscriptions, billing, cancellation and account deletion.
