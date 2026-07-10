import { useEffect, useCallback } from 'react'
import { useRouteKeyStore } from '@/store/routeKeyStore'
import { useLocation } from 'react-router'
import { useThemeStore } from '@/store/themeStore'

const AppRoute = ({ component: Component, routeKey, ...props }) => {
    const location = useLocation()

    const { layout, setPreviousLayout, setLayout } = useThemeStore(
        (state) => state,
    )

    const { type: layoutType, previousType: previousLayout } = layout

    const setCurrentRouteKey = useRouteKeyStore(
        (state) => state.setCurrentRouteKey,
    )

    const handleLayoutChange = useCallback(() => {
        setCurrentRouteKey(routeKey)

        if (props.layout && props.layout !== layoutType) {
            setPreviousLayout(layoutType)
            setLayout(props.layout)
        }

        if (!props.layout && previousLayout && layoutType !== previousLayout) {
            setLayout(previousLayout)
            setPreviousLayout('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.layout, routeKey])

    useEffect(() => {
        handleLayoutChange()
    }, [location, handleLayoutChange])

    return <Component {...props} />
}

export default AppRoute
