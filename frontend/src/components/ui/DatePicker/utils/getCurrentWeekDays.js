import { getStartOfWeek } from './getStartOfWeek'
import { getEndOfWeek } from './getEndOfWeek'

export function getCurrentWeekDays(month, firstDayOfWeek = 'monday') {
    const currentMonth = month.getMonth()
    const startOfMonth = new Date(month.getFullYear(), currentMonth, 1)
    const today = new Date()
    const isCurrentMonth =
        today.getMonth() === currentMonth &&
        today.getFullYear() === month.getFullYear()

    let date
    if (isCurrentMonth) {
        date = getStartOfWeek(today, firstDayOfWeek)
    } else {
        date = getStartOfWeek(startOfMonth, firstDayOfWeek)
    }

    const endDate = getEndOfWeek(date, firstDayOfWeek)
    const days = []

    while (date <= endDate) {
        days.push(new Date(date))
        date.setDate(date.getDate() + 1)
    }

    return days
}
