export function getNextMarkValue(currentValue, marks) {
  const sortedMarks = [...marks].sort((a, b) => a.value - b.value)
  const nextMark = sortedMarks.find(mark => mark.value > currentValue)
  return nextMark ? nextMark.value : currentValue
}

export function getPreviousMarkValue(currentValue, marks) {
  const sortedMarks = [...marks].sort((a, b) => b.value - a.value)
  const previousMark = sortedMarks.find(mark => mark.value < currentValue)
  return previousMark ? previousMark.value : currentValue
}

export function getFirstMarkValue(marks) {
  const sortedMarks = [...marks].sort((a, b) => a.value - b.value)
  return sortedMarks.length > 0 ? sortedMarks[0].value : 0
}

export function getLastMarkValue(marks) {
  const sortedMarks = [...marks].sort((a, b) => a.value - b.value)
  return sortedMarks.length > 0
    ? sortedMarks[sortedMarks.length - 1].value
    : 100
}
