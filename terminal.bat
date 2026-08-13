@echo off
cd /d C:\g
git add .
git commit -m "Auto sync"
git checkout HEAD -- .
cmd