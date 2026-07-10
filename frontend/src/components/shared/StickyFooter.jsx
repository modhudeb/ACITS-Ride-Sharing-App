import { useRef, useState, useEffect } from 'react'
import classNames from 'classnames'
import useDebounce from '@/utils/hooks/useDebounce'

const StickyFooter = (props) => {
    const { children, className, stickyClass, defaultClass, ...rest } = props

    const [isSticky, setIsSticky] = useState(false)
    const ref = useRef(null)

    function handleDebounceFn(val) {
        setIsSticky(val)
    }

    const debounceFn = useDebounce(handleDebounceFn, 100)

    useEffect(() => {
        const cachedRef = ref.current
        const observer = new IntersectionObserver(
            ([e]) => {
                console.log(
                    'e.intersectionRatio < 1',
                    e.intersectionRatio,
                    e.intersectionRatio < 1,
                )
                if (!(e.intersectionRatio < 1)) {
                    window.scrollTo({
                        top: document.body.scrollHeight - 1,
                        behavior: 'smooth',
                    })
                }
                debounceFn(e.intersectionRatio < 1)
            },
            {
                threshold: [1],
            },
        )

        observer.observe(cachedRef)

        return function () {
            observer.unobserve(cachedRef)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div
            ref={ref}
            className={classNames(
                'static -bottom-[1px]',
                className,
                isSticky ? classNames(stickyClass, 'sticky') : defaultClass,
            )}
            {...rest}
        >
            {typeof children === 'function' ? children(isSticky) : children}
        </div>
    )
}

export default StickyFooter
