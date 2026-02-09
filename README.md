# spending

Mobile spending logger. A static site hosted on GitHub Pages that logs daily spending to a CSV in this repo via the GitHub API.

Open on your phone, punch in amount and category, it commits to `spending_log.csv`. That's it.

## Live URL

```
https://williaal1.github.io/spending/
```

Set this as your Safari homepage.

## How It Works

1. Static HTML/JS page — no backend, no server
2. On submit, the app reads `spending_log.csv` from this repo via the GitHub API, appends the new entry, and commits it back
3. Auth via a fine-grained personal access token stored in your browser's `localStorage`
4. The CSV accumulates entries over time; pull it into the budgeting pipeline for analysis

## Setup

### 1. Create the GitHub repo

```bash
cd ~/spending
git init
git add -A
git commit -m "Initial commit"
gh repo create spending --public --source=. --push
```

### 2. Enable GitHub Pages

Go to: https://github.com/williaal1/spending/settings/pages

- Source: **Deploy from a branch**
- Branch: **main** / **/ (root)**
- Save

The site will be live at `https://williaal1.github.io/spending/` within a minute.

### 3. Generate a personal access token

Go to: https://github.com/settings/personal-access-tokens/new

- Token name: `spending-logger`
- Expiration: No expiration (or set a long one)
- Repository access: **Only select repositories** → `spending`
- Permissions: **Contents** → Read and write
- Generate token
- Copy the token

### 4. Set up on your phone

1. Open `https://williaal1.github.io/spending/` in Safari
2. Paste the token when prompted (text/AirDrop it to your phone)
3. Set as homepage: Safari Settings → General → Homepage
4. Done — open Safari and the logger is right there

## CSV Format

```csv
timestamp,amount,category,note
2026-02-07T14:30:00-05:00,14.50,RESTAURANTS,lunch at sweetgreen
```

## Pulling data into the budgeting pipeline

From the Personal Budgeting directory in claude-projects:

```bash
# One-time clone
git clone https://github.com/williaal1/spending.git ~/spending

# Before running the R pipeline, pull latest
cd ~/spending && git pull
```

Then in R, read `~/spending/spending_log.csv` alongside `TD Debit.csv` for the transaction matching step.

## Files

```
spending/
├── index.html          # Single-page app
├── style.css           # Mobile-first dark theme
├── app.js              # GitHub API integration, form logic
├── spending_log.csv    # Accumulating log (created on first entry)
└── README.md
```
