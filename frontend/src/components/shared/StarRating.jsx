import { useState } from 'react'

const StarRating = ({ onRate, disabled }) => {
    const [hovered, setHovered] = useState(0)
    const [selected, setSelected] = useState(0)

    const handleClick = (value) => {
        if (disabled || selected) return
        setSelected(value)
        onRate?.(value)
    }

    const active = hovered || selected

    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
                <button
                    key={value}
                    type="button"
                    disabled={disabled || Boolean(selected)}
                    className={`text-2xl leading-none transition-colors ${
                        value <= active ? 'text-amber-400' : 'text-gray-300'
                    } ${disabled || selected ? '' : 'cursor-pointer hover:scale-110'}`}
                    onMouseEnter={() => !selected && setHovered(value)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => handleClick(value)}
                    aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                >
                    ★
                </button>
            ))}
        </div>
    )
}

export default StarRating
