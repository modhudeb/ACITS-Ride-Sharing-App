import SimpleBarReact from 'simplebar-react'

const ScrollBar = ({ ref, ...props }) => {
    return <SimpleBarReact ref={ref} {...props} />
}

export default ScrollBar
