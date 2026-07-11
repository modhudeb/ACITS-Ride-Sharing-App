import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { apiSendRideMessage } from '@/services/RideService'
import useRideMessages from '@/utils/hooks/useRideMessages'

// Lightweight passenger<->driver chat for an active ride. The backend
// derives the sender's name from their own profile (not a client-supplied
// value) and fans each message out over the ride_chat:{id} realtime topic.
const ChatIcon = (props) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
)

const ChevronDownIcon = (props) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="m6 9 6 6 6-6" />
    </svg>
)

const SendIcon = (props) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
    </svg>
)

const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const RideChat = ({ rideId, currentUid, peerName }) => {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [unread, setUnread] = useState(0)
    // Subscribe always so the unread badge can track new messages while the
    // panel is collapsed; only the list itself is rendered when open.
    const messages = useRideMessages(rideId)
    const bottomRef = useRef(null)
    const prevLenRef = useRef(0)
    const initializedRef = useRef(false)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length, open])

    useEffect(() => {
        if (!initializedRef.current) {
            initializedRef.current = true
            prevLenRef.current = messages.length
            return
        }
        if (!open) {
            const delta = messages.length - prevLenRef.current
            if (delta > 0) setUnread((u) => u + delta)
        } else {
            setUnread(0)
        }
        prevLenRef.current = messages.length
    }, [messages.length, open])

    const handleSend = async () => {
        const trimmed = text.trim()
        if (!trimmed || sending) return
        setSending(true)
        try {
            await apiSendRideMessage(rideId, trimmed)
            setText('')
        } finally {
            setSending(false)
        }
    }

    const title = peerName ? `Chat · ${peerName}` : 'Chat'

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="group relative flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:shadow dark:border-gray-700 dark:bg-gray-800"
            >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                    <ChatIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                        {title}
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                        {unread > 0
                            ? `${unread} new message${unread > 1 ? 's' : ''}`
                            : 'Tap to message your rider'}
                    </span>
                </span>
                {unread > 0 && (
                    <span className="grid h-5 min-w-[1.25rem] shrink-0 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
                        {unread}
                    </span>
                )}
            </button>
        )
    }

    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2 bg-emerald-600 px-3 py-2 text-white">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20">
                    <ChatIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                        {title}
                    </span>
                    <span className="block text-[11px] opacity-80">
                        Ride chat
                    </span>
                </span>
                <button
                    type="button"
                    aria-label="Minimize chat"
                    onClick={() => setOpen(false)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-white/20"
                >
                    <ChevronDownIcon className="h-5 w-5" />
                </button>
            </div>

            <div className="max-h-64 space-y-1.5 overflow-y-auto px-3 py-2">
                {messages.length === 0 && (
                    <p className="py-4 text-center text-xs text-gray-400">
                        No messages yet — say hello! 👋
                    </p>
                )}
                {messages.map((msg) => {
                    const mine = msg.sender_id === currentUid
                    return (
                        <div
                            key={msg.id}
                            className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-sm ${
                                    mine
                                        ? 'rounded-br-sm bg-emerald-600 text-white'
                                        : 'rounded-bl-sm bg-gray-100 dark:bg-gray-700'
                                }`}
                            >
                                <p className="whitespace-pre-wrap break-words">
                                    {msg.text}
                                </p>
                                <span
                                    className={`mt-0.5 block text-[10px] ${
                                        mine
                                            ? 'text-emerald-100'
                                            : 'text-gray-400'
                                    }`}
                                >
                                    {formatTime(msg.at)}
                                </span>
                            </div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

            <div className="flex items-center gap-2 border-t border-gray-200 p-2 dark:border-gray-700">
                <Input
                    size="sm"
                    placeholder="Type a message"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSend()
                    }}
                />
                <Button
                    size="sm"
                    variant="solid"
                    className="!px-2.5"
                    disabled={!text.trim()}
                    loading={sending}
                    onClick={handleSend}
                    aria-label="Send message"
                >
                    <SendIcon className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

export default RideChat
