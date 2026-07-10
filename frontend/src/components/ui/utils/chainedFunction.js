export default function chainedFunction(...funcs) {
    return funcs
        .filter((f) => f !== null && typeof f !== 'undefined')
        .reduce((acc, f) => {
            if (typeof f !== 'function') {
                throw new Error(
                    'Invalid Argument Type, must only provide functions, undefined, or null.',
                )
            }

            if (acc === undefined) {
                return f
            }

            return function chainedFunction(...args) {
                acc.apply(this, args)
                f.apply(this, args)
            }
        }, undefined)
}
