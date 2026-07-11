import { useToken } from '@/store/authStore'
import appConfig from '@/configs/app.config'

function buildWsUrl() {
    const apiPrefix = appConfig.apiPrefix
    let base
    if (/^https?:\/\//.test(apiPrefix)) {
        base = apiPrefix.replace(/^http/, 'ws')
    } else {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        base = `${proto}://${window.location.host}${apiPrefix}`
    }
    return `${base}/v1/ws`
}

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 15000

// Single shared WebSocket connection for every realtime topic in the app -
// the Postgres-era replacement for Firestore's onSnapshot. Hooks subscribe
// to a topic and get a callback per message; this class owns the socket
// lifecycle, reconnects with backoff, and re-subscribes everything on
// reconnect so a network blip doesn't silently stop live updates.
class RealtimeClient {
    constructor() {
        this.ws = null
        this.topics = new Map() // topic -> Set<callback>
        this.reconnectAttempt = 0
        this.reconnectTimer = null
        this.explicitlyClosed = false
    }

    _ensureConnected() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return
        }
        this._connect()
    }

    _connect() {
        const token = useToken().token
        if (!token) return

        this.explicitlyClosed = false
        const ws = new WebSocket(`${buildWsUrl()}?token=${encodeURIComponent(token)}`)
        this.ws = ws

        ws.onopen = () => {
            this.reconnectAttempt = 0
            for (const topic of this.topics.keys()) {
                ws.send(JSON.stringify({ action: 'subscribe', topic }))
            }
        }

        ws.onmessage = (event) => {
            let message
            try {
                message = JSON.parse(event.data)
            } catch {
                return
            }
            const callbacks = this.topics.get(message.topic)
            if (!callbacks) return
            callbacks.forEach((callback) => callback(message))
        }

        ws.onclose = () => {
            if (this.explicitlyClosed) return
            this._scheduleReconnect()
        }

        ws.onerror = () => {
            ws.close()
        }
    }

    _scheduleReconnect() {
        if (this.reconnectTimer || this.topics.size === 0) return
        const delay = Math.min(
            RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt,
            RECONNECT_MAX_DELAY_MS,
        )
        this.reconnectAttempt += 1
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            if (this.topics.size > 0) this._connect()
        }, delay)
    }

    /** Subscribes to a topic; returns an unsubscribe function. Multiple
     * local subscribers to the same topic share one server subscription. */
    subscribe(topic, callback) {
        if (!this.topics.has(topic)) {
            this.topics.set(topic, new Set())
        }
        const callbacks = this.topics.get(topic)
        const isFirstForTopic = callbacks.size === 0
        callbacks.add(callback)

        this._ensureConnected()
        if (isFirstForTopic && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'subscribe', topic }))
        }

        return () => {
            callbacks.delete(callback)
            if (callbacks.size === 0) {
                this.topics.delete(topic)
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ action: 'unsubscribe', topic }))
                }
            }
        }
    }

    /** Called on sign-out - drops the connection and cancels any pending
     * reconnect so a stale session's socket doesn't linger. */
    close() {
        this.explicitlyClosed = true
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
        this.topics.clear()
        this.reconnectAttempt = 0
        this.ws?.close()
        this.ws = null
    }
}

export const realtimeClient = new RealtimeClient()
