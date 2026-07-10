import { Suspense } from 'react'
import Container from '@/components/shared/Container'
import Footer from '@/components/template/Footer'
import useLayout from '@/utils/hooks/useLayout'
import classNames from '@/utils/classNames'
import {
    PAGE_CONTAINER_GUTTER_X,
    PAGE_CONTAINER_GUTTER_Y,
} from '@/constants/theme.constant'

const CustomHeader = ({ header, ...props }) => {
    const Header = header
    return <Header {...props} />
}

export const PageContainerHeader = ({
    title,
    contained,
    extraHeader,
    customeHeader,
    gutterLess,
    className,
}) => {
    if (!title && !extraHeader) return null

    return (
        <div
            className={classNames(
                contained && 'container mx-auto',
                'flex items-center justify-between mb-4',
                gutterLess && 'mt-4',
                className,
            )}
        >
            <div>
                {title &&
                    typeof title === 'string' &&
                    (customeHeader ? (
                        customeHeader()
                    ) : (
                        <h3 className="font-bold">{title}</h3>
                    ))}
                <Suspense fallback={<></>}>
                    {title && typeof title !== 'string' && (
                        <CustomHeader header={title} />
                    )}
                </Suspense>
            </div>
            <Suspense fallback={<></>}>
                {extraHeader && typeof extraHeader !== 'string' && (
                    <CustomHeader header={extraHeader} />
                )}
            </Suspense>
        </div>
    )
}

export const PageContainerBody = ({
    pageContainerType,
    children,
    className,
}) => {
    return pageContainerType === 'contained' ? (
        <Container className={classNames('h-full', className)}>
            {children}
        </Container>
    ) : (
        <>{children}</>
    )
}

export const PageContainerFooter = ({
    footer,
    pageContainerType,
    className,
}) => {
    if (!footer) return null

    return (
        <Footer className={className} pageContainerType={pageContainerType} />
    )
}

const PageContainer = (props) => {
    const {
        pageContainerType = 'default',
        pageBackgroundType = 'default',
        children,
        header,
        footer = true,
    } = props

    const { pageContainerReassemble } = useLayout()

    const defaultClass = 'h-full flex flex-auto flex-col justify-between'
    const pageContainerDefaultClass =
        'page-container relative h-full flex flex-auto flex-col'
    const pageContainerGutterClass = `${PAGE_CONTAINER_GUTTER_X} ${PAGE_CONTAINER_GUTTER_Y}`

    return (
        <>
            {pageContainerReassemble ? (
                pageContainerReassemble({
                    pageContainerType,
                    pageBackgroundType,
                    pageContainerGutterClass,
                    children,
                    footer,
                    header,
                    defaultClass,
                    pageContainerDefaultClass,
                    PageContainerBody,
                    PageContainerFooter,
                    PageContainerHeader,
                })
            ) : (
                <div
                    className={classNames(
                        defaultClass,
                        pageBackgroundType === 'plain' &&
                            'bg-white dark:bg-gray-900',
                    )}
                >
                    <main className="h-full">
                        <div
                            className={classNames(
                                pageContainerDefaultClass,
                                pageContainerType !== 'gutterless' &&
                                    pageContainerGutterClass,
                                pageContainerType === 'contained' &&
                                    'container mx-auto',
                                !footer && 'pb-0 sm:pb-0 md:pb-0',
                            )}
                        >
                            <PageContainerHeader
                                {...header}
                                gutterLess={pageContainerType === 'gutterless'}
                            />
                            <PageContainerBody
                                pageContainerType={pageContainerType}
                            >
                                {children}
                            </PageContainerBody>
                        </div>
                    </main>
                    <PageContainerFooter
                        footer={footer}
                        pageContainerType={pageContainerType}
                    />
                </div>
            )}
        </>
    )
}

export default PageContainer
