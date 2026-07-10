from pydantic import BaseModel, Field

from app.models.ride import LatLng


class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=1000)


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    location: LatLng
    # Short rolling window of prior turns so the assistant has context
    # ("closer one" after a place-search reply) without an unbounded payload.
    history: list[ChatMessage] = Field(default_factory=list, max_length=6)


class PlaceResult(BaseModel):
    name: str
    address: str | None = None
    lat: float
    lng: float
    distance_km: float


class AssistantChatResponse(BaseModel):
    reply: str
    places: list[PlaceResult] = Field(default_factory=list)
