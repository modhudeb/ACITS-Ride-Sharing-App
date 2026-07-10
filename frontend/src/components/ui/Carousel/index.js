import _Carousel from './Carousel'
import CarouselContent from './CarouselContent'
import CarouselItem from './CarouselItem'
import CarouselPrevious from './CarouselPrevious'
import CarouselNext from './CarouselNext'

const Carousel = _Carousel

Carousel.Content = CarouselContent
Carousel.Item = CarouselItem
Carousel.Previous = CarouselPrevious
Carousel.Next = CarouselNext

export { Carousel }

export default Carousel
