import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { TbSend, TbCar, TbX, TbSparkles } from 'react-icons/tb'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { apiAssistantChat } from '@/services/AssistantService'
import { usePendingDestinationStore } from '@/store/pendingDestinationStore'
import { DEFAULT_CENTER } from '@/constants/map.constant'

const WELCOME = {
    role: 'assistant',
    content:
        "Hi! Ask me to find a place nearby - e.g. \"nearest restaurant\" or \"where is Square company\" - and I can start a ride there for you.",
}

// Floating ride-search assistant: the model only ever parses intent, real
// place data always comes from the backend's Overpass/Mapbox lookup, and
// picking a result hands the destination straight to the booking flow.
const ChatAssistant = () => {
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState([WELCOME])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const locationRef = useRef(DEFAULT_CENTER)
    const bottomRef = useRef(null)

    useEffect(() => {
        if (!navigator.geolocation) return
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locationRef.current = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                }
            },
            () => {},
        )
    }, [])

    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, open])

    const handleSend = async () => {
        const text = input.trim()
        if (!text || sending) return
        setInput('')
        setSending(true)

        const history = messages
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content }))
        setMessages((prev) => [...prev, { role: 'user', content: text }])

        try {
            const res = await apiAssistantChat({
                message: text,
                location: locationRef.current,
                history,
            })
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: res.reply, places: res.places },
            ])
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content:
                        err?.response?.data?.detail ||
                        "Sorry, I couldn't reach the assistant just now.",
                },
            ])
        } finally {
            setSending(false)
        }
    }

    const handleBookRideHere = (place) => {
        usePendingDestinationStore.getState().setPendingDestination({
            lat: place.lat,
            lng: place.lng,
            address: place.address ? `${place.name}, ${place.address}` : place.name,
        })
        navigate('/passenger')
        setOpen(false)
    }

    if (!open) {
        return (
            <button
                type="button"
                aria-label="Open ride assistant"
                onClick={() => setOpen(true)}
                className="fixed bottom-5 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-white p-2.5 text-white shadow-lg ring-2 ring-emerald-600/20 transition-transform hover:scale-105"
            >
                <img
                    src="/img/logo/logo-light-streamline.png"
                    alt="Open ACITS ride assistant"
                    className="h-full w-full object-contain"
                />
            </button>
        )
    }

    return (
        <div className="fixed bottom-5 right-5 z-20 flex h-[28rem] max-h-[calc(100vh-6rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-emerald-600/30 bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between bg-emerald-600 px-3 py-2.5 text-white">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <TbSparkles size={18} /> Ride assistant
                </span>
                <button
                    type="button"
                    aria-label="Close ride assistant"
                    onClick={() => setOpen(false)}
                    className="rounded p-0.5 hover:bg-emerald-700"
                >
                    <TbX size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2.5">
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                                msg.role === 'user'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-emerald-50 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                            }`}
                        >
                            {msg.content}
                        </div>
                        {msg.places?.map((place) => (
                            <div
                                key={`${place.lat}-${place.lng}`}
                                className="w-[85%] rounded-lg border border-emerald-200 dark:border-emerald-800 p-2.5"
                            >
                                <p className="text-sm font-semibold truncate">
                                    {place.name}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {place.address}
                                </p>
                                <div className="mt-1.5 flex items-center justify-between">
                                    <span className="text-xs text-emerald-600 font-medium">
                                        {place.distance_km} km away
                                    </span>
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        className="!bg-emerald-600 hover:!bg-emerald-700"
                                        icon={<TbCar size={16} />}
                                        onClick={() => handleBookRideHere(place)}
                                    >
                                        Book ride here
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
                {sending && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Spinner size={14} /> Thinking...
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="flex gap-2 border-t border-gray-100 p-2 dark:border-gray-700">
                <Input
                    size="sm"
                    placeholder="Ask e.g. nearest restaurant"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSend()
                    }}
                />
                <Button
                    size="sm"
                    variant="solid"
                    className="!bg-emerald-600 hover:!bg-emerald-700"
                    loading={sending}
                    icon={!sending ? <TbSend size={16} /> : undefined}
                    onClick={handleSend}
                />
            </div>
        </div>
    )
}

export default ChatAssistant
