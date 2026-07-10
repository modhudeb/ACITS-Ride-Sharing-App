const sortBy = (field, reverse, primer) => {
    const key = primer
        ? function (x) {
              return primer(x[field])
          }
        : function (x) {
              return x[field]
          }
    const isReverse = !reverse ? 1 : -1
    return function (a, b) {
        const valueA = key(a)
        const valueB = key(b)
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            return isReverse * valueA.localeCompare(valueB)
        }
        return isReverse * (valueA > valueB ? 1 : valueB > valueA ? -1 : 0)
    }
}

export default sortBy
