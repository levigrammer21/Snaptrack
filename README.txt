SnapTrack v1.2.3

Upload these runtime files to the ROOT of your GitHub Pages directory:
index.html
styles.css
app.js
firebase.js
stats.js
admin.js
manifest.json
icon-192.png
icon-512.png

Firebase setup:
- Copy/paste firestore.rules into Firebase Rules; it does not need to be hosted.
- Existing game and preset data is compatible with this version.

Release and verification references:
BUILD.txt
CHANGELOG.txt
TEST.txt

Features:
- live game scoring and play timeline
- expandable roster presets
- runner and receiver touchdown/fumble tracking
- multiple simultaneous live games across teams
- box scores, season hub, player profiles, leaderboards, and CSV exports
- email/Google sign-in and admin People screen
- offline draft recovery, conflict warning, and quick undo
- installable PWA icons and visible version number

Firebase note: static web apps cannot list Firebase Auth users directly. A user appears in People after signing in once, or after an admin adds their email manually.
