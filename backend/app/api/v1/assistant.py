from fastapi import APIRouter, Depends

from app.core.rate_limit import rate_limit
from app.core.security import CurrentUser, get_current_user
from app.models.assistant import AssistantChatRequest, AssistantChatResponse
from app.services import assistant_service

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantChatResponse)
async def chat(
    payload: AssistantChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _: CurrentUser = Depends(rate_limit("assistant.chat", max_calls=15, window_seconds=60)),
):
    result = await assistant_service.run_agent(payload.message, payload.location, payload.history)
    return AssistantChatResponse(
        reply=result["reply"],
        places=result["places"],
        booking=result["booking"],
    )
