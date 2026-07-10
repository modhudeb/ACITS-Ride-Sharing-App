import classNames from '@/utils/classNames'
import { SIZES } from '../utils/constants'

const Line = (props) => {
    const { percent, size, children, strokeColor, trailClass } = props

    const progressBackgroundClass = classNames(
        'progress-bg',
        size === SIZES.SM ? 'h-1.5' : 'h-2',
        strokeColor,
    )

    return (
        <>
            <div className="progress-wrapper">
                <div className={classNames('progress-inner', trailClass)}>
                    <div
                        className={progressBackgroundClass}
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>
            {children}
        </>
    )
}

Line.displayName = 'ProgressLine'

export default Line
