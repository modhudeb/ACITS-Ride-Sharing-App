import { MenuContextConsumer } from './context/menuContext'
import { GroupContextConsumer } from './context/groupContext'
import { CollapseContextConsumer } from './context/collapseContext'
import BaseMenuItem from '../MenuItem'

const MenuItem = (props) => {
    const { eventKey, ...rest } = props

    return (
        <MenuContextConsumer>
            {(context) => (
                <GroupContextConsumer>
                    {() => (
                        <CollapseContextConsumer>
                            {() => (
                                <BaseMenuItem
                                    menuItemHeight={context.menuItemHeight}
                                    isActive={context.defaultActiveKeys.includes(
                                        eventKey,
                                    )}
                                    eventKey={eventKey}
                                    onSelect={context.onSelect}
                                    {...rest}
                                />
                            )}
                        </CollapseContextConsumer>
                    )}
                </GroupContextConsumer>
            )}
        </MenuContextConsumer>
    )
}

MenuItem.displayName = 'MenuItem'

export default MenuItem
