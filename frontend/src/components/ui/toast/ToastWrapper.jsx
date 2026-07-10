import {
    useState,
    useImperativeHandle,
    useRef,
    useCallback,
    cloneElement,
    createRef,
} from 'react'
import classNames from 'classnames'
import chainedFunction from '../utils/chainedFunction'
import { motion } from 'framer-motion'
import { getPlacementTransition } from './transition'
import { PLACEMENT } from '../utils/constants'
import { createRoot } from 'react-dom/client'

const useMessages = (msgKey) => {
    const [messages, setMessages] = useState([])

    const getKey = useCallback(
        (key) => {
            if (typeof key === 'undefined' && messages.length) {
                key = messages[messages.length - 1].key
            }
            return key
        },
        [messages],
    )

    const push = useCallback(
        (message) => {
            const key = msgKey || '_' + Math.random().toString(36).substr(2, 12)
            setMessages([...messages, { key, visible: true, node: message }])
            return key
        },
        [messages, msgKey],
    )

    const removeAll = useCallback(() => {
        setMessages(messages.map((msg) => ({ ...msg, visible: false })))
        setTimeout(() => {
            setMessages([])
        }, 50)
    }, [messages])

    const remove = useCallback(
        (key) => {
            setMessages(
                messages.map((elm) => {
                    if (elm.key === getKey(key)) {
                        elm.visible = false
                    }
                    return elm
                }),
            )

            setTimeout(() => {
                setMessages(messages.filter((msg) => msg.visible))
            }, 50)
        },
        [messages, getKey],
    )

    return { messages, push, removeAll, remove }
}

const ToastWrapper = (props) => {
    const rootRef = useRef(null)

    const {
        transitionType = 'scale',
        placement = PLACEMENT.TOP_END,
        offsetX = 30,
        offsetY = 30,
        messageKey,
        block = false,
        ref,
        callback,
        ...rest
    } = props

    const { push, removeAll, remove, messages } = useMessages(messageKey)

    useImperativeHandle(ref, () => {
        return { root: rootRef.current, push, removeAll, remove }
    })

    const placementTransition = getPlacementTransition({
        offsetX,
        offsetY,
        placement: placement,
        transitionType,
    })

    const toastProps = {
        triggerByToast: true,
        ...rest,
    }

    const messageElements = messages.map((item) => {
        return (
            <motion.div
                key={item.key}
                className={'toast-wrapper'}
                initial={placementTransition.variants.initial}
                variants={placementTransition.variants}
                animate={item.visible ? 'animate' : 'exit'}
                transition={{ duration: 0.15, type: 'tween' }}
            >
                {cloneElement(item.node, {
                    ...toastProps,
                    ref,
                    onClose: chainedFunction(item.node?.props?.onClose, () =>
                        remove(item.key),
                    ),
                    className: classNames(item.node?.props?.className),
                })}
            </motion.div>
        )
    })

    return (
        <div
            style={placementTransition.default}
            {...rest}
            ref={(thisRef) => {
                rootRef.current = thisRef
                callback?.(thisRef)
            }}
            className={classNames('toast', block && 'w-full')}
        >
            {messageElements}
        </div>
    )
}

ToastWrapper.getInstance = (props) => {
    const { wrapper, ...rest } = props

    const wrapperRef = createRef()

    const wrapperElement =
        (typeof wrapper === 'function' ? wrapper() : wrapper) || document.body

    return new Promise((resolve) => {
        const renderCallback = () => {
            resolve([wrapperRef, unmount])
        }

        function renderElement(element) {
            const mountElement = document.createElement('div')

            wrapperElement.appendChild(mountElement)

            const root = createRoot(mountElement)

            root.render(element)

            return root
        }

        const { unmount } = renderElement(
            <ToastWrapper
                {...rest}
                ref={wrapperRef}
                callback={renderCallback}
            />,
        )
    })
}

export default ToastWrapper
