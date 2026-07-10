import dayjs from 'dayjs'

function hexToRgb(hex) {
    hex = hex.replace(/^#/, '')

    let bigint
    if (hex.length === 3) {
        bigint = parseInt(
            hex.charAt(0) +
                hex.charAt(0) +
                hex.charAt(1) +
                hex.charAt(1) +
                hex.charAt(2) +
                hex.charAt(2),
            16,
        )
    } else if (hex.length === 6) {
        bigint = parseInt(hex, 16)
    } else {
        return null
    }

    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255

    return `rgb(${r}, ${g}, ${b})`
}

function isHexOrRgb(color) {
    const hexRegex = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
    const rgbRegex = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/

    if (hexRegex.test(color)) {
        return 'hex'
    } else if (rgbRegex.test(color)) {
        return 'rgb'
    } else {
        return 'invalid'
    }
}

function applyOpacityToRgb(color, opacity) {
    const rgbRegex = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/
    const match = color.match(rgbRegex)

    if (match) {
        const r = parseInt(match[1], 10)
        const g = parseInt(match[2], 10)
        const b = parseInt(match[3], 10)

        if (opacity < 0 || opacity > 1) {
            return null // Invalid opacity value
        }

        return `rgba(${r}, ${g}, ${b}, ${opacity})`
    } else {
        return null // Invalid RGB color
    }
}

export default function tasksPreProcess(tasks, colorsMap) {
    const coloredTask = tasks.map((task) => {
        task.start = dayjs(task.start).toDate()
        task.end = dayjs(task.end).toDate()

        if (task.barVariant && colorsMap[task.barVariant]) {
            const inputColor = colorsMap[task.barVariant]
            let color = ''

            if (isHexOrRgb(inputColor) === 'invalid') {
                return task
            }

            if (isHexOrRgb(inputColor) === 'hex') {
                color = hexToRgb(inputColor)
            }

            if (task.type === 'task') {
                task.styles = {
                    progressColor: color,
                    backgroundColor: applyOpacityToRgb(color, 0.5),
                    progressSelectedColor: color,
                    backgroundSelectedColor: applyOpacityToRgb(color, 0.5),
                }
            }

            if (task.type === 'milestone') {
                task.styles = {
                    backgroundColor: color,
                    backgroundSelectedColor: color,
                }
            }

            if (task.type === 'project') {
                task.styles = {
                    progressColor: applyOpacityToRgb('rgb(255,255,255)', 0.3),
                    backgroundColor: color,
                    progressSelectedColor: applyOpacityToRgb(
                        'rgb(255,255,255)',
                        0.3,
                    ),
                    backgroundSelectedColor: color,
                }
            }
        }

        return task
    })

    return coloredTask
}
