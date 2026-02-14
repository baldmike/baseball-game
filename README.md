# Baseball Game

A full-stack interactive baseball game that uses real MLB rosters and player stats. Pick any team and season from 1920–2025, choose your starting pitcher, pick an opponent from any era, then play a full 9-inning game or simulate it with animated play-by-play.

## Tech Stack

- **Backend:** Python / FastAPI
- **Frontend:** Vue 3 / Vite
- **Data:** [MLB Stats API](https://github.com/toddrob99/MLB-StatsAPI) for real rosters and hitting/pitching stats

## Features

### Setup Wizard
A 6-step pregame setup:
1. **Pick your team** — choose from all 30 MLB teams
2. **Pick your season** — select a year (1920–2025) for your roster
3. **Pick your pitcher** — choose a starting pitcher with ERA and K/9 stats displayed
4. **Pick the opponent** — select any other MLB team to face
5. **Pick opponent season** — the opponent can use a different year (historical matchups like 2005 White Sox vs 2004 Red Sox)
6. **Pick opponent pitcher** — choose their starter, then play or simulate

### Gameplay
- **Play mode** — you pitch when your team is in the field (fastball, curveball, slider, changeup) and bat when they're up (swing or take)
- **Simulate mode** — CPU vs CPU with animated play-by-play replay and speed controls (Slow / Normal / Fast / Skip to End)
- Smart lineup selection: fills one player per position (C, 1B, 2B, 3B, SS, 3 OF, DH), then best remaining by OPS
- Batter stats (AVG, SLG, K rate, HR rate) and pitcher stats (ERA, K/9, BB/9) both influence at-bat outcomes
- Full 9-inning games with extra innings support
- Live scoreboard, base runner diamond, pitcher/batter display, and play-by-play log
- Sound effects for hits, strikeouts, walks, home runs, and more

## Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 to play.
