from pydantic import BaseModel, Field

from app.models.ride import LatLng


class ChatMessage(BaseModel):
    role: str
    # Raised from 1000: the frontend now folds serialized place options
    # ("Options shown: 1. X (lat,lng); ...") into assistant history entries
    # so multi-turn references like "book the second one" stay grounded in
    # real coordinates instead of the model re-guessing them.
    content: str = Field(max_length=2000)


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


class AssistantBooking(BaseModel):
    """Emitted only when the agent decided to actually start a booking (via
    the start_booking tool), as opposed to just listing search results. The
    frontend hands this straight to the booking screen with no extra click
    required - the whole point of the agent being able to act, not just
    search."""

    destination: PlaceResult
    # Explicit alternate origin (e.g. "from Gulshan to Banani"). Absent means
    # the app falls back to the passenger's live GPS location as pickup.
    pickup: PlaceResult | None = None


class AssistantChatResponse(BaseModel):
    reply: str
    places: list[PlaceResult] = Field(default_factory=list)
    booking: AssistantBooking | None = None
