import classNames from 'classnames'

const TimeLineItem = (props) => {
    const { children, className, isLast, media, ref } = props

    return (
        <li
            ref={ref}
            className={classNames(
                'timeline-item',
                isLast ? 'timeline-item-last' : '',
                className,
            )}
        >
            <div className="timeline-item-wrapper">
                <div className="timeline-item-media">
                    <div className="timeline-item-media-content">
                        {media || (
                            <div className="timeline-item-media-default" />
                        )}
                    </div>
                    {!isLast && <div className="timeline-connect" />}
                </div>
                <div
                    className={classNames(
                        'timeline-item-content',
                        isLast && 'timeline-item-content-last',
                    )}
                >
                    {children}
                </div>
            </div>
        </li>
    )
}

export default TimeLineItem
