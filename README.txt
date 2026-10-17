SHADOW 12 — Online Starter
===========================

Includes:
- Stylish Arabic game lobby
- Node.js + Express + Socket.IO multiplayer room server
- Public/private rooms, room codes, max 12 participants
- Host controls, ready status, add/remove bots
- Basic role assignment and voting prototype
- Browser localStorage profile progression

Run locally:
1. Install Node.js LTS from https://nodejs.org/
2. Open this folder in VS Code.
3. Move index.html into the `public` folder (the ZIP already includes it there).
4. Open Terminal in this folder and run:
   npm install
   npm start
5. Visit http://localhost:3000

For LAN testing, use the computer's local IP and allow port 3000 through the firewall.
For public internet launch, deploy the Node.js app to a host that supports persistent Node.js processes and WebSockets, then use HTTPS.

Important:
This is a starter project, not a fully production-ready commercial game. The server supports real-time rooms and basic roles, but it does NOT yet implement a complete Mafia game loop (night actions, doctor saves, police investigations, win conditions, moderation, database-backed accounts, secure persistent XP, anti-cheat, or production security). Bots are placeholders in the lobby and do not make intelligent game decisions. Do not market it as a finished game until these systems are implemented and tested.
