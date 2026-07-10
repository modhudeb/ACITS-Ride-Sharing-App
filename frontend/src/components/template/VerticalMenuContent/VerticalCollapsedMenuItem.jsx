import Menu from '@/components/ui/Menu'
import Dropdown from '@/components/ui/Dropdown'
import VerticalMenuIcon from './VerticalMenuIcon'
import AuthorityCheck from '@/components/shared/AuthorityCheck'

const { MenuItem, MenuCollapse } = Menu

const DefaultItem = ({
    nav,
    indent,
    dotIndent,
    children,
    userAuthority,
    t,
}) => {
    return (
        <AuthorityCheck userAuthority={userAuthority} authority={nav.authority}>
            <MenuCollapse
                key={nav.key}
                label={
                    <>
                        <VerticalMenuIcon icon={nav.icon} />
                        <span>{t(nav.translateKey, nav.title)}</span>
                    </>
                }
                eventKey={nav.key}
                expanded={false}
                dotIndent={dotIndent}
                indent={indent}
            >
                {children}
            </MenuCollapse>
        </AuthorityCheck>
    )
}

const CollapsedItem = ({
    nav,
    direction,
    children,
    t,
    renderAsIcon,
    userAuthority,
    parentKeys,
}) => {
    const menuItem = (
        <MenuItem
            key={nav.key}
            isActive={parentKeys?.includes(nav.key)}
            eventKey={nav.key}
            className="mb-2"
        >
            <VerticalMenuIcon icon={nav.icon} />
        </MenuItem>
    )

    const dropdownItem = (
        <div key={nav.key}>{t(nav.translateKey, nav.title)}</div>
    )

    return (
        <AuthorityCheck userAuthority={userAuthority} authority={nav.authority}>
            <Dropdown
                trigger="hover"
                renderTitle={renderAsIcon ? menuItem : dropdownItem}
                placement={direction === 'rtl' ? 'left-start' : 'right-start'}
            >
                {children}
            </Dropdown>
        </AuthorityCheck>
    )
}

const VerticalCollapsedMenuItem = ({ sideCollapsed, ...rest }) => {
    return sideCollapsed ? (
        <CollapsedItem {...rest} />
    ) : (
        <DefaultItem {...rest} />
    )
}

export default VerticalCollapsedMenuItem
