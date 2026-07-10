import { useMemo } from 'react'
import isPlainObject from 'lodash/isPlainObject'

const getRouteInfo = (navTree, key) => {
    if (!Array.isArray(navTree) && navTree.key === key) {
        return navTree
    }
    let activedRoute
    let isIncludeActivedRoute = false
    for (const p in navTree) {
        if (
            p !== 'icon' &&
            // eslint-disable-next-line no-prototype-builtins
            navTree.hasOwnProperty(p) &&
            typeof navTree[p] === 'object'
        ) {
            if (isPlainObject(navTree[p]) && navTree[p].subMenu?.length > 0) {
                if (navTree[p].subMenu.some((el) => el.key === key)) {
                    isIncludeActivedRoute = true
                }
            }

            activedRoute = getRouteInfo(navTree[p], key)

            if (activedRoute) {
                if (isIncludeActivedRoute) {
                    activedRoute.parentKey = navTree[p].key
                }

                return activedRoute
            }
        }
    }
    return activedRoute
}

const findNestedRoute = (navTree, key) => {
    const found = navTree.find((node) => {
        return node.key === key
    })
    if (found) {
        return true
    }
    return navTree.some((c) => findNestedRoute(c.subMenu, key))
}

const getTopRouteKey = (navTree, key) => {
    let foundNav = {}
    navTree.forEach((nav) => {
        if (findNestedRoute([nav], key)) {
            foundNav = nav
        }
    })
    return foundNav
}

function useMenuActive(navTree, key) {
    const activedRoute = useMemo(() => {
        const route = getRouteInfo(navTree, key)
        return route
    }, [navTree, key])

    const includedRouteTree = useMemo(() => {
        const included = getTopRouteKey(navTree, key)
        return included
    }, [navTree, key])

    return { activedRoute, includedRouteTree }
}

export default useMenuActive
