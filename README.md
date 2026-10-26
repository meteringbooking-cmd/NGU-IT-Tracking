# IT Helpdesk (HTML + Firebase)

Static web pages. Data is stored in Firebase (Firestore for tickets, Storage for attachments) and emails go through EmailJS. There's no server to run.

| Page | Who uses it |
|---|---|
| `index.html` | **Submissions.** Anyone can raise a ticket, with screenshots and an urgency level. |
| `track.html?id=…` | **Tracking.** The person who raised the ticket sees its status, IT's replies, and can reply back. The link is emailed to them. |
| `dashboard.html` | **IT dashboard.** Sign-in, live queue, ticket handling, reports, team and settings. |

## One-off setup in Firebase (about 10 minutes)

Your Firebase project `meter-install-check` already runs another app. Everything here uses separate collections (`it_tickets`, `it_staff`, `it_settings`, `it_counters`) and a separate `it_tickets/` Storage folder, so the two don't touch each other's data.

1. **Turn on email sign-in.** Firebase console → Authentication → Sign-in method → enable **Email/Password**.
2. **Add the Firestore rules.** Firestore Database → Rules. Copy everything between `BEGIN IT HELPDESK` and `END IT HELPDESK` in `firestore.rules` into your existing rules, inside the `match /databases/{database}/documents { … }` block. Click **Publish**.
   ⚠️ Don't replace your existing rules, or the meter app will stop working.
3. **Add the Storage rules.** Storage → Rules. Do the same with the block from `storage.rules`. If Storage asks for permission to use Firestore in its rules, allow it.
4. **Authorised domains.** Authentication → Settings → Authorized domains. Add the domain where you host these pages. `localhost` is already allowed.

> Tip: the console's **Rules Playground** lets you test a rule before publishing. For example, an unauthenticated `get` on `it_tickets/abc` should be allowed, and an unauthenticated `list` on `it_tickets` should be denied.

## One-off setup in EmailJS

Both "To IT" and "External" currently use the same template, `template_ojea9np`, so that template has to work for both. In EmailJS → Email Templates → `template_ojea9np`, set:

- **To Email:** `{{to_email}}`
- **Subject:** `{{subject}}`
- **Content:** `{{message}}` (plus `{{ticket_link}}` if you want a button)
- **Reply To:** `{{reply_to}}`
- **From Name:** `{{from_name}}`

The page also sends these variables, which you can use in the template: `to_name`, `ticket_ref`, `ticket_title`, `priority`, `status`, `requester_name`, `requester_email`.

If you later make a separate template for outside requesters, put its ID in `js/config.js` → `templateExternal`.

> EmailJS's free plan allows 200 emails a month. Each new ticket uses two: one to IT and one confirmation to the requester.

## Running it

**To try it on your PC:** double-click `preview.bat` and open http://localhost:8080. It needs Python, which you already have. The pages must be opened through a web address like this, not by double-clicking the HTML files.

**First time:** open `dashboard.html`. You'll see **Set up the helpdesk**, which creates the first admin account. Then go to **Settings** and enter the IT team's email address, which is where new-ticket alerts go. **Send a test email** checks that EmailJS works.

**Adding IT staff:** send them the dashboard link and ask them to choose **Request access**. They appear under **Team** for you to approve.

**Putting it online for everyone.** Any static web host works:
- **Firebase Hosting:** create a *new site* first so you don't overwrite the meter app's site: `firebase hosting:sites:create nextgen-it-helpdesk`. Then run `firebase deploy --only hosting`. `firebase.json` is already set up for that site name.
- Or an IIS / SharePoint / intranet web folder, Netlify, or GitHub Pages. Copy the whole folder.

## What IT can do
- **Dashboard:** your tickets, the unassigned queue with one-click **Take**, requester replies waiting, and SLA breaches. It updates live without refreshing.
- **Tickets:** filter, search by `INC-00012`, name or text, and export to CSV.
- **Each ticket:**
  - Reply to the requester, which emails them and shows on their tracking page.
  - Add internal notes, which only IT sees.
  - Change status, priority, assignee or category; the assignee is emailed.
  - Resolve, which emails the requester; if they reply, the ticket reopens.
  - Add files. There's a full change history.
- **Reports:** created vs resolved per week, SLA compliance, average time to resolve, ticket age, workload per person, and breakdowns by priority, category, status and how tickets came in.
- **Settings (admins):** helpdesk name, IT email, SLA hours and categories.

## Security, in short
- **The public:** can only create tickets. With a ticket's tracking link they can view that one ticket and reply to it. They can't list or browse tickets.
- **IT staff:** sign in with Firebase Authentication, and need an admin's approval before they see anything.
- **Attachments:** only signed-in, approved IT staff can open them.
- **API keys:** the Firebase and EmailJS keys in `js/config.js` are meant to be public. The security rules are what protect the data.

## Notes and limits
- SLA clocks run 24/7 from when a ticket is opened. Changing SLA hours in Settings also changes the figures for older tickets.
- Times are shown in UK time.
- Requesters reply through their tracking page. Replying to the email itself doesn't feed back into the ticket.
- To stop spam submissions later, you can add Firebase App Check (reCAPTCHA).

## Files
| File | What it is |
|---|---|
| `index.html`, `track.html`, `dashboard.html` | The three pages |
| `js/config.js` | Firebase and EmailJS settings, shared helpers |
| `css/style.css` | Styling, with automatic light and dark mode |
| `firestore.rules`, `storage.rules` | Security rules to merge into Firebase |
| `firebase.json` | Firebase Hosting config (optional) |
| `preview.bat` | Runs it locally at http://localhost:8080 |
