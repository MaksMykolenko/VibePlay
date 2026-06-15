#!/bin/bash
# One-click: commit Claude's Railway fixes and push to GitHub so Railway can build.
# Double-click this file in Finder. (Safe to delete afterward.)

cd "/Users/maksymmikolenko/MyProjects/VibePlay" || { echo "Repo folder not found"; read -n1; exit 1; }

echo "→ Preparing VibePlay push for Railway…"
rm -f .git/index.lock

git add -A
git commit -m "fix(railway): allow SCAN_DRIVER=none/off in prod; add migrate.Dockerfile" 2>/dev/null \
  || echo "  (nothing new to commit — continuing)"

echo "→ git push origin main"
git push origin main
status=$?

echo ""
if [ $status -eq 0 ]; then
  echo "✅ Pushed to GitHub. Switch back to Claude and say: pushed."
else
  echo "❌ Push failed (exit $status)."
  echo "   If it's an authentication error, make sure you're logged into GitHub"
  echo "   (e.g. open GitHub Desktop once, or run: git push origin main) and retry."
fi
echo ""
echo "Press any key to close this window…"
read -n 1
