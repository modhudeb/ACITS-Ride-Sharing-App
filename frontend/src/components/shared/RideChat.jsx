import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { db } from '@/services/firebase/firebaseApp'
import useRideMessages from '@/utils/hooks/useRideMessages'

// Lightweight passenger<->driver chat for an active ride. Messages live in a
// subcollection of the ride and arrive via the same realtime channel as
// ride status, so there is no extra backend involved.
const RideChat = ({ rideId, currentUid, currentName }) => {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const messages = useRideMessages(open ? rideId : null)
    const bottomRef = useRef(null)
    const seenCountRef = useRef(0)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        if (open) seenCountRef.current = messages.length
    }, [messages.length, open])

    const handleSend = async () => {
        const trimmed = text.trim()
        if (!trimmed || sending) return
        setSending(true)
        try {
            await addDoc(collection(db, 'rides', rideId, 'messages'), {
                senderId: currentUid,
                senderName: currentName || 'User',
                text: trimmed.slice(0, 500),
                at: serverTimestamp(),
            })
            setText('')
        } finally {
            setSending(false)
        }
    }

    if (!open) {
        return (
            <button
                type="button"
                className="text-sm underline text-emerald-600 dark:text-emerald-400"
                onClick={() => setOpen(true)}
            >
                Open chat
            </button>
        )
    }

    return (
        <div className="border rounded-lg dark:border-gray-600">
            <div className="flex items-center justify-between px-3 py-2 border-b dark:border-gray-600">
                <span className="text-sm font-semibold">Chat</span>
                <button
                    type="button"
                    className="text-xs text-gray-400 underline"
                    onClick={() => setOpen(false)}
                >
                    Hide
                </button>
            </div>
            <div className="max-h-40 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                {messages.length === 0 && (
                    <p className="text-xs text-gray-400">
                        No messages yet - say hello!
                    </p>
                )}
                {messages.map((msg) => {
                    const mine = msg.senderId === currentUid
                    return (
                        <div
                            key={msg.id}
                            className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm ${
                                mine
                                    ? 'self-end bg-emerald-600 text-white'
                                    : 'self-start bg-gray-100 dark:bg-gray-700'
                            }`}
                        >
                            {msg.text}
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>
            <div className="flex gap-2 p-2 border-t dark:border-gray-600">
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
                    loading={sending}
                    onClick={handleSend}
                >
                    Send
                </Button>
            </div>
        </div>
    )
}

export default RideChat
