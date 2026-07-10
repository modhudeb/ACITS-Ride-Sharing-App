import getPosition from './utils/getPosition'
import classNames from '../utils/classNames'

function isMarkFilled({ mark, offset, value }) {
    return typeof offset === 'number'
        ? mark.value >= offset && mark.value <= value
        : mark.value <= value
}

function Marks({
    marks,
    min,
    max,
    disabled,
    value,
    offset,
    markClass,
    direction,
}) {
    if (!marks) {
        return null
    }

    const items = marks.map((mark, index) => (
        <div
            key={index}
            className="slider-mark-wrapper"
            style={
                direction === 'rtl'
                    ? {
                          insetInlineStart: `calc(${getPosition({ value: mark.value, min, max })}% - 6px )`,
                      }
                    : {
                          insetInlineStart: `calc(${getPosition({ value: mark.value, min, max })}% - 6px / 2)`,
                      }
            }
        >
            <div
                className={classNames(
                    'slider-mark',
                    isMarkFilled({ mark, offset, value }) &&
                        'slider-mark-filled',
                    disabled && 'disabled',
                    typeof markClass === 'function'
                        ? markClass(
                              isMarkFilled({
                                  mark,
                                  offset,
                                  value,
                              }),
                          )
                        : markClass,
                )}
            />
            {mark.label && (
                <div className="slider-mark-label">{mark.label}</div>
            )}
        </div>
    ))

    return <div>{items}</div>
}

export default Marks
