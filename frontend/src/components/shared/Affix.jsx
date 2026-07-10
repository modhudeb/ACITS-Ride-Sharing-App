import { useEffect, createRef } from 'react'
import classNames from 'classnames'

function Affix(props) {
    const { offset = 0, className, children } = props

    const ref = createRef()
    const prevStyle = {
        position: '',
        top: '',
        width: '',
    }

    const checkPosition = (distanceToBody, width) => {
        const scrollTop = window.scrollY

        if (ref.current) {
            if (distanceToBody - scrollTop < offset) {
                if (ref.current.style.position !== 'fixed') {
                    for (const key in prevStyle) {
                        prevStyle[key] = ref.current.style[key]
                    }
                    ref.current.style.position = 'fixed'
                    ref.current.style.width = width + 'px'
                    ref.current.style.top = offset + 'px'
                }
            } else {
                for (const key in prevStyle) {
                    ref.current.style[key] = prevStyle[key]
                }
            }
        }
    }

    useEffect(() => {
        if (typeof window.scrollY === 'undefined') {
            return
        }

        if (ref.current) {
            const distanceToBody =
                window.scrollY + ref.current.getBoundingClientRect().top
            const handleScroll = () => {
                if (!ref.current) {
                    return
                }

                requestAnimationFrame(() => {
                    checkPosition(distanceToBody, ref.current?.clientWidth)
                })
            }

            window.addEventListener('scroll', handleScroll)
            return () => {
                window.removeEventListener('scroll', handleScroll)
            }
        }
    })

    return (
        <div ref={ref} className={classNames('z-10', className)}>
            {children}
        </div>
    )
}

export default Affix
