import { createContext, useContext } from 'react'
import { SIZES } from '../utils/constants'

export const defaultConfig = {
    direction: 'ltr',
    mode: 'light',
    locale: 'en',
    controlSize: SIZES.MD,
}

export const ConfigContext = createContext(defaultConfig)

const ConfigProvider = ConfigContext.Provider

export const ConfigConsumer = ConfigContext.Consumer

export function useConfig() {
    return useContext(ConfigContext)
}

export default ConfigProvider
