import { useCallback } from 'react'

const whiteListTwColor = [
    'bg-indigo-200',
    'bg-emerald-200',
    'bg-cyan-200',
    'bg-blue-200',
    'bg-teal-200',
    'bg-fuchsia-200',
    'bg-pink-200',
    'bg-rose-200',
    'bg-red-200',
    'bg-amber-200',
    'bg-violet-200',
    'bg-purple-200',
]

function useRandomBgColor() {
    const hashName = (name) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) {
            const charCode = name.charCodeAt(i)
            hash += charCode
        }
        return hash
    }

    const generateBgColor = useCallback((name) => {
        const hash = hashName(name)
        const index = hash % whiteListTwColor.length
        return whiteListTwColor[index]
    }, [])

    return generateBgColor
}

export default useRandomBgColor
