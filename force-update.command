#!/bin/zsh
# Force the site to rebuild now, instead of waiting for the weekday job.
#
# Why this exists: the GitHub Action is scheduled for 22:30 UTC but is queued,
# and has consistently run about two hours late. Treasury posts the day's curve
# just before 4pm New York. So between roughly 4pm and 8pm New York the data
# exists and the site does not have it yet. This closes that gap.
#
# Double-click it in Finder, or run it from a terminal.

set -e
cd "$(dirname "$0")"

REPO="eric714/yield-curve-3d"
WORKFLOW="update-data.yml"
TOKEN_FILE="$HOME/.config/yieldcurve3d/token"

if [ ! -s "$TOKEN_FILE" ]; then
  cat <<SETUP

  One-time setup needed.

  1. Open https://github.com/settings/personal-access-tokens/new
  2. Token name:        yieldcurve3d force update
     Repository access: Only select repositories -> $REPO
     Permissions:       Repository permissions -> Actions -> Read and write
     Expiration:        whatever you like
  3. Click Generate token and copy it.
  4. Run these two lines in Terminal, pasting your token in place of PASTE_HERE:

       mkdir -p ~/.config/yieldcurve3d
       printf %s 'PASTE_HERE' > ~/.config/yieldcurve3d/token && chmod 600 ~/.config/yieldcurve3d/token

  The token stays on this Mac. It can do exactly one thing: run this
  repository's workflows. It cannot read your other repositories.

SETUP
  echo "Press return to close."; read _; exit 1
fi

TOKEN=$(tr -d ' \t\n\r' < "$TOKEN_FILE")

echo "Asking GitHub to run \"Update data\"..."
CODE=$(curl -sS -o /tmp/ycd-dispatch.out -w '%{http_code}' -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches" \
  -d '{"ref":"main"}')

if [ "$CODE" = "204" ]; then
  echo
  echo "  Started. It takes about a minute."
  echo "  Watch it:  https://github.com/$REPO/actions"
  echo "  Then press \"Check for newer\" on the site."
else
  echo
  echo "  GitHub said HTTP $CODE:"
  sed 's/^/    /' /tmp/ycd-dispatch.out
  echo
  if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
    echo "  That usually means the token expired or lacks Actions: Read and write."
    echo "  Delete $TOKEN_FILE and run this again for the setup steps."
  fi
fi
rm -f /tmp/ycd-dispatch.out
echo
echo "Press return to close."; read _
