from fastapi import APIRouter, HTTPException

from app.services import mlb_service

router = APIRouter()


@router.get("/games/today")
def today_games():
    try:
        return mlb_service.get_todays_games()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")


@router.get("/games/{game_pk}")
def game_detail(game_pk: int):
    try:
        return mlb_service.get_game_detail(game_pk)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")


@router.get("/games/{game_pk}/playbyplay")
def play_by_play(game_pk: int):
    try:
        return mlb_service.get_play_by_play(game_pk)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")
