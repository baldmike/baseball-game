# Baseball Game

A full-stack interactive baseball game that uses real MLB rosters and player stats. Pick any team and season from 2015–2025, then play a full 9-inning game — you pitch when your team is in the field and bat when they're up.

## Tech Stack

- **Backend:** Python / FastAPI
- **Frontend:** Vue 3 / Vite
- **Data:** [MLB Stats API](https://github.com/toddrob99/MLB-StatsAPI) for real rosters and hitting stats

## Features

- Choose from all 30 MLB teams
- Select a season (2015–2025) to play with historical rosters and stats
- Player stats (AVG, SLG, K rate, HR rate) influence at-bat outcomes
- Full 9-inning games with extra innings support
- Pitch selection (fastball, curveball, slider, changeup) and swing/take batting
- Live scoreboard, base runner diamond, and play-by-play log

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
