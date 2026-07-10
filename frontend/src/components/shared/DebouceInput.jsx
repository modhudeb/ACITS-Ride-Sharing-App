import Input from '@/components/ui/Input'
import useDebounce from '@/utils/hooks/useDebounce'

const DebouceInput = (props) => {
    const { wait = 500, ref, ...rest } = props

    function handleDebounceFn(value) {
        props.onChange?.(value)
    }

    const debounceFn = useDebounce(handleDebounceFn, wait)

    const handleInputChange = (e) => {
        debounceFn(e)
    }

    return <Input ref={ref} {...rest} onChange={handleInputChange} />
}

export default DebouceInput
