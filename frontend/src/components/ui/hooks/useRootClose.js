import { useEffect, useCallback, useRef } from 'react'

const domContains = (context, node) => {
    if (context.contains) {
        return context.contains(node)
    } else if (context.compareDocumentPosition) {
        return (
            context === node || !!(context.compareDocumentPosition(node) & 16)
        )
    }
    if (node) {
        do {
            if (node === context) {
                return true
            }
        } while ((node = node.parentNode))
    }
    return false
}

function isLeftClickEvent(e) {
    return e?.button === 0
}

function isModifiedEvent(e) {
    return !!(e.metaKey || e.altKey || e.ctrlKey || e?.shiftKey)
}

function onEventListener(target, eventType, listener, options = false) {
    target.addEventListener(eventType, listener, options)

    return {
        off() {
            target.removeEventListener(eventType, listener, options)
        },
    }
}

function useRootClose(onRootClose, { disabled, triggerTarget, overlayTarget }) {
    const handleDocumentMouseDown = useCallback(
        (event) => {
            const triggerElement = triggerTarget?.current
            const overlayElement = overlayTarget?.current

            if (triggerElement && domContains(triggerElement, event.target)) {
                return
            }

            if (overlayElement && domContains(overlayElement, event.target)) {
                return
            }

            if (isModifiedEvent(event) || !isLeftClickEvent(event)) {
                return
            }

            onRootClose?.(event)
        },
        [onRootClose, triggerTarget, overlayTarget],
    )

    const handleDocumentMouseDownRef = useRef(handleDocumentMouseDown)

    useEffect(() => {
        handleDocumentMouseDownRef.current = handleDocumentMouseDown
    }, [handleDocumentMouseDown])

    useEffect(() => {
        const currentTarget = triggerTarget?.current

        if (disabled || !currentTarget) return

        const doc = () =>
            (currentTarget && currentTarget.ownerDocument) || document
        const onDocumentMouseDownListener = onEventListener(
            doc(),
            'mousedown',
            (event) => handleDocumentMouseDownRef.current(event),
            true,
        )

        return () => {
            onDocumentMouseDownListener?.off()
        }
    }, [triggerTarget, disabled])
}

export default useRootClose
