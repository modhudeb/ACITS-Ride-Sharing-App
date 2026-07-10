import { useCallback, useRef, useState } from "react"
import Thumb from "./Thumb"
import Track from "./Track"
import { useConfig } from "../ConfigProvider"
import useMergeRef from "../hooks/useMergeRef"
import useControllableState from "../hooks/useControllableState"
import { clamp } from "../utils/clamp"
import getChangeValue from "./utils/getChangeValue"
import getFloatingValue from "./utils/getFloatingValue"
import getPosition from "./utils/getPosition"
import getPrecision from "./utils/getPrecision"
import getClosestNumber from "./utils/getClosestNumber"
import useMove from "./utils/useMove"
import {
  getFirstMarkValue,
  getLastMarkValue,
  getNextMarkValue,
  getPreviousMarkValue
} from "./utils/getStepMarkValue"

const Slider = props => {
  const {
    value,
    onChange,
    onDraggingStop,
    min = 0,
    max = 100,
    step = 1,
    precision: _precision,
    defaultValue = 0,
    name,
    marks = [],
    tooltip = f => f,
    alwaysShowTooltip = false,
    classNames = {},
    thumbAriaLabel,
    showTooltipOnHover = false,
    disabled = false,
    inputProps,
    stepOnMarks,
    ref = null,
    ...rest
  } = props

  const { direction } = useConfig()

  const [hovered, setHovered] = useState(false)
  const [_value, setValue] = useControllableState({
    prop: typeof value === "number" ? clamp(value, min, max) : value,
    defaultProp:
      typeof defaultValue === "number"
        ? clamp(defaultValue, min, max)
        : defaultValue,
    onChange
  })

  const valueRef = useRef(_value)
  const root = useRef(null)
  const thumb = useRef(null)
  const position = getPosition({
    value: _value,
    min: min,
    max: max
  })
  const scaledValue = _value
  const _tooltip =
    typeof tooltip === "function" ? tooltip(scaledValue) : tooltip
  const precision = _precision ?? getPrecision(step)

  const handleChange = useCallback(
    ({ x }) => {
      if (!disabled) {
        const nextValue = getChangeValue({
          value: x,
          min: min,
          max: max,
          step: step,
          precision
        })
        setValue(
          stepOnMarks && marks?.length
            ? getClosestNumber(
                nextValue,
                marks.map(mark => mark.value)
              )
            : nextValue
        )
        valueRef.current = nextValue
      }
    },
    [disabled, min, max, step, precision, setValue, marks, stepOnMarks]
  )

  const { ref: container, active } = useMove(
    handleChange,
    {
      onScrubEnd: () =>
        !disabled &&
        onDraggingStop?.(
          stepOnMarks && marks?.length
            ? getClosestNumber(
                valueRef.current,
                marks.map(mark => mark.value)
              )
            : valueRef.current
        )
    },
    direction
  )

  const handleTrackKeydownCapture = event => {
    if (!disabled) {
      switch (event.key) {
        case "ArrowUp": {
          event.preventDefault()
          thumb.current?.focus()

          if (stepOnMarks && marks) {
            const nextValue = getNextMarkValue(_value, marks)
            setValue(nextValue)
            onDraggingStop?.(nextValue)
            break
          }

          const nextValue = getFloatingValue(
            Math.min(Math.max(_value + step, min), max),
            precision
          )
          setValue(nextValue)
          onDraggingStop?.(nextValue)
          break
        }

        case "ArrowRight": {
          event.preventDefault()
          thumb.current?.focus()

          if (stepOnMarks && marks) {
            const nextValue =
              direction === "rtl"
                ? getPreviousMarkValue(_value, marks)
                : getNextMarkValue(_value, marks)
            setValue(nextValue)
            onDraggingStop?.(nextValue)
            break
          }

          const nextValue = getFloatingValue(
            Math.min(
              Math.max(
                direction === "rtl" ? _value - step : _value + step,
                min
              ),
              max
            ),
            precision
          )
          setValue(nextValue)
          onDraggingStop?.(nextValue)
          break
        }

        case "ArrowDown": {
          event.preventDefault()
          thumb.current?.focus()

          if (stepOnMarks && marks) {
            const nextValue = getPreviousMarkValue(_value, marks)
            setValue(nextValue)
            onDraggingStop?.(nextValue)
            break
          }

          const nextValue = getFloatingValue(
            Math.min(Math.max(_value - step, min), max),
            precision
          )
          setValue(nextValue)
          onDraggingStop?.(nextValue)
          break
        }

        case "ArrowLeft": {
          event.preventDefault()
          thumb.current?.focus()

          if (stepOnMarks && marks) {
            const nextValue =
              direction === "rtl"
                ? getNextMarkValue(_value, marks)
                : getPreviousMarkValue(_value, marks)
            setValue(nextValue)
            onDraggingStop?.(nextValue)
            break
          }

          const nextValue = getFloatingValue(
            Math.min(
              Math.max(
                direction === "rtl" ? _value + step : _value - step,
                min
              ),
              max
            ),
            precision
          )
          setValue(nextValue)
          onDraggingStop?.(nextValue)
          break
        }

        case "Home": {
          event.preventDefault()
          thumb.current?.focus()

          if (stepOnMarks && marks) {
            setValue(getFirstMarkValue(marks))
            onDraggingStop?.(getFirstMarkValue(marks))
            break
          }

          setValue(min)
          onDraggingStop?.(min)
          break
        }

        case "End": {
          event.preventDefault()
          thumb.current?.focus()

          if (stepOnMarks && marks) {
            setValue(getLastMarkValue(marks))
            onDraggingStop?.(getLastMarkValue(marks))
            break
          }

          setValue(max)
          onDraggingStop?.(max)
          break
        }

        default: {
          break
        }
      }
    }
  }

  return (
    <div
      {...rest}
      ref={useMergeRef(ref, root)}
      onKeyDownCapture={handleTrackKeydownCapture}
      onMouseDownCapture={() => root.current?.focus()}
    >
      <Track
        offset={0}
        filled={position}
        marks={marks}
        min={min}
        max={max}
        value={scaledValue}
        disabled={disabled}
        trackClass={classNames.track}
        barClass={classNames.bar}
        markClass={classNames.mark}
        direction={direction}
        containerProps={{
          ref: container,
          onMouseEnter: showTooltipOnHover ? () => setHovered(true) : undefined,
          onMouseLeave: showTooltipOnHover ? () => setHovered(false) : undefined
        }}
      >
        <Thumb
          ref={thumb}
          max={max}
          min={min}
          value={scaledValue}
          position={position}
          direction={direction}
          dragging={active}
          tooltip={_tooltip}
          alwaysShowTooltip={alwaysShowTooltip}
          thumbAriaLabel={thumbAriaLabel}
          showTooltipOnHover={showTooltipOnHover}
          isHovered={hovered}
          disabled={disabled}
          thumbClass={classNames.thumb}
        />
      </Track>

      <input type="hidden" name={name} value={scaledValue} {...inputProps} />
    </div>
  )
}

export default Slider
