import { createContext, useContext } from 'react'

const FormContext = createContext(null)

export const FormContextProvider = FormContext.Provider

export const FormContextConsumer = FormContext.Consumer

export function useForm() {
    return useContext(FormContext)
}

const FormItemContext = createContext(null)

export const FormItemContextProvider = FormItemContext.Provider

export const FormItemContextConsumer = FormItemContext.Consumer

export function useFormItem() {
    return useContext(FormItemContext)
}

export default FormContext
