import { useRef, useState, useEffect } from 'react'
import {
    autoUpdate,
    size,
    flip,
    useId,
    useDismiss,
    useFloating,
    useInteractions,
    useListNavigation,
    useRole,
    FloatingFocusManager,
    FloatingPortal,
} from '@floating-ui/react'
import Input from '@/components/ui/Input'

const Item = ({ children, active, ref, ...rest }) => {
    const id = useId()
    return (
        <div
            ref={ref}
            role="option"
            id={id}
            aria-selected={active}
            {...rest}
            className="select-option hover:text-gray-800 dark:hover:text-gray-100"
        >
            {children}
        </div>
    )
}

function AutoComplete(props) {
    const {
        data = [],
        optionKey,
        value,
        onInputChange,
        onOptionSelected,
        renderOption,
        ...rest
    } = props
    const [open, setOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(null)

    const [options, setOptions] = useState([])

    const listRef = useRef([])

    useEffect(() => {
        const items = data.filter((item) =>
            optionKey(item).toLowerCase().includes(value.toLowerCase()),
        )
        setOptions(items)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const { refs, floatingStyles, context } = useFloating({
        whileElementsMounted: autoUpdate,
        open,
        onOpenChange: setOpen,
        middleware: [
            flip({ padding: 10 }),
            size({
                apply({ rects, availableHeight, elements }) {
                    Object.assign(elements.floating.style, {
                        width: `${rects.reference.width}px`,
                        maxHeight: `${availableHeight}px`,
                    })
                },
                padding: 10,
            }),
        ],
    })

    const role = useRole(context, { role: 'listbox' })
    const dismiss = useDismiss(context)
    const listNav = useListNavigation(context, {
        listRef,
        activeIndex,
        onNavigate: setActiveIndex,
        virtual: true,
        loop: true,
    })

    const { getReferenceProps, getFloatingProps, getItemProps } =
        useInteractions([role, dismiss, listNav])

    function onAutoCompleteChange(event) {
        const value = event.target.value
        onInputChange(value)
        const items = data.filter((item) =>
            optionKey(item).toLowerCase().includes(value.toLowerCase()),
        )
        if (value && items.length > 0) {
            setOpen(true)
            setActiveIndex(0)
        } else {
            setOpen(false)
        }
    }

    return (
        <>
            <Input
                {...rest}
                {...getReferenceProps({
                    ref: refs.setReference,
                    onChange: onAutoCompleteChange,
                    value: value,
                    'aria-autocomplete': 'list',
                    onKeyDown(event) {
                        if (
                            event.key === 'Enter' &&
                            activeIndex != null &&
                            options[activeIndex]
                        ) {
                            onInputChange(optionKey(options[activeIndex]))
                            setActiveIndex(null)
                            setOpen(false)
                        }
                    },
                })}
            />
            <FloatingPortal>
                {open && (
                    <FloatingFocusManager
                        visuallyHiddenDismiss
                        context={context}
                        initialFocus={-1}
                    >
                        <div
                            {...getFloatingProps({
                                ref: refs.setFloating,
                                style: {
                                    ...floatingStyles,
                                },
                                className: 'select-menu py-1',
                            })}
                        >
                            {options.map((item, index) => (
                                <Item
                                    {...getItemProps({
                                        key: optionKey(item),
                                        ref(node) {
                                            listRef.current[index] = node
                                        },
                                        onClick() {
                                            onInputChange(optionKey(item))
                                            onOptionSelected(item)
                                            setOpen(false)
                                            refs.domReference.current?.focus()
                                        },
                                    })}
                                    key={`auto-complete-item-${index}`}
                                    active={activeIndex === index}
                                >
                                    {renderOption(item)}
                                </Item>
                            ))}
                        </div>
                    </FloatingFocusManager>
                )}
            </FloatingPortal>
        </>
    )
}

export default AutoComplete
