import { createContext, useContext } from 'react'

const CarouselContext = createContext(null)

export const CarouselContextProvider = CarouselContext.Provider

export function useCarousel() {
    const context = useContext(CarouselContext)
    if (!context) {
        throw new Error('useCarousel must be used within a <Carousel />')
    }
    return context
}

export default CarouselContext
