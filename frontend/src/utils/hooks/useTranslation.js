import { useTranslation as useReactI18NextTranslation } from 'react-i18next'

export const useTranslation = (usePlaceholder) => {
    const translatePlaceholder = (_, fallback) => {
        if (typeof fallback === 'string') {
            return fallback
        }
        return ''
    }

    const placehoderResponse = () => ({
        t: translatePlaceholder,
        ready: true,
        i18n: '',
    })

    const i18NextTranslation = useReactI18NextTranslation()

    return usePlaceholder ? placehoderResponse() : i18NextTranslation
}

export default useTranslation
