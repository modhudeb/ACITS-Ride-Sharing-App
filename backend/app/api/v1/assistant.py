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
    intent = await assistant_service.parse_intent(payload.message, payload.history)

    places = []
    pickup = None
    if intent["intent"] in ("place_search", "book_ride") and intent["search_query"]:
        places = await assistant_service.resolve_places(intent["search_query"], payload.location)
        if not places:
            intent["reply"] = f"I couldn't find anything for \"{intent['search_query']}\"."

    # An explicit origin ("from Gulshan to Banani") is resolved the same
    # way as the destination. When pickup_query is null the frontend falls
    # back to the passenger's live GPS location as the pickup.
    if intent.get("pickup_query"):
        pickup_places = await assistant_service.resolve_places(intent["pickup_query"], payload.location)
        if pickup_places:
            pickup = pickup_places[0]

    return AssistantChatResponse(reply=intent["reply"], places=places, pickup=pickup)
